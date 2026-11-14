import test from 'node:test';
import assert from 'node:assert/strict';
import { getDb, all, first, runMigrations } from '../src/database/db.js';
import { migrations, LATEST_VERSION } from '../src/database/migrations/index.js';
import {
  tasksRepository, remindersRepository, subjectsRepository, attendanceRepository, assignmentsRepository,
  routinesRepository, habitsRepository, settingsRepository, flashcardsRepository,
} from '../src/database/repositories/index.js';

test('migrations apply cleanly and are idempotent', async () => {
  const db = await getDb();
  const v = (await db.getFirstAsync('PRAGMA user_version')).user_version;
  assert.equal(v, LATEST_VERSION);
  assert.equal(migrations.length, 14);
  await runMigrations(db); // second run is a no-op
  const tables = (await all("SELECT name FROM sqlite_master WHERE type='table'")).map((r) => r.name);
  for (const t of ['settings', 'tasks', 'reminders', 'reminder_history', 'subjects', 'attendance', 'timetable', 'assignments', 'exams',
    'lecture_cancelled', 'semester_archives', 'study_sessions', 'revisions', 'flashcards', 'routines', 'habits', 'notes', 'documents', 'assistant_history', 'reports']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
});

test('foreign keys: deleting a subject cascades to attendance', async () => {
  const db = await getDb();
  await db.execAsync('PRAGMA foreign_keys = ON');
  const sid = await subjectsRepository.insert({ name: 'DBMS', target_pct: 75 });
  await attendanceRepository.mark(sid, '2026-11-10', 'present');
  await attendanceRepository.mark(sid, '2026-11-10', 'absent');
  assert.equal((await attendanceRepository.forSubject(sid)).length, 2);
  await subjectsRepository.remove(sid);
  assert.equal((await attendanceRepository.forSubject(sid)).length, 0);
});

test('attendance summary and unique slot constraint', async () => {
  const sid = await subjectsRepository.insert({ name: 'OS' });
  const slot = await attendanceRepository.mark(sid, '2026-11-11', 'present');
  await attendanceRepository.mark(sid, '2026-11-11', 'absent', { slot }); // re-mark replaces
  const s = (await attendanceRepository.summary()).find((x) => x.id === sid);
  assert.equal(s.total, 1); assert.equal(s.present, 0);
});

test('unique constraint rejects duplicate subject names', async () => {
  await subjectsRepository.insert({ name: 'Maths' });
  await assert.rejects(() => subjectsRepository.insert({ name: 'Maths' }));
});

test('tasks lifecycle', async () => {
  const id = await tasksRepository.insert({ title: 'Write journal', priority: 2 });
  assert.equal((await tasksRepository.pending()).length >= 1, true);
  await tasksRepository.complete(id);
  assert.equal((await tasksRepository.get(id)).status, 'done');
  assert.equal((await tasksRepository.findByTitle('journal')).length, 0);
});

test('reminder source uniqueness and history cascade', async () => {
  const base = { title: 'Due', time: '10:00', repeat: 'once', once_at: Date.now() + 1e6, source: 'assignment', source_id: 7 };
  const id = await remindersRepository.insert(base);
  await assert.rejects(() => remindersRepository.insert(base));
  await remindersRepository.addHistory(id, 'Due', 'fired');
  assert.equal((await remindersRepository.history()).length, 1);
  await remindersRepository.remove(id);
  assert.equal((await remindersRepository.history()).length, 0);
});

test('routine steps ordering, logs and habits', async () => {
  const rid = await routinesRepository.insert({ name: 'Morning', kind: 'morning' });
  const a = await routinesRepository.addStep(rid, { title: 'Wake up' });
  const b = await routinesRepository.addStep(rid, { title: 'Breakfast' });
  await routinesRepository.moveStep(rid, b, -1);
  assert.deepEqual((await routinesRepository.steps(rid)).map((s) => s.title), ['Breakfast', 'Wake up']);
  await routinesRepository.setStepStatus(a, '2026-11-14', 'done');
  await routinesRepository.setStepStatus(a, '2026-11-14', 'done'); // upsert, no duplicate
  assert.equal((await routinesRepository.doneByDay('2026-11-14', '2026-11-14'))[0].done, 1);
  const hid = await habitsRepository.insert({ name: 'Read' });
  await habitsRepository.setDone(hid, '2026-11-14', true);
  await habitsRepository.setDone(hid, '2026-11-14', true);
  assert.equal((await habitsRepository.allLogs(hid)).length, 1);
});

test('settings upsert and defaults', async () => {
  assert.equal(await settingsRepository.get('userName'), 'Gaurav');
  await settingsRepository.set('userName', 'Test');
  assert.equal(await settingsRepository.get('userName'), 'Test');
});

test('CHECK constraints reject bad data', async () => {
  await assert.rejects(() => assignmentsRepository.insert({ title: 'x', due_at: 1, status: 'weird' }));
  await assert.rejects(() => flashcardsRepository.insert({ front: 'a' })); // missing NOT NULL columns
});

test('attendance: manual counts, reset subject and reset all', async () => {
  const id = await subjectsRepository.insert({ name: 'MANUAL TEST', kind: 'theory', target_pct: 75 });
  await attendanceRepository.setCounts(id, 19, 4);
  let c = await attendanceRepository.counts(id);
  assert.deepEqual([c.present, c.absent], [19, 4]);
  await attendanceRepository.mark(id, '2026-11-14', 'present', { slot: 1001 });
  c = await attendanceRepository.counts(id);
  assert.deepEqual([c.present, c.absent], [20, 4]);
  await attendanceRepository.setCounts(id, 30, 6); // keeps the day-marked lecture, rebuilds the baseline
  c = await attendanceRepository.counts(id);
  assert.deepEqual([c.present, c.absent, c.dayP], [30, 6, 1]);
  await assert.rejects(() => attendanceRepository.setCounts(id, 0, 0), /Reset this subject/);
  await attendanceRepository.resetSubject(id);
  c = await attendanceRepository.counts(id);
  assert.deepEqual([c.present, c.absent], [0, 0]);
  await attendanceRepository.setCounts(id, 2, 1);
  await attendanceRepository.resetAll();
  assert.equal((await first('SELECT COUNT(*) AS c FROM attendance')).c, 0);
});
