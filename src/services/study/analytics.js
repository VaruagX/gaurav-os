import {
  studySessionsRepository as sessions, tasksRepository as tasks, attendanceRepository as attendance,
  assignmentsRepository as assignments, habitsRepository as habits, dailyGoalsRepository as dgoals,
  codingRepository as coding, goalsRepository as goals, routinesRepository as routines, remindersRepository as reminders,
  achievementsRepository, mcqRepository as mcq, syllabusRepository,
} from '../../database/repositories';
import { lastNDays, toDateStr, startOfDay, endOfDay, addDays, startOfWeek, parseDateStr, isoWeekday } from '../../utils/date';
import { habitStreak, habitConsistency } from '../routine/habits';

const range = (d1, d2) => [startOfDay(d1).getTime(), endOfDay(d2).getTime()];

export async function dailyReport(date = new Date()) {
  const ds = toDateStr(date);
  const [from, to] = range(date, date);
  const [studySec, doneTasks, goalStat, routineDone, att, remDone] = await Promise.all([
    sessions.secondsOn(ds), tasks.completedBetween(from, to), dgoals.statsBetween(ds, ds),
    routines.doneByDay(ds, ds), attendance.countByStatusBetween(ds, ds), reminders.historyCount('completed', from, to),
  ]);
  const habitList = await habits.active();
  const logs = await habits.logsBetween(ds, ds);
  const iso = isoWeekday(date);
  const dueHabits = habitList.filter((h) => h.weekdays.split(',').includes(String(iso)));
  const habitsDone = dueHabits.filter((h) => logs.some((l) => l.habit_id === h.id)).length;
  const data = {
    date: ds, studySeconds: studySec, tasksDone: doneTasks, goalsDone: goalStat.done, goalsTotal: goalStat.total,
    routineStepsDone: routineDone[0]?.done || 0, lecturesAttended: att.present, lecturesTotal: att.total,
    habitsDone, habitsDue: dueHabits.length, remindersCompleted: remDone,
  };
  // Simple, transparent score: share of planned things completed (null when nothing was planned).
  const planned = data.goalsTotal + data.habitsDue;
  const achieved = data.goalsDone + data.habitsDone;
  data.score = planned > 0 ? Math.round((achieved / planned) * 100) : null;
  return data;
}

export async function weeklyReport(end = new Date()) {
  const days = lastNDays(7, end);
  const [from, to] = [days[0], days[6]];
  const [fromMs, toMs] = range(parseDateStr(from), parseDateStr(to));
  const [byDay, perSubject, doneTasks, att, goalStat, codeDays, mcqStats, topics, rdone] = await Promise.all([
    sessions.byDay(from, to), sessions.bySubject(from, to), tasks.completedBetween(fromMs, toMs),
    attendance.countByStatusBetween(from, to), dgoals.statsBetween(from, to), coding.byDay(from, to),
    mcq.statsBetween(fromMs, toMs), syllabusRepository.doneBetween(fromMs, toMs), routines.doneByDay(from, to),
  ]);
  const map = Object.fromEntries(byDay.map((r) => [r.date, r.seconds]));
  const daily = days.map((d) => ({ date: d, seconds: map[d] || 0 }));
  return {
    from, to, daily, studySeconds: daily.reduce((a, d) => a + d.seconds, 0), perSubject,
    tasksDone: doneTasks, lecturesAttended: att.present, lecturesTotal: att.total,
    goalsDone: goalStat.done, goalsTotal: goalStat.total,
    codingProblems: codeDays.reduce((a, d) => a + d.n, 0), mcqAttempts: mcqStats.attempts, mcqCorrect: mcqStats.correct,
    topicsCompleted: topics, routineStepsDone: rdone.reduce((a, d) => a + d.done, 0),
  };
}

export async function habitOverview(days = 30) {
  const list = await habits.active();
  const range30 = lastNDays(days);
  const logs = await habits.logsBetween(range30[0], range30[range30.length - 1]);
  const out = [];
  for (const h of list) {
    const all = await habits.allLogs(h.id);
    const dates = new Set(all.map((l) => l.date));
    out.push({ ...h, streak: habitStreak(dates, h.weekdays), consistency: habitConsistency(new Set(logs.filter((l) => l.habit_id === h.id).map((l) => l.date)), h.weekdays, range30) });
  }
  return out;
}

export async function achievementsSummary() {
  const [gs, sec, att, tcount] = await Promise.all([goals.stats(), sessions.totalSeconds(), assignments.stats(), tasks.completedBetween(0, Date.now())]);
  const manual = await achievementsRepository.list('', [], 'LIMIT 50');
  return { goals: gs, studySeconds: sec, assignments: att, tasksCompleted: tcount, manual };
}

export { addDays, startOfWeek };
