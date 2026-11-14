// Test double for expo-sqlite backed by Node's built-in SQLite, matching the async API the app uses.
import { DatabaseSync } from 'node:sqlite';

class Db {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  async execAsync(sql) { this.db.exec(sql); }
  async runAsync(sql, params = []) {
    const r = this.db.prepare(sql).run(...params);
    return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
  }
  async getAllAsync(sql, params = []) { return this.db.prepare(sql).all(...params).map((r) => ({ ...r })); }
  async getFirstAsync(sql, params = []) { const r = this.db.prepare(sql).get(...params); return r ? { ...r } : null; }
  async withExclusiveTransactionAsync(fn) {
    this.db.exec('BEGIN');
    try { await fn(this); this.db.exec('COMMIT'); } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  async serializeAsync() { return new Uint8Array(); }
}
let shared = null;
export const openDatabaseAsync = async () => (shared ||= new Db());
export const backupDatabaseAsync = async () => {};
export const __reset = () => { shared = null; };
export const createMemoryDb = () => new Db();
