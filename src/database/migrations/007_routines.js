export default {
  version: 7,
  name: 'routines, habits, daily goals',
  statements: [
    `CREATE TABLE IF NOT EXISTS routines (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT NOT NULL UNIQUE,
       kind TEXT NOT NULL DEFAULT 'custom' CHECK (kind IN ('morning','evening','custom')),
       weekdays TEXT NOT NULL DEFAULT '1,2,3,4,5,6,7',
       created_at INTEGER NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS routine_steps (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
       title TEXT NOT NULL,
       time TEXT,
       minutes INTEGER NOT NULL DEFAULT 10,
       sort INTEGER NOT NULL DEFAULT 0,
       remind INTEGER NOT NULL DEFAULT 0,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_steps_routine ON routine_steps(routine_id, sort)`,
    `CREATE TABLE IF NOT EXISTS routine_logs (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       step_id INTEGER NOT NULL REFERENCES routine_steps(id) ON DELETE CASCADE,
       date TEXT NOT NULL,
       status TEXT NOT NULL CHECK (status IN ('done','skipped')),
       at INTEGER NOT NULL,
       UNIQUE (step_id, date)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_rlogs_date ON routine_logs(date)`,
    `CREATE TABLE IF NOT EXISTS habits (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT NOT NULL UNIQUE,
       weekdays TEXT NOT NULL DEFAULT '1,2,3,4,5,6,7',
       archived INTEGER NOT NULL DEFAULT 0,
       created_at INTEGER NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS habit_logs (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
       date TEXT NOT NULL,
       at INTEGER NOT NULL,
       UNIQUE (habit_id, date)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_hlogs_date ON habit_logs(date)`,
    `CREATE TABLE IF NOT EXISTS daily_goals (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       date TEXT NOT NULL,
       title TEXT NOT NULL,
       done INTEGER NOT NULL DEFAULT 0,
       completed_at INTEGER,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_dgoals_date ON daily_goals(date)`,
  ],
};
