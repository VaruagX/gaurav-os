import { all, first, run, transaction } from '../db';
import { parseRupees } from '../../services/khata/money';
import { monthRange, shiftMonth, daysInMonth } from '../../services/expenses/finance';

/** Escape LIKE wildcards so user text is matched literally. */
const like = (s) => `%${String(s).toLowerCase().replace(/[\\%_]/g, (m) => '\\' + m)}%`;
const now = () => Date.now();
const KINDS = ['expense', 'income'];
const METHODS = ['cash', 'upi', 'card', 'bank', 'wallet', 'other'];

function validate({ kind, amountPaise, date, paymentMethod }) {
  if (!KINDS.includes(kind)) throw new Error('Choose income or expense.');
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) throw new Error('Amount must be greater than zero.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Pick a date.');
  if (!METHODS.includes(paymentMethod)) throw new Error('Choose a payment method.');
}

const SELECT = `SELECT e.id, e.kind, e.amount_paise, e.date, e.note, e.payment_method, e.category_id, e.created_at, e.updated_at,
                       c.name AS category, c.color AS category_color
                FROM expenses e LEFT JOIN categories c ON c.id = e.category_id`;

export const expenseRepository = {
  // ---------- categories --------------------------------------------------------------------
  categories: (flow) => all(`SELECT id, name, color FROM categories WHERE kind = 'expense' AND flow = ? ORDER BY name COLLATE NOCASE`, [flow]),

  // ---------- transactions --------------------------------------------------------------------
  async add({ kind = 'expense', amountPaise, date, categoryId = null, paymentMethod = 'cash', note = null }) {
    validate({ kind, amountPaise, date, paymentMethod });
    const t = now();
    const r = await run(
      `INSERT INTO expenses (date, amount, amount_paise, kind, payment_method, category_id, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [date, amountPaise / 100, amountPaise, kind, paymentMethod, categoryId, note ? String(note).trim() || null : null, t, t]);
    return r.lastInsertRowId;
  },

  async update(id, { kind, amountPaise, date, categoryId = null, paymentMethod, note = null }) {
    validate({ kind, amountPaise, date, paymentMethod });
    await run(`UPDATE expenses SET kind = ?, amount = ?, amount_paise = ?, date = ?, category_id = ?, payment_method = ?, note = ?, updated_at = ? WHERE id = ?`,
      [kind, amountPaise / 100, amountPaise, date, categoryId, paymentMethod, note ? String(note).trim() || null : null, now(), id]);
  },

  remove: (id) => run('DELETE FROM expenses WHERE id = ?', [id]),
  get: (id) => first(`${SELECT} WHERE e.id = ?`, [id]),

  /** Filtered, newest first. All filters optional and combinable. */
  async list({ search = '', kind = null, categoryId = null, method = null, from = null, to = null, limit = 500, offset = 0 } = {}) {
    const w = [], p = [];
    if (kind) { w.push('e.kind = ?'); p.push(kind); }
    if (categoryId === 'none') w.push('e.category_id IS NULL'); else if (categoryId) { w.push('e.category_id = ?'); p.push(categoryId); }
    if (method) { w.push('e.payment_method = ?'); p.push(method); }
    if (from) { w.push('e.date >= ?'); p.push(from); }
    if (to) { w.push('e.date <= ?'); p.push(to); }
    const q = String(search).trim();
    if (q) {
      const paise = parseRupees(q);
      w.push(`(LOWER(COALESCE(e.note,'')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(c.name,'')) LIKE ? ESCAPE '\\'${paise ? ' OR e.amount_paise = ?' : ''})`);
      p.push(like(q), like(q)); if (paise) p.push(paise);
    }
    return all(`${SELECT} ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY e.date DESC, e.id DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
  },

  // ---------- aggregates ---------------------------------------------------------------------
  async totals(from, to) {
    const r = await first(
      `SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount_paise END),0) AS income,
              COALESCE(SUM(CASE WHEN kind='expense' THEN amount_paise END),0) AS expense,
              COUNT(*) AS count FROM expenses WHERE date BETWEEN ? AND ?`, [from, to]);
    return { income: r.income, expense: r.expense, count: r.count };
  },

  /** Opening balance (setting) + all income - all expenses ever recorded. */
  async balance() {
    const o = await first(`SELECT value FROM settings WHERE key = 'expenseOpeningPaise'`);
    const opening = o ? parseInt(o.value, 10) || 0 : 0;
    const r = await first(`SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount_paise ELSE -amount_paise END),0) AS net FROM expenses`);
    return { opening, net: r.net, balance: opening + r.net };
  },
  setOpeningBalance: (paise) => run(`INSERT INTO settings (key, value, updated_at) VALUES ('expenseOpeningPaise', ?, ?)
                                     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, [String(Math.round(paise)), now()]),

  byCategory: (from, to, kind = 'expense') => all(
    `SELECT e.category_id, COALESCE(c.name, 'Uncategorised') AS name, COALESCE(c.color, '#8E9AAF') AS color, SUM(e.amount_paise) AS total, COUNT(*) AS count
     FROM expenses e LEFT JOIN categories c ON c.id = e.category_id WHERE e.kind = ? AND e.date BETWEEN ? AND ?
     GROUP BY e.category_id ORDER BY total DESC`, [kind, from, to]),

  daily: (from, to) => all(
    `SELECT date, COALESCE(SUM(CASE WHEN kind='income' THEN amount_paise END),0) AS income,
            COALESCE(SUM(CASE WHEN kind='expense' THEN amount_paise END),0) AS expense
     FROM expenses WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date`, [from, to]),

  biggestExpense: (from, to) => first(`${SELECT} WHERE e.kind = 'expense' AND e.date BETWEEN ? AND ? ORDER BY e.amount_paise DESC, e.id DESC LIMIT 1`, [from, to]),

  /** Spend per weekday (Mon..Sun) in a range. */
  async weekdayTotals(from, to) {
    const rows = await all(`SELECT date, SUM(amount_paise) AS total FROM expenses WHERE kind='expense' AND date BETWEEN ? AND ? GROUP BY date`, [from, to]);
    const out = [0, 0, 0, 0, 0, 0, 0];
    for (const r of rows) { const [y, m, d] = r.date.split('-').map(Number); out[(new Date(y, m - 1, d).getDay() + 6) % 7] += r.total; }
    return out;
  },

  methodTotals: (from, to) => all(`SELECT payment_method AS method, SUM(amount_paise) AS total FROM expenses WHERE kind='expense' AND date BETWEEN ? AND ? GROUP BY payment_method`, [from, to]),

  /** Total spent from day 1 to `day` of a month (for fair month-vs-month comparison). */
  async spentThroughDay(monthKey, day) {
    const last = Math.min(day, daysInMonth(monthKey));
    const r = await first(`SELECT COALESCE(SUM(amount_paise),0) AS t FROM expenses WHERE kind='expense' AND date BETWEEN ? AND ?`, [`${monthKey}-01`, `${monthKey}-${String(last).padStart(2, '0')}`]);
    return r.t;
  },

  // ---------- budgets -------------------------------------------------------------------------
  /** Effective budget rows for a month: the row for that month, else the latest earlier one (0 = removed). */
  async budgets(month) {
    const overall = await first(`SELECT * FROM budgets WHERE category_id IS NULL AND month <= ? ORDER BY month DESC LIMIT 1`, [month]);
    const cats = await all(
      `SELECT b.*, c.name, c.color FROM budgets b JOIN categories c ON c.id = b.category_id
       WHERE b.category_id IS NOT NULL AND b.month = (SELECT MAX(b2.month) FROM budgets b2 WHERE b2.category_id = b.category_id AND b2.month <= ?)
       ORDER BY c.name COLLATE NOCASE`, [month]);
    return { overall: overall && overall.amount_paise > 0 ? overall : null, categories: cats.filter((c) => c.amount_paise > 0) };
  },

  async setBudget(month, categoryId, amountPaise) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid month.');
    if (!Number.isInteger(amountPaise) || amountPaise < 0) throw new Error('Budget must be zero or more.');
    const t = now();
    if (categoryId == null) {
      await run(`INSERT INTO budgets (month, category_id, amount_paise, created_at, updated_at) VALUES (?, NULL, ?, ?, ?)
                 ON CONFLICT(month) WHERE category_id IS NULL DO UPDATE SET amount_paise = excluded.amount_paise, updated_at = excluded.updated_at`, [month, amountPaise, t, t]);
    } else {
      await run(`INSERT INTO budgets (month, category_id, amount_paise, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(month, category_id) WHERE category_id IS NOT NULL DO UPDATE SET amount_paise = excluded.amount_paise, updated_at = excluded.updated_at`, [month, categoryId, amountPaise, t, t]);
    }
  },

  /** Budget vs actual for a month, overall and per category (only expenses count). */
  async budgetStatus(month) {
    const { from, to } = monthRange(month);
    const b = await this.budgets(month);
    const total = (await this.totals(from, to)).expense;
    const spentBy = new Map((await this.byCategory(from, to)).map((r) => [r.category_id, r.total]));
    return {
      month, spent: total,
      overall: b.overall ? { budget: b.overall.amount_paise, spent: total } : null,
      categories: b.categories.map((c) => ({ category_id: c.category_id, name: c.name, color: c.color, budget: c.amount_paise, spent: spentBy.get(c.category_id) || 0 })),
    };
  },

  /** Last `n` months (newest first) with the budget that applied and what was actually spent. */
  async budgetHistory(n = 12, fromMonth) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const month = shiftMonth(fromMonth, -i);
      const { from, to } = monthRange(month);
      const b = await this.budgets(month);
      const t = await this.totals(from, to);
      if (!b.overall && !b.categories.length && t.expense === 0) continue;
      out.push({ month, budget: b.overall?.amount_paise || 0, spent: t.expense, categoryBudgets: b.categories.length });
    }
    return out;
  },

  /** True only the first time an alert level is recorded for (month, scope). */
  async recordAlert(month, scope, level) {
    const r = await run(`INSERT OR IGNORE INTO budget_alerts (month, scope, level, at) VALUES (?,?,?,?)`, [month, String(scope), level, now()]);
    return r.changes > 0;
  },
};

export { transaction };
