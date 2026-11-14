import { routinesRepository as routines } from '../../database/repositories';
import { upsertLinkedReminder, removeLinkedReminder } from '../reminders/reminderService';
import { parseWeekdays } from '../reminders/schedule';

/** Keep a step's daily/weekday reminder in sync with its time + remind flag + routine weekdays. */
export async function syncStepReminder(step, routine) {
  if (!step.remind || !step.time) return removeLinkedReminder('routine_step', step.id);
  const days = parseWeekdays(routine.weekdays);
  const every = days.length === 7;
  return upsertLinkedReminder('routine_step', step.id, {
    title: step.title, message: `Time for: ${step.title}.`, mode: 'normal', time: step.time,
    repeat: every ? 'daily' : 'weekdays', weekdays: every ? '' : routine.weekdays, once_at: null, enabled: 1, speak_enabled: 1,
  });
}

export async function syncRoutineReminders(routineId) {
  const routine = await routines.get(routineId);
  if (!routine) return;
  for (const s of await routines.steps(routineId)) await syncStepReminder(s, routine);
}

export async function deleteRoutine(routineId) {
  for (const s of await routines.steps(routineId)) await removeLinkedReminder('routine_step', s.id);
  await routines.remove(routineId);
}

export async function deleteStep(stepId) {
  await removeLinkedReminder('routine_step', stepId);
  await routines.removeStep(stepId);
}

/** "Wake up → Get ready → Breakfast" (also commas / new lines / '>') into step titles. */
export const parseStepList = (text) =>
  text.split(/→|->|>|,|\n/).map((s) => s.trim()).filter(Boolean);

export const TEMPLATES = {
  morning: { name: 'Morning routine', kind: 'morning', steps: [['Wake up', '06:30'], ['Get ready', '06:45'], ['Breakfast', '07:30'], ['College preparation', '08:00']] },
  evening: { name: 'Evening routine', kind: 'evening', steps: [['Study', '19:00'], ['Coding practice', '20:30'], ['Dinner', '21:30'], ['Plan tomorrow', '22:00'], ['Sleep', '22:30']] },
};
