import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDb } from 'expo-sqlite';
import { migrations } from '../src/database/migrations/index.js';
import { getDb, all, first } from '../src/database/db.js';
import { khataRepository as K } from '../src/database/repositories/index.js';
import { outstandingLots, agingBuckets, overdueLots, monthlyTrend, ageDays, netAsOf, sumReceived } from '../src/services/khata/analytics.js';
import { timeAgo } from '../src/services/khata/format.js';
import { ledgerCsv, cell } from '../src/services/khata/csv.js';

let nextId = 1;
const E = (type, paise, date, due = null, contact = 1) => ({ id: nextId++, contact_id: contact, type, amount_paise: paise, date, due_date: due });

test('migration 13 keeps every existing khata record and adds the new columns/tables', async () => {
  const db = createMemoryDb();
  for (const m of migrations.filter((x) => x.version <= 12)) { for (const s of m.statements) await db.execAsync(s); await db.execAsync(`PRAGMA user_version = ${m.version}`); }
  await db.runAsync(`INSERT INTO khata_contacts (name, phone, phone_norm, archived, created_at, updated_at) VALUES ('Old Friend','9876500000','9876500000',0,1,1)`);
  await db.runAsync(`INSERT INTO khata_entries (contact_id, type, amount_paise, date, note, status, created_at, updated_at) VALUES (1,'lena',123450,'2026-09-01','loan','active',1,1),(1,'received',50000,'2026-09-10',NULL,'active',2,2)`);
  const before = await db.getAllAsync('SELECT * FROM khata_entries ORDER BY id');
  for (const s of migrations.find((x) => x.version === 13).statements) await db.execAsync(s);
  const after = await db.getAllAsync('SELECT * FROM khata_entries ORDER BY id');
  assert.equal(after.length, 2);
  after.forEach((r, i) => { assert.equal(r.amount_paise, before[i].amount_paise); assert.equal(r.date, before[i].date); assert.equal(r.due_date, null); });
  const t = (await db.getAllAsync("SELECT name FROM sqlite_master WHERE name LIKE 'khata_%'")).map((r) => r.name);
  assert.ok(t.includes('khata_reminder_log'));
  assert.ok(!t.some((n) => n.includes('bulk')), 'no bulk tables');
});

test('FIFO outstanding lots: payments clear the oldest debt first', () => {
  const o = outstandingLots([E('lena', 100000, '2026-08-01'), E('lena', 50000, '2026-09-01'), E('received', 120000, '2026-09-15')]);
  assert.equal(o.net, 30000); assert.equal(o.dir, 1);
  assert.deepEqual(o.lots.map((l) => [l.date, l.amount]), [['2026-09-01', 30000]]);         // August cleared entirely, September part-paid
  const flip = outstandingLots([E('lena', 10000, '2026-10-01'), E('received', 15000, '2026-10-02')]);
  assert.equal(flip.net, -5000); assert.equal(flip.dir, -1);                                  // overpayment: now I owe them
  assert.equal(outstandingLots([E('lena', 5000, '2026-10-01'), E('received', 5000, '2026-10-02')]).dir, 0);
  assert.equal(outstandingLots([]).net, 0);
  const pay = outstandingLots([E('dena', 80000, '2026-10-01'), E('given', 30000, '2026-10-05')]);
  assert.deepEqual([pay.net, pay.dir, pay.lots[0].amount], [-50000, -1, 50000]);
  // out-of-order input is replayed by date
  assert.equal(outstandingLots([E('received', 20000, '2026-10-05'), E('lena', 50000, '2026-10-01')]).net, 30000);
});

test('aging buckets and overdue use the lot date / due date', () => {
  const today = '2026-11-14';
  const o = outstandingLots([E('lena', 100000, '2026-11-10', '2026-11-20'), E('lena', 200000, '2026-10-01', '2026-10-31'), E('lena', 300000, '2026-08-01', '2026-08-15'), E('lena', 400000, '2026-09-01')]);
  const a = agingBuckets(o.lots, today);
  assert.equal(ageDays('2026-11-10', today), 4);
  assert.deepEqual(a.map((b) => b.total), [100000, 200000, 400000, 300000]);              // 4d, 44d, 74d, 105d
  assert.equal(a.reduce((x, b) => x + b.total, 0), 1000000);
  const od = overdueLots(o.lots, today);
  assert.deepEqual(od.map((l) => l.amount).sort((x, y) => x - y), [200000, 300000]);        // no due date => never "overdue"
  assert.equal(overdueLots(o.lots, '2026-11-20').length, 2);                                 // due today is not overdue yet
});

test('monthly trend nets per person as of each month end', () => {
  const es = [E('lena', 100000, '2026-06-10', null, 1), E('dena', 40000, '2026-07-05', null, 2), E('received', 100000, '2026-08-20', null, 1), E('lena', 70000, '2026-11-02', null, 3)];
  const t = monthlyTrend(es, '2026-11-14', 6);
  assert.deepEqual(t.map((m) => m.key), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.deepEqual(t.map((m) => m.receivable), [100000, 100000, 0, 0, 0, 70000]);
  assert.deepEqual(t.map((m) => m.payable), [0, 40000, 40000, 40000, 40000, 40000]);
  assert.equal(netAsOf(es.filter((e) => e.contact_id === 1), '2026-07-31'), 100000);
  assert.equal(sumReceived(es, '2026-08-01', '2026-08-31'), 100000);
  assert.equal(monthlyTrend([], '2026-11-14', 3).every((m) => m.receivable === 0 && m.payable === 0), true);
});

test('timeAgo wording', () => {
  assert.equal(timeAgo(Date.now() - 3 * 86400000), '3 days ago'); assert.equal(timeAgo(Date.now() - 86400000), 'yesterday'); assert.equal(timeAgo(Date.now()), 'today');
});

test('repository: due dates, overdue insights, aging from real records', async () => {
  await getDb();
  const a = (await K.addContact({ name: 'Asha', phone: '9810000001' })).id;
  const b = (await K.addContact({ name: 'Bunty', phone: '9810000002' })).id;
  await assert.rejects(() => K.addEntry({ contactId: a, type: 'lena', amountPaise: 100, date: '2026-11-10', dueDate: '2026-11-01' }), /before the transaction date/);
  await assert.rejects(() => K.addEntry({ contactId: a, type: 'lena', amountPaise: 100, date: '2026-11-10', dueDate: 'soon' }), /Invalid due date/);
  const e1 = await K.addEntry({ contactId: a, type: 'lena', amountPaise: 400000, date: '2026-09-01', dueDate: '2026-09-30' });
  await K.addEntry({ contactId: a, type: 'received', amountPaise: 100000, date: '2026-10-01' });
  await K.addEntry({ contactId: b, type: 'lena', amountPaise: 250000, date: '2026-11-05', dueDate: '2026-12-05' });
  const ins = await K.insights('2026-11-14');
  assert.equal(ins.people.get(a).overdue, true); assert.equal(ins.people.get(a).overduePaise, 300000); assert.equal(ins.people.get(a).oldestDue, '2026-09-30');
  assert.equal(ins.people.get(b).overdue, false);
  assert.equal(ins.overdue.amount, 300000); assert.equal(ins.overdue.people, 1);
  const recv = ins.agingReceivable.reduce((x, y) => x + y.total, 0);
  assert.equal(recv, (await K.summary()).receivable);                                        // aging adds up to the dashboard total
  assert.equal(ins.agingReceivable[0].total, 250000);                                        // Bunty, 9 days old
  assert.equal(ins.agingReceivable[2].total, 300000);                                        // Asha's remaining lot, 74 days old
  assert.equal(ins.collected, 0 + 0);                                                        // 'received' was in October
  await K.updateEntry(e1, { type: 'lena', amountPaise: 400000, date: '2026-09-01', dueDate: '2026-12-31' });
  assert.equal((await K.insights('2026-11-14')).overdue.amount, 0, 'editing the due date updates overdue');
  assert.equal((await first('SELECT due_date FROM khata_entries WHERE id = ?', [e1])).due_date, '2026-12-31');
});

test('single reminders are logged per person for "last reminded"', async () => {
  const c = (await K.addContact({ name: 'Remind Me', phone: '9830000001' })).id;
  await K.addEntry({ contactId: c, type: 'lena', amountPaise: 12300, date: '2026-11-01' });
  assert.equal((await K.lastReminders()).get(c), undefined);
  await K.logReminder({ contactId: c, channel: 'whatsapp', amountPaise: 12300 });
  await K.logReminder({ contactId: c, channel: 'sms', amountPaise: 12300 });
  const log = await K.reminderLogFor(c);
  assert.equal(log.length, 2); assert.deepEqual(log.map((l) => l.channel).sort(), ['sms', 'whatsapp']);
  assert.ok((await K.lastReminders()).get(c) > 0);
  await assert.rejects(async () => { const db = await getDb(); await db.runAsync("INSERT INTO khata_reminder_log (contact_id, channel, amount_paise, at) VALUES (?,?,?,?)", [c, 'telegram', 1, 1]); });
});

test('CSV export escapes cells, guards spreadsheet formulas and includes deleted entries', async () => {
  assert.equal(cell('plain'), 'plain'); assert.equal(cell('a,b'), '"a,b"'); assert.equal(cell('say "hi"'), '"say ""hi"""'); assert.equal(cell('line\nbreak'), '"line\nbreak"');
  assert.equal(cell('=SUM(A1)'), "'=SUM(A1)"); assert.equal(cell('+91 98765'), "'+91 98765"); assert.equal(cell(null), '');
  const csv = ledgerCsv([
    { date: '2026-11-01', contact_name: 'Rahul, Jr', contact_phone: '+91 98765 43210', type: 'lena', amount_paise: 200050, due_date: '2026-11-20', note: '=cmd', status: 'active' },
    { date: '2026-11-02', contact_name: 'Asha', contact_phone: '', type: 'received', amount_paise: 50000, due_date: null, note: null, status: 'deleted' },
  ]);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'Date,Person,Phone,Type,Amount (INR),Due date,Note,Status');
  assert.equal(lines[1], `2026-11-01,"Rahul, Jr",'+91 98765 43210,Mujhe Lena Hai,2000.50,2026-11-20,'=cmd,active`);
  assert.equal(lines[2], '2026-11-02,Asha,,Payment Received,500,,,deleted');
  const rows = await K.allEntriesForExport(); assert.ok(rows.length >= 4 && rows.every((r) => r.contact_name));
});
