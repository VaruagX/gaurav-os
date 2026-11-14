// Pure helpers for lecture prompts, pending lectures, bunk planning and exam study plans (unit-tested, no I/O).
import { pct } from './attendance';

export const SLOT_BASE = 1000; // attendance.slot = SLOT_BASE + timetable id (shared by Timetable / Attendance / notification buttons)

const pad = (n) => String(n).padStart(2, '0');
export const addMinutes = (hhmm, min) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = ((h * 60 + m + min) % 1440 + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
};
const clock = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };

/** One weekly "Did you attend…?" prompt per timetable lecture, fired when the lecture ends (+ delay). */
export function buildLecturePrompts(rows, { delayMin = 0 } = {}) {
  return rows.map((l) => ({
    id: `lec-${l.id}`, group: 'lecture', repeat: 'weekly', weekday: l.weekday, time: addMinutes(l.end_time, delayMin),
    title: `${l.subject_name} — attendance`,
    text: `Did you attend ${l.subject_name}${l.kind === 'practical' ? ' (practical)' : ''}, ${clock(l.start_time)} – ${clock(l.end_time)}?`,
    actions: [{ key: 'present', label: 'Present' }, { key: 'absent', label: 'Absent' }, { key: 'cancelled', label: 'Not held' }],
    data: JSON.stringify({ tt: l.id, subject: l.subject_id, kind: l.kind }), open: 'gauravos://attendance',
  }));
}

/** One weekly briefing prompt per weekday, listing that weekday's lectures. */
export function buildBriefingPrompts(rows, { time = '07:30', name = 'there', pending = 0 } = {}) {
  const out = [];
  for (let d = 1; d <= 7; d++) {
    const day = rows.filter((l) => l.weekday === d).sort((a, b) => a.start_time.localeCompare(b.start_time));
    const lines = day.length ? `${day.length} lecture${day.length > 1 ? 's' : ''}: ${day.map((l) => `${l.subject_name} ${clock(l.start_time)}`).join(', ')}.` : 'No lectures today.';
    out.push({
      id: `brief-${d}`, group: 'briefing', repeat: 'weekly', weekday: d, time, title: `Good morning, ${name}`,
      text: `${lines}${pending ? ` ${pending} task${pending > 1 ? 's' : ''} pending.` : ''}`, actions: [], data: '', open: 'gauravos://home',
    });
  }
  return out;
}

export const backupPrompt = (time = '20:00') => ({
  id: 'backup-weekly', group: 'backup', repeat: 'weekly', weekday: 7, time, title: 'Back up your data',
  text: 'Everything lives only on this phone. Create a backup now so nothing is lost.', actions: [{ key: 'open', label: 'Back up now', open: 'gauravos://backup' }], data: '', open: 'gauravos://backup',
});

/** Lectures that already ended today with no Present/Absent and not cancelled. nowHHmm like "14:05". */
export function pendingLectures(rows, marks, cancelledIds, nowHHmm) {
  return rows.filter((l) => l.end_time <= nowHHmm && !cancelledIds.has(l.id) && !marks.some((m) => m.subject_id === l.subject_id && m.slot === SLOT_BASE + l.id));
}

/** Projected attendance if the given lectures per subject are missed (skips: {subjectId: n}). */
export function bunkProjection(summary, skips) {
  return summary.filter((s) => (skips[s.id] || 0) > 0).map((s) => {
    const n = skips[s.id];
    const before = pct(s.present, s.total), after = pct(s.present, s.total + n);
    return { id: s.id, name: s.name, skips: n, before, after, target: s.target_pct, safe: after !== null && after >= s.target_pct };
  });
}

const dateOf = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Lectures per subject that will still be held on days (from, to], skipping cancelled-holiday knowledge we don't have. */
export function lecturesBetween(rows, fromStr, toStr) {
  const out = {};
  const d = dateOf(fromStr); d.setDate(d.getDate() + 1);
  const end = dateOf(toStr);
  for (; d <= end; d.setDate(d.getDate() + 1)) {
    const iso = ((d.getDay() + 6) % 7) + 1;
    rows.filter((l) => l.weekday === iso).forEach((l) => { out[l.subject_id] = (out[l.subject_id] || 0) + 1; });
  }
  return out;
}

/** How many of the next `remaining` lectures must be attended to end at >= target. null = cannot reach it any more. */
export function mustAttend(present, total, target, remaining) {
  const need = Math.max(0, Math.ceil((target / 100) * (total + remaining) - present - 1e-9));
  return need > remaining ? null : need;
}

/** Spread undone topics over the days before an exam (weak topics first, last day kept for revision). */
export function examPlan(topics, todayStr, examStr) {
  const days = Math.max(1, Math.round((dateOf(examStr) - dateOf(todayStr)) / 86400000));
  const study = Math.max(1, days - 1);
  const list = [...topics].filter((t) => !t.done).sort((a, b) => (b.weak - a.weak) || (a.sort - b.sort) || (a.id - b.id));
  const per = Math.max(1, Math.ceil(list.length / study));
  const plan = [];
  for (let i = 0; i < list.length; i += per) {
    const d = dateOf(todayStr); d.setDate(d.getDate() + plan.length);
    plan.push({ date: dstr(d), topics: list.slice(i, i + per).map((t) => t.title) });
  }
  if (days > 1 && list.length) { const d = dateOf(examStr); d.setDate(d.getDate() - 1); plan.push({ date: dstr(d), topics: ['Final revision of weak topics'] }); }
  return plan;
}
