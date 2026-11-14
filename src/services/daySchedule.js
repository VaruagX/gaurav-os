import {
  timetableRepository, assignmentsRepository, examsRepository, studyPlanRepository, remindersRepository,
  routinesRepository,
} from '../database/repositories';
import { isoWeekday, startOfDay, endOfDay, toDateStr, toEpoch, fmtTime, fmtClock } from '../utils/date';
import { nextOccurrence } from './reminders/schedule';
import { all } from '../database/db';

/**
 * Everything happening on `date`, sorted by time. Items: {key, type, at (ms), title, subtitle}.
 * type: lecture | reminder | assignment | exam | study | routine
 */
export async function getDaySchedule(date = new Date()) {
  const ds = toDateStr(date);
  const from = startOfDay(date).getTime(), to = endOfDay(date).getTime();
  const items = [];

  const lectures = await timetableRepository.forDay(isoWeekday(date));
  lectures.forEach((l) => items.push({
    key: `lec${l.id}`, type: 'lecture', at: toEpoch(ds, l.start_time), endAt: toEpoch(ds, l.end_time),
    title: l.subject_name, subtitle: `${fmtTime(l.start_time)} – ${fmtTime(l.end_time)} · ${l.kind === 'practical' ? 'Practical' : 'Theory'}${l.room ? ` · ${l.room}` : ''}`,
  }));

  const rems = await remindersRepository.list('enabled = 1');
  rems.forEach((r) => {
    const n = nextOccurrence(r, from - 1);
    if (n && n <= to) items.push({ key: `rem${r.id}`, type: 'reminder', at: n, title: r.title, subtitle: `${fmtClock(n)} · ${r.mode}` });
  });

  const asg = await assignmentsRepository.withSubject('a.status = ? AND a.due_at BETWEEN ? AND ?', ['pending', from, to]);
  asg.forEach((a) => items.push({ key: `asg${a.id}`, type: 'assignment', at: a.due_at, title: `Due: ${a.title}`, subtitle: `${a.subject_name || 'Assignment'} · ${fmtClock(a.due_at)}` }));

  const exams = (await examsRepository.withSubject()).filter((e) => e.exam_at >= from && e.exam_at <= to);
  exams.forEach((e) => items.push({ key: `ex${e.id}`, type: 'exam', at: e.exam_at, title: `Exam: ${e.title}`, subtitle: `${e.subject_name || ''} · ${fmtClock(e.exam_at)}` }));

  const plan = await studyPlanRepository.forDate(ds);
  plan.filter((p) => !p.done).forEach((p) => items.push({ key: `pl${p.id}`, type: 'study', at: from + 20 * 3600000, title: p.title, subtitle: `Study · ${p.planned_min} min${p.subject_name ? ` · ${p.subject_name}` : ''}` }));

  // Timed routine steps scheduled for that weekday
  const steps = await all(
    `SELECT st.*, r.name AS routine_name FROM routine_steps st JOIN routines r ON r.id = st.routine_id
     WHERE st.time IS NOT NULL AND (',' || r.weekdays || ',') LIKE ?`, [`%,${isoWeekday(date)},%`]);
  steps.forEach((s) => items.push({ key: `rs${s.id}`, type: 'routine', at: toEpoch(ds, s.time), title: s.title, subtitle: `${s.routine_name} · ${fmtTime(s.time)}` }));

  return items.sort((a, b) => a.at - b.at);
}

export { routinesRepository };
