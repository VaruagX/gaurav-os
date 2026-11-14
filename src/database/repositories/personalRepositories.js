import { all, first, run } from '../db';
import { makeRepo } from './base';

export const notesRepository = {
  ...makeRepo('notes', ['title', 'body', 'is_idea', 'pinned', 'created_at', 'updated_at'], { orderBy: 'pinned DESC, updated_at DESC', stamps: ['created_at', 'updated_at'] }),
  search: (q) => all(`SELECT * FROM notes WHERE LOWER(title) LIKE ? OR LOWER(body) LIKE ? ORDER BY pinned DESC, updated_at DESC`, [`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`]),
};

export const goalsRepository = {
  ...makeRepo('goals', ['title', 'description', 'target_date', 'progress', 'status', 'completed_at', 'created_at'], { orderBy: "status, (target_date IS NULL), target_date, id" }),
  active: () => all(`SELECT * FROM goals WHERE status = 'active' ORDER BY (target_date IS NULL), target_date`),
  stats: () => first(`SELECT COUNT(*) AS total, COALESCE(SUM(status='done'),0) AS done FROM goals`),
};

export const eventsRepository = {
  ...makeRepo('events', ['title', 'date', 'notes', 'created_at'], { orderBy: 'date' }),
  upcoming: (fromDate, limit = 5) => all('SELECT * FROM events WHERE date >= ? ORDER BY date LIMIT ?', [fromDate, limit]),
};

export const codingRepository = {
  ...makeRepo('coding_log', ['date', 'platform', 'problem', 'topic', 'difficulty', 'minutes', 'solved', 'created_at'], { orderBy: 'date DESC, id DESC' }),
  byDay: (from, to) => all('SELECT date, COUNT(*) AS n, SUM(minutes) AS minutes FROM coding_log WHERE date BETWEEN ? AND ? GROUP BY date', [from, to]),
  byDifficulty: () => all('SELECT difficulty, COUNT(*) AS n FROM coding_log WHERE solved = 1 GROUP BY difficulty'),
  allDates: () => all('SELECT DISTINCT date FROM coding_log ORDER BY date DESC'),
};

export const englishRepository = {
  ...makeRepo('english_log', ['date', 'activity', 'minutes', 'new_words', 'created_at'], { orderBy: 'date DESC, id DESC' }),
  byDay: (from, to) => all('SELECT date, SUM(minutes) AS minutes FROM english_log WHERE date BETWEEN ? AND ? GROUP BY date', [from, to]),
  allDates: () => all('SELECT DISTINCT date FROM english_log ORDER BY date DESC'),
};

export const subscriptionsRepository = {
  ...makeRepo('subscriptions', ['name', 'amount', 'cycle', 'next_due', 'active', 'created_at'], { orderBy: 'active DESC, next_due' }),
};

export const purchasesRepository = {
  ...makeRepo('purchases', ['item', 'price', 'purchase_date', 'warranty_until', 'store', 'notes', 'created_at'], { orderBy: 'purchase_date DESC' }),
};

export const documentsRepository = {
  ...makeRepo('documents', ['title', 'category', 'stored_name', 'display_name', 'mime', 'size', 'created_at'], { orderBy: 'created_at DESC' }),
};

export const achievementsRepository = {
  ...makeRepo('achievements', ['title', 'date', 'notes', 'created_at'], { orderBy: 'date DESC, id DESC' }),
};

export const assistantRepository = {
  add: (role, text, intent = null) =>
    run('INSERT INTO assistant_history (role, text, intent, created_at) VALUES (?,?,?,?)', [role, text, intent, Date.now()]),
  recent: (limit = 60) =>
    all('SELECT * FROM (SELECT * FROM assistant_history ORDER BY id DESC LIMIT ?) ORDER BY id', [limit]),
  recentCommands: (limit = 8) =>
    all(`SELECT text, MAX(created_at) AS at FROM assistant_history WHERE role = 'user' GROUP BY text ORDER BY at DESC LIMIT ?`, [limit]),
  clear: () => run('DELETE FROM assistant_history'),
};

export const reportsRepository = {
  save: (kind, key, data) =>
    run(`INSERT INTO reports (kind, period_key, data, created_at) VALUES (?,?,?,?)
         ON CONFLICT(kind, period_key) DO UPDATE SET data = excluded.data, created_at = excluded.created_at`, [kind, key, JSON.stringify(data), Date.now()]),
  list: (kind, limit = 12) => all('SELECT * FROM reports WHERE kind = ? ORDER BY period_key DESC LIMIT ?', [kind, limit]),
};

export const callLogRepository = {
  add: (name, outcome, detail, at = Date.now()) =>
    run('INSERT INTO call_assistant_log (name, outcome, detail, at) VALUES (?,?,?,?)', [name || null, outcome, detail || null, at]),
  recent: (limit = 30) => all('SELECT * FROM call_assistant_log ORDER BY at DESC LIMIT ?', [limit]),
  clear: () => run('DELETE FROM call_assistant_log'),
};
