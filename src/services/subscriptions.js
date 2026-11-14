import { subscriptionsRepository } from '../database/repositories';
import { upsertDeadlineReminder, removeLinkedReminder } from './reminders/reminderService';
import { toEpoch } from '../utils/date';

let signature = '';

/** One reminder per active subscription: 9 AM the day before it is due. Re-runs only when the subscriptions actually changed. */
export async function syncSubscriptionReminders() {
  const subs = await subscriptionsRepository.list();
  const sig = JSON.stringify(subs.map((s) => [s.id, s.name, s.amount, s.next_due, s.active]));
  if (sig === signature) return;
  signature = sig;
  for (const s of subs) {
    if (!s.active) { await removeLinkedReminder('subscription', s.id); continue; }
    await upsertDeadlineReminder('subscription', s.id, `${s.name} is due tomorrow`, toEpoch(s.next_due, '09:00') + 86400000, 1440,
      `${s.name} (₹${Number(s.amount).toLocaleString('en-IN')}) is due on ${s.next_due}.`);
  }
}
