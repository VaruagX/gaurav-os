export default {
  version: 5,
  name: 'timetable, assignments, exams, syllabus, practicals, marks',
  statements: [
    `CREATE TABLE IF NOT EXISTS timetable (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
       weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
       start_time TEXT NOT NULL,
       end_time TEXT NOT NULL,
       kind TEXT NOT NULL DEFAULT 'theory' CHECK (kind IN ('theory','practical')),
       room TEXT,
       teacher TEXT,
       created_at INTEGER NOT NULL,
       UNIQUE (weekday, start_time, subject_id)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_timetable_day ON timetable(weekday, start_time)`,
    `CREATE TABLE IF NOT EXISTS assignments (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
       title TEXT NOT NULL,
       description TEXT,
       due_at INTEGER NOT NULL,
       attachment TEXT,
       status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted')),
       submitted_at INTEGER,
       remind_before_min INTEGER,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_assignments_status_due ON assignments(status, due_at)`,
    `CREATE TABLE IF NOT EXISTS exams (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
       title TEXT NOT NULL,
       exam_at INTEGER NOT NULL,
       room TEXT,
       prep_status TEXT NOT NULL DEFAULT 'not_started' CHECK (prep_status IN ('not_started','in_progress','ready')),
       notes TEXT,
       remind_before_min INTEGER,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_exams_at ON exams(exam_at)`,
    `CREATE TABLE IF NOT EXISTS syllabus_topics (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
       unit TEXT NOT NULL DEFAULT 'Unit 1',
       title TEXT NOT NULL,
       done INTEGER NOT NULL DEFAULT 0,
       weak INTEGER NOT NULL DEFAULT 0,
       sort INTEGER NOT NULL DEFAULT 0,
       completed_at INTEGER,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_topics_subject ON syllabus_topics(subject_id, unit, sort)`,
    `CREATE TABLE IF NOT EXISTS practicals (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
       number INTEGER NOT NULL DEFAULT 1,
       title TEXT NOT NULL,
       program_done INTEGER NOT NULL DEFAULT 0,
       journal_status TEXT NOT NULL DEFAULT 'pending' CHECK (journal_status IN ('pending','written','submitted')),
       viva_questions TEXT,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_practicals_subject ON practicals(subject_id, number)`,
    `CREATE TABLE IF NOT EXISTS marks (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
       kind TEXT NOT NULL DEFAULT 'internal' CHECK (kind IN ('internal','practical','theory')),
       title TEXT NOT NULL,
       obtained REAL NOT NULL,
       total REAL NOT NULL CHECK (total > 0),
       semester TEXT NOT NULL DEFAULT '1',
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_marks_subject ON marks(subject_id, semester)`,
  ],
};
