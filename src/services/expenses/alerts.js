import Native from '../../../modules/reminder-native';
import { expenseRepository as X } from '../../database/repositories';
import { crossedThresholds } from './finance';
import { formatPaise } from '../khata/money';

/**
 * Compare budget status before and after a change and return the NEW 80% / 100% alerts (each fires once per month
 * and scope). Also posts a phone notification when the native layer is available.
 * before/after: results of expenseRepository.budgetStatus(month).
 */
export async function checkBudgetAlerts(before, after, notify = notifyBudget) {
  const out = [];
  const check = async (scope, label, b, a) => {
    for (const level of crossedThresholds(b.spent, a.spent, a.budget)) {
      if (await X.recordAlert(after.month, scope, level)) {
        const title = level === 100 ? `${label} budget used up` : `${label} budget: 80% used`;
        const text = level === 100
          ? `You have spent ${formatPaise(a.spent)} of ${formatPaise(a.budget)}${a.spent > a.budget ? ` — ${formatPaise(a.spent - a.budget)} over` : ''}.`
          : `${formatPaise(a.spent)} of ${formatPaise(a.budget)} spent. ${formatPaise(a.budget - a.spent)} left.`;
        out.push({ level, scope, title, text });
        try { await notify(title, text); } catch (e) { /* notification is best-effort */ }
      }
    }
  };
  if (before.overall && after.overall) await check('all', 'Monthly', before.overall, after.overall);
  for (const c of after.categories) {
    const b = before.categories.find((x) => x.category_id === c.category_id);
    if (b) await check(`c${c.category_id}`, c.name, b, c);
  }
  return out;
}

export async function notifyBudget(title, text) {
  if (Native?.postNotification) await Native.postNotification(9300 + Math.floor(Math.random() * 1000), title, text);
}
