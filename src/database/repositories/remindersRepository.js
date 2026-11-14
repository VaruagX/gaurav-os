import { all, first, run } from '../db';
import { makeRepo } from './base';

const cols = ['title', 'message', 'mode', 'speak_enabled', 'lang', 'rate', 'pitch', 'snooze_min', 'repeat', 'time',
  'weekdays', 'once_at', 'enabled', 'next_at', 'source', 'source_id', 'created_at', 'updated_at'];
const base = makeRepo('reminders', cols, { orderBy: 'enabled DESC, (next_at IS NULL), next_at, id', stamps: ['created_at', 'updated_at'] });

export const remindersRepository = {
  ...base,
  user: () => base.list(`source = 'user'`),
  allEnabled: () => base.list('enabled = 1'),
  findBySource: (source, sourceId) => first('SELECT * FROM reminders WHERE source = ? AND source_id = ?', [source, sourceId]),
  removeBySource: (source, sourceId) => run('DELETE FROM reminders WHERE source = ? AND source_id = ?', [source, sourceId]),
  upcoming: (limit = 5) =>
    all(`SELECT * FROM reminders WHERE enabled = 1 AND next_at IS NOT NULL AND next_at > ? ORDER BY next_at LIMIT ?`, [Date.now(), limit]),
  history: (limit = 100) => all('SELECT * FROM reminder_history ORDER BY at DESC LIMIT ?', [limit]),
  addHistory: (reminderId, title, event, at = Date.now(), detail = null) =>
    run('INSERT INTO reminder_history (reminder_id, title, event, detail, at) VALUES (?,?,?,?,?)', [reminderId, title, event, detail, at]),
  clearHistory: () => run('DELETE FROM reminder_history'),
  historyCount: async (event, from, to) =>
    (await first('SELECT COUNT(*) AS c FROM reminder_history WHERE event = ? AND at BETWEEN ? AND ?', [event, from, to])).c,
};
