import { all, first, transaction, run } from '../db';
import { normalizePhone } from '../../services/khata/share';
import { SIGN } from '../../services/khata/money';
import { outstandingLots, agingBuckets, overdueLots, monthlyTrend, sumReceived } from '../../services/khata/analytics';

const now = () => Date.now();

export class DuplicateContactError extends Error {
  constructor(existing) { super(`${existing.name} is already in your khata.`); this.name = 'DuplicateContactError'; this.existing = existing; }
}

const NET_SQL = `COALESCE(SUM(CASE e.type WHEN 'lena' THEN e.amount_paise WHEN 'given' THEN e.amount_paise
                                 WHEN 'dena' THEN -e.amount_paise WHEN 'received' THEN -e.amount_paise END), 0)`;

export const khataRepository = {
  // ---------- contacts ----------------------------------------------------------------------
  /** Existing contact (archived or not) that would be a duplicate, or null. Same phone => duplicate; no phone => same name. */
  async findDuplicate({ name, phone }, exceptId = null) {
    const norm = normalizePhone(phone);
    if (norm) {
      return first('SELECT * FROM khata_contacts WHERE phone_norm = ? AND id <> ?', [norm, exceptId ?? -1]);
    }
    return first(`SELECT * FROM khata_contacts WHERE phone_norm = '' AND LOWER(name) = LOWER(?) AND id <> ?`, [String(name).trim(), exceptId ?? -1]);
  },

  /** Adds a person. Throws DuplicateContactError if present; an archived match is restored instead. */
  async addContact({ name, phone = '', androidContactId = null }) {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('Name is required.');
    const dup = await this.findDuplicate({ name: clean, phone });
    if (dup) {
      if (dup.archived) {
        await run('UPDATE khata_contacts SET archived = 0, name = ?, updated_at = ? WHERE id = ?', [clean, now(), dup.id]);
        return { id: dup.id, restored: true };
      }
      throw new DuplicateContactError(dup);
    }
    const t = now();
    const res = await run(
      'INSERT INTO khata_contacts (name, phone, phone_norm, android_contact_id, archived, created_at, updated_at) VALUES (?,?,?,?,0,?,?)',
      [clean, String(phone || '').trim(), normalizePhone(phone), androidContactId, t, t]
    );
    return { id: res.lastInsertRowId, restored: false };
  },

  async updateContact(id, { name, phone = '' }) {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('Name is required.');
    const dup = await this.findDuplicate({ name: clean, phone }, id);
    if (dup) throw new DuplicateContactError(dup);
    await run('UPDATE khata_contacts SET name = ?, phone = ?, phone_norm = ?, updated_at = ? WHERE id = ?', [clean, String(phone || '').trim(), normalizePhone(phone), now(), id]);
  },

  getContact: (id) => first('SELECT * FROM khata_contacts WHERE id = ?', [id]),

  /**
   * Remove a person from the list. Their transactions are never deleted: a person with history is archived
   * (hidden, history kept, restored automatically if added again); a person with no history is deleted outright.
   * Returns 'deleted' | 'archived'.
   */
  async removeContact(id) {
    const n = (await first('SELECT COUNT(*) AS c FROM khata_entries WHERE contact_id = ?', [id])).c;
    if (n === 0) { await run('DELETE FROM khata_contacts WHERE id = ?', [id]); return 'deleted'; }
    await run('UPDATE khata_contacts SET archived = 1, updated_at = ? WHERE id = ?', [now(), id]);
    return 'archived';
  },

  /** Active contacts with their net balance (paise; + they owe me, - I owe them), newest activity first. */
  listBalances: (search = '') => all(
    `SELECT c.*, ${NET_SQL} AS net_paise, MAX(CASE WHEN e.status='active' THEN e.date END) AS last_date,
            COUNT(CASE WHEN e.status='active' THEN 1 END) AS entry_count
     FROM khata_contacts c LEFT JOIN khata_entries e ON e.contact_id = c.id AND e.status = 'active'
     WHERE c.archived = 0 AND (? = '' OR LOWER(c.name) LIKE ? ESCAPE '\\' OR c.phone_norm LIKE ?)
     GROUP BY c.id ORDER BY (net_paise = 0), ABS(net_paise) DESC, c.name COLLATE NOCASE`,
    [search.trim(), `%${search.trim().toLowerCase().replace(/[\\%_]/g, (m) => '\\' + m)}%`, (normalizePhone(search) ? `%${normalizePhone(search)}%` : '%x%') /* digits-only column: '%x%' never matches */]
  ),

  async summary() {
    const rows = await this.listBalances();
    let lena = 0, dena = 0, outstanding = 0;
    for (const r of rows) {
      if (r.net_paise > 0) { lena += r.net_paise; outstanding++; } else if (r.net_paise < 0) { dena += -r.net_paise; outstanding++; }
    }
    return { receivable: lena, payable: dena, net: lena - dena, outstanding, people: rows.length };
  },

  // ---------- entries ------------------------------------------------------------------------
  entriesFor: (contactId) => all('SELECT * FROM khata_entries WHERE contact_id = ? ORDER BY date DESC, id DESC', [contactId]),

  recent: (limit = 8) => all(
    `SELECT e.*, c.name AS contact_name FROM khata_entries e JOIN khata_contacts c ON c.id = e.contact_id
     WHERE e.status = 'active' AND c.archived = 0 ORDER BY e.created_at DESC, e.id DESC LIMIT ?`, [limit]),

  /** Totals for one person (all in paise). outstanding > 0: they owe me; < 0: I owe them. */
  async personTotals(contactId) {
    const rows = await all(`SELECT type, SUM(amount_paise) AS total FROM khata_entries WHERE contact_id = ? AND status = 'active' GROUP BY type`, [contactId]);
    const t = { lena: 0, dena: 0, received: 0, given: 0 };
    rows.forEach((r) => { t[r.type] = r.total; });
    const outstanding = t.lena + t.given - t.dena - t.received;
    return { ...t, outstanding };
  },

  async addEntry({ contactId, type, amountPaise, date, note = null, dueDate = null }) {
    if (!SIGN[type]) throw new Error('Unknown transaction type.');
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) throw new Error('Amount must be greater than zero.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Pick a date.');
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error('Invalid due date.');
    if (dueDate && dueDate < date) throw new Error('The due date cannot be before the transaction date.');
    return transaction(async (tx) => {
      const t = now();
      const r = await tx.runAsync(
        `INSERT INTO khata_entries (contact_id, type, amount_paise, date, note, status, created_at, updated_at, due_date) VALUES (?,?,?,?,?, 'active', ?, ?, ?)`,
        [contactId, type, amountPaise, date, note ? String(note).trim() || null : null, t, t, dueDate || null]);
      await tx.runAsync(`INSERT INTO khata_audit (entry_id, action, before, at) VALUES (?, 'create', NULL, ?)`, [r.lastInsertRowId, t]);
      return r.lastInsertRowId;
    });
  },

  /** Edit keeps the original in khata_audit, so history is never silently lost. */
  async updateEntry(id, { type, amountPaise, date, note = null, dueDate = null }) {
    if (dueDate && dueDate < date) throw new Error('The due date cannot be before the transaction date.');
    if (!SIGN[type]) throw new Error('Unknown transaction type.');
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) throw new Error('Amount must be greater than zero.');
    return transaction(async (tx) => {
      const before = await tx.getFirstAsync('SELECT * FROM khata_entries WHERE id = ?', [id]);
      if (!before) throw new Error('Transaction not found.');
      const t = now();
      await tx.runAsync('UPDATE khata_entries SET type = ?, amount_paise = ?, date = ?, note = ?, updated_at = ?, due_date = ? WHERE id = ?',
        [type, amountPaise, date, note ? String(note).trim() || null : null, t, dueDate || null, id]);
      await tx.runAsync(`INSERT INTO khata_audit (entry_id, action, before, at) VALUES (?, 'edit', ?, ?)`, [id, JSON.stringify(before), t]);
    });
  },

  /** Soft delete: stays visible in the timeline as "deleted", excluded from every balance, can be restored. */
  async deleteEntry(id) {
    return transaction(async (tx) => {
      const before = await tx.getFirstAsync('SELECT * FROM khata_entries WHERE id = ?', [id]);
      if (!before || before.status === 'deleted') return;
      const t = now();
      await tx.runAsync(`UPDATE khata_entries SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?`, [t, t, id]);
      await tx.runAsync(`INSERT INTO khata_audit (entry_id, action, before, at) VALUES (?, 'delete', ?, ?)`, [id, JSON.stringify(before), t]);
    });
  },

  async restoreEntry(id) {
    return transaction(async (tx) => {
      const before = await tx.getFirstAsync('SELECT * FROM khata_entries WHERE id = ?', [id]);
      if (!before || before.status !== 'deleted') return;
      const t = now();
      await tx.runAsync(`UPDATE khata_entries SET status = 'active', deleted_at = NULL, updated_at = ? WHERE id = ?`, [t, id]);
      await tx.runAsync(`INSERT INTO khata_audit (entry_id, action, before, at) VALUES (?, 'restore', ?, ?)`, [id, JSON.stringify(before), t]);
    });
  },

  auditFor: (entryId) => all('SELECT * FROM khata_audit WHERE entry_id = ? ORDER BY at, id', [entryId]),

  /** Record a payment that fully clears the current balance with a person. Returns the entry id, or null if already settled. */
  async settle(contactId, date, note = 'Full settlement') {
    const { outstanding } = await this.personTotals(contactId);
    if (outstanding === 0) return null;
    return this.addEntry({ contactId, type: outstanding > 0 ? 'received' : 'given', amountPaise: Math.abs(outstanding), date, note });
  },

  // ---------- insights (all computed from real active entries) --------------------------------
  activeEntries: () => all(
    `SELECT e.*, c.name AS contact_name, c.phone AS contact_phone FROM khata_entries e JOIN khata_contacts c ON c.id = e.contact_id
     WHERE e.status = 'active' AND c.archived = 0 ORDER BY e.date, e.id`),

  /** Everything including deleted entries, for CSV export. */
  allEntriesForExport: () => all(
    `SELECT e.*, c.name AS contact_name, c.phone AS contact_phone FROM khata_entries e JOIN khata_contacts c ON c.id = e.contact_id ORDER BY e.date, e.id`),

  /** Per-person overdue flag + aging + trend for the dashboard. `today` = 'YYYY-MM-DD'. */
  async insights(today) {
    const entries = await this.activeEntries();
    const per = new Map();
    for (const e of entries) { if (!per.has(e.contact_id)) per.set(e.contact_id, []); per.get(e.contact_id).push(e); }
    const recv = [], pay = [];
    const people = new Map();
    let overdueTotal = 0;
    for (const [cid, list] of per) {
      const o = outstandingLots(list);
      const od = o.dir > 0 ? overdueLots(o.lots, today) : [];
      const odAmt = od.reduce((a, l) => a + l.amount, 0);
      overdueTotal += odAmt;
      people.set(cid, { net: o.net, overdue: odAmt > 0, overduePaise: odAmt, oldestDue: od.length ? od.map((l) => l.due).sort()[0] : null });
      (o.dir > 0 ? recv : o.dir < 0 ? pay : []).push(...o.lots);
    }
    const month = today.slice(0, 7);
    return {
      people,
      agingReceivable: agingBuckets(recv, today), agingPayable: agingBuckets(pay, today),
      overdue: { amount: overdueTotal, people: [...people.values()].filter((p) => p.overdue).length },
      trend: monthlyTrend(entries, today, 6),
      collected: sumReceived(entries, `${month}-01`, `${month}-31`),
    };
  },

  // ---------- reminder log (a reminder was opened for this person; the app never sends anything) ------
  async logReminder({ contactId, channel, amountPaise }) {
    await run('INSERT INTO khata_reminder_log (contact_id, channel, amount_paise, at) VALUES (?,?,?,?)', [contactId, channel, amountPaise, now()]);
  },
  async lastReminders() {
    const rows = await all('SELECT contact_id, MAX(at) AS at FROM khata_reminder_log GROUP BY contact_id');
    return new Map(rows.map((r) => [r.contact_id, r.at]));
  },
  reminderLogFor: (contactId, limit = 10) => all('SELECT * FROM khata_reminder_log WHERE contact_id = ? ORDER BY at DESC LIMIT ?', [contactId, limit])
};
