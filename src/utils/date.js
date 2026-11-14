// Date helpers. Dates are stored as local 'YYYY-MM-DD' strings, instants as epoch millis.
const pad = (n) => String(n).padStart(2, '0');

export const toDateStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => toDateStr(new Date());
export const parseDateStr = (s) => {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const addDays = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };
export const addDaysStr = (s, n) => toDateStr(addDays(parseDateStr(s), n));
export const startOfDay = (d = new Date()) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; };
export const endOfDay = (d = new Date()) => { const c = new Date(d); c.setHours(23, 59, 59, 999); return c; };
/** ISO weekday: Mon=1 .. Sun=7 */
export const isoWeekday = (d = new Date()) => ((d.getDay() + 6) % 7) + 1;
export const startOfWeek = (d = new Date()) => startOfDay(addDays(d, -(isoWeekday(d) - 1)));
export const lastNDays = (n, from = new Date()) => Array.from({ length: n }, (_, i) => toDateStr(addDays(from, -(n - 1 - i))));

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '22:30' -> '10:30 PM' */
export const fmtTime = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
};
export const fmtClock = (ms) => { const d = new Date(ms); return fmtTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`); };
export const timeStrOf = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fmtDateShort = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
export const fmtDateStr = (s) => (s ? fmtDateShort(parseDateStr(s)) : '');
export const fmtDateLong = (d = new Date()) => `${WEEKDAYS_LONG[isoWeekday(d) - 1]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
export const fmtDateTime = (ms) => `${fmtDateShort(new Date(ms))}, ${fmtClock(ms)}`;

/** Human relative label for a future/past instant: "in 2h 10m", "Tomorrow, 9:00 AM" */
export const fmtWhen = (ms, now = Date.now()) => {
  const d = new Date(ms);
  const dayDiff = Math.round((startOfDay(d) - startOfDay(new Date(now))) / 86400000);
  if (dayDiff === 0) return `Today, ${fmtClock(ms)}`;
  if (dayDiff === 1) return `Tomorrow, ${fmtClock(ms)}`;
  if (dayDiff === -1) return `Yesterday, ${fmtClock(ms)}`;
  return fmtDateTime(ms);
};

export const fmtCountdown = (ms) => {
  if (ms <= 0) return 'now';
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export const fmtDuration = (sec) => {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

/** Combine 'YYYY-MM-DD' + 'HH:mm' -> epoch ms (local). */
export const toEpoch = (dateStr, hhmm = '00:00') => {
  const d = parseDateStr(dateStr);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

export const greeting = (d = new Date()) => {
  const h = d.getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night';
};
