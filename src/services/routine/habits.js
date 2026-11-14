import { addDays, toDateStr, parseDateStr, isoWeekday, todayStr } from '../../utils/date';

const isDue = (weekdaysCsv, d) => String(weekdaysCsv).split(',').includes(String(isoWeekday(d)));

/**
 * Current streak: consecutive *scheduled* days completed, counting back from today.
 * Today not yet done does not break the streak (it is still in progress).
 */
export function habitStreak(doneDates, weekdaysCsv, today = todayStr()) {
  let streak = 0;
  let d = parseDateStr(today);
  for (let i = 0; i < 400; i++) {
    const s = toDateStr(d);
    if (isDue(weekdaysCsv, d)) {
      if (doneDates.has(s)) streak++;
      else if (s !== today) break;
    }
    d = addDays(d, -1);
  }
  return streak;
}

/** Percentage of scheduled days completed within `dates`. */
export function habitConsistency(doneDates, weekdaysCsv, dates) {
  const due = dates.filter((s) => isDue(weekdaysCsv, parseDateStr(s)));
  if (!due.length) return null;
  return Math.round((due.filter((s) => doneDates.has(s)).length / due.length) * 100);
}

/** Days (strings) in the last `n` days where nothing was activity-logged: used for streak of any activity. */
export function activityStreak(dateSet, today = todayStr()) {
  let streak = 0;
  let d = parseDateStr(today);
  if (!dateSet.has(today)) d = addDays(d, -1);
  while (dateSet.has(toDateStr(d))) { streak++; d = addDays(d, -1); }
  return streak;
}
