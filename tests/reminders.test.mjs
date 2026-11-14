import test from 'node:test';
import assert from 'node:assert/strict';
import { nextOccurrence, parseWeekdays, repeatLabel } from '../src/services/reminders/schedule.js';
import { validateReminder, blankReminder } from '../src/services/reminders/reminderService.js';

const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();

test('daily reminder: later today if time not passed, else tomorrow', () => {
  const r = { repeat: 'daily', time: '22:00', weekdays: '' };
  assert.equal(nextOccurrence(r, at(2026, 11, 14, 9, 0)), at(2026, 11, 14, 22, 0));
  assert.equal(nextOccurrence(r, at(2026, 11, 14, 22, 0)), at(2026, 11, 15, 22, 0)); // strictly after
  assert.equal(nextOccurrence(r, at(2026, 11, 14, 23, 30)), at(2026, 11, 15, 22, 0));
});

test('selected weekdays skip other days (2026-11-14 is a Saturday)', () => {
  const r = { repeat: 'weekdays', time: '07:30', weekdays: '1,3,5' }; // Mon, Wed, Fri
  assert.equal(nextOccurrence(r, at(2026, 11, 14, 8, 0)), at(2026, 11, 16, 7, 30)); // Monday
  assert.equal(nextOccurrence(r, at(2026, 11, 16, 8, 0)), at(2026, 11, 18, 7, 30)); // Wednesday
});

test('weekly with one weekday, and month/year rollover', () => {
  const r = { repeat: 'weekly', time: '09:00', weekdays: '7' }; // Sunday
  assert.equal(nextOccurrence(r, at(2026, 12, 29, 12, 0)), at(2027, 1, 3, 9, 0));
  const d = new Date(nextOccurrence(r, at(2026, 12, 29, 12, 0)));
  assert.equal(d.getDay(), 0); assert.equal(d.getFullYear(), 2027); assert.equal(d.getMonth(), 0);
});

test('one-time reminders', () => {
  const when = at(2026, 11, 20, 10, 0);
  assert.equal(nextOccurrence({ repeat: 'once', once_at: when }, at(2026, 11, 14, 0, 0)), when);
  assert.equal(nextOccurrence({ repeat: 'once', once_at: when }, when + 1), null);
});

test('no weekdays => no occurrence; labels', () => {
  assert.equal(nextOccurrence({ repeat: 'weekdays', time: '10:00', weekdays: '' }, Date.now()), null);
  assert.equal(repeatLabel({ repeat: 'weekdays', weekdays: '1,2,3,4,5' }), 'Weekdays');
  assert.equal(repeatLabel({ repeat: 'daily' }), 'Every day');
  assert.deepEqual(parseWeekdays('1,x,9,7'), [1, 7]);
});

test('validation', () => {
  const ok = { ...blankReminder(), title: 'Good Night', repeat: 'daily', time: '22:00' };
  assert.equal(validateReminder(ok), null);
  assert.match(validateReminder({ ...ok, title: ' ' }), /title/i);
  assert.match(validateReminder({ ...ok, repeat: 'once', once_at: 1 }), /future/i);
  assert.match(validateReminder({ ...ok, repeat: 'weekdays', weekdays: '' }), /weekday/i);
  assert.match(validateReminder({ ...ok, snooze_min: 0 }), /snooze/i);
});
