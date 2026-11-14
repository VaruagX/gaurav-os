import test from 'node:test';
import assert from 'node:assert/strict';
import { addMinutes, buildLecturePrompts, buildBriefingPrompts, pendingLectures, bunkProjection, lecturesBetween, mustAttend, examPlan, SLOT_BASE } from '../src/services/college/lectureLogic.js';

const rows = [
  { id: 1, subject_id: 10, subject_name: 'ML', weekday: 1, start_time: '15:00', end_time: '16:00', kind: 'theory' },
  { id: 2, subject_id: 11, subject_name: 'DBMS', weekday: 2, start_time: '10:00', end_time: '12:00', kind: 'practical' },
];

test('lecture prompts fire at the lecture end, with a delay option', () => {
  const p = buildLecturePrompts(rows);
  assert.equal(p[0].time, '16:00'); assert.equal(p[0].weekday, 1);
  assert.match(p[0].text, /Did you attend ML, 3:00 PM – 4:00 PM\?/);
  assert.deepEqual(p[0].actions.map((a) => a.key), ['present', 'absent', 'cancelled']);
  assert.equal(JSON.parse(p[1].data).tt, 2);
  assert.equal(buildLecturePrompts(rows, { delayMin: 10 })[1].time, '12:10');
  assert.equal(addMinutes('23:55', 10), '00:05');
});

test('briefing lists the day\'s lectures', () => {
  const b = buildBriefingPrompts(rows, { name: 'Gaurav', pending: 2 });
  assert.equal(b.length, 7);
  assert.match(b[0].text, /1 lecture: ML 3:00 PM\. 2 tasks pending\./);
  assert.match(b[2].text, /No lectures today/);
});

test('pending lectures = ended, unmarked, not cancelled', () => {
  const marks = [{ subject_id: 10, slot: SLOT_BASE + 1 }];
  const r = [...rows, { id: 3, subject_id: 12, weekday: 1, start_time: '08:00', end_time: '09:00' }, { id: 4, subject_id: 13, weekday: 1, start_time: '09:00', end_time: '10:00' }];
  assert.deepEqual(pendingLectures(r, marks, new Set([4]), '16:30').map((l) => l.id), [2, 3]);
  assert.deepEqual(pendingLectures(r, marks, new Set(), '11:00').map((l) => l.id), [3, 4]);
});

test('bunk projection and attendance needed', () => {
  const s = [{ id: 1, name: 'ML', present: 22, total: 31, target_pct: 75 }];
  const [p] = bunkProjection(s, { 1: 2 });
  assert.equal(Math.round(p.before * 100) / 100, 70.97);
  assert.equal(Math.round(p.after * 100) / 100, 66.67);
  assert.equal(p.safe, false);
  assert.deepEqual(bunkProjection(s, {}), []);
  assert.equal(mustAttend(22, 31, 75, 12), 11); // (22+11)/43 = 76.7%
  assert.equal(mustAttend(22, 31, 75, 3), null);
  assert.equal(mustAttend(40, 40, 75, 5), 0);
});

test('lectures between two dates', () => {
  // 2026-11-14 is a Saturday; Mon 16 and Tue 17 fall inside (14, 17].
  assert.deepEqual(lecturesBetween(rows, '2026-11-14', '2026-11-17'), { 10: 1, 11: 1 });
});

test('exam plan spreads topics, weak first, keeps a revision day', () => {
  const topics = [1, 2, 3, 4, 5, 6].map((i) => ({ id: i, title: `T${i}`, done: i === 6 ? 1 : 0, weak: i === 4 ? 1 : 0, sort: i }));
  const plan = examPlan(topics, '2026-11-14', '2026-11-19'); // 5 days -> 4 study days + revision
  assert.equal(plan[0].topics[0], 'T4');
  assert.equal(plan.flatMap((d) => d.topics).filter((t) => t.startsWith('T')).length, 5);
  assert.equal(plan[plan.length - 1].date, '2026-11-18');
  assert.deepEqual(examPlan([], '2026-11-14', '2026-11-19'), []);
});
