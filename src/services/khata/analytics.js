import { SIGN } from './money';
import { parseDateStr, toDateStr, addDays, MONTHS } from '../../utils/date';

/** Pure ledger analytics (paise). Entries are active ones only: {type, amount_paise, date, due_date?, id}. */

const byTime = (a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1);

/**
 * What is still unpaid, oldest first. Entries are replayed in date order; an entry on the opposite side of the
 * balance consumes the oldest unpaid lots first (FIFO), any excess starts a new lot on the other side.
 * Returns {dir: 1 (they owe me) | -1 (I owe them) | 0, net, lots:[{date, due, amount, id}]}.
 */
export function outstandingLots(entries) {
  let lots = [];
  for (const e of [...entries].sort(byTime)) {
    const s = SIGN[e.type];
    let amt = e.amount_paise;
    while (amt > 0 && lots.length && lots[0].dir !== s) {
      const take = Math.min(amt, lots[0].amount);
      lots[0].amount -= take; amt -= take;
      if (lots[0].amount === 0) lots.shift();
    }
    if (amt > 0) lots.push({ dir: s, date: e.date, due: e.type === 'lena' || e.type === 'dena' ? e.due_date || null : null, amount: amt, id: e.id });
  }
  const net = lots.reduce((a, l) => a + l.dir * l.amount, 0);
  return { dir: lots.length ? lots[0].dir : 0, net, lots };
}

export const AGE_BUCKETS = [{ label: '0–30 days', max: 30 }, { label: '31–60 days', max: 60 }, { label: '61–90 days', max: 90 }, { label: '90+ days', max: Infinity }];

export function ageDays(date, today) { return Math.max(0, Math.round((parseDateStr(today) - parseDateStr(date)) / 86400000)); }

/** Sum of lots into the four age buckets (by the date the money was lent/borrowed). */
export function agingBuckets(lots, today) {
  const out = AGE_BUCKETS.map((b) => ({ label: b.label, total: 0 }));
  for (const l of lots) {
    const a = ageDays(l.date, today);
    out[AGE_BUCKETS.findIndex((b) => a <= b.max)].total += l.amount;
  }
  return out;
}

/** Lots whose due date has passed (only lots with a due date can be overdue). */
export const overdueLots = (lots, today) => lots.filter((l) => l.due && l.due < today);
export const isOverdue = (due, today) => !!due && due < today;

/** Net per person as of an inclusive date (positive = they owe me). */
export const netAsOf = (entries, date) => entries.reduce((a, e) => (e.date <= date ? a + SIGN[e.type] * e.amount_paise : a), 0);

/**
 * Month-end receivable / payable for the last `n` months (oldest first). Each person is netted, as in the dashboard.
 * entries: active entries with contact_id.
 */
export function monthlyTrend(entries, today, n = 6) {
  const t = parseDateStr(today);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const first = new Date(t.getFullYear(), t.getMonth() - i, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const end = i === 0 ? today : toDateStr(last);
    const per = new Map();
    for (const e of entries) if (e.date <= end) per.set(e.contact_id, (per.get(e.contact_id) || 0) + SIGN[e.type] * e.amount_paise);
    let receivable = 0, payable = 0;
    for (const v of per.values()) { if (v > 0) receivable += v; else if (v < 0) payable += -v; }
    out.push({ key: `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`, label: MONTHS[first.getMonth()], receivable, payable });
  }
  return out;
}

export const sumReceived = (entries, from, to) => entries.filter((e) => e.type === 'received' && e.date >= from && e.date <= to).reduce((a, e) => a + e.amount_paise, 0);
