export default {
  version: 3,
  name: 'reminders and history',
  statements: [
    `CREATE TABLE IF NOT EXISTS reminders (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       title TEXT NOT NULL,
       message TEXT NOT NULL DEFAULT '',
       mode TEXT NOT NULL DEFAULT 'normal' CHECK (mode IN ('normal','persistent','alarm')),
       speak_enabled INTEGER NOT NULL DEFAULT 1,
       lang TEXT NOT NULL DEFAULT 'en-US',
       rate REAL NOT NULL DEFAULT 1.0,
       pitch REAL NOT NULL DEFAULT 1.0,
       snooze_min INTEGER NOT NULL DEFAULT 10,
       repeat TEXT NOT NULL DEFAULT 'once' CHECK (repeat IN ('once','daily','weekly','weekdays')),
       time TEXT NOT NULL,
       weekdays TEXT NOT NULL DEFAULT '',
       once_at INTEGER,
       enabled INTEGER NOT NULL DEFAULT 1,
       next_at INTEGER,
       source TEXT NOT NULL DEFAULT 'user',
       source_id INTEGER,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_reminders_source ON reminders(source, source_id) WHERE source_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_reminders_enabled_next ON reminders(enabled, next_at)`,
    `CREATE TABLE IF NOT EXISTS reminder_history (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       reminder_id INTEGER NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
       title TEXT NOT NULL,
       event TEXT NOT NULL,
       detail TEXT,
       at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_rhistory_reminder ON reminder_history(reminder_id, at)`,
    `CREATE INDEX IF NOT EXISTS idx_rhistory_at ON reminder_history(at)`,
  ],
};
