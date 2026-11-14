import { all, first, run, transaction } from '../db';
import { makeRepo } from './base';

const routinesBase = makeRepo('routines', ['name', 'kind', 'weekdays', 'created_at'], { orderBy: 'id' });
const stepsBase = makeRepo('routine_steps', ['routine_id', 'title', 'time', 'minutes', 'sort', 'remind', 'created_at'], { orderBy: 'sort, id' });

export const routinesRepository = {
  ...routinesBase,
  steps: (routineId) => all('SELECT * FROM routine_steps WHERE routine_id = ? ORDER BY sort, id', [routineId]),
  stepsBase,
  async addStep(routineId, data) {
    const sort = (await first('SELECT COALESCE(MAX(sort),0)+1 AS s FROM routine_steps WHERE routine_id = ?', [routineId])).s;
    return stepsBase.insert({ ...data, routine_id: routineId, sort });
  },
  removeStep: (id) => stepsBase.remove(id),
  updateStep: (id, d) => stepsBase.update(id, d),
  async moveStep(routineId, stepId, dir) {
    const steps = await all('SELECT id FROM routine_steps WHERE routine_id = ? ORDER BY sort, id', [routineId]);
    const i = steps.findIndex((s) => s.id === stepId), j = i + dir;
    if (i < 0 || j < 0 || j >= steps.length) return;
    const order = steps.map((s) => s.id);
    [order[i], order[j]] = [order[j], order[i]];
    await transaction(async (tx) => { for (let k = 0; k < order.length; k++) await tx.runAsync('UPDATE routine_steps SET sort = ? WHERE id = ?', [k, order[k]]); });
  },
  /** Steps with completion state for a date. */
  stepsForDate: (routineId, date) =>
    all(`SELECT st.*, l.status AS log_status FROM routine_steps st
         LEFT JOIN routine_logs l ON l.step_id = st.id AND l.date = ?
         WHERE st.routine_id = ? ORDER BY st.sort, st.id`, [date, routineId]),
  setStepStatus: (stepId, date, status) =>
    status
      ? run(`INSERT INTO routine_logs (step_id, date, status, at) VALUES (?,?,?,?)
             ON CONFLICT(step_id, date) DO UPDATE SET status = excluded.status, at = excluded.at`, [stepId, date, status, Date.now()])
      : run('DELETE FROM routine_logs WHERE step_id = ? AND date = ?', [stepId, date]),
  /** Done-step counts per date within a range. */
  doneByDay: (from, to) =>
    all(`SELECT date, COUNT(*) AS done FROM routine_logs WHERE status = 'done' AND date BETWEEN ? AND ? GROUP BY date`, [from, to]),
  totalSteps: async () => (await first('SELECT COUNT(*) AS c FROM routine_steps')).c,
  /** Steps scheduled on `weekday` whose log for `date` is missing; used for "missed task recovery". */
  incompleteForDate: (date, weekday) =>
    all(`SELECT st.*, r.name AS routine_name FROM routine_steps st JOIN routines r ON r.id = st.routine_id
         LEFT JOIN routine_logs l ON l.step_id = st.id AND l.date = ?
         WHERE l.id IS NULL AND (',' || r.weekdays || ',') LIKE ? ORDER BY r.id, st.sort`, [date, `%,${weekday},%`]),
  findStepByTitle: (needle) =>
    all(`SELECT st.*, r.name AS routine_name FROM routine_steps st JOIN routines r ON r.id = st.routine_id
         WHERE LOWER(st.title) LIKE ? ORDER BY st.id`, [`%${needle.toLowerCase()}%`]),
};

const habitsBase = makeRepo('habits', ['name', 'weekdays', 'archived', 'created_at'], { orderBy: 'id' });
export const habitsRepository = {
  ...habitsBase,
  active: () => all('SELECT * FROM habits WHERE archived = 0 ORDER BY id'),
  logsBetween: (from, to) => all('SELECT habit_id, date FROM habit_logs WHERE date BETWEEN ? AND ?', [from, to]),
  allLogs: (habitId) => all('SELECT date FROM habit_logs WHERE habit_id = ? ORDER BY date DESC', [habitId]),
  setDone: (habitId, date, done) =>
    done
      ? run('INSERT OR IGNORE INTO habit_logs (habit_id, date, at) VALUES (?,?,?)', [habitId, date, Date.now()])
      : run('DELETE FROM habit_logs WHERE habit_id = ? AND date = ?', [habitId, date]),
  findByName: (needle) => all('SELECT * FROM habits WHERE archived = 0 AND LOWER(name) LIKE ?', [`%${needle.toLowerCase()}%`]),
};

export const dailyGoalsRepository = {
  ...makeRepo('daily_goals', ['date', 'title', 'done', 'completed_at', 'created_at'], { orderBy: 'done, id' }),
  forDate: (date) => all('SELECT * FROM daily_goals WHERE date = ? ORDER BY done, id', [date]),
  setDone: (id, done) => run('UPDATE daily_goals SET done = ?, completed_at = ? WHERE id = ?', [done ? 1 : 0, done ? Date.now() : null, id]),
  statsBetween: (from, to) =>
    first('SELECT COUNT(*) AS total, COALESCE(SUM(done),0) AS done FROM daily_goals WHERE date BETWEEN ? AND ?', [from, to]),
};
