/**
 * College extras:
 *  - lecture_cancelled: a timetable lecture that did not happen on a date (cancelled / holiday). Not counted in attendance.
 *  - semester_archives: JSON snapshot of timetable + attendance totals saved before starting a new semester.
 */
export default {
  version: 14,
  name: 'lecture cancellations and semester archives',
  statements: [
    `CREATE TABLE IF NOT EXISTS lecture_cancelled (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       timetable_id INTEGER NOT NULL,
       date TEXT NOT NULL,
       created_at INTEGER NOT NULL,
       UNIQUE (timetable_id, date)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_lecture_cancelled_date ON lecture_cancelled(date)`,
    `CREATE TABLE IF NOT EXISTS semester_archives (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT NOT NULL,
       data TEXT NOT NULL,
       created_at INTEGER NOT NULL
     )`,
  ],
};
