import { WEEKDAYS_LONG } from '../../utils/date';

/** Extract a clock time from free text. Returns 'HH:mm' or null. */
export function parseTime(text) {
  const t = text.toLowerCase();
  if (/\bnoon\b/.test(t)) return '12:00';
  if (/\bmidnight\b/.test(t)) return '00:00';
  let m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/);
  if (m) {
    let h = parseInt(m[1], 10); const min = parseInt(m[2] || '0', 10);
    const pm = m[3].startsWith('p');
    if (h < 1 || h > 12 || min > 59) return null;
    h = (h % 12) + (pm ? 12 : 0);
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  m = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  m = t.match(/\bat\s+(\d{1,2})\b(?!\s*(?:min|hour|day))/);
  if (m) {
    const h = parseInt(m[1], 10);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:00`;
  }
  return null;
}

/** Relative offsets: "in 15 minutes", "in 2 hours". Returns ms or null. */
export function parseRelative(text) {
  const m = text.toLowerCase().match(/\bin\s+(\d+)\s*(min(?:ute)?s?|hours?|hrs?)\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n * (m[2].startsWith('m') ? 60000 : 3600000);
}

/** 'daily' | {weekdays:[..]} | null */
export function parseRepeat(text) {
  const t = text.toLowerCase();
  if (/\b(every ?day|daily|each day|everyday)\b/.test(t)) return { repeat: 'daily', weekdays: [] };
  if (/\bweekdays\b/.test(t)) return { repeat: 'weekdays', weekdays: [1, 2, 3, 4, 5] };
  const days = [];
  WEEKDAYS_LONG.forEach((name, i) => { if (new RegExp(`\\b${name.toLowerCase()}s?\\b`).test(t) && /every|each|weekly|on/.test(t)) days.push(i + 1); });
  if (days.length === 1) return { repeat: 'weekly', weekdays: days };
  if (days.length > 1) return { repeat: 'weekdays', weekdays: days };
  return null;
}

export const parseDayOffset = (text) => (/\btomorrow\b/i.test(text) ? 1 : 0);

export const isYes = (t) => /^(y|yes|yeah|yep|yup|sure|ok|okay|confirm|do it|go ahead|please do|haan|ha)\b/i.test(t.trim());
export const isNo = (t) => /^(n|no|nope|nah|cancel|stop|don'?t|never mind|nevermind)\b/i.test(t.trim());

/** Strip command boilerplate to get the object phrase: "mark dbms revision complete" -> "dbms revision" */
export function extractMarkTarget(text) {
  return text.toLowerCase()
    .replace(/^(please\s+)?(mark|set|tick|check off|finish)\s+/, '')
    .replace(/\s+(as\s+)?(complete|completed|done|finished)\s*$/, '')
    .replace(/\s+(as\s+)?(complete|completed|done|finished)\b.*$/, '')
    .replace(/^(my|the)\s+/, '')
    .trim();
}

export const PRESET_REMINDERS = [
  { match: /good\s*night|sleep|bed\s*time/, title: 'Good Night', time: '22:00', message: (n) => `Good night, ${n}! It's time to sleep. Sweet dreams!` },
  { match: /good\s*morning|wake\s*up/, title: 'Good Morning', time: '07:00', message: (n) => `Good morning, ${n}! A new day, let's make it count.` },
  { match: /water|hydrat/, title: 'Drink Water', time: '11:00', message: (n) => `${n}, time to drink some water.` },
  { match: /study/, title: 'Study Time', time: '19:00', message: (n) => `${n}, it's study time. Let's focus.` },
];
