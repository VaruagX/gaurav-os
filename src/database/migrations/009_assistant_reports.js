export default {
  version: 9,
  name: 'assistant history and reports',
  statements: [
    `CREATE TABLE IF NOT EXISTS assistant_history (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       role TEXT NOT NULL CHECK (role IN ('user','assistant')),
       text TEXT NOT NULL,
       intent TEXT,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_assistant_created ON assistant_history(created_at)`,
    `CREATE TABLE IF NOT EXISTS reports (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       kind TEXT NOT NULL CHECK (kind IN ('daily','weekly')),
       period_key TEXT NOT NULL,
       data TEXT NOT NULL,
       created_at INTEGER NOT NULL,
       UNIQUE (kind, period_key)
     )`,
  ],
};
