export default {
  version: 4,
  name: 'college subjects and attendance',
  statements: [
    `CREATE TABLE IF NOT EXISTS subjects (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT NOT NULL UNIQUE,
       code TEXT,
       kind TEXT NOT NULL DEFAULT 'theory' CHECK (kind IN ('theory','practical','both')),
       teacher TEXT,
       semester TEXT,
       target_pct REAL NOT NULL DEFAULT 75,
       archived INTEGER NOT NULL DEFAULT 0,
       created_at INTEGER NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS attendance (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
       date TEXT NOT NULL,
       slot INTEGER NOT NULL DEFAULT 1,
       status TEXT NOT NULL CHECK (status IN ('present','absent')),
       kind TEXT NOT NULL DEFAULT 'theory',
       note TEXT,
       created_at INTEGER NOT NULL,
       UNIQUE (subject_id, date, slot)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_subject ON attendance(subject_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date)`,
  ],
};
