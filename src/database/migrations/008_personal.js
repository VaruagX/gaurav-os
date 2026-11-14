export default {
  version: 8,
  name: 'notes, goals and personal management',
  statements: [
    `CREATE TABLE IF NOT EXISTS notes (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       title TEXT NOT NULL,
       body TEXT,
       is_idea INTEGER NOT NULL DEFAULT 0,
       pinned INTEGER NOT NULL DEFAULT 0,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned, updated_at)`,
    `CREATE TABLE IF NOT EXISTS goals (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       title TEXT NOT NULL,
       description TEXT,
       target_date TEXT,
       progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
       status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','done')),
       completed_at INTEGER,
       created_at INTEGER NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS events (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       title TEXT NOT NULL,
       date TEXT NOT NULL,
       notes TEXT,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_events_date ON events(date)`,
    `CREATE TABLE IF NOT EXISTS coding_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       date TEXT NOT NULL,
       platform TEXT,
       problem TEXT NOT NULL,
       topic TEXT,
       difficulty TEXT NOT NULL DEFAULT 'easy' CHECK (difficulty IN ('easy','medium','hard')),
       minutes INTEGER NOT NULL DEFAULT 0,
       solved INTEGER NOT NULL DEFAULT 1,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_coding_date ON coding_log(date)`,
    `CREATE TABLE IF NOT EXISTS english_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       date TEXT NOT NULL,
       activity TEXT NOT NULL,
       minutes INTEGER NOT NULL DEFAULT 0,
       new_words TEXT,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_english_date ON english_log(date)`,
    `CREATE TABLE IF NOT EXISTS expenses (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       date TEXT NOT NULL,
       amount REAL NOT NULL CHECK (amount >= 0),
       category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
       note TEXT,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)`,
    `CREATE TABLE IF NOT EXISTS subscriptions (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT NOT NULL UNIQUE,
       amount REAL NOT NULL CHECK (amount >= 0),
       cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (cycle IN ('weekly','monthly','yearly')),
       next_due TEXT NOT NULL,
       active INTEGER NOT NULL DEFAULT 1,
       created_at INTEGER NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS purchases (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       item TEXT NOT NULL,
       price REAL,
       purchase_date TEXT NOT NULL,
       warranty_until TEXT,
       store TEXT,
       notes TEXT,
       created_at INTEGER NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS documents (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       title TEXT NOT NULL,
       category TEXT NOT NULL DEFAULT 'Other',
       stored_name TEXT NOT NULL UNIQUE,
       display_name TEXT NOT NULL,
       mime TEXT,
       size INTEGER,
       created_at INTEGER NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS achievements (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       title TEXT NOT NULL,
       date TEXT NOT NULL,
       notes TEXT,
       created_at INTEGER NOT NULL
     )`,
  ],
};
