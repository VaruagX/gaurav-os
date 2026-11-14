import { all, first, run, transaction } from '../db';
import { makeRepo } from './base';

export const subjectsRepository = {
  ...makeRepo('subjects', ['name', 'code', 'kind', 'teacher', 'semester', 'target_pct', 'archived', 'created_at'], { orderBy: 'name COLLATE NOCASE' }),
  active: () => all('SELECT * FROM subjects WHERE archived = 0 ORDER BY name COLLATE NOCASE'),
  findByName: (n) => first('SELECT * FROM subjects WHERE LOWER(name) = LOWER(?) OR LOWER(code) = LOWER(?)', [n, n]),
};

const attBase = makeRepo('attendance', ['subject_id', 'date', 'slot', 'status', 'kind', 'note', 'created_at'], { orderBy: 'date DESC, slot DESC' });
export const attendanceRepository = {
  ...attBase,
  /** Per-subject totals for every non-archived subject. */
  summary: () =>
    all(`SELECT s.id, s.name, s.code, s.target_pct,
                COALESCE(SUM(a.status = 'present'), 0) AS present,
                COUNT(a.id) AS total
         FROM subjects s LEFT JOIN attendance a ON a.subject_id = s.id
         WHERE s.archived = 0 GROUP BY s.id ORDER BY s.name COLLATE NOCASE`),
  forSubject: (subjectId, limit = 200) =>
    all('SELECT * FROM attendance WHERE subject_id = ? ORDER BY date DESC, slot DESC LIMIT ?', [subjectId, limit]),
  forDate: (date) =>
    all(`SELECT a.*, s.name AS subject_name FROM attendance a JOIN subjects s ON s.id = a.subject_id WHERE a.date = ? ORDER BY a.slot`, [date]),
  /** Record a lecture. Re-marking the same (subject, date, slot) replaces the status. */
  async mark(subjectId, date, status, { slot, kind = 'theory', note = null } = {}) {
    const useSlot = slot ?? ((await first('SELECT COALESCE(MAX(slot),0)+1 AS s FROM attendance WHERE subject_id = ? AND date = ?', [subjectId, date])).s);
    await run(
      `INSERT INTO attendance (subject_id, date, slot, status, kind, note, created_at) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(subject_id, date, slot) DO UPDATE SET status = excluded.status, note = excluded.note`,
      [subjectId, date, useSlot, status, kind, note, Date.now()]
    );
    return useSlot;
  },
  /** Counts for one subject, split into lectures marked day by day and manually entered baseline. */
  async counts(subjectId) {
    const r = await first(`SELECT COALESCE(SUM(status='present' AND note IS NOT 'manual'),0) AS dayP, COALESCE(SUM(status='absent' AND note IS NOT 'manual'),0) AS dayA,
                                  COALESCE(SUM(status='present' AND note = 'manual'),0) AS manP, COALESCE(SUM(status='absent' AND note = 'manual'),0) AS manA
                           FROM attendance WHERE subject_id = ?`, [subjectId]);
    return { present: r.dayP + r.manP, absent: r.dayA + r.manA, ...r };
  },
  /**
   * Make the subject's totals equal present/absent by (re)creating a manual baseline on top of the lectures marked day by day.
   * Manual rows are dated 2000-01-01 so they never mix with real days.
   */
  async setCounts(subjectId, present, absent) {
    const c = await this.counts(subjectId);
    const needP = present - c.dayP, needA = absent - c.dayA;
    if (needP < 0 || needA < 0) throw new Error(`You have already marked ${c.dayP} present and ${c.dayA} absent day by day, so the totals can't be lower than that. Reset this subject first to start from scratch.`);
    await transaction(async (tx) => {
      await tx.runAsync(`DELETE FROM attendance WHERE subject_id = ? AND note = 'manual'`, [subjectId]);
      const now = Date.now();
      for (let i = 0; i < needP; i++) await tx.runAsync(`INSERT INTO attendance (subject_id, date, slot, status, kind, note, created_at) VALUES (?, '2000-01-01', ?, 'present', 'theory', 'manual', ?)`, [subjectId, 10000 + i, now]);
      for (let i = 0; i < needA; i++) await tx.runAsync(`INSERT INTO attendance (subject_id, date, slot, status, kind, note, created_at) VALUES (?, '2000-01-01', ?, 'absent', 'theory', 'manual', ?)`, [subjectId, 20000 + i, now]);
    });
  },
  unmark: (subjectId, date, slot) => run('DELETE FROM attendance WHERE subject_id = ? AND date = ? AND slot = ?', [subjectId, date, slot]),
  resetSubject: (subjectId) => run('DELETE FROM attendance WHERE subject_id = ?', [subjectId]),
  resetAll: () => run('DELETE FROM attendance'),
  countByStatusBetween: (from, to) =>
    first(`SELECT COALESCE(SUM(status='present'),0) AS present, COUNT(*) AS total FROM attendance WHERE date BETWEEN ? AND ?`, [from, to]),
};

export const timetableRepository = {
  ...makeRepo('timetable', ['subject_id', 'weekday', 'start_time', 'end_time', 'kind', 'room', 'teacher', 'created_at'], { orderBy: 'weekday, start_time' }),
  forDay: (weekday) =>
    all(`SELECT t.*, s.name AS subject_name, s.code AS subject_code FROM timetable t JOIN subjects s ON s.id = t.subject_id
         WHERE t.weekday = ? ORDER BY t.start_time`, [weekday]),
  week: () =>
    all(`SELECT t.*, s.name AS subject_name, s.code AS subject_code FROM timetable t JOIN subjects s ON s.id = t.subject_id
         ORDER BY t.weekday, t.start_time`),
};

export const assignmentsRepository = {
  ...makeRepo('assignments', ['subject_id', 'title', 'description', 'due_at', 'attachment', 'status', 'submitted_at', 'remind_before_min', 'created_at'], { orderBy: 'status, due_at' }),
  withSubject: (where = '', params = []) =>
    all(`SELECT a.*, s.name AS subject_name FROM assignments a LEFT JOIN subjects s ON s.id = a.subject_id
         ${where ? `WHERE ${where}` : ''} ORDER BY (a.status = 'submitted'), a.due_at`, params),
  pending: (limit = 50) =>
    all(`SELECT a.*, s.name AS subject_name FROM assignments a LEFT JOIN subjects s ON s.id = a.subject_id
         WHERE a.status = 'pending' ORDER BY a.due_at LIMIT ?`, [limit]),
  submit: (id) => run(`UPDATE assignments SET status='submitted', submitted_at=? WHERE id=?`, [Date.now(), id]),
  reopen: (id) => run(`UPDATE assignments SET status='pending', submitted_at=NULL WHERE id=?`, [id]),
  stats: () => first(`SELECT COUNT(*) AS total, COALESCE(SUM(status='submitted'),0) AS submitted FROM assignments`),
};

export const examsRepository = {
  ...makeRepo('exams', ['subject_id', 'title', 'exam_at', 'room', 'prep_status', 'notes', 'remind_before_min', 'created_at'], { orderBy: 'exam_at' }),
  withSubject: () =>
    all(`SELECT e.*, s.name AS subject_name FROM exams e LEFT JOIN subjects s ON s.id = e.subject_id ORDER BY e.exam_at`),
  upcoming: (limit = 10) =>
    all(`SELECT e.*, s.name AS subject_name FROM exams e LEFT JOIN subjects s ON s.id = e.subject_id
         WHERE e.exam_at >= ? ORDER BY e.exam_at LIMIT ?`, [Date.now(), limit]),
};

export const syllabusRepository = {
  ...makeRepo('syllabus_topics', ['subject_id', 'unit', 'title', 'done', 'weak', 'sort', 'completed_at', 'created_at'], { orderBy: 'unit, sort, id' }),
  forSubject: (subjectId) => all('SELECT * FROM syllabus_topics WHERE subject_id = ? ORDER BY unit, sort, id', [subjectId]),
  setDone: (id, done) => run('UPDATE syllabus_topics SET done = ?, completed_at = ? WHERE id = ?', [done ? 1 : 0, done ? Date.now() : null, id]),
  setWeak: (id, weak) => run('UPDATE syllabus_topics SET weak = ? WHERE id = ?', [weak ? 1 : 0, id]),
  progress: () =>
    all(`SELECT s.id, s.name, COUNT(t.id) AS total, COALESCE(SUM(t.done),0) AS done, COALESCE(SUM(t.weak),0) AS weak
         FROM subjects s LEFT JOIN syllabus_topics t ON t.subject_id = s.id WHERE s.archived = 0
         GROUP BY s.id ORDER BY s.name COLLATE NOCASE`),
  weakTopics: (limit = 20) =>
    all(`SELECT t.*, s.name AS subject_name FROM syllabus_topics t JOIN subjects s ON s.id = t.subject_id WHERE t.weak = 1 AND t.done = 0 LIMIT ?`, [limit]),
  findByTitle: (needle) =>
    all(`SELECT t.*, s.name AS subject_name FROM syllabus_topics t JOIN subjects s ON s.id = t.subject_id
         WHERE t.done = 0 AND LOWER(t.title) LIKE ? ORDER BY t.id`, [`%${needle.toLowerCase()}%`]),
  doneBetween: async (from, to) =>
    (await first('SELECT COUNT(*) AS c FROM syllabus_topics WHERE done = 1 AND completed_at BETWEEN ? AND ?', [from, to])).c,
};

export const practicalsRepository = {
  ...makeRepo('practicals', ['subject_id', 'number', 'title', 'program_done', 'journal_status', 'viva_questions', 'created_at'], { orderBy: 'number, id' }),
  forSubject: (subjectId) => all('SELECT * FROM practicals WHERE subject_id = ? ORDER BY number, id', [subjectId]),
  nextNumber: async (subjectId) => (await first('SELECT COALESCE(MAX(number),0)+1 AS n FROM practicals WHERE subject_id = ?', [subjectId])).n,
};

export const marksRepository = {
  ...makeRepo('marks', ['subject_id', 'kind', 'title', 'obtained', 'total', 'semester', 'created_at'], { orderBy: 'semester, id' }),
  withSubject: () =>
    all(`SELECT m.*, s.name AS subject_name FROM marks m JOIN subjects s ON s.id = m.subject_id ORDER BY m.semester DESC, s.name, m.id`),
  semesterSummary: () =>
    all(`SELECT semester, SUM(obtained) AS obtained, SUM(total) AS total, COUNT(*) AS n FROM marks GROUP BY semester ORDER BY semester`),
  subjectSummary: (semester) =>
    all(`SELECT s.id, s.name, SUM(m.obtained) AS obtained, SUM(m.total) AS total FROM marks m JOIN subjects s ON s.id = m.subject_id
         WHERE m.semester = ? GROUP BY s.id ORDER BY s.name`, [semester]),
};


export const cancelledRepository = {
  forDate: (date) => all('SELECT * FROM lecture_cancelled WHERE date = ?', [date]),
  async set(timetableId, date, cancelled) {
    if (cancelled) await run('INSERT OR IGNORE INTO lecture_cancelled (timetable_id, date, created_at) VALUES (?,?,?)', [timetableId, date, Date.now()]);
    else await run('DELETE FROM lecture_cancelled WHERE timetable_id = ? AND date = ?', [timetableId, date]);
  },
};

export const archivesRepository = {
  list: () => all('SELECT id, name, created_at FROM semester_archives ORDER BY created_at DESC'),
  get: (id) => first('SELECT * FROM semester_archives WHERE id = ?', [id]),
  add: (name, data) => run('INSERT INTO semester_archives (name, data, created_at) VALUES (?,?,?)', [name, JSON.stringify(data), Date.now()]),
  remove: (id) => run('DELETE FROM semester_archives WHERE id = ?', [id]),
};
