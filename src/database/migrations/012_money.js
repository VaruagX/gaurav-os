/**
 * Personal finance upgrade of the EXISTING expenses table (no second table):
 *  - kind (expense | income), payment_method, amount_paise (integer money, backfilled from the old REAL `amount`).
 *    `amount` is kept and mirrored (paise/100) so older code and backups keep working.
 *  - categories.flow separates income categories from expense categories.
 *  - budgets: monthly overall budget (category_id NULL) and per-category budgets. A row applies to its month and
 *    carries forward to later months until a newer row exists; amount 0 = "no budget from this month on".
 *  - budget_alerts: remembers which 80% / 100% alerts were already shown, so each fires once per month.
 */
export default {
  version: 12,
  name: 'expense dashboard: income, payment method, paise, budgets',
  statements: [
    `ALTER TABLE expenses ADD COLUMN kind TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense','income'))`,
    `ALTER TABLE expenses ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'other' CHECK (payment_method IN ('cash','upi','card','bank','wallet','other'))`,
    `ALTER TABLE expenses ADD COLUMN amount_paise INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE expenses ADD COLUMN updated_at INTEGER`,
    `UPDATE expenses SET amount_paise = CAST(ROUND(amount * 100) AS INTEGER), updated_at = created_at`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_kind_date ON expenses(kind, date)`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id)`,
    `ALTER TABLE categories ADD COLUMN flow TEXT NOT NULL DEFAULT 'expense' CHECK (flow IN ('expense','income'))`,
    `INSERT OR IGNORE INTO categories (name, kind, color, flow, created_at) VALUES
       ('Groceries','expense','#9CB8A6','expense',0),('Shopping','expense','#B8A9C9','expense',0),
       ('Bills & Recharge','expense','#8E9AAF','expense',0),('Rent','expense','#D9B38C','expense',0),
       ('Entertainment','expense','#C9A9B8','expense',0),('Health','expense','#A9C9C4','expense',0),
       ('Salary','expense','#9CB8A6','income',0),('Pocket Money','expense','#8E9AAF','income',0),
       ('Freelance','expense','#B8A9C9','income',0),('Gift','expense','#D9B38C','income',0),
       ('Refund','expense','#A9C9C4','income',0),('Other Income','expense','#C9A9B8','income',0)`,
    `CREATE TABLE IF NOT EXISTS budgets (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
       category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
       amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_overall ON budgets(month) WHERE category_id IS NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_category ON budgets(month, category_id) WHERE category_id IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS budget_alerts (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       month TEXT NOT NULL,
       scope TEXT NOT NULL,
       level INTEGER NOT NULL CHECK (level IN (80,100)),
       at INTEGER NOT NULL,
       UNIQUE (month, scope, level)
     )`,
  ],
};
