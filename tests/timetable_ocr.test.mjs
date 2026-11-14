import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTimetable, toSlots } from '../src/services/college/timetableOcr.js';

// Box helper: centred text of given width at (x,y). Coordinates follow the sample timetable photo.
const L = (text, x, y, w = 70, h = 12) => ({ text, left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2 });
const header = [
  L('Day/Time', 62, 90), L('10.00 AM', 136, 76), L('to', 136, 88, 12), L('11:00 AM', 136, 100),
  L('11.00AM', 210, 76), L('to', 210, 88, 12), L('12:00 PM', 210, 100),
  L('12.45 PM', 315, 76), L('to', 315, 88, 12), L('1:45 PM', 315, 100),
  L('1.45 PM', 399, 76), L('to', 399, 88, 12), L('2:45 PM', 399, 100),
  L('3:00 PM', 502, 76), L('to', 502, 88, 12), L('4:00 PM', 502, 100),
  L('4:00 PM', 574, 76), L('to', 574, 88, 12), L('5:00 PM', 574, 100),
  L('Hall No: SF25/SF28', 560, 40, 120), L('TO BE EFFECTIVE FROM 15.06.2026', 280, 40, 200),
];
const dayY = { Monday: 135, Tuesday: 180, Wednesday: 225, Thursday: 272, Friday: 322, Saturday: 370 };
const days = Object.entries(dayY).map(([d, y]) => L(d, 62, y, 50));
const lunch = ['L', 'U', 'N', 'C', 'H'].map((c, i) => L(c, 258, 190 + i * 14, 8)).concat(['R', 'E', 'C', 'E', 'S', 'S'].map((c, i) => L(c, 453, 190 + i * 12, 8)));
const body = [
  L('C:DBMS:FF09/2:(SP)', 315 + 42, 135, 110),
  L('ML', 502, 125, 20), L('(AMJ)', 502, 137, 30), L('SF25', 502, 149, 30), L('DAA', 574, 125, 22), L('(DVD)', 574, 137, 30), L('SF25', 574, 149, 30),
  L('A:ELE -(IBD):FF02/2:(KD)', 173, 170, 135), L('B:DBMS:FF06/2:(SP)', 173, 182, 110), L('C:DAA:FF06/1:(DVD)', 173, 194, 110),
  L('A:DBMS:FF06/2:(SP)', 357, 170, 110), L('B:DAA:FF08/1:(TM)', 357, 182, 110), L('C:ML:FF02/1:(AMJ)', 357, 194, 110),
  L('MDM', 538, 182, 30),
  L('DBMS', 315, 215, 40), L('(SP)', 315, 227, 25), L('SF25', 315, 239, 30), L('ELE I', 399, 215, 36), L('IBD:(SGG)', 399, 227, 55), L('SF25', 399, 239, 30),
  L('MDM', 538, 225, 30),
  L('B:ML:FF05/1:(AMJ)', 173, 272, 110), L('OE-4', 357, 272, 30),
  L('A:ML:FF02/2:(AMJ)', 538, 258, 110), L('B: ELE-(IBD):FF02/1:(KD)', 538, 272, 130), L('C:ELE-(IBD):FF08/1:(SGG)', 538, 286, 130),
  L('ELE I', 210, 312, 36), L('IBD:(SGG)', 210, 324, 55), L('SF25', 210, 336, 30), L('GIS', 315, 312, 25), L('(JSD)', 315, 324, 30), L('SF28', 315, 336, 30),
  L('DBMS', 399, 312, 40), L('(SP)', 399, 324, 25), L('SF28', 399, 336, 30), L('ML', 502, 312, 20), L('(AMJ)', 502, 324, 30), L('SF25', 502, 336, 30),
  L('DAA', 574, 312, 22), L('(DVD)', 574, 324, 30), L('SF25', 574, 336, 30),
  L('DAA', 210, 362, 22), L('(DVD)', 210, 374, 30), L('SF25', 210, 386, 30), L('GIS', 315, 362, 25), L('(JSD)', 315, 374, 30), L('SF25', 315, 386, 30),
  L('ELE I', 399, 362, 36), L('IBD:(SGG)', 399, 374, 55), L('SF25', 399, 386, 30), L('A:DAA:FF06/2:(DVD)', 538, 374, 120),
  L('A. M. Mohsin', 130, 410, 80), L('Time Table Incharge', 130, 424, 110), L('Director, IICT', 540, 424, 80),
];
const all = [...header, ...days, ...lunch, ...body];

test('reads the days, time columns and batches', () => {
  const p = parseTimetable(all);
  assert.equal(p.error, undefined);
  assert.deepEqual(p.columns.map((c) => `${c.start}-${c.end}`), ['10:00-11:00', '11:00-12:00', '12:45-13:45', '13:45-14:45', '15:00-16:00', '16:00-17:00']);
  assert.deepEqual(p.rows.map((r) => r.weekday), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(p.batches, ['A', 'B', 'C']);
});

test('batch B timetable', () => {
  const s = toSlots(parseTimetable(all), 'B').map((x) => `${x.weekday} ${x.start_time}-${x.end_time} ${x.subject}${x.teacher ? ' ' + x.teacher : ''}${x.room ? ' ' + x.room : ''} ${x.kind}`);
  assert.deepEqual(s, [
    '1 15:00-16:00 ML AMJ SF25 theory', '1 16:00-17:00 DAA DVD SF25 theory',
    '2 10:00-12:00 DBMS SP FF06/2 practical', '2 12:45-14:45 DAA TM FF08/1 practical', '2 15:00-17:00 MDM theory',
    '3 12:45-13:45 DBMS SP SF25 theory', '3 13:45-14:45 ELE IBD SGG SF25 theory', '3 15:00-17:00 MDM theory',
    '4 10:00-12:00 ML AMJ FF05/1 practical', '4 12:45-14:45 OE 4 theory', '4 15:00-17:00 ELE IBD KD FF02/1 practical',
    '5 11:00-12:00 ELE IBD SGG SF25 theory', '5 12:45-13:45 GIS JSD SF28 theory', '5 13:45-14:45 DBMS SP SF28 theory', '5 15:00-16:00 ML AMJ SF25 theory', '5 16:00-17:00 DAA DVD SF25 theory',
    '6 11:00-12:00 DAA DVD SF25 theory', '6 12:45-13:45 GIS JSD SF25 theory', '6 13:45-14:45 ELE IBD SGG SF25 theory',
  ]);
});

test('OCR slips: FFO6 for FF06, and ELEI vs ELE I spelling', () => {
  const noisy = all.map((l) => (l.text === 'B:DBMS:FF06/2:(SP)' ? { ...l, text: 'B:DBMS:FFO6/2:(SP)' } : l.text === 'ELE I' && l.left < 395 && l.top > 300 ? { ...l, text: 'ELEI' } : l));
  const slots = toSlots(parseTimetable(noisy), 'B');
  assert.ok(slots.find((x) => x.subject === 'DBMS' && x.room === 'FF06/2'));
  assert.ok(!slots.some((x) => /FF/.test(x.subject)));
  assert.equal(new Set(slots.filter((x) => x.subject.startsWith('ELE')).map((x) => x.subject)).size, 1);
});
