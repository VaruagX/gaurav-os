/** Attendance maths. `target` is a percentage (e.g. 75). */
export const pct = (present, total) => (total > 0 ? (present / total) * 100 : null);

/** Consecutive lectures that must be attended to reach `target`. 0 if already there. */
export function classesNeeded(present, total, target) {
  const t = target / 100;
  if (t >= 1) return total === present ? 0 : Infinity;
  if (total === 0 || present / total >= t) return 0;
  return Math.ceil((t * total - present) / (1 - t));
}

/** Lectures that can still be missed while staying at or above `target`. */
export function classesCanSkip(present, total, target) {
  const t = target / 100;
  if (total === 0 || present / total < t) return 0;
  return Math.max(0, Math.floor(present / t - total));
}

export function attendanceStatus(present, total, target) {
  if (total === 0) return { level: 'none', label: 'No classes yet' };
  const p = pct(present, total);
  if (p >= target + 5) return { level: 'safe', label: 'On track' };
  if (p >= target) return { level: 'borderline', label: 'Borderline' };
  return { level: 'short', label: 'Shortage' };
}

/** Subjects below target, most urgent first. */
export function shortages(summary) {
  return summary
    .filter((s) => s.total > 0 && pct(s.present, s.total) < s.target_pct)
    .map((s) => ({ ...s, pct: pct(s.present, s.total), needed: classesNeeded(s.present, s.total, s.target_pct) }))
    .sort((a, b) => a.pct - b.pct);
}

export function overall(summary) {
  const present = summary.reduce((a, s) => a + s.present, 0);
  const total = summary.reduce((a, s) => a + s.total, 0);
  return { present, total, pct: pct(present, total) };
}

export const OVERALL_TARGET = 75;

/**
 * Overall attendance (all subjects together). Assumes you are absent for the next `absentDays` class days
 * (starting tomorrow) and attend every lecture after that, following the weekly timetable `rows`
 * ({subject_name, weekday, start_time, end_time}). Finds the exact lecture where overall % reaches `target`.
 * Recomputed from live counts, so the date moves whenever attendance changes.
 */
export function overallRecovery(summary, rows, absentDays, target = OVERALL_TARGET, from = new Date(), horizon = 400) {
  let p = summary.reduce((a, s) => a + s.present, 0);
  let t = summary.reduce((a, s) => a + s.total, 0);
  const meets = () => t === 0 || (p / t) * 100 >= target - 1e-9;
  const now = pct(p, t);
  const ds = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const sorted = [...rows].sort((a, b) => a.weekday - b.weekday || String(a.start_time).localeCompare(String(b.start_time)));
  let classDays = 0, missed = 0;
  for (let i = 1; i <= horizon && classDays < absentDays; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const lec = sorted.filter((r) => r.weekday === ((d.getDay() + 6) % 7) + 1);
    if (!lec.length) continue;
    classDays++; t += lec.length; missed += lec.length;
  }
  const afterAbsence = pct(p, t);
  const base = { now, afterAbsence, missed, target, total: t };
  if (meets()) return { ...base, ok: true, reachable: true };
  let attended = 0;
  const start = absentDays > 0 ? 1 : 1;
  // continue after the absent days
  let seen = 0;
  for (let i = start; i <= horizon * 2; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const lec = sorted.filter((r) => r.weekday === ((d.getDay() + 6) % 7) + 1);
    if (!lec.length) continue;
    if (seen < absentDays) { seen++; continue; }
    for (const l of lec) {
      t += 1; p += 1; attended++;
      if (meets()) return { ...base, ok: false, reachable: true, date: ds(d), lecture: l, attended };
    }
  }
  return { ...base, ok: false, reachable: false };
}
