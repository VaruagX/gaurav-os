import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDb } from 'expo-sqlite';
import { migrations } from '../src/database/migrations/index.js';
import { getDb, all, first, run } from '../src/database/db.js';
import { expenseRepository as X } from '../src/database/repositories/index.js';
import {
  monthKeyOf, daysInMonth, monthRange, shiftMonth, bucketize, cumulative, changePct, monthSummary, budgetState, crossedThresholds, buildInsights, eachDay,
} from '../src/services/expenses/finance.js';

const M = '2026-11', P = '2026-10';
let food, travel, salary, rent;

test('migration 12 preserves every existing expense record and adds the new columns', async () => {
  const db = createMemoryDb();
  for (const m of migrations.filter((x) => x.version <= 11)) { for (const s of m.statements) await db.execAsync(s); await db.execAsync(`PRAGMA user_version = ${m.version}`); }
  const cats = await db.getAllAsync("SELECT id, name FROM categories WHERE kind='expense'");
  const foodId = cats.find((c) => c.name === 'Food').id;
  const legacy = [['2026-09-01', 123.45, foodId, 'lunch'], ['2026-09-02', 0.1, null, null], ['2026-09-03', 2000, foodId, 'rent share'], ['2026-09-04', 19.99, foodId, 'tea']];
  for (const [d, a, c, n] of legacy) await db.runAsync('INSERT INTO expenses (date, amount, category_id, note, created_at) VALUES (?,?,?,?,?)', [d, a, c, n, 111]);
  const before = await db.getAllAsync('SELECT * FROM expenses ORDER BY id');

  const m12 = migrations.find((x) => x.version === 12);
  for (const s of m12.statements) await db.execAsync(s);

  const after = await db.getAllAsync('SELECT * FROM expenses ORDER BY id');
  assert.equal(after.length, before.length);
  after.forEach((r, i) => {
    assert.equal(r.date, before[i].date); assert.equal(r.amount, before[i].amount); assert.equal(r.note, before[i].note);
    assert.equal(r.category_id, before[i].category_id); assert.equal(r.created_at, before[i].created_at);
    assert.equal(r.kind, 'expense'); assert.equal(r.payment_method, 'other');
  });
  assert.deepEqual(after.map((r) => r.amount_paise), [12345, 10, 200000, 1999]);      // exact paise, no float drift
  assert.ok((await db.getAllAsync("SELECT id FROM categories WHERE flow='income'")).length >= 5);
  assert.equal((await db.getAllAsync("SELECT id FROM categories WHERE kind='expense' AND name='Food'")).length, 1, 'existing categories not duplicated');
  await db.runAsync('INSERT INTO expenses (date, amount, amount_paise, category_id, created_at) VALUES (?,?,?,?,?)', ['2026-09-05', 1, 100, null, 1]); // old-style insert still works
});

test('setup: categories exist for both flows', async () => {
  await getDb();
  const exp = await X.categories('expense'), inc = await X.categories('income');
  food = exp.find((c) => c.name === 'Food').id; travel = exp.find((c) => c.name === 'Travel').id; rent = exp.find((c) => c.name === 'Rent').id;
  salary = inc.find((c) => c.name === 'Salary').id;
  assert.ok(exp.length >= 8 && inc.length >= 5);
  assert.ok(!exp.some((c) => c.name === 'Salary') && !inc.some((c) => c.name === 'Food'));
});

test('add / validation / edit / delete, income vs expense', async () => {
  const id = await X.add({ kind: 'expense', amountPaise: 45050, date: `${M}-03`, categoryId: food, paymentMethod: 'upi', note: ' Lunch ' });
  const row = await X.get(id);
  assert.equal(row.amount_paise, 45050); assert.equal(row.note, 'Lunch'); assert.equal(row.category, 'Food'); assert.equal(row.payment_method, 'upi');
  assert.equal((await first('SELECT amount FROM expenses WHERE id = ?', [id])).amount, 450.5, 'legacy amount column mirrored');
  await assert.rejects(() => X.add({ kind: 'expense', amountPaise: 0, date: `${M}-03`, paymentMethod: 'cash' }), /greater than zero/);
  await assert.rejects(() => X.add({ kind: 'expense', amountPaise: 10.5, date: `${M}-03`, paymentMethod: 'cash' }), /greater than zero/);
  await assert.rejects(() => X.add({ kind: 'loan', amountPaise: 100, date: `${M}-03`, paymentMethod: 'cash' }), /income or expense/);
  await assert.rejects(() => X.add({ kind: 'expense', amountPaise: 100, date: 'nope', paymentMethod: 'cash' }), /date/);
  await assert.rejects(() => X.add({ kind: 'expense', amountPaise: 100, date: `${M}-03`, paymentMethod: 'cheque' }), /payment method/);
  await X.update(id, { kind: 'expense', amountPaise: 50000, date: `${M}-04`, categoryId: travel, paymentMethod: 'card', note: null });
  const e = await X.get(id);
  assert.deepEqual([e.amount_paise, e.date, e.category, e.payment_method, e.note], [50000, `${M}-04`, 'Travel', 'card', null]);
  await X.remove(id);
  assert.equal(await X.get(id), null);
});

test('dashboard totals, savings and month-over-month comparison use real records', async () => {
  // October (previous month)
  await X.add({ kind: 'income', amountPaise: 5000000, date: `${P}-01`, categoryId: salary, paymentMethod: 'bank' });
  await X.add({ kind: 'expense', amountPaise: 1200000, date: `${P}-05`, categoryId: rent, paymentMethod: 'bank' });
  await X.add({ kind: 'expense', amountPaise: 300000, date: `${P}-10`, categoryId: food, paymentMethod: 'upi' });
  // November (current month)
  await X.add({ kind: 'income', amountPaise: 5500000, date: `${M}-01`, categoryId: salary, paymentMethod: 'bank' });
  await X.add({ kind: 'expense', amountPaise: 1200000, date: `${M}-02`, categoryId: rent, paymentMethod: 'bank', note: 'Nov rent' });
  await X.add({ kind: 'expense', amountPaise: 150000, date: `${M}-03`, categoryId: food, paymentMethod: 'upi' });
  await X.add({ kind: 'expense', amountPaise: 99950, date: `${M}-09`, categoryId: food, paymentMethod: 'cash' });
  await X.add({ kind: 'expense', amountPaise: 50000, date: `${M}-09`, categoryId: travel, paymentMethod: 'upi', note: 'cab' });

  const cur = await X.totals(...Object.values(monthRange(M)));
  const prev = await X.totals(...Object.values(monthRange(P)));
  assert.equal(cur.income, 5500000);
  assert.equal(cur.expense, 1499950); assert.equal(prev.expense, 1500000);
  const s = monthSummary(cur);
  assert.equal(s.savings, 4000050); assert.equal(s.savingsPct, 72.7);
  assert.equal(monthSummary({ income: 0, expense: 500 }).savingsPct, null);
  assert.equal(changePct(cur.expense, prev.expense), -0);
  assert.equal(changePct(1100, 1000), 10); assert.equal(changePct(900, 1000), -10); assert.equal(changePct(5, 0), null);

  const b = await X.balance();                                     // opening 0 + 5,000,000 + 5,500,000 - (1,500,000 + 1,499,950) + small legacy rows
  assert.equal(b.balance, b.opening + b.net);
  const manualNet = (await all(`SELECT kind, SUM(amount_paise) t FROM expenses GROUP BY kind`)).reduce((a, r) => a + (r.kind === 'income' ? r.t : -r.t), 0);
  assert.equal(b.net, manualNet);
  await X.setOpeningBalance(100000);
  assert.equal((await X.balance()).balance, manualNet + 100000);
});

test('category breakdown, biggest transaction, weekday & payment-method patterns', async () => {
  const { from, to } = monthRange(M);
  const cats = await X.byCategory(from, to);
  assert.deepEqual(cats.map((c) => [c.name, c.total]), [['Rent', 1200000], ['Food', 249950], ['Travel', 50000]]);
  assert.equal(cats.reduce((a, c) => a + c.total, 0), (await X.totals(from, to)).expense);
  assert.deepEqual((await X.byCategory(from, to, 'income')).map((c) => [c.name, c.total]), [['Salary', 5500000]]);
  const big = await X.biggestExpense(from, to);
  assert.equal(big.amount_paise, 1200000); assert.equal(big.category, 'Rent'); assert.equal(big.note, 'Nov rent');
  const wd = await X.weekdayTotals(from, to);                       // 2 Nov 2026 is a Monday; 3 Tue; 9 Mon
  assert.equal(wd.reduce((a, b) => a + b, 0), 1499950);
  assert.equal(wd[0], 1200000 + 99950 + 50000); assert.equal(wd[1], 150000);
  const m = Object.fromEntries((await X.methodTotals(from, to)).map((r) => [r.method, r.total]));
  assert.deepEqual(m, { bank: 1200000, upi: 200000, cash: 99950 });
  assert.equal(await X.spentThroughDay(M, 3), 1350000);            // days 1-3
  assert.equal(await X.spentThroughDay(P, 31), 1500000);
});

test('daily/weekly/monthly buckets are zero-filled, add up exactly, and follow the selected range', async () => {
  const { from, to } = monthRange(M);
  const rows = await X.daily(from, to);
  const days = bucketize(rows, from, to, 'day');
  assert.equal(days.length, 30); assert.equal(days[1].expense, 1200000); assert.equal(days[3].expense, 0);
  const weeks = bucketize(rows, from, to, 'week');
  assert.equal(weeks[0].start, '2026-11-01'); assert.equal(weeks[0].end, '2026-11-01');            // 1 Nov is a Sunday: partial first week
  assert.equal(weeks[1].start, '2026-11-02'); assert.equal(weeks[1].end, '2026-11-08');
  assert.equal(weeks[1].expense, 1200000 + 150000);
  for (const g of ['day', 'week', 'month']) assert.equal(bucketize(rows, from, to, g).reduce((a, b) => a + b.expense, 0), 1499950, g);
  const wide = await X.daily(`${P}-01`, to);                                                          // range change -> different data
  const months = bucketize(wide, `${P}-01`, to, 'month');
  assert.deepEqual(months.map((b) => [b.label, b.expense, b.income]), [['Oct', 1500000, 5000000], ['Nov', 1499950, 5500000]]);
  const sub = bucketize(await X.daily(`${M}-03`, `${M}-09`), `${M}-03`, `${M}-09`, 'day');
  assert.equal(sub.length, 7); assert.equal(sub.reduce((a, b) => a + b.expense, 0), 150000 + 99950 + 50000);
  assert.equal(eachDay('2026-02-27', '2026-03-02').length, 4);
  const cum = cumulative(rows, M);
  assert.equal(cum.length, 30); assert.equal(cum[29], 1499950); assert.equal(cum[1], 1200000); assert.equal(cum[2], 1350000);
  assert.equal(cumulative(rows, M, 3).length, 3);
});

test('transaction filters: search, kind, category, payment method, date range, combined', async () => {
  assert.ok((await X.list()).length >= 8);
  assert.deepEqual((await X.list({ search: 'cab' })).map((r) => r.note), ['cab']);
  assert.ok((await X.list({ search: 'food' })).every((r) => r.category === 'Food'));                 // category name search
  assert.equal((await X.list({ search: '1500' })).length, 1);                                         // amount search (₹1,500.00)
  assert.equal((await X.list({ search: '%' })).length, 0);                                            // wildcards are literal
  const inc = await X.list({ kind: 'income' }); assert.ok(inc.length === 2 && inc.every((r) => r.kind === 'income'));
  assert.ok((await X.list({ categoryId: food })).every((r) => r.category_id === food));
  assert.ok((await X.list({ method: 'upi' })).every((r) => r.payment_method === 'upi'));
  const r = await X.list({ from: `${M}-03`, to: `${M}-09` }); assert.ok(r.every((x) => x.date >= `${M}-03` && x.date <= `${M}-09`)); assert.equal(r.length, 3);
  const combo = await X.list({ kind: 'expense', method: 'upi', from: `${M}-01`, to: `${M}-30`, categoryId: food });
  assert.equal(combo.length, 1); assert.equal(combo[0].amount_paise, 150000);
  assert.ok((await X.list({ categoryId: 'none' })).every((x) => x.category_id === null));
  const ordered = await X.list(); for (let i = 1; i < ordered.length; i++) assert.ok(ordered[i - 1].date >= ordered[i].date);
});

test('budgets: overall + category, carry-forward, removal, status, history', async () => {
  await X.setBudget(P, null, 2000000);
  await X.setBudget(P, food, 400000);
  let b = await X.budgets(M);                                      // November has no rows: October's carries forward
  assert.equal(b.overall.amount_paise, 2000000); assert.equal(b.categories.length, 1);
  await X.setBudget(M, null, 2500000);                             // update for this month only
  await X.setBudget(M, null, 2600000);                             // upsert, not duplicate
  assert.equal((await first("SELECT COUNT(*) c FROM budgets WHERE month = ? AND category_id IS NULL", [M])).c, 1);
  assert.equal((await X.budgets(M)).overall.amount_paise, 2600000);
  assert.equal((await X.budgets(P)).overall.amount_paise, 2000000, 'earlier months untouched');
  await X.setBudget(M, food, 200000);
  const st = await X.budgetStatus(M);
  assert.deepEqual([st.overall.budget, st.overall.spent], [2600000, 1499950]);
  assert.equal(st.spent, 1499950);
  assert.equal((await X.budgetStatus('2030-01')).spent, 0);                // no records -> zero, no budget carried as spent
  const f = st.categories.find((c) => c.category_id === food);
  assert.deepEqual([f.budget, f.spent], [200000, 249950]);
  assert.equal(budgetState(f.spent, f.budget).level, 'over');
  assert.equal(budgetState(st.overall.spent, st.overall.budget).level, 'ok');
  assert.equal(budgetState(800, 1000).level, 'warn'); assert.equal(budgetState(799, 1000).level, 'ok'); assert.equal(budgetState(1000, 1000).level, 'over');
  assert.equal(budgetState(5, 0).level, 'none'); assert.equal(budgetState(900, 1000).remaining, 100);
  await X.setBudget(M, food, 0);                                   // remove from this month on
  assert.equal((await X.budgets(M)).categories.length, 0);
  assert.equal((await X.budgets(P)).categories.length, 1);
  await assert.rejects(() => X.setBudget('bad', null, 100), /Invalid month/);
  await assert.rejects(() => X.setBudget(M, null, -5), /zero or more/);
  const h = await X.budgetHistory(3, M);
  assert.deepEqual(h.map((x) => [x.month, x.budget, x.spent]), [[M, 2600000, 1499950], [P, 2000000, 1500000]]);
});

test('80% / 100% alerts fire once on crossing, and only when moving upward', async () => {
  assert.deepEqual(crossedThresholds(700, 810, 1000), [80]);
  assert.deepEqual(crossedThresholds(700, 1000, 1000), [80, 100]);
  assert.deepEqual(crossedThresholds(850, 990, 1000), []);
  assert.deepEqual(crossedThresholds(850, 1100, 1000), [100]);
  assert.deepEqual(crossedThresholds(900, 100, 1000), []);        // going down never alerts
  assert.deepEqual(crossedThresholds(0, 5000, 0), []);            // no budget, no alert
  assert.equal(await X.recordAlert(M, 'all', 80), true);
  assert.equal(await X.recordAlert(M, 'all', 80), false);         // not repeated
  assert.equal(await X.recordAlert(M, 'all', 100), true);
  assert.equal(await X.recordAlert('2026-12', 'all', 80), true);  // new month alerts again
});

test('insights are plain language and built only from real figures', async () => {
  const { from, to } = monthRange(M);
  const byCategory = await X.byCategory(from, to);
  const d = {
    month: M, monthName: 'November', expense: 1499950, byCategory, biggest: await X.biggestExpense(from, to),
    prevSameDaySpent: 1000000, prevMonthSpent: 1500000, budget: { budget: 2600000, spent: 1499950 },
    weekdayTotals: await X.weekdayTotals(from, to), methodTotals: await X.methodTotals(from, to), daysElapsed: 14, daysLeft: 16,
  };
  const ins = buildInsights(d); const byId = Object.fromEntries(ins.map((i) => [i.id, i.text]));
  assert.match(byId['top-category'], /Rent — ₹12,000, which is 80%/);
  assert.match(byId.biggest, /₹12,000 on Rent \(Nov rent\), on 2 Nov/);
  assert.match(byId['avg-daily'], /about ₹1,071 a day/);
  assert.match(byId['vs-last-month'], /50% more than at this point last month/);
  assert.match(byId['budget-left'], /₹11,000\.50 left of your ₹26,000 budget with 16 days to go — about ₹687 a day/);
  assert.match(byId['pattern-weekday'], /most on Mondays/);
  assert.match(byId['pattern-method'], /Bank is used for 80%/);
  const over = buildInsights({ ...d, budget: { budget: 1000000, spent: 1499950 } }).find((i) => i.id === 'budget-left');
  assert.match(over.text, /₹4,999\.50 over your ₹10,000 budget/);
  const none = buildInsights({ ...d, budget: null }).find((i) => i.id === 'days-left');
  assert.match(none.text, /16 days left in November/);
  const empty = buildInsights({ month: M, monthName: 'November', expense: 0, byCategory: [], biggest: null, prevSameDaySpent: 0, prevMonthSpent: 0, budget: null, weekdayTotals: [0, 0, 0, 0, 0, 0, 0], methodTotals: [], daysElapsed: 1, daysLeft: 29 });
  assert.deepEqual(empty.map((i) => i.id), ['days-left']);        // nothing fabricated when there is no data
  assert.match(buildInsights({ ...d, prevSameDaySpent: 0, prevMonthSpent: 0 }).find((i) => i.id === 'vs-last-month').text, /nothing to compare/);
});

test('date helpers', () => {
  assert.equal(monthKeyOf(new Date(2026, 10, 14)), '2026-11'); assert.equal(daysInMonth('2026-02'), 28); assert.equal(daysInMonth('2028-02'), 29);
  assert.equal(shiftMonth('2026-01', -1), '2025-12'); assert.equal(shiftMonth('2026-11', 3), '2027-02');
  assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
});

test('expenses are separate from Khata records', async () => {
  const tables = (await all("SELECT name FROM sqlite_master WHERE type='table'")).map((r) => r.name);
  assert.ok(tables.includes('khata_entries') && tables.includes('expenses'));
  const cols = (await all("PRAGMA table_info(expenses)")).map((c) => c.name);
  assert.ok(!cols.some((c) => c.includes('khata') || c === 'contact_id'));
  assert.equal((await first("SELECT COUNT(*) c FROM expenses")).c > 0, true);
  assert.equal((await first("SELECT COUNT(*) c FROM khata_entries")).c, 0);   // nothing leaked in either direction
});

import { checkBudgetAlerts } from '../src/services/expenses/alerts.js';
test('checkBudgetAlerts returns each new 80%/100% alert once, per scope, and notifies', async () => {
  const month = '2027-01';
  const mk = (all, cat) => ({ month, overall: { budget: 100000, spent: all }, categories: [{ category_id: 7, name: 'Food', budget: 20000, spent: cat }] });
  const sent = [];
  const notify = async (t, x) => { sent.push([t, x]); };
  let a = await checkBudgetAlerts(mk(10000, 5000), mk(85000, 5000), notify);
  assert.deepEqual(a.map((x) => [x.scope, x.level]), [['all', 80]]);
  assert.match(a[0].text, /₹850 of ₹1,000 spent\. ₹150 left/);
  a = await checkBudgetAlerts(mk(85000, 5000), mk(90000, 5000), notify);              // still above 80, no repeat
  assert.equal(a.length, 0);
  a = await checkBudgetAlerts(mk(90000, 5000), mk(105000, 21000), notify);            // overall 100 + Food 80 and 100
  assert.deepEqual(a.map((x) => `${x.scope}:${x.level}`).sort(), ['all:100', 'c7:100', 'c7:80']);
  assert.match(a.find((x) => x.scope === 'all').text, /₹50 over/);
  assert.equal(sent.length, 4);
  const none = await checkBudgetAlerts({ month, overall: null, categories: [] }, { month, overall: null, categories: [] }, notify);
  assert.deepEqual(none, []);
  await checkBudgetAlerts(mk(1, 1), mk(2, 2), async () => { throw new Error('no notifications'); });  // notify failure never breaks saving
});
