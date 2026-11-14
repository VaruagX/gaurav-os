export default {
  version: 6,
  name: 'study sessions, planner, revision, flashcards, mcq',
  statements: [
    `CREATE TABLE IF NOT EXISTS study_sessions (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
       topic TEXT,
       mode TEXT NOT NULL DEFAULT 'focus' CHECK (mode IN ('focus','pomodoro','manual')),
       seconds INTEGER NOT NULL CHECK (seconds >= 0),
       date TEXT NOT NULL,
       started_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_date ON study_sessions(date)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_subject ON study_sessions(subject_id)`,
    `CREATE TABLE IF NOT EXISTS study_plan (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       date TEXT NOT NULL,
       subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
       title TEXT NOT NULL,
       planned_min INTEGER NOT NULL DEFAULT 30,
       done INTEGER NOT NULL DEFAULT 0,
       completed_at INTEGER,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_plan_date ON study_plan(date)`,
    `CREATE TABLE IF NOT EXISTS revisions (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
       topic TEXT NOT NULL,
       stage INTEGER NOT NULL DEFAULT 0,
       next_date TEXT NOT NULL,
       last_done TEXT,
       status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','mastered')),
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_revisions_next ON revisions(status, next_date)`,
    `CREATE TABLE IF NOT EXISTS flashcards (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
       front TEXT NOT NULL,
       back TEXT NOT NULL,
       box INTEGER NOT NULL DEFAULT 0,
       next_review TEXT NOT NULL,
       correct INTEGER NOT NULL DEFAULT 0,
       wrong INTEGER NOT NULL DEFAULT 0,
       created_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_flashcards_next ON flashcards(next_review)`,
    `CREATE TABLE IF NOT EXISTS mcq_questions (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
       question TEXT NOT NULL,
       options TEXT NOT NULL,
       answer_index INTEGER NOT NULL,
       explanation TEXT,
       attempts INTEGER NOT NULL DEFAULT 0,
       correct INTEGER NOT NULL DEFAULT 0,
       created_at INTEGER NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS mcq_attempts (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       question_id INTEGER NOT NULL REFERENCES mcq_questions(id) ON DELETE CASCADE,
       is_correct INTEGER NOT NULL,
       at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_mcq_attempts_at ON mcq_attempts(at)`,
  ],
};
