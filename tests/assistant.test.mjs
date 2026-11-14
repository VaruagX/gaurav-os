import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCommand } from '../src/services/assistant/engine.js';
import { parseTime, parseRepeat, parseRelative } from '../src/services/assistant/parse.js';
import { classesNeeded, classesCanSkip, pct } from '../src/services/college/attendance.js';
import { habitStreak } from '../src/services/routine/habits.js';
import { remindersRepository, tasksRepository, subjectsRepository, attendanceRepository, studyPlanRepository, timetableRepository } from '../src/database/repositories/index.js';

test('time parsing', () => {
  assert.equal(parseTime('remind me at 10 PM'), '22:00');
  assert.equal(parseTime('at 7:30 am'), '07:30');
  assert.equal(parseTime('12 am'), '00:00');
  assert.equal(parseTime('12 pm'), '12:00');
  assert.equal(parseTime('at 18:45'), '18:45');
  assert.equal(parseTime('hello'), null);
  assert.equal(parseRelative('in 15 minutes'), 15 * 60000);
  assert.deepEqual(parseRepeat('every day'), { repeat: 'daily', weekdays: [] });
  assert.deepEqual(parseRepeat('every monday'), { repeat: 'weekly', weekdays: [1] });
});

test('attendance maths', () => {
  assert.equal(classesNeeded(6, 10, 75), 6);   // (6+6)/(16)=75%
  assert.equal(classesNeeded(8, 10, 75), 0);
  assert.equal(classesCanSkip(9, 10, 75), 2);  // 9/12 = 75%
  assert.equal(classesCanSkip(7, 10, 75), 0);
  assert.equal(pct(0, 0), null);
});

test('habit streak counts scheduled days', () => {
  const done = new Set(['2026-11-14', '2026-11-13', '2026-11-12']);
  assert.equal(habitStreak(done, '1,2,3,4,5,6,7', '2026-11-14'), 3);
  assert.equal(habitStreak(new Set(['2026-11-13']), '1,2,3,4,5,6,7', '2026-11-14'), 1); // today pending doesn't break
  assert.equal(habitStreak(new Set(['2026-11-12']), '1,2,3,4,5,6,7', '2026-11-14'), 0);
});

test('assistant: unknown command asks for clarification and changes nothing', async () => {
  const r = await handleCommand('flibbertigibbet the moon');
  assert.equal(r.intent, 'unknown');
  assert.match(r.reply, /not sure/i);
});

test('assistant: one-time reminder is created directly; repeating needs confirmation', async () => {
  const one = await handleCommand('Remind me to drink water in 20 minutes');
  assert.equal(one.intent, 'create_reminder');
  const list = await remindersRepository.list();
  assert.ok(list.find((r) => r.title === 'Drink water' && r.repeat === 'once'));

  const before = (await remindersRepository.list()).length;
  const daily = await handleCommand('Create a daily good night reminder');
  assert.equal(daily.intent, 'confirm');
  assert.equal((await remindersRepository.list()).length, before, 'nothing saved before confirmation');
  assert.equal(daily.pending.data.time, '22:00');
  assert.match(daily.pending.data.message, /Good night, Gaurav/);
  const done = await handleCommand('yes', { pending: daily.pending });
  assert.equal(done.intent, 'create_reminder');
  const saved = (await remindersRepository.list()).find((r) => r.title === 'Good Night');
  assert.equal(saved.repeat, 'daily');
});

test('assistant: declining a confirmation changes nothing', async () => {
  const d = await handleCommand('delete the good night reminder');
  assert.equal(d.intent, 'confirm');
  const n = await handleCommand('no', { pending: d.pending });
  assert.equal(n.intent, 'cancel');
  assert.ok((await remindersRepository.list()).find((r) => r.title === 'Good Night'));
  const y = await handleCommand('yes', { pending: d.pending });
  assert.equal(y.intent, 'delete_reminder');
  assert.ok(!(await remindersRepository.list()).find((r) => r.title === 'Good Night'));
});

test('assistant: reads real data (tasks, attendance) and marks complete after confirmation', async () => {
  assert.match((await handleCommand('show my pending tasks')).reply, /no pending tasks/i);
  await tasksRepository.insert({ title: 'DBMS revision', priority: 2 });
  assert.match((await handleCommand('Show my pending tasks')).reply, /DBMS revision/);

  const m = await handleCommand('Mark DBMS revision complete');
  assert.equal(m.intent, 'confirm');
  assert.equal((await tasksRepository.pending()).length, 1, 'not completed before confirmation');
  await handleCommand('yes', { pending: m.pending });
  assert.equal((await tasksRepository.pending()).length, 0);

  const sid = await subjectsRepository.insert({ name: 'Networks', target_pct: 75 });
  await attendanceRepository.mark(sid, '2026-11-01', 'present');
  await attendanceRepository.mark(sid, '2026-11-02', 'absent');
  const a = await handleCommand('show my attendance');
  assert.match(a.reply, /Networks: 50\.0%/);
  assert.match(a.reply, /attend next 2/);
});

test('assistant: study mode navigates; mark with no match asks', async () => {
  assert.equal((await handleCommand('Start study mode')).navigate.screen, 'FocusTimer');
  const r = await handleCommand('mark quantum basket weaving complete');
  assert.equal(r.intent, 'clarify');
});

test('assistant: "set reminder 10 pm good night" creates a spoken good-night reminder', async () => {
  const r = await handleCommand('set reminder on 10 pm good night', { userName: 'Gaurav' });
  assert.equal(r.intent, 'create_reminder');
  assert.match(r.reply, /Good night, Gaurav/);
  const rem = (await remindersRepository.user()).find((x) => x.title === 'Good Night');
  assert.ok(rem); assert.equal(rem.time, '22:00'); assert.equal(rem.speak_enabled, 1);
  assert.match(rem.message, /Good night, Gaurav/);
});

test('assistant: class schedule from the timetable', async () => {
  const sid = await subjectsRepository.insert({ name: 'ML', kind: 'theory', target_pct: 75 });
  const wd = ((new Date().getDay() + 6) % 7) + 1;
  await timetableRepository.insert({ subject_id: sid, weekday: wd, start_time: '15:00', end_time: '16:00', kind: 'theory', room: 'SF25' });
  const r = await handleCommand("today class schedule tell me", { userName: 'Gaurav' });
  assert.equal(r.intent, 'classes');
  assert.match(r.reply, /Gaurav, you have 1 lecture today/);
  assert.match(r.reply, /3:00 PM – 4:00 PM {2}ML, SF25/);
  const n = await handleCommand('when is my next class');
  assert.equal(n.intent, 'classes');
  assert.match(n.reply, /ML/);
  const none = await handleCommand("what are tomorrow's lectures");
  assert.equal(none.intent, 'classes');
});

test('assistant: extra commands (attendance by voice, bunk, money, summary, reminders)', async () => {
  const { expenseRepository } = await import('../src/database/repositories/index.js');
  const sid = (await subjectsRepository.findByName('ML')).id;
  const r1 = await handleCommand('I attended ML today');
  assert.equal(r1.intent, 'mark_attendance'); assert.match(r1.reply, /ML as present/);
  const r2 = await handleCommand('what is my attendance in ML');
  assert.equal(r2.intent, 'attendance'); assert.match(r2.reply, /^ML: 100\.0%/);
  const r3 = await handleCommand('can I skip tomorrow');
  assert.equal(r3.intent, 'bunk');
  const r4 = await handleCommand('spent 150 on lunch');
  assert.equal(r4.intent, 'add_expense'); assert.match(r4.reply, /₹150/);
  const r5 = await handleCommand('how much did I spend today');
  assert.equal(r5.intent, 'spending'); assert.match(r5.reply, /₹150/);
  const r6 = await handleCommand('summarize my day', { userName: 'Gaurav' });
  assert.equal(r6.intent, 'summary'); assert.match(r6.reply, /Gaurav, here is your day/);
  const r7 = await handleCommand('list all reminders');
  assert.equal(r7.intent, 'reminders'); assert.match(r7.reply, /Good Night/);
  const r8 = await handleCommand('pause the good night reminder');
  assert.equal(r8.intent, 'toggle_reminder'); assert.match(r8.reply, /now off/);
  const r9 = await handleCommand('who owes me money');
  assert.equal(r9.intent, 'khata');
  const r10 = await handleCommand('show high priority tasks');
  assert.equal(r10.intent, 'tasks');
  assert.ok(sid);
});
