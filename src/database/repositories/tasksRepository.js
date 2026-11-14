import { all, run, first } from '../db';
import { makeRepo } from './base';

const base = makeRepo('tasks', ['title', 'notes', 'category_id', 'priority', 'due_at', 'status', 'completed_at', 'created_at', 'updated_at'], {
  orderBy: 'id DESC', stamps: ['created_at', 'updated_at'],
});

export const tasksRepository = {
  ...base,
  pending: (limit = 100) =>
    all(
      `SELECT t.*, c.name AS category FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.status = 'pending'
       ORDER BY (t.due_at IS NULL), t.due_at, t.priority DESC, t.id LIMIT ?`, [limit]
    ),
  completed: (limit = 50) =>
    all(`SELECT * FROM tasks WHERE status = 'done' ORDER BY completed_at DESC LIMIT ?`, [limit]),
  complete: (id) => base.update(id, { status: 'done', completed_at: Date.now() }),
  reopen: (id) => base.update(id, { status: 'pending', completed_at: null }),
  countPending: async () => (await first(`SELECT COUNT(*) AS c FROM tasks WHERE status='pending'`)).c,
  completedBetween: async (from, to) =>
    (await first(`SELECT COUNT(*) AS c FROM tasks WHERE status='done' AND completed_at BETWEEN ? AND ?`, [from, to])).c,
  findByTitle: (needle) =>
    all(`SELECT * FROM tasks WHERE status='pending' AND LOWER(title) LIKE ? ORDER BY id DESC`, [`%${needle.toLowerCase()}%`]),
  createdBetween: async (from, to) =>
    (await first(`SELECT COUNT(*) AS c FROM tasks WHERE created_at BETWEEN ? AND ?`, [from, to])).c,
  clearCompleted: () => run(`DELETE FROM tasks WHERE status = 'done'`),
};

export const categoriesRepository = {
  list: (kind) => all('SELECT * FROM categories WHERE kind = ? ORDER BY name', [kind]),
  async ensure(name, kind) {
    await run('INSERT OR IGNORE INTO categories (name, kind, created_at) VALUES (?, ?, ?)', [name, kind, Date.now()]);
    return first('SELECT * FROM categories WHERE name = ? AND kind = ?', [name, kind]);
  },
};
