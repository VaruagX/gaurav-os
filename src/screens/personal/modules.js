import {
  notesRepository, goalsRepository, eventsRepository, codingRepository, englishRepository,
  subscriptionsRepository, purchasesRepository, achievementsRepository, expenseRepository,
} from '../../database/repositories';
import { todayStr, parseDateStr, fmtDateStr, startOfDay, addDaysStr, lastNDays } from '../../utils/date';
import { activityStreak } from '../../services/routine/habits';

const daysUntil = (dateStr) => Math.round((parseDateStr(dateStr) - startOfDay()) / 86400000);
const rel = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 1 ? `in ${n} days` : `${-n} day${n === -1 ? '' : 's'} ago`);
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const monthKey = () => todayStr().slice(0, 7);

const CYCLE_DAYS = { weekly: 7 };
function advanceDue(dateStr, cycle) {
  const d = parseDateStr(dateStr);
  if (cycle === 'weekly') d.setDate(d.getDate() + 7);
  else if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const monthlyEquivalent = (s) => (s.cycle === 'weekly' ? s.amount * 52 / 12 : s.cycle === 'yearly' ? s.amount / 12 : s.amount);

/**
 * Config-driven personal modules rendered by ModuleScreen.
 * item(row) -> {title, subtitle, badge?}; summary(rows) -> [{label,value,sub}]
 */
export const MODULES = {
  notes: {
    title: 'Notes & ideas', icon: 'create-outline', repo: notesRepository, searchable: true,
    empty: { title: 'No notes yet', text: 'Capture notes and quick ideas here.' },
    fields: [
      { key: 'title', label: 'Title', required: true },
      { key: 'body', label: 'Note', type: 'multiline' },
      { key: 'is_idea', label: 'This is a quick idea', type: 'toggle' },
      { key: 'pinned', label: 'Pin to top', type: 'toggle' },
    ],
    defaults: () => ({}),
    toRow: (v) => ({ title: v.title.trim(), body: v.body || '', is_idea: v.is_idea ? 1 : 0, pinned: v.pinned ? 1 : 0 }),
    item: (r) => ({ title: `${r.pinned ? '📌 ' : ''}${r.title}`, subtitle: (r.body || '').slice(0, 110), badge: r.is_idea ? 'IDEA' : null }),
    summary: (rows) => [{ label: 'Notes', value: rows.filter((r) => !r.is_idea).length }, { label: 'Ideas', value: rows.filter((r) => r.is_idea).length }],
  },
  goals: {
    title: 'Personal goals', icon: 'flag-outline', repo: goalsRepository,
    empty: { title: 'No goals yet', text: 'Set goals and track your progress toward them.' },
    fields: [
      { key: 'title', label: 'Goal', required: true },
      { key: 'description', label: 'Why / details', type: 'multiline' },
      { key: 'target_date', label: 'Target date', type: 'date' },
      { key: 'progress', label: 'Progress %', type: 'number', hint: '100 marks it complete.' },
    ],
    defaults: () => ({ progress: 0 }),
    toRow: (v) => {
      const progress = Math.max(0, Math.min(100, Math.round(v.progress ?? 0)));
      return { title: v.title.trim(), description: v.description || null, target_date: v.target_date || null, progress, status: progress >= 100 ? 'done' : 'active', completed_at: progress >= 100 ? Date.now() : null };
    },
    item: (r) => ({ title: r.title, subtitle: `${r.progress}%${r.target_date ? ` · target ${fmtDateStr(r.target_date)} (${rel(daysUntil(r.target_date))})` : ''}`, badge: r.status === 'done' ? 'DONE' : null, progress: r.progress / 100 }),
    summary: (rows) => [{ label: 'Active', value: rows.filter((r) => r.status === 'active').length }, { label: 'Completed', value: rows.filter((r) => r.status === 'done').length }],
  },
  events: {
    title: 'Important events', icon: 'calendar-outline', repo: eventsRepository,
    empty: { title: 'No events yet', text: 'Add birthdays, fests, deadlines — and see a countdown.' },
    fields: [{ key: 'title', label: 'Event', required: true }, { key: 'date', label: 'Date', type: 'date', required: true }, { key: 'notes', label: 'Notes', type: 'multiline' }],
    defaults: () => ({ date: todayStr() }),
    toRow: (v) => ({ title: v.title.trim(), date: v.date, notes: v.notes || null }),
    item: (r) => ({ title: r.title, subtitle: `${fmtDateStr(r.date)} · ${rel(daysUntil(r.date))}${r.notes ? ` · ${r.notes}` : ''}`, badge: daysUntil(r.date) < 0 ? 'PAST' : null }),
    sort: (rows) => [...rows].sort((a, b) => (daysUntil(a.date) < 0) - (daysUntil(b.date) < 0) || (daysUntil(a.date) < 0 ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date))),
    summary: (rows) => { const n = rows.filter((r) => daysUntil(r.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0]; return [{ label: 'Next event', value: n ? rel(daysUntil(n.date)) : '—', sub: n?.title }]; },
  },
  coding: {
    title: 'Coding practice', icon: 'code-slash-outline', repo: codingRepository,
    empty: { title: 'No problems logged', text: 'Log each problem you solve to build a practice history.' },
    fields: [
      { key: 'problem', label: 'Problem', required: true, placeholder: 'e.g. Two Sum' },
      { key: 'platform', label: 'Platform', placeholder: 'LeetCode, CodeChef, GFG…' },
      { key: 'topic', label: 'Topic', placeholder: 'Arrays, DP…' },
      { key: 'difficulty', label: 'Difficulty', type: 'segmented', options: [{ label: 'Easy', value: 'easy' }, { label: 'Medium', value: 'medium' }, { label: 'Hard', value: 'hard' }] },
      { key: 'minutes', label: 'Minutes spent', type: 'number' },
      { key: 'solved', label: 'Solved', type: 'toggle' },
      { key: 'date', label: 'Date', type: 'date', required: true },
    ],
    defaults: () => ({ date: todayStr(), difficulty: 'easy', solved: 1, minutes: 30 }),
    toRow: (v) => ({ problem: v.problem.trim(), platform: v.platform || null, topic: v.topic || null, difficulty: v.difficulty || 'easy', minutes: v.minutes || 0, solved: v.solved ? 1 : 0, date: v.date }),
    item: (r) => ({ title: r.problem, subtitle: `${fmtDateStr(r.date)} · ${[r.platform, r.topic, r.difficulty].filter(Boolean).join(' · ')}${r.minutes ? ` · ${r.minutes}m` : ''}`, badge: r.solved ? null : 'UNSOLVED' }),
    summary: (rows) => [
      { label: 'Solved', value: rows.filter((r) => r.solved).length },
      { label: 'Streak', value: `${activityStreak(new Set(rows.map((r) => r.date)))}d` },
      { label: 'This week', value: rows.filter((r) => r.date >= addDaysStr(todayStr(), -6)).length },
    ],
  },
  english: {
    title: 'English practice', icon: 'chatbubbles-outline', repo: englishRepository,
    empty: { title: 'No practice logged', text: 'Log reading, speaking, writing or vocabulary sessions.' },
    fields: [
      { key: 'activity', label: 'Activity', type: 'select', required: true, options: ['Reading', 'Speaking', 'Writing', 'Listening', 'Vocabulary'].map((a) => ({ label: a, value: a })) },
      { key: 'minutes', label: 'Minutes', type: 'number', required: true },
      { key: 'new_words', label: 'New words / notes', type: 'multiline' },
      { key: 'date', label: 'Date', type: 'date', required: true },
    ],
    defaults: () => ({ date: todayStr(), activity: 'Reading', minutes: 20 }),
    toRow: (v) => ({ activity: v.activity, minutes: v.minutes || 0, new_words: v.new_words || null, date: v.date }),
    item: (r) => ({ title: `${r.activity} · ${r.minutes} min`, subtitle: `${fmtDateStr(r.date)}${r.new_words ? ` · ${r.new_words}` : ''}` }),
    summary: (rows) => [
      { label: 'This week', value: `${rows.filter((r) => r.date >= addDaysStr(todayStr(), -6)).reduce((a, r) => a + r.minutes, 0)}m` },
      { label: 'Streak', value: `${activityStreak(new Set(rows.map((r) => r.date)))}d` },
    ],
  },
  subscriptions: {
    title: 'Subscriptions', icon: 'card-outline', repo: subscriptionsRepository,
    empty: { title: 'No subscriptions', text: 'Track recurring payments and their due dates.' },
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'amount', label: 'Amount (₹)', type: 'number', required: true },
      { key: 'cycle', label: 'Billing cycle', type: 'segmented', options: [{ label: 'Weekly', value: 'weekly' }, { label: 'Monthly', value: 'monthly' }, { label: 'Yearly', value: 'yearly' }] },
      { key: 'next_due', label: 'Next due date', type: 'date', required: true },
      { key: 'active', label: 'Active', type: 'toggle' },
    ],
    defaults: () => ({ cycle: 'monthly', next_due: todayStr(), active: 1 }),
    toRow: (v) => ({ name: v.name.trim(), amount: v.amount, cycle: v.cycle || 'monthly', next_due: v.next_due, active: v.active ? 1 : 0 }),
    item: (r) => ({ title: r.name, subtitle: `${money(r.amount)} / ${r.cycle} · due ${fmtDateStr(r.next_due)} (${rel(daysUntil(r.next_due))})`, badge: !r.active ? 'PAUSED' : daysUntil(r.next_due) < 0 ? 'OVERDUE' : daysUntil(r.next_due) <= 3 ? 'DUE SOON' : null }),
    actions: [{ label: 'Mark paid', icon: 'checkmark', run: async (r) => {
      // Paying a subscription also records the spend in Money, then moves the due date forward.
      await expenseRepository.add({ kind: 'expense', amountPaise: Math.round(Number(r.amount) * 100), date: todayStr(), paymentMethod: 'upi', note: `Subscription: ${r.name}` });
      await subscriptionsRepository.update(r.id, { next_due: advanceDue(r.next_due, r.cycle) });
    }, when: (r) => !!r.active }],
    summary: (rows) => [{ label: 'Monthly cost', value: money(rows.filter((r) => r.active).reduce((a, r) => a + monthlyEquivalent(r), 0)) }, { label: 'Active', value: rows.filter((r) => r.active).length }],
  },
  purchases: {
    title: 'Purchases & warranty', icon: 'bag-handle-outline', repo: purchasesRepository,
    empty: { title: 'No purchases', text: 'Keep purchase details and warranty end dates handy.' },
    fields: [
      { key: 'item', label: 'Item', required: true },
      { key: 'price', label: 'Price (₹)', type: 'number' },
      { key: 'purchase_date', label: 'Purchase date', type: 'date', required: true },
      { key: 'warranty_until', label: 'Warranty valid until', type: 'date' },
      { key: 'store', label: 'Store / seller' },
      { key: 'notes', label: 'Notes / invoice no.', type: 'multiline' },
    ],
    defaults: () => ({ purchase_date: todayStr() }),
    toRow: (v) => ({ item: v.item.trim(), price: v.price ?? null, purchase_date: v.purchase_date, warranty_until: v.warranty_until || null, store: v.store || null, notes: v.notes || null }),
    item: (r) => {
      const w = r.warranty_until ? daysUntil(r.warranty_until) : null;
      return { title: r.item, subtitle: `${fmtDateStr(r.purchase_date)}${r.price ? ` · ${money(r.price)}` : ''}${w === null ? '' : w < 0 ? ' · warranty expired' : ` · warranty ${rel(w).replace('in ', '')} left`}`, badge: w !== null && w >= 0 && w <= 30 ? 'EXPIRING' : null };
    },
    summary: (rows) => [{ label: 'Items', value: rows.length }, { label: 'In warranty', value: rows.filter((r) => r.warranty_until && daysUntil(r.warranty_until) >= 0).length }],
  },
  achievements: {
    title: 'Achievements', icon: 'trophy-outline', repo: achievementsRepository,
    empty: { title: 'No achievements yet', text: 'Record wins — big or small.' },
    fields: [{ key: 'title', label: 'Achievement', required: true }, { key: 'date', label: 'Date', type: 'date', required: true }, { key: 'notes', label: 'Notes', type: 'multiline' }],
    defaults: () => ({ date: todayStr() }),
    toRow: (v) => ({ title: v.title.trim(), date: v.date, notes: v.notes || null }),
    item: (r) => ({ title: r.title, subtitle: `${fmtDateStr(r.date)}${r.notes ? ` · ${r.notes}` : ''}` }),
    summary: (rows) => [{ label: 'Total', value: rows.length }],
  },
};
