import { all, first, run } from '../db';

const now = () => Date.now();

/**
 * Minimal table repository. Column names come from `cols` (never from user input) and all values are
 * bound as parameters. `created_at` / `updated_at` are filled automatically when the table has them.
 */
export function makeRepo(table, cols, { orderBy = 'id DESC', stamps = ['created_at'] } = {}) {
  const pick = (obj) => Object.keys(obj).filter((k) => cols.includes(k) && obj[k] !== undefined);
  const norm = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v);
  return {
    table,
    list: (where = '', params = [], extra = '') =>
      all(`SELECT * FROM ${table} ${where ? `WHERE ${where}` : ''} ORDER BY ${orderBy} ${extra}`, params),
    get: (id) => first(`SELECT * FROM ${table} WHERE id = ?`, [id]),
    count: async (where = '', params = []) =>
      (await first(`SELECT COUNT(*) AS c FROM ${table} ${where ? `WHERE ${where}` : ''}`, params)).c,
    async insert(obj) {
      const data = { ...obj };
      for (const s of stamps) if (data[s] === undefined) data[s] = now();
      const keys = pick(data);
      const res = await run(
        `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        keys.map((k) => norm(data[k]))
      );
      return res.lastInsertRowId;
    },
    async update(id, obj) {
      const data = { ...obj };
      if (stamps.includes('updated_at')) data.updated_at = now();
      const keys = pick(data);
      if (!keys.length) return;
      await run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(',')} WHERE id = ?`, [...keys.map((k) => norm(data[k])), id]);
    },
    remove: (id) => run(`DELETE FROM ${table} WHERE id = ?`, [id]),
  };
}

export { all, first, run, now };
