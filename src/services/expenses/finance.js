import { toDateStr, parseDateStr, addDays, MONTHS, WEEKDAYS_LONG, isoWeekday } from '../../utils/date';
import { formatPaise } from '../khata/money';

/** Pure finance helpers (no database access). Money is integer paise throughout. */

export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', icon: 'cash-outline' }, { id: 'upi', label: 'UPI', icon: 'phone-portrait-outline' },
  { id: 'card', label: 'Card', icon: 'card-outline' }, { id: 'bank', label: 'Bank', icon: 'business-outline' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet-outline' }, { id: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];
export const methodLabel = (id) => PAYMENT_METHODS.find((m) => m.id === id)?.label || 'Other';

const pad = (n) => String(n).padStart(2, '0');
export const monthKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const todayMonthKey = () => monthKeyOf(new Date());
export const daysInMonth = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export const monthRange = (key) => ({ from: `${key}-01`, to: `${key}-${pad(daysInMonth(key))}` });
export const shiftMonth = (key, n) => { const [y, m] = key.split('-').map(Number); return monthKeyOf(new Date(y, m - 1 + n, 1)); };
export const monthLabel = (key, short = false) => { const [y, m] = key.split('-').map(Number); return `${short ? MONTHS[m - 1] : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`; };
export const eachDay = (from, to) => {
  const out = []; let d = parseDateStr(from); const end = parseDateStr(to);
  while (d <= end) { out.push(toDateStr(d)); d = addDays(d, 1); }
  return out;
};

/** Percentage change prev -> curr; null when there is nothing to compare against. */
export const changePct = (curr, prev) => (prev > 0 ? Math.round(((curr - prev) / prev) * 1000) / 10 : null);

export function monthSummary({ income, expense }) {
  const savings = income - expense;
  return { income, expense, savings, savingsPct: income > 0 ? Math.round((savings / income) * 1000) / 10 : null };
}

/**
 * Group per-day totals into day / week (Monday start) / month buckets covering exactly [from, to], zero-filled.
 * rows: [{date, income, expense}] -> [{key, label, start, end, income, expense}]
 */
export function bucketize(rows, from, to, granularity) {
  const byDay = new Map(rows.map((r) => [r.date, r]));
  const buckets = [];
  const keyOf = (ds) => {
    const d = parseDateStr(ds);
    if (granularity === 'day') return ds;
    if (granularity === 'week') return toDateStr(addDays(d, -(isoWeekday(d) - 1)));
    return monthKeyOf(d);
  };
  const index = new Map();
  for (const ds of eachDay(from, to)) {
    const k = keyOf(ds);
    let b = index.get(k);
    if (!b) {
      const d = parseDateStr(ds);
      const label = granularity === 'day' ? `${d.getDate()}` : granularity === 'week' ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : MONTHS[d.getMonth()];
      b = { key: k, label, start: ds, end: ds, income: 0, expense: 0 };
      index.set(k, b); buckets.push(b);
    }
    b.end = ds;
    const r = byDay.get(ds);
    if (r) { b.income += r.income || 0; b.expense += r.expense || 0; }
  }
  return buckets;
}

/** Cumulative expense per day-of-month for a month (index 0 = day 1), up to `upToDay` (default whole month). */
export function cumulative(rows, monthKey, upToDay = daysInMonth(monthKey)) {
  const by = new Map(rows.map((r) => [r.date, r.expense || 0]));
  const out = []; let run = 0;
  for (let d = 1; d <= upToDay; d++) { run += by.get(`${monthKey}-${pad(d)}`) || 0; out.push(run); }
  return out;
}

/** Budget state. level: none (no budget) | ok | warn (>=80%) | over (>=100%). */
export function budgetState(spent, budget) {
  if (!budget || budget <= 0) return { level: 'none', pct: null, remaining: null, budget: 0, spent };
  const pct = Math.round((spent / budget) * 1000) / 10;
  return { level: spent >= budget ? 'over' : pct >= 80 ? 'warn' : 'ok', pct, remaining: budget - spent, budget, spent };
}

/** Thresholds (80/100) newly crossed when spending moves from `before` to `after`. */
export function crossedThresholds(before, after, budget) {
  if (!budget || budget <= 0) return [];
  return [80, 100].filter((t) => before * 100 < budget * t && after * 100 >= budget * t);
}

/**
 * Plain-language insights. Every figure comes from `d` (computed from real records); nothing is invented.
 * d: {month, today(Date), expense, byCategory:[{name,total}], biggest:{amount_paise,category,date}|null,
 *     prevSameDaySpent, prevMonthSpent, budget:{budget,spent}|null, weekdayTotals:[7 numbers Mon..Sun],
 *     methodTotals:[{method,total}], daysElapsed, daysLeft, month label}
 */
export function buildInsights(d) {
  const out = [];
  if (d.expense > 0 && d.byCategory.length) {
    const top = d.byCategory[0];
    out.push({ id: 'top-category', icon: 'pie-chart-outline', title: 'Most spent on', text: `${top.name} — ${formatPaise(top.total)}, which is ${Math.round((top.total / d.expense) * 100)}% of this month's spending.` });
  }
  if (d.biggest) {
    out.push({ id: 'biggest', icon: 'trending-up-outline', title: 'Biggest expense', text: `${formatPaise(d.biggest.amount_paise)}${d.biggest.category ? ` on ${d.biggest.category}` : ''}${d.biggest.note ? ` (${d.biggest.note})` : ''}, on ${parseDateStr(d.biggest.date).getDate()} ${MONTHS[parseDateStr(d.biggest.date).getMonth()]}.` });
  }
  if (d.expense > 0 && d.daysElapsed > 0) {
    const avg = Math.round(d.expense / d.daysElapsed / 100) * 100; // whole rupees reads better
    out.push({ id: 'avg-daily', icon: 'calendar-outline', title: 'Daily average', text: `You spend about ${formatPaise(avg)} a day (${formatPaise(d.expense)} over ${d.daysElapsed} ${d.daysElapsed === 1 ? 'day' : 'days'}).` });
  }
  if (d.prevSameDaySpent > 0) {
    const c = changePct(d.expense, d.prevSameDaySpent);
    const word = c > 0 ? `${c}% more` : c < 0 ? `${Math.abs(c)}% less` : 'the same';
    out.push({ id: 'vs-last-month', icon: c > 0 ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline', tone: c > 0 ? 'bad' : 'good',
      title: 'Compared with last month', text: c === 0 ? `You have spent exactly the same as at this point last month (${formatPaise(d.expense)}).` : `You have spent ${word} than at this point last month (${formatPaise(d.expense)} vs ${formatPaise(d.prevSameDaySpent)}).` });
  } else if (d.expense > 0 && d.prevMonthSpent === 0) {
    out.push({ id: 'vs-last-month', icon: 'information-circle-outline', title: 'Compared with last month', text: 'No spending was recorded last month, so there is nothing to compare with yet.' });
  }
  if (d.budget && d.budget.budget > 0) {
    const left = d.budget.budget - d.budget.spent;
    if (left >= 0) {
      const perDay = d.daysLeft > 0 ? Math.floor(left / d.daysLeft / 100) * 100 : left;
      out.push({ id: 'budget-left', icon: 'wallet-outline', tone: 'good', title: 'Budget left', text: `${formatPaise(left)} left of your ${formatPaise(d.budget.budget)} budget with ${d.daysLeft} ${d.daysLeft === 1 ? 'day' : 'days'} to go${d.daysLeft > 0 ? ` — about ${formatPaise(perDay)} a day` : ''}.` });
    } else {
      out.push({ id: 'budget-left', icon: 'alert-circle-outline', tone: 'bad', title: 'Over budget', text: `You are ${formatPaise(-left)} over your ${formatPaise(d.budget.budget)} budget, with ${d.daysLeft} ${d.daysLeft === 1 ? 'day' : 'days'} left this month.` });
    }
  } else if (d.daysLeft >= 0) {
    out.push({ id: 'days-left', icon: 'hourglass-outline', title: 'Days left', text: `${d.daysLeft} ${d.daysLeft === 1 ? 'day' : 'days'} left in ${d.monthName}. Set a monthly budget to see how much you can spend each day.` });
  }
  const wd = d.weekdayTotals || [];
  const wdTotal = wd.reduce((a, b) => a + b, 0);
  if (wdTotal > 0) {
    const best = wd.indexOf(Math.max(...wd));
    const weekend = (wd[5] || 0) + (wd[6] || 0);
    out.push({ id: 'pattern-weekday', icon: 'stats-chart-outline', title: 'Spending pattern', text: `You spend most on ${WEEKDAYS_LONG[best]}s (${formatPaise(wd[best])} in total). Weekends make up ${Math.round((weekend / wdTotal) * 100)}% of your spending.` });
  }
  const mt = (d.methodTotals || []).filter((m) => m.total > 0).sort((a, b) => b.total - a.total);
  const mTotal = mt.reduce((a, m) => a + m.total, 0);
  if (mt.length && mTotal > 0) out.push({ id: 'pattern-method', icon: 'card-outline', title: 'How you pay', text: `${methodLabel(mt[0].method)} is used for ${Math.round((mt[0].total / mTotal) * 100)}% of your spending.` });
  return out;
}
