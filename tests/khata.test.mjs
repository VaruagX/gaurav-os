import test from 'node:test';
import assert from 'node:assert/strict';
import { getDb, all, first, runMigrations } from '../src/database/db.js';
import { LATEST_VERSION } from '../src/database/migrations/index.js';
import { khataRepository as K, DuplicateContactError } from '../src/database/repositories/index.js';
import { parseRupees, formatPaise, paiseToInput } from '../src/services/khata/money.js';
import { normalizePhone, whatsappNumber, reminderMessage, smsUrl, whatsappUrl, whatsappWebUrl, openReminder } from '../src/services/khata/share.js';

const D = '2026-11-14';
const net = async (id) => (await K.personTotals(id)).outstanding;

test('migration 11 applied, idempotent, tables and indexes exist', async () => {
  const db = await getDb();
  assert.equal(LATEST_VERSION, 14);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 14);
  await runMigrations(db);
  const names = (await all("SELECT name FROM sqlite_master WHERE name LIKE '%khata%'")).map((r) => r.name);
  for (const n of ['khata_contacts', 'khata_entries', 'khata_audit', 'uq_khata_contact_phone', 'idx_khata_entries_contact']) assert.ok(names.includes(n), n);
});

test('money is integer paise: parsing, formatting (Indian grouping), rejects bad input', () => {
  assert.equal(parseRupees('2,000'), 200000);
  assert.equal(parseRupees('₹ 1,23,456.50'), 12345650);
  assert.equal(parseRupees('0.1'), 10);
  assert.equal(parseRupees('0.30'), 30); // no 0.1+0.2 style drift
  for (const bad of ['', 'abc', '-5', '0', '1.234', '1e3', null, undefined]) assert.equal(parseRupees(bad), null, String(bad));
  assert.equal(formatPaise(200000), '₹2,000');
  assert.equal(formatPaise(12345650), '₹1,23,456.50');
  assert.equal(formatPaise(5), '₹0.05');
  assert.equal(formatPaise(-150), '-₹1.50');
  assert.equal(paiseToInput(200050), '2000.50');
  assert.equal(paiseToInput(200000), '2000');
  assert.equal(10 + 20, 30); assert.equal(parseRupees('0.10') + parseRupees('0.20'), parseRupees('0.30'));
});

test('contact creation, listing, search and phone normalisation', async () => {
  const a = await K.addContact({ name: ' Rahul Sharma ', phone: '+91 98765 43210', androidContactId: '42' });
  assert.ok(a.id);
  const c = await K.getContact(a.id);
  assert.equal(c.name, 'Rahul Sharma'); assert.equal(c.phone_norm, '9876543210');
  await K.addContact({ name: 'Priya' }); // manual, no phone
  assert.equal((await K.listBalances('rahul')).length, 1);
  assert.equal((await K.listBalances('98765')).length, 1);
  assert.equal((await K.listBalances('98765 43')).length, 1); // formatted phone search
  assert.equal((await K.listBalances('%')).length, 0);           // wildcard characters are not special for names
  assert.equal((await K.listBalances('zzz')).length, 0);
  assert.equal(normalizePhone('098765-43210'), '9876543210');
  await assert.rejects(() => K.addContact({ name: '  ' }), /Name is required/);
});

test('duplicate contacts are blocked (same phone in any format; same name when no phone)', async () => {
  await assert.rejects(() => K.addContact({ name: 'Someone Else', phone: '9876543210' }), (e) => e instanceof DuplicateContactError && e.existing.name === 'Rahul Sharma');
  await assert.rejects(() => K.addContact({ name: 'X', phone: '098765 43210' }), DuplicateContactError);
  await assert.rejects(() => K.addContact({ name: 'priya' }), DuplicateContactError); // case-insensitive, no phone
  const ok = await K.addContact({ name: 'Priya', phone: '9000000001' });             // same name, different phone: allowed
  assert.ok(ok.id);
  const r = await K.getContact((await K.listBalances('rahul'))[0].id);
  await assert.rejects(() => K.updateContact(ok.id, { name: 'Priya', phone: r.phone }), DuplicateContactError);
  await K.updateContact(ok.id, { name: 'Priya Patel', phone: '9000000001' });
  assert.equal((await K.getContact(ok.id)).name, 'Priya Patel');
});

test('receivable / payable / partial / full settlement maths', async () => {
  const { id } = await K.addContact({ name: 'Amit', phone: '9111111111' });
  await K.addEntry({ contactId: id, type: 'lena', amountPaise: 500000, date: D, note: 'loan' });       // he owes me 5000
  assert.equal(await net(id), 500000);
  await K.addEntry({ contactId: id, type: 'received', amountPaise: 200050, date: D });                 // partial 2000.50
  assert.equal(await net(id), 299950);
  let t = await K.personTotals(id);
  assert.deepEqual([t.lena, t.received, t.dena, t.given], [500000, 200050, 0, 0]);
  const sid = await K.settle(id, D);                                                                    // full settlement
  assert.ok(sid);
  assert.equal(await net(id), 0);
  assert.equal(await K.settle(id, D), null);                                                            // nothing left to settle
  // now I borrow from him
  await K.addEntry({ contactId: id, type: 'dena', amountPaise: 100000, date: D });
  assert.equal(await net(id), -100000);
  await K.addEntry({ contactId: id, type: 'given', amountPaise: 40000, date: D });                      // I repay part
  assert.equal(await net(id), -60000);
  await K.settle(id, D);
  assert.equal(await net(id), 0);
  const last = (await K.entriesFor(id))[0];
  assert.equal(last.type, 'given'); assert.equal(last.amount_paise, 60000);
});

test('overpayment flips direction correctly', async () => {
  const { id } = await K.addContact({ name: 'Over', phone: '9222222222' });
  await K.addEntry({ contactId: id, type: 'lena', amountPaise: 10000, date: D });
  await K.addEntry({ contactId: id, type: 'received', amountPaise: 15000, date: D });
  assert.equal(await net(id), -5000); // now I owe him 50
});

test('dashboard summary nets per person and counts outstanding', async () => {
  const before = await K.summary();
  const a = await K.addContact({ name: 'SumA', phone: '9333333331' });
  const b = await K.addContact({ name: 'SumB', phone: '9333333332' });
  const c = await K.addContact({ name: 'SumC', phone: '9333333333' });
  await K.addEntry({ contactId: a.id, type: 'lena', amountPaise: 100000, date: D });
  await K.addEntry({ contactId: b.id, type: 'dena', amountPaise: 30000, date: D });
  await K.addEntry({ contactId: c.id, type: 'lena', amountPaise: 5000, date: D });
  await K.addEntry({ contactId: c.id, type: 'received', amountPaise: 5000, date: D });            // fully paid: not outstanding
  const s = await K.summary();
  assert.equal(s.receivable - before.receivable, 100000);
  assert.equal(s.payable - before.payable, 30000);
  assert.equal(s.net, s.receivable - s.payable);
  assert.equal(s.outstanding - before.outstanding, 2);
});

test('edit recalculates; delete is soft, excluded from balances, kept in history, restorable, audited', async () => {
  const { id } = await K.addContact({ name: 'Edit Me', phone: '9444444444' });
  const e1 = await K.addEntry({ contactId: id, type: 'lena', amountPaise: 100000, date: D });
  const e2 = await K.addEntry({ contactId: id, type: 'received', amountPaise: 40000, date: D });
  assert.equal(await net(id), 60000);
  await K.updateEntry(e1, { type: 'lena', amountPaise: 150000, date: D, note: 'corrected' });
  assert.equal(await net(id), 110000);
  await K.updateEntry(e2, { type: 'given', amountPaise: 10000, date: D });                          // type change flips its effect
  assert.equal(await net(id), 160000);
  await K.deleteEntry(e2);
  assert.equal(await net(id), 150000);
  const all2 = await K.entriesFor(id);
  assert.equal(all2.length, 2, 'deleted entry still in the timeline');
  assert.equal(all2.find((x) => x.id === e2).status, 'deleted');
  assert.equal((await K.summary()).people > 0, true);
  await K.restoreEntry(e2);
  assert.equal(await net(id), 160000);
  const actions = (await K.auditFor(e2)).map((a) => a.action);
  assert.deepEqual(actions, ['create', 'edit', 'delete', 'restore']);
  const edit = (await K.auditFor(e1)).find((a) => a.action === 'edit');
  assert.equal(JSON.parse(edit.before).amount_paise, 100000, 'original value preserved');
  await assert.rejects(() => K.addEntry({ contactId: id, type: 'lena', amountPaise: 0, date: D }), /greater than zero/);
  await assert.rejects(() => K.addEntry({ contactId: id, type: 'lena', amountPaise: 1.5, date: D }), /greater than zero/);
  await assert.rejects(() => K.addEntry({ contactId: id, type: 'nope', amountPaise: 5, date: D }), /Unknown/);
});

test('removing a person never deletes their history; re-adding restores them', async () => {
  const empty = await K.addContact({ name: 'No History', phone: '9555555550' });
  assert.equal(await K.removeContact(empty.id), 'deleted');
  assert.equal(await K.getContact(empty.id), null);

  const { id } = await K.addContact({ name: 'Has History', phone: '9555555551' });
  await K.addEntry({ contactId: id, type: 'lena', amountPaise: 7700, date: D });
  assert.equal(await K.removeContact(id), 'archived');
  assert.equal((await K.listBalances('has history')).length, 0);                                    // hidden
  assert.equal((await K.entriesFor(id)).length, 1);                                                // history intact
  const back = await K.addContact({ name: 'Has History Again', phone: '9555555551' });             // same phone
  assert.equal(back.restored, true); assert.equal(back.id, id);
  assert.equal(await net(id), 7700);
  const db = await getDb(); await db.execAsync('PRAGMA foreign_keys = ON');
  await assert.rejects(() => db.runAsync('DELETE FROM khata_contacts WHERE id = ?', [id]));        // FK RESTRICT protects history
});

test('persistence: data survives re-running migrations / reading back', async () => {
  const db = await getDb();
  await runMigrations(db);
  const row = await first("SELECT COUNT(*) AS c FROM khata_entries WHERE status = 'active'");
  assert.ok(row.c > 5);
  const raw = await first('SELECT typeof(amount_paise) AS t FROM khata_entries LIMIT 1');
  assert.equal(raw.t, 'integer');
});

test('reminder text for both directions, zero balance has none', () => {
  assert.equal(reminderMessage('Rahul Sharma', 200000), 'Hello Rahul, aapke ₹2,000 pending hain. Kripya payment kar dein. Thank you.');
  assert.equal(reminderMessage('Rahul', -150050), 'Hello Rahul, mujhe aapko ₹1,500.50 dena hai. Main jaldi payment kar dunga. Thank you.');
  assert.equal(reminderMessage('Rahul', 0), null);
});

test('SMS and WhatsApp URLs are built correctly and encode the message', () => {
  const m = 'Hello Rahul, aapke ₹2,000 pending hain & more?';
  const sms = smsUrl('+91 98765-43210', m);
  assert.ok(sms.startsWith('sms:+919876543210?body='));
  assert.equal(decodeURIComponent(sms.split('body=')[1]), m);
  assert.equal(whatsappNumber('9876543210'), '919876543210');
  assert.equal(whatsappNumber('098765 43210'), '919876543210');
  assert.equal(whatsappNumber('+1 (415) 555-2671'), '14155552671');
  assert.equal(whatsappNumber('0044 7911 123456'), '447911123456');
  assert.equal(whatsappNumber('919876543210'), '919876543210');
  assert.ok(whatsappUrl('9876543210', m).startsWith('whatsapp://send?phone=919876543210&text='));
  assert.ok(whatsappWebUrl('9876543210', m).startsWith('https://wa.me/919876543210?text='));
});

test('openReminder opens the app with a prefilled message, never sends, and degrades gracefully', async () => {
  const calls = [];
  const linking = (supported) => ({ canOpenURL: async (u) => supported.some((p) => u.startsWith(p)), openURL: async (u) => { calls.push(u); } });
  let r = await openReminder('sms', '9876543210', 'hi', { linking: linking(['sms:']) });
  assert.equal(r.ok, true); assert.ok(calls[0].startsWith('sms:9876543210?body='));
  calls.length = 0;
  r = await openReminder('whatsapp', '9876543210', 'hi', { linking: linking(['whatsapp://']) });
  assert.equal(r.ok, true); assert.ok(calls[0].startsWith('whatsapp://send?phone=919876543210'));
  calls.length = 0;
  r = await openReminder('whatsapp', '9876543210', 'hi', { linking: linking(['https://wa.me']) });   // falls back to wa.me
  assert.ok(r.ok && calls[0].startsWith('https://wa.me/'));
  r = await openReminder('whatsapp', '9876543210', 'hi', { linking: linking([]) });
  assert.deepEqual([r.ok, r.reason], [false, 'WhatsApp is not installed on this phone.']);
  r = await openReminder('sms', '9876543210', 'hi', { linking: linking([]) });
  assert.deepEqual([r.ok, r.reason], [false, 'No SMS app found on this phone.']);
  r = await openReminder('sms', '', 'hi', { linking: linking(['sms:']) });
  assert.equal(r.ok, false); assert.match(r.reason, /no phone/i);
  r = await openReminder('sms', '9876543210', null, { linking: linking(['sms:']) });
  assert.equal(r.ok, false);
  const throwing = { canOpenURL: async () => true, openURL: async () => { throw new Error('boom'); } };
  r = await openReminder('sms', '9876543210', 'hi', { linking: throwing });
  assert.equal(r.ok, false); // an app that fails to open is reported, not crashed
});

// ---------------- exports: statement / summary / receipt models, PDF + image share ----------------
import { personStatementModel, allKhataModel, receiptModel, exportPdf, sendReminderWithImage } from '../src/services/khata/exports.js';

test('person statement model: headline, totals, running balance, deleted rows marked', async () => {
  const { id } = await K.addContact({ name: 'Statement Guy', phone: '9666666666' });
  const e1 = await K.addEntry({ contactId: id, type: 'lena', amountPaise: 500000, date: '2026-11-01', note: 'loan' });
  await K.addEntry({ contactId: id, type: 'received', amountPaise: 200000, date: '2026-11-05' });
  const e3 = await K.addEntry({ contactId: id, type: 'received', amountPaise: 99900, date: '2026-11-06', note: 'mistake' });
  await K.deleteEntry(e3);
  const m = personStatementModel({ contact: await K.getContact(id), totals: await K.personTotals(id), entries: await K.entriesFor(id), now: new Date(2026, 10, 14, 18, 5) });
  assert.equal(m.headline.label, 'THEY OWE ME'); assert.equal(m.headline.amount, '₹3,000'); assert.equal(m.headline.tone, 'green');
  assert.deepEqual(m.stats.map((s) => s.value), ['₹5,000', '₹0', '₹2,000', '₹0']);
  assert.equal(m.rows.length, 3, 'deleted entries stay in the statement');
  assert.deepEqual(m.rows.map((r) => r.date), ['6 Nov', '5 Nov', '1 Nov']);                 // newest first
  assert.equal(m.rows[0].deleted, true); assert.equal(m.rows[0].balance, 'deleted');
  assert.equal(m.rows[1].balance, 'Bal ₹3,000 Lena'); assert.equal(m.rows[2].balance, 'Bal ₹5,000 Lena');
  assert.equal(m.rows[2].note, 'loan'); assert.match(m.fileName, /^khata_Statement_Guy_20261114_1805$/);
  assert.match(m.footer, /14 Nov 2026, 6:05 PM/);
  assert.equal(JSON.parse(JSON.stringify(m)).rows.length, 3); // serialisable for the native renderer
  void e1;
});

test('summary and receipt models', async () => {
  const people = await K.listBalances(); const summary = await K.summary();
  const m = allKhataModel({ summary, people, now: new Date(2026, 10, 14, 9, 0) });
  assert.equal(m.rows.length, people.length);
  assert.equal(m.stats[0].value, formatPaise(summary.receivable));
  assert.ok(['green', 'red', 'grey'].includes(m.headline.tone));
  const c = (await K.listBalances('statement'))[0];
  const entry = (await K.entriesFor(c.id)).find((e) => e.type === 'lena');
  const r = receiptModel({ contact: c, entry, outstanding: 300000, now: new Date(2026, 10, 14, 9, 0) });
  assert.equal(r.headline.amount, '₹5,000'); assert.equal(r.headline.label, 'MUJHE LENA HAI');
  assert.ok(r.rows.find((x) => x.title === 'Balance with this person').amount.includes('₹3,000 (they owe me)'));
  assert.ok(r.rows.find((x) => x.title === 'Note').amount === 'loan');
  const settled = receiptModel({ contact: c, entry, outstanding: 0 });
  assert.equal(settled.rows.at(-1).amount, 'Settled');
});

test('exportPdf renders a PDF and opens the share sheet; fails clearly without native support', async () => {
  const calls = [];
  const deps = {
    native: { renderStatement: async (json, fmt, max) => { calls.push(['render', fmt, JSON.parse(json).title]); return '/cache/khata_share/x.pdf'; } },
    sharing: { isAvailableAsync: async () => true, shareAsync: async (u, o) => { calls.push(['share', u, o.mimeType]); } },
  };
  const p = await exportPdf({ title: 'T', rows: [] }, deps);
  assert.equal(p, '/cache/khata_share/x.pdf');
  assert.deepEqual(calls, [['render', 'pdf', 'T'], ['share', 'file:///cache/khata_share/x.pdf', 'application/pdf']]);
  await assert.rejects(() => exportPdf({ title: 'T' }, { native: null, sharing: deps.sharing }), /installed Android app/);
});

test('sendReminderWithImage: attaches image via the right channel, never claims success on failure', async () => {
  const seen = [];
  const deps = (status) => ({ native: {
    renderStatement: async (json, fmt, max) => { seen.push(['render', fmt, max]); return '/cache/a.png'; },
    shareImageTo: async (path, channel, digits, text) => { seen.push(['share', path, channel, digits, text]); return status; },
  } });
  const contact = { name: 'Rahul', phone: '098765 43210' };
  let r = await sendReminderWithImage('whatsapp', contact, 'msg', { title: 'x' }, {}, deps('ok'));
  assert.equal(r.ok, true);
  assert.deepEqual(seen, [['render', 'png', 8], ['share', '/cache/a.png', 'whatsapp', '919876543210', 'msg']]);
  seen.length = 0;
  r = await sendReminderWithImage('sms', { name: 'R', phone: '+91 98765-43210' }, 'msg', {}, {}, deps('ok'));
  assert.equal(seen[1][3], '+919876543210');
  r = await sendReminderWithImage('whatsapp', contact, 'msg', {}, {}, deps('WhatsApp is not installed on this phone.'));
  assert.deepEqual([r.ok, r.reason], [false, 'WhatsApp is not installed on this phone.']);
  r = await sendReminderWithImage('sms', { name: 'x', phone: '' }, 'msg', {}, {}, deps('ok'));
  assert.match(r.reason, /no phone/i);
  r = await sendReminderWithImage('sms', contact, null, {}, {}, deps('ok'));
  assert.equal(r.ok, false);
  r = await sendReminderWithImage('sms', contact, 'm', {}, {}, { native: { renderStatement: async () => { throw new Error('render boom'); }, shareImageTo: async () => 'ok' } });
  assert.deepEqual([r.ok, r.reason], [false, 'render boom']);
  r = await sendReminderWithImage('sms', contact, 'm', {}, {}, { native: null });
  assert.equal(r.ok, false);
});
