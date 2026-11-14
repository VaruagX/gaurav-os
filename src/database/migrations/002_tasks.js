export default {
  version: 2,
  name: 'tasks',
  statements: [
    `CREATE TABLE IF NOT EXISTS tasks (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       title TEXT NOT NULL,
       notes TEXT,
       category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
       priority INTEGER NOT NULL DEFAULT 1 CHECK (priority BETWEEN 0 AND 2),
       due_at INTEGER,
       status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
       completed_at INTEGER,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_at)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed_at)`,
  ],
};
