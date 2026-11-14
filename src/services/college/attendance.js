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
