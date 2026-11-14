import { isoWeekday } from '../../utils/date';

export const parseWeekdays = (csv) =>
  String(csv || '').split(',').map((s) => parseInt(s, 10)).filter((n) => n >= 1 && n <= 7);
export const serializeWeekdays = (arr) => [...new Set(arr)].sort((a, b) => a - b).join(',');

/**
 * Next trigger strictly after `from` (epoch ms) or null. Mirrors ReminderModel.nextAfter in Kotlin,
 * which is what the alarm actually uses; keep both in sync (covered by tests/reminders.test.mjs).
 * `r` uses DB column names: repeat, time, weekdays (csv), once_at.
 */
export function nextOccurrence(r, from = Date.now()) {
  if (!r) return null;
  if (r.repeat === 'once') return r.once_at && r.once_at > from ? r.once_at : null;
  const [hh, mm] = String(r.time || '').split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const days = r.repeat === 'daily' ? [1, 2, 3, 4, 5, 6, 7] : parseWeekdays(r.weekdays);
  if (!days.length) return null;
  for (let offset = 0; offset <= 7; offset++) {
    const c = new Date(from);
    c.setDate(c.getDate() + offset);
    c.setHours(hh, mm, 0, 0);
    if (c.getTime() > from && days.includes(isoWeekday(c))) return c.getTime();
  }
  return null;
}

export const repeatLabel = (r) => {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  switch (r.repeat) {
    case 'daily': return 'Every day';
    case 'weekly': return `Every ${names[(parseWeekdays(r.weekdays)[0] || 1) - 1]}`;
    case 'weekdays': {
      const d = parseWeekdays(r.weekdays);
      if (d.length === 5 && !d.includes(6) && !d.includes(7)) return 'Weekdays';
      return d.map((n) => names[n - 1]).join(', ') || 'No days';
    }
    default: return 'Once';
  }
};
