import * as SQLite from 'expo-sqlite';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { serialize, replaceWith } from '../../database/db';
import { LATEST_VERSION } from '../../database/migrations';
import { settingsRepository } from '../../database/repositories';
import { rescheduleAllFromDb } from '../reminders/reminderService';

const REQUIRED_TABLES = ['settings', 'reminders', 'tasks', 'subjects'];

const stamp = () => {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};

/** Write a consistent snapshot of gaurav_os.db to cache and open the share sheet (save to Drive/Files/etc.). */
export async function createBackup() {
  const bytes = await serialize();
  const file = new File(Paths.cache, `gaurav_os_backup_${stamp()}.db`);
  if (file.exists) file.delete();
  file.create();
  await file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) throw new Error(`Sharing is not available. The backup was saved at ${file.uri}`);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/octet-stream', dialogTitle: 'Save GAURAV OS backup' });
  await settingsRepository.set('lastBackupAt', Date.now());
  return file.uri;
}

/** Let the user pick a .db backup and validate it. Returns an opened (not yet applied) database + summary. */
export async function pickBackup() {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: '*/*' });
  if (res.canceled) return null;
  const asset = res.assets[0];
  const bytes = await new File(asset.uri).bytes();
  const header = String.fromCharCode(...bytes.slice(0, 15));
  if (header !== 'SQLite format 3') throw new Error('That file is not a SQLite database backup.');
  const db = await SQLite.deserializeDatabaseAsync(bytes);
  try {
    const names = (await db.getAllAsync("SELECT name FROM sqlite_master WHERE type='table'")).map((r) => r.name);
    const missing = REQUIRED_TABLES.filter((t) => !names.includes(t));
    if (missing.length) throw new Error('This does not look like a GAURAV OS backup.');
    const version = (await db.getFirstAsync('PRAGMA user_version')).user_version;
    if (version > LATEST_VERSION) throw new Error('This backup was made by a newer version of the app. Update the app first.');
    const count = async (t) => (names.includes(t) ? (await db.getFirstAsync(`SELECT COUNT(*) AS c FROM ${t}`)).c : 0);
    return { db, name: asset.name, version, summary: { tasks: await count('tasks'), reminders: await count('reminders'), subjects: await count('subjects'), notes: await count('notes') } };
  } catch (e) { await db.closeAsync(); throw e; }
}

/** Replace live data with the picked backup, then rebuild all native alarms from it. */
export async function applyBackup(picked) {
  try {
    await replaceWith(picked.db);
  } finally { await picked.db.closeAsync().catch(() => {}); }
  await rescheduleAllFromDb();
}
