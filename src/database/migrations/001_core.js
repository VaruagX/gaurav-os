export default {
  version: 1,
  name: 'core settings and categories',
  statements: [
    `CREATE TABLE IF NOT EXISTS settings (
       key TEXT PRIMARY KEY NOT NULL,
       value TEXT,
       updated_at INTEGER NOT NULL DEFAULT 0
     )`,
    `CREATE TABLE IF NOT EXISTS categories (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT NOT NULL,
       kind TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('task','expense','note','general')),
       color TEXT,
       created_at INTEGER NOT NULL,
       UNIQUE (name, kind)
     )`,
    `INSERT OR IGNORE INTO categories (name, kind, color, created_at) VALUES
       ('College','task','#8E9AAF',0),('Personal','task','#B8A9C9',0),('Coding','task','#9CB8A6',0),
       ('Health','task','#D9B38C',0),('Food','expense','#D9B38C',0),('Travel','expense','#8E9AAF',0),
       ('Study','expense','#9CB8A6',0),('Other','expense','#B8A9C9',0)`,
  ],
};
