import * as SQLite from 'expo-sqlite';
import { migrations } from './migrations';

export const DB_NAME = 'gaurav_os.db';
let dbPromise = null;
const listeners = new Set();
let version = 0;

/** Subscribe to "data changed" notifications (used by useQuery to refresh screens). */
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getVersion = () => version;
const notify = () => { version += 1; listeners.forEach((fn) => fn(version)); };
export const notifyChanged = notify;

/** Run pending migrations, each inside its own transaction, tracked by PRAGMA user_version. */
export async function runMigrations(db) {
  const row = await db.getFirstAsync('PRAGMA user_version');
  let current = row?.user_version ?? 0;
  for (const m of migrations) {
    if (m.version <= current) continue;
    try {
      await db.withExclusiveTransactionAsync(async (tx) => {
        for (const stmt of m.statements) await tx.execAsync(stmt);
        await tx.execAsync(`PRAGMA user_version = ${m.version}`);
      });
      current = m.version;
    } catch (e) {
      throw new Error(`Migration ${m.version} (${m.name}) failed: ${e.message}`);
    }
  }
  return current;
}

async function open() {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await runMigrations(db);
  return db;
}

/** Initialise (once) and return the database. Safe to call from anywhere. */
export function getDb() {
  if (!dbPromise) dbPromise = open().catch((e) => { dbPromise = null; throw e; });
  return dbPromise;
}

export const initDatabase = getDb;

export async function all(sql, params = []) { return (await getDb()).getAllAsync(sql, params); }
export async function first(sql, params = []) { return (await getDb()).getFirstAsync(sql, params); }
export async function run(sql, params = []) {
  const r = await (await getDb()).runAsync(sql, params);
  notify();
  return r;
}
/** Execute several writes atomically: tx(async (t) => { await t.runAsync(...) }) */
export async function transaction(fn) {
  const db = await getDb();
  let out;
  await db.withExclusiveTransactionAsync(async (tx) => { out = await fn(tx); });
  notify();
  return out;
}

/** Replace the live database contents with another open database (used by restore). */
export async function replaceWith(sourceDb) {
  const db = await getDb();
  await SQLite.backupDatabaseAsync({ sourceDatabase: sourceDb, destDatabase: db });
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await runMigrations(db); // a backup from an older app version is brought up to date
  notify();
}

export async function serialize() {
  const db = await getDb();
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  return db.serializeAsync();
}
