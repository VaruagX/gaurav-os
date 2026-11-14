import { all, first, run } from '../db';
import { makeRepo } from './base';

export const studySessionsRepository = {
  ...makeRepo('study_sessions', ['subject_id', 'topic', 'mode', 'seconds', 'date', 'started_at'], { orderBy: 'started_at DESC', stamps: [] }),
  recent: (limit = 50) =>
    all(`SELECT ss.*, s.name AS subject_name FROM study_sessions ss LEFT JOIN subjects s ON s.id = ss.subject_id
         ORDER BY ss.started_at DESC LIMIT ?`, [limit]),
  secondsOn: async (date) => (await first('SELECT COALESCE(SUM(seconds),0) AS s FROM study_sessions WHERE date = ?', [date])).s,
  /** [{date, seconds}] for an inclusive date range. */
  byDay: (from, to) =>
    all('SELECT date, SUM(seconds) AS seconds FROM study_sessions WHERE date BETWEEN ? AND ? GROUP BY date', [from, to]),
  bySubject: (from, to) =>
    all(`SELECT COALESCE(s.name, 'General') AS name, SUM(ss.seconds) AS seconds FROM study_sessions ss
         LEFT JOIN subjects s ON s.id = ss.subject_id WHERE ss.date BETWEEN ? AND ? GROUP BY ss.subject_id ORDER BY seconds DESC`, [from, to]),
  totalSeconds: async () => (await first('SELECT COALESCE(SUM(seconds),0) AS s FROM study_sessions')).s,
};

export const studyPlanRepository = {
  ...makeRepo('study_plan', ['date', 'subject_id', 'title', 'planned_min', 'done', 'completed_at', 'created_at'], { orderBy: 'done, id' }),
  forDate: (date) =>
    all(`SELECT p.*, s.name AS subject_name FROM study_plan p LEFT JOIN subjects s ON s.id = p.subject_id WHERE p.date = ? ORDER BY p.done, p.id`, [date]),
  setDone: (id, done) => run('UPDATE study_plan SET done = ?, completed_at = ? WHERE id = ?', [done ? 1 : 0, done ? Date.now() : null, id]),
  findByTitle: (needle) =>
    all(`SELECT * FROM study_plan WHERE done = 0 AND LOWER(title) LIKE ? ORDER BY date DESC, id DESC`, [`%${needle.toLowerCase()}%`]),
};

export const revisionsRepository = {
  ...makeRepo('revisions', ['subject_id', 'topic', 'stage', 'next_date', 'last_done', 'status', 'created_at'], { orderBy: 'next_date' }),
  due: (date) =>
    all(`SELECT r.*, s.name AS subject_name FROM revisions r LEFT JOIN subjects s ON s.id = r.subject_id
         WHERE r.status = 'active' AND r.next_date <= ? ORDER BY r.next_date`, [date]),
  active: () =>
    all(`SELECT r.*, s.name AS subject_name FROM revisions r LEFT JOIN subjects s ON s.id = r.subject_id WHERE r.status = 'active' ORDER BY r.next_date`),
};

export const flashcardsRepository = {
  ...makeRepo('flashcards', ['subject_id', 'front', 'back', 'box', 'next_review', 'correct', 'wrong', 'created_at'], { orderBy: 'id DESC' }),
  due: (date) =>
    all(`SELECT f.*, s.name AS subject_name FROM flashcards f LEFT JOIN subjects s ON s.id = f.subject_id WHERE f.next_review <= ? ORDER BY f.next_review, f.id`, [date]),
  withSubject: () =>
    all(`SELECT f.*, s.name AS subject_name FROM flashcards f LEFT JOIN subjects s ON s.id = f.subject_id ORDER BY f.id DESC`),
};

export const mcqRepository = {
  ...makeRepo('mcq_questions', ['subject_id', 'question', 'options', 'answer_index', 'explanation', 'attempts', 'correct', 'created_at'], { orderBy: 'id DESC' }),
  withSubject: () =>
    all(`SELECT q.*, s.name AS subject_name FROM mcq_questions q LEFT JOIN subjects s ON s.id = q.subject_id ORDER BY q.id DESC`),
  /** Least-accurate / least-practised first. */
  practiceSet: (limit = 10, subjectId = null) =>
    all(`SELECT * FROM mcq_questions ${subjectId ? 'WHERE subject_id = ?' : ''}
         ORDER BY (CASE WHEN attempts = 0 THEN 0 ELSE 1.0 * correct / attempts END), RANDOM() LIMIT ?`,
      subjectId ? [subjectId, limit] : [limit]),
  async recordAttempt(id, isCorrect) {
    await run('UPDATE mcq_questions SET attempts = attempts + 1, correct = correct + ? WHERE id = ?', [isCorrect ? 1 : 0, id]);
    await run('INSERT INTO mcq_attempts (question_id, is_correct, at) VALUES (?,?,?)', [id, isCorrect ? 1 : 0, Date.now()]);
  },
  statsBetween: (from, to) =>
    first('SELECT COUNT(*) AS attempts, COALESCE(SUM(is_correct),0) AS correct FROM mcq_attempts WHERE at BETWEEN ? AND ?', [from, to]),
};
