export default {
  version: 10,
  name: 'ai caller assistant log',
  statements: [
    `CREATE TABLE IF NOT EXISTS call_assistant_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT,
       outcome TEXT NOT NULL,
       detail TEXT,
       at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_call_log_at ON call_assistant_log(at)`,
  ],
};
