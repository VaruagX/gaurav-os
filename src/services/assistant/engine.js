import {
  tasksRepository as tasks, attendanceRepository, timetableRepository, assignmentsRepository, examsRepository,
  studyPlanRepository, revisionsRepository, syllabusRepository, routinesRepository, habitsRepository, remindersRepository,
  notesRepository, dailyGoalsRepository, studySessionsRepository, cancelledRepository, subjectsRepository, expenseRepository, khataRepository,
} from '../../database/repositories';
import { saveReminder, deleteReminder, blankReminder, setEnabled } from '../reminders/reminderService';
import { nextOccurrence, repeatLabel, serializeWeekdays } from '../reminders/schedule';
import { getDaySchedule } from '../daySchedule';
import { overall, pct, shortages, classesNeeded, classesCanSkip, overallRecovery, OVERALL_TARGET } from '../college/attendance';
import { nextRevision } from '../study/spaced';
import { bunkProjection } from '../college/lectureLogic';
import { formatPaise } from '../khata/money';
import { monthRange, monthKeyOf } from '../expenses/finance';
import {
  parseTime, parseRelative, parseRepeat, parseDayOffset, isYes, isNo, extractMarkTarget, PRESET_REMINDERS,
} from './parse';
import {
  fmtTime, fmtClock, fmtWhen, fmtDateLong, fmtCountdown, isoWeekday, todayStr, addDays, toEpoch, toDateStr, fmtDateShort, timeStrOf, startOfDay,
} from '../../utils/date';

export const SUGGESTIONS = [
  'Summarize my day',
  'What should I do now?',
  "What are today's classes?",
  'When is my next class?',
  'Show my attendance',
  'Can I skip tomorrow?',
  "What's due this week?",
  'When will I reach 75%?',
  'Show my pending tasks',
  'Set reminder at 10 PM good night',
  'How much did I spend today?',
];

const reply = (text, extra = {}) => ({ reply: text, ...extra });

/**
 * Interpret one user message. `pending` is the confirmation awaiting an answer (or null).
 * Returns {reply, intent, pending?, navigate?: {screen, params}}. Never claims an action happened unless it did.
 */
export async function handleCommand(input, { userName = 'Gaurav', pending = null } = {}) {
  const text = input.trim();
  const t = text.toLowerCase().replace(/[?!.]+$/g, '');
  if (!t) return reply('Type or say a command. Try "What should I do now?"', { intent: 'empty' });

  if (pending) {
    if (isYes(t)) return runPending(pending, userName);
    if (isNo(t)) return reply('Okay, cancelled. Nothing was changed.', { intent: 'cancel' });
    // Anything else abandons the pending action and is handled as a fresh command.
  }

  if (/^(help|what can you do|commands)$/.test(t)) {
    return reply(`I work offline using your saved data. You can ask:\n• ${SUGGESTIONS.join('\n• ')}\n• Mark <something> complete\n• Add task <title>\n• Add note <text>`, { intent: 'help' });
  }

  if (/\b(summary|summari[sz]e|brief me|my day|daily brief|overview)\b/.test(t)) return daySummary(userName);
  if (/\b(all|every)\b.*\breminders\b|^(list|show) reminders$/.test(t)) return allReminders();
  if (/\b(pause|turn off|disable|switch off|resume|turn on|enable|switch on)\b.*\breminder/.test(t)) return toggleReminderIntent(t);
  if (/\bwhen\b.*\b(reach|get|be|become|hit|cross|safe)\b.*\b(\d{2}\s*%?|target)|\b(\d{2}\s*%|target)\b.*\b(date|which day|when)\b/.test(t)) return targetDateIntent(t);
  if (/\bwhat('?s| is| are)\b.*\b(due|deadlines?)\b|\b(due|deadlines?|submissions?)\b.*\b(this week|next week|tomorrow|today)\b|\bwhat'?s pending\b/.test(t)) return dueIntent(t);
  if (/\b(can|should|may) i\b.*\b(bunk|skip|miss)\b|\bbunk\b/.test(t)) return bunkIntent(t);
  if (/\b(attended|missed|bunked|skipped)\b/.test(t) || /\bmark\b.*\b(present|absent)\b|\bi was (present|absent)\b/.test(t)) return markAttendanceIntent(t);
  if (/\b(spent|spend|spending|expenses?)\b/.test(t) && /\b(how much|total|show|what|so far|today|month|week)\b/.test(t) && !/^(add|log|record)\b/.test(t)) return spendingIntent(t);
  if (/^(add|log|record)\s+(an?\s+)?(expense|spend)\b|\b(i )?spent\s+(rs\.?|₹)?\s*\d/.test(t)) return addExpenseIntent(text);
  if (/\b(khata|owe|owes|udhar|lena|dena)\b/.test(t)) return khataIntent();
  if (/\b(delete|remove|cancel)\b.*\breminder/.test(t)) return deleteReminderIntent(t);
  if (/\b(remind|reminder|alarm)\b/.test(t) && /\b(create|set|add|make|remind me|new)\b/.test(t)) return createReminderIntent(text, userName);
  if (/^(mark|tick|check off|finish|complete)\b/.test(t) || /\b(mark|set)\b.*\b(complete|completed|done|finished)\b/.test(t)) return markCompleteIntent(t);
  if (/\bwhat (should|can) i (do|work on)\b|\bwhat'?s next\b|\bwhat now\b/.test(t)) return whatNow(userName);
  if (/\btasks?\b.*\b(due today|today)\b|\bdue today\b|\b(high|top) priority\b/.test(t)) return filteredTasks(t);
  if (/\b(pending|open|incomplete|todo|to-do)\b.*\btasks?\b|\btasks?\b.*\b(pending|left|due|todo)\b|^(show|list) (my )?tasks$/.test(t)) return pendingTasks();
  if (/\b(class(es)?|lectures?)\b/.test(t) && !/\b(attendance|assignments?|exams?|reminders?|tasks?|mark|present|absent)\b/.test(t)) return classesIntent(t, userName);
  if (/\b(schedule|agenda|timetable|plan)\b/.test(t) || /\bwhat('?s| is) (on|happening)\b/.test(t)) return scheduleIntent(t);
  if (/\bstart\b.*\b(study|focus|pomodoro)\b|\b(study|focus) mode\b/.test(t)) {
    return reply('Opening the focus timer. Pick a subject and start when you are ready.', { intent: 'study_mode', navigate: { screen: 'FocusTimer' } });
  }
  if (/\battendance\b/.test(t)) return attendanceIntent(t);
  if (/\b(reminders?)\b/.test(t) && /\b(show|list|upcoming|next|my|what)\b/.test(t)) return upcomingReminders();
  if (/\bexams?\b/.test(t)) return examsIntent();
  if (/\bassignments?\b|\bdeadlines?\b/.test(t)) return assignmentsIntent();
  if (/^(add|create|new)\s+(a\s+)?task\b/.test(t)) return addTask(text);
  if (/^(add|save|create|new)\s+(a\s+)?(note|idea)\b/.test(t)) return addNote(text);
  if (/\bstreaks?\b|\bhabits?\b/.test(t)) return habitsIntent();
  if (/\b(today'?s?|my) (study|progress)\b|\bhow (much|many).*(studied|study)\b/.test(t)) return studyToday();

  return reply(
    `I'm not sure what you meant by "${text}". I only run commands I can do reliably offline, so I'd rather ask than guess.\nTry one of these:\n• ${SUGGESTIONS.slice(0, 5).join('\n• ')}`,
    { intent: 'unknown' }
  );
}

// ---------- Confirmed actions -------------------------------------------------------------
async function runPending(p, userName) {
  try {
    switch (p.kind) {
      case 'create_reminder': {
        const id = await saveReminder(p.data);
        const r = await remindersRepository.get(id);
        return reply(`Done. "${r.title}" is set — ${repeatLabel(r).toLowerCase()} at ${fmtTime(r.time)}. Next: ${r.next_at ? fmtWhen(r.next_at) : 'not scheduled'}.`, { intent: 'create_reminder', navigate: null });
      }
      case 'delete_reminder':
        await deleteReminder(p.id);
        return reply(`Deleted the reminder "${p.label}".`, { intent: 'delete_reminder' });
      case 'complete': return completeEntity(p);
      default: return reply('That action is no longer available.', { intent: 'unknown' });
    }
  } catch (e) {
    return reply(`I couldn't do that: ${e.message}`, { intent: 'error' });
  }
}

async function completeEntity(p) {
  switch (p.entity) {
    case 'task': await tasks.complete(p.id); break;
    case 'plan': await studyPlanRepository.setDone(p.id, true); break;
    case 'topic': await syllabusRepository.setDone(p.id, true); break;
    case 'step': await routinesRepository.setStepStatus(p.id, todayStr(), 'done'); break;
    case 'assignment': await assignmentsRepository.submit(p.id); break;
    case 'habit': await habitsRepository.setDone(p.id, todayStr(), true); break;
    case 'revision': {
      const rev = await revisionsRepository.get(p.id);
      const n = nextRevision(rev.stage, todayStr());
      await revisionsRepository.update(p.id, { ...n, last_done: todayStr() });
      break;
    }
    default: return reply('Unsupported item type.', { intent: 'error' });
  }
  return reply(`Marked "${p.label}" as complete.`, { intent: 'mark_complete' });
}

// ---------- Reminders ---------------------------------------------------------------------
async function createReminderIntent(text, userName) {
  const t = text.toLowerCase();
  const preset = PRESET_REMINDERS.find((p) => p.match.test(t));
  const rep = parseRepeat(t);
  let time = parseTime(t);
  const rel = parseRelative(t);

  let title = null;
  const m = text.match(/remind(?:er)?(?: me)?\s+(?:to|about|that)\s+(.+?)(?=\s+(?:at|in|every|daily|tomorrow|on|each)\b|$)/i);
  if (m) title = m[1].trim().replace(/^(my|the)\s+/i, '');
  if (!title && preset) title = preset.title;
  if (!time && !rel && preset) time = preset.time;
  if (!time && !rel) {
    return reply('What time should I set it for? For example: "Remind me to drink water at 5 PM".', { intent: 'clarify' });
  }

  const base = blankReminder();
  const data = { ...base, title: title ? cap(title) : 'Reminder' };
  data.message = preset ? preset.message(userName) : title ? `${userName}, ${title}.` : `${userName}, this is your reminder.`;
  if (preset && !m) data.title = preset.title;

  let whenNote = '';
  if (rel) {
    data.repeat = 'once'; data.once_at = Date.now() + rel;
    data.time = timeStrOf(new Date(data.once_at));
  } else if (rep) {
    data.repeat = rep.repeat; data.weekdays = serializeWeekdays(rep.weekdays); data.time = time;
  } else {
    data.repeat = 'once'; data.time = time;
    let at = toEpoch(todayStr(), time) + parseDayOffset(t) * 86400000;
    if (at <= Date.now()) { at = toEpoch(toDateStr(addDays(new Date(), 1)), time); whenNote = ' (that time has passed today, so tomorrow)'; }
    data.once_at = at;
  }
  const desc = data.repeat === 'once' ? `once, ${fmtWhen(data.once_at)}${whenNote}` : `${repeatLabel(data).toLowerCase()} at ${fmtTime(data.time)}`;
  const summary = `"${data.title}" — ${desc}.\nIt will say: "${data.message}"`;

  if (data.repeat === 'once') {
    try {
      const id = await saveReminder(data);
      const r = await remindersRepository.get(id);
      return reply(`Reminder set: ${summary}${r.next_at ? '' : ''}`, { intent: 'create_reminder' });
    } catch (e) { return reply(`I couldn't set that reminder: ${e.message}`, { intent: 'error' }); }
  }
  return reply(`Create this repeating reminder?\n${summary}\nReply "yes" to confirm or "no" to cancel.`, {
    intent: 'confirm', pending: { kind: 'create_reminder', data },
  });
}

async function deleteReminderIntent(t) {
  const list = await remindersRepository.user();
  const needle = t.replace(/\b(delete|remove|cancel|the|my|reminder|reminders)\b/g, '').trim();
  const hits = needle ? list.filter((r) => r.title.toLowerCase().includes(needle)) : [];
  if (hits.length === 1) {
    return reply(`Delete the reminder "${hits[0].title}" (${repeatLabel(hits[0]).toLowerCase()} at ${fmtTime(hits[0].time)})? This can't be undone. Reply "yes" to confirm.`, {
      intent: 'confirm', pending: { kind: 'delete_reminder', id: hits[0].id, label: hits[0].title },
    });
  }
  if (hits.length > 1) return reply(`Several reminders match: ${hits.map((h) => `"${h.title}"`).join(', ')}. Which one?`, { intent: 'clarify' });
  return reply(needle ? `I couldn't find a reminder matching "${needle}".` : 'Which reminder should I delete? Say its name, e.g. "Delete the good night reminder".', { intent: 'clarify' });
}

async function upcomingReminders() {
  const list = await remindersRepository.upcoming(6);
  if (!list.length) return reply('You have no upcoming reminders. Say "Remind me at 10 PM" to add one.', { intent: 'reminders' });
  return reply(`Upcoming reminders:\n${list.map((r) => `• ${r.title} — ${fmtWhen(r.next_at)}`).join('\n')}`, { intent: 'reminders' });
}

// ---------- Mark complete -----------------------------------------------------------------
const tokenMatch = (title, target) => {
  const tt = title.toLowerCase();
  const tokens = target.split(/\s+/).filter((w) => w.length > 1 && !['the', 'my', 'and'].includes(w));
  return tokens.length > 0 && tokens.every((w) => tt.includes(w));
};

async function markCompleteIntent(t) {
  const target = extractMarkTarget(t);
  if (!target) return reply('What should I mark complete? For example: "Mark DBMS revision complete".', { intent: 'clarify' });
  const found = [];
  const push = (entity, rows, label) => rows.forEach((r) => found.push({ entity, id: r.id, label: label(r) }));
  push('plan', (await studyPlanRepository.findByTitle(target.split(' ')[0])).filter((r) => tokenMatch(r.title, target)), (r) => r.title);
  push('revision', (await revisionsRepository.active()).filter((r) => tokenMatch(`${r.subject_name || ''} ${r.topic}`, target)), (r) => `${r.topic} (revision)`);
  push('task', (await tasks.pending(300)).filter((r) => tokenMatch(r.title, target)), (r) => r.title);
  push('topic', (await syllabusRepository.findByTitle(target.split(' ')[0])).filter((r) => tokenMatch(`${r.subject_name} ${r.title}`, target)), (r) => `${r.title} (${r.subject_name})`);
  push('step', (await routinesRepository.findStepByTitle(target.split(' ')[0])).filter((r) => tokenMatch(r.title, target)), (r) => `${r.title} (${r.routine_name})`);
  push('assignment', (await assignmentsRepository.pending(200)).filter((r) => tokenMatch(`${r.subject_name || ''} ${r.title}`, target)), (r) => `${r.title} (assignment — mark submitted)`);
  push('habit', (await habitsRepository.findByName(target.split(' ')[0])).filter((r) => tokenMatch(r.name, target)), (r) => `${r.name} (habit, today)`);

  if (found.length === 0) return reply(`I couldn't find anything pending that matches "${target}". Check the spelling or say "Show my pending tasks".`, { intent: 'clarify' });
  if (found.length > 1) return reply(`"${target}" matches several items:\n${found.slice(0, 5).map((f) => `• ${f.label}`).join('\n')}\nPlease say which one more specifically.`, { intent: 'clarify' });
  const f = found[0];
  return reply(`Mark "${f.label}" as complete? Reply "yes" to confirm.`, { intent: 'confirm', pending: { kind: 'complete', ...f } });
}

// ---------- Read-only intents --------------------------------------------------------------
async function pendingTasks() {
  const list = await tasks.pending(10);
  if (!list.length) return reply('You have no pending tasks. Nice and clear.', { intent: 'tasks' });
  const total = await tasks.countPending();
  const lines = list.map((x) => `• ${x.title}${x.due_at ? ` — due ${fmtWhen(x.due_at)}` : ''}${x.priority === 2 ? ' (high priority)' : ''}`);
  return reply(`You have ${total} pending task${total === 1 ? '' : 's'}:\n${lines.join('\n')}${total > list.length ? `\n…and ${total - list.length} more.` : ''}`, { intent: 'tasks' });
}

async function scheduleIntent(t) {
  const tomorrow = /\btomorrow\b/.test(t);
  const day = tomorrow ? addDays(new Date(), 1) : new Date();
  const items = await getDaySchedule(day);
  const label = tomorrow ? "Tomorrow's" : "Today's";
  if (!items.length) return reply(`Nothing is scheduled for ${tomorrow ? 'tomorrow' : 'today'} (${fmtDateLong(day)}). Add lectures in College → Timetable or create a reminder.`, { intent: 'schedule' });
  const lines = items.map((i) => `• ${i.type === 'study' ? '' : `${fmtClock(i.at)} — `}${i.title}${i.subtitle ? ` (${i.subtitle.replace(/^[^·]*· ?/, '')})` : ''}`);
  return reply(`${label} schedule, ${fmtDateLong(day)}:\n${lines.join('\n')}`, { intent: 'schedule' });
}

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** "today's classes", "tomorrow's lectures", "Monday classes", "next class" — answered from the timetable. */
async function classesIntent(t, userName) {
  const lec = (l) => `${fmtTime(l.start_time)} – ${fmtTime(l.end_time)}  ${l.subject_name}${l.kind === 'practical' ? ' (practical)' : ''}${l.room ? `, ${l.room}` : ''}`;
  if (/\bnext\b/.test(t)) {
    for (let i = 0; i < 8; i++) {
      const d = addDays(new Date(), i);
      const nowHm = timeStrOf(new Date());
      const l = (await timetableRepository.forDay(isoWeekday(d))).find((x) => i > 0 || x.start_time > nowHm);
      if (l) {
        const when = i === 0 ? `today at ${fmtTime(l.start_time)}` : i === 1 ? `tomorrow at ${fmtTime(l.start_time)}` : `${DAY_NAMES[isoWeekday(d) - 1]} at ${fmtTime(l.start_time)}`;
        return reply(`${userName}, your next class is ${l.subject_name}${l.kind === 'practical' ? ' practical' : ''} ${when}${l.room ? ` in ${l.room}` : ''}.`, { intent: 'classes' });
      }
    }
    return reply('Your timetable has no lectures yet. Add or import it in College → Timetable.', { intent: 'classes', navigate: { screen: 'Timetable' } });
  }
  const named = DAY_NAMES.findIndex((n) => t.includes(n));
  const offset = /\btomorrow\b/.test(t) ? 1 : 0;
  const date = named >= 0 ? (() => { const d = new Date(); while (isoWeekday(d) !== named + 1) d.setDate(d.getDate() + 1); return d; })() : addDays(new Date(), offset);
  const label = named >= 0 ? DAY_NAMES[named][0].toUpperCase() + DAY_NAMES[named].slice(1) : offset ? 'tomorrow' : 'today';
  const rows = await timetableRepository.forDay(isoWeekday(date));
  if (!rows.length) return reply(`${userName}, you have no lectures ${named >= 0 ? `on ${label}` : label}. Enjoy the free time!`, { intent: 'classes' });
  const isToday = toDateStr(date) === todayStr();
  const marks = isToday ? await attendanceRepository.forDate(todayStr()) : [];
  const cancelled = isToday ? new Set((await cancelledRepository.forDate(todayStr())).map((c) => c.timetable_id)) : new Set();
  const status = (l) => {
    if (cancelled.has(l.id)) return ' — not held';
    const m = marks.find((x) => x.subject_id === l.subject_id && x.slot === 1000 + l.id);
    return m ? ` — marked ${m.status}` : '';
  };
  return reply(`${userName}, you have ${rows.length} lecture${rows.length > 1 ? 's' : ''} ${named >= 0 ? `on ${label}` : label}:\n${rows.map((l) => `• ${lec(l)}${status(l)}`).join('\n')}`, { intent: 'classes' });
}

async function attendanceIntent(t = '') {
  const summary = await attendanceRepository.summary();
  const one = await findSubject(t);
  if (one) {
    const row = summary.find((x) => x.id === one.id);
    if (!row || !row.total) return reply(`No attendance recorded for ${one.name} yet.`, { intent: 'attendance' });
    const p = pct(row.present, row.total);
    const hint = p < row.target_pct ? `Attend the next ${classesNeeded(row.present, row.total, row.target_pct)} lectures to reach ${row.target_pct}%.` : `You can still miss ${classesCanSkip(row.present, row.total, row.target_pct)} lectures and stay at ${row.target_pct}%.`;
    return reply(`${one.name}: ${p.toFixed(1)}% — attended ${row.present} of ${row.total}, absent ${row.total - row.present}.\n${hint}`, { intent: 'attendance' });
  }
  if (!summary.length || summary.every((s) => s.total === 0)) {
    return reply('No attendance recorded yet. Add subjects in College → Attendance and mark lectures as you attend them.', { intent: 'attendance', navigate: { screen: 'Attendance' } });
  }
  const o = overall(summary);
  const lines = summary.filter((s) => s.total > 0).map((s) => {
    const p = pct(s.present, s.total);
    const hint = p < s.target_pct ? ` — attend next ${classesNeeded(s.present, s.total, s.target_pct)} to reach ${s.target_pct}%` : ` — can skip ${classesCanSkip(s.present, s.total, s.target_pct)}`;
    return `• ${s.name}: ${p.toFixed(1)}% (${s.present}/${s.total})${hint}`;
  });
  const sh = shortages(summary);
  return reply(`Overall attendance: ${o.pct.toFixed(1)}% (${o.present}/${o.total}).\n${lines.join('\n')}${sh.length ? `\n⚠ Below target: ${sh.map((s) => s.name).join(', ')}.` : ''}`, { intent: 'attendance' });
}

async function examsIntent() {
  const list = await examsRepository.upcoming(5);
  if (!list.length) return reply('No upcoming exams saved. Add them in College → Exams.', { intent: 'exams' });
  return reply(`Upcoming exams:\n${list.map((e) => `• ${e.title}${e.subject_name ? ` (${e.subject_name})` : ''} — ${fmtWhen(e.exam_at)}, in ${fmtCountdown(e.exam_at - Date.now())}`).join('\n')}`, { intent: 'exams' });
}

async function assignmentsIntent() {
  const list = await assignmentsRepository.pending(6);
  if (!list.length) return reply('No pending assignments. 🎉', { intent: 'assignments' });
  return reply(`Pending assignments:\n${list.map((a) => `• ${a.title}${a.subject_name ? ` (${a.subject_name})` : ''} — due ${fmtWhen(a.due_at)}`).join('\n')}`, { intent: 'assignments' });
}

async function habitsIntent() {
  const hs = await habitsRepository.active();
  if (!hs.length) return reply('You have no habits yet. Add some in the Routine tab.', { intent: 'habits' });
  const logs = new Set((await habitsRepository.logsBetween(todayStr(), todayStr())).map((l) => l.habit_id));
  return reply(`Habits today:\n${hs.map((h) => `• ${logs.has(h.id) ? '✓' : '○'} ${h.name}`).join('\n')}`, { intent: 'habits' });
}

async function studyToday() {
  const sec = await studySessionsRepository.secondsOn(todayStr());
  return reply(sec ? `You've studied ${Math.round(sec / 60)} minutes today.` : "No study time logged yet today. Say \"Start study mode\" to begin.", { intent: 'study' });
}

// ---------- Extra intents -------------------------------------------------------------------
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function findSubject(t) {
  const subs = await subjectsRepository.active();
  const hits = subs.filter((s) => new RegExp(`(^|[^a-z0-9])${esc(s.name.toLowerCase())}([^a-z0-9]|$)`).test(t) || (s.code && new RegExp(`(^|[^a-z0-9])${esc(s.code.toLowerCase())}([^a-z0-9]|$)`).test(t)));
  return hits.sort((a, b) => b.name.length - a.name.length)[0] || null;
}

async function markAttendanceIntent(t) {
  const status = /\b(missed|bunked|skipped|absent)\b/.test(t) ? 'absent' : 'present';
  const sub = await findSubject(t);
  if (!sub) return reply('Which subject? For example: "I attended ML today" or "I missed DBMS".', { intent: 'clarify' });
  const today = todayStr();
  const lectures = (await timetableRepository.forDay(isoWeekday())).filter((l) => l.subject_id === sub.id);
  const marks = await attendanceRepository.forDate(today);
  const open = lectures.find((l) => !marks.some((m) => m.subject_id === sub.id && m.slot === 1000 + l.id));
  if (open) { await cancelledRepository.set(open.id, today, false); await attendanceRepository.mark(sub.id, today, status, { slot: 1000 + open.id, kind: open.kind }); }
  else await attendanceRepository.mark(sub.id, today, status);
  const row = (await attendanceRepository.summary()).find((x) => x.id === sub.id);
  return reply(`Marked ${sub.name} as ${status} for today. ${sub.name} attendance is now ${pct(row.present, row.total).toFixed(1)}% (${row.present}/${row.total}).`, { intent: 'mark_attendance' });
}

/** Day offset from today for "today", "tomorrow", "day after tomorrow" or a weekday name (next occurrence). Defaults to tomorrow. */
function dayOffsetOf(t) {
  if (/\bday after tomorrow\b/.test(t)) return { offset: 2, word: 'the day after tomorrow' };
  if (/\btomorrow\b/.test(t)) return { offset: 1, word: 'tomorrow' };
  if (/\btoday\b/.test(t)) return { offset: 0, word: 'today' };
  const names = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const k = names.findIndex((n) => new RegExp(`\\b${n}\\b`).test(t));
  if (k >= 0) { const offset = ((k + 1 - isoWeekday() + 7) % 7) || 7; return { offset, word: `on ${names[k][0].toUpperCase()}${names[k].slice(1)}` }; }
  return { offset: 1, word: 'tomorrow' };
}

async function bunkIntent(t) {
  const { offset, word } = dayOffsetOf(t);
  const date = addDays(new Date(), offset);
  const only = await findSubject(t);
  const lectures = (await timetableRepository.forDay(isoWeekday(date))).filter((l) => !only || l.subject_id === only.id);
  if (!lectures.length) return reply(`You have no ${only ? `${only.name} ` : ''}lectures ${word}, so there is nothing to skip.`, { intent: 'bunk' });
  const skips = {};
  lectures.forEach((l) => { skips[l.subject_id] = (skips[l.subject_id] || 0) + 1; });
  const summary = await attendanceRepository.summary();
  const proj = bunkProjection(summary, skips);
  if (!proj.length) return reply(`No attendance recorded yet, so I can't predict the effect of skipping ${word}.`, { intent: 'bunk' });
  const lines = proj.map((p) => `• ${p.name}: ${p.before === null ? '—' : p.before.toFixed(1)}% → ${p.after.toFixed(1)}% ${p.safe ? '(stays above' : '(drops below'} ${p.target}%)`);
  const bad = proj.filter((p) => !p.safe);
  // Overall view: skipped lectures add to the total but not to "present".
  const o = overall(summary);
  const n = lectures.length;
  const afterAdj = summary.map((x) => ({ ...x, total: x.total + (skips[x.id] || 0) }));
  const oa = overall(afterAdj);
  let overallLine = '';
  if (o.total > 0) {
    overallLine = `\nOverall: ${o.pct.toFixed(1)}% → ${oa.pct.toFixed(1)}%.`;
    const rec = overallRecovery(afterAdj, await timetableRepository.week(), 0);
    overallLine += rec.ok ? ` Still above ${OVERALL_TARGET}%.` : rec.reachable && rec.date ? ` You'd reach ${OVERALL_TARGET}% overall on ${fmtDateShort(new Date(rec.date + 'T00:00:00'))} (${fmtTime(rec.lecture.start_time)} ${rec.lecture.subject_name}) if you attend everything after that.` : '';
  }
  const verdict = bad.length ? `Not recommended: ${bad.map((b) => b.name).join(', ')} would fall below target.` : 'Safe to skip — every subject stays above target.';
  return reply(`If you skip ${n} lecture${n > 1 ? 's' : ''} ${word}:\n${lines.join('\n')}${overallLine}\n${verdict}`, { intent: 'bunk' });
}

/** "When will I reach 75%?" / "if I miss 2 days, when will I be at 75%?" — overall attendance projection. */
async function targetDateIntent(t) {
  const summary = await attendanceRepository.summary();
  const o = overall(summary);
  if (!o.total) return reply('No attendance recorded yet, so I can\'t project a date. Mark a few lectures first.', { intent: 'target_date', navigate: { screen: 'Attendance' } });
  const m = t.match(/\b(\d+)\s*(?:class\s*)?days?\b/);
  const days = m && /\b(absent|miss|bunk|skip|leave)\b/.test(t) ? Math.min(30, Number(m[1])) : /\btomorrow\b/.test(t) && /\b(absent|miss|bunk|skip)\b/.test(t) ? 1 : 0;
  const week = await timetableRepository.week();
  if (!week.length) return reply('Add your timetable (College → Timetable) so I can work out the date.', { intent: 'target_date', navigate: { screen: 'Timetable' } });
  const r = overallRecovery(summary, week, days);
  const lead = days ? `If you miss the next ${days} class day${days > 1 ? 's' : ''}, overall goes ${o.pct.toFixed(1)}% → ${r.afterAbsence.toFixed(1)}%. ` : `Overall is ${o.pct.toFixed(1)}%. `;
  if (r.ok) return reply(`${lead}That's still above ${OVERALL_TARGET}%, so you're safe.`, { intent: 'target_date' });
  if (!r.reachable) return reply(`${lead}I can't reach ${OVERALL_TARGET}% within your timetable horizon.`, { intent: 'target_date' });
  return reply(`${lead}If you attend every lecture after that, you reach ${OVERALL_TARGET}% on ${fmtDateLong(new Date(r.date + 'T00:00:00'))}, at ${fmtTime(r.lecture.start_time)} (${r.lecture.subject_name}) — after ${r.attended} lecture${r.attended === 1 ? '' : 's'} in a row.`, { intent: 'target_date' });
}

/** "What's due this week / today / tomorrow?" — pending tasks, assignments and exams combined, soonest first. */
async function dueIntent(t) {
  const now = new Date();
  let end, label;
  if (/\btoday\b/.test(t)) { end = endOfDayMs(now); label = 'today'; }
  else if (/\btomorrow\b/.test(t)) { end = endOfDayMs(addDays(now, 1)); label = 'by tomorrow'; }
  else if (/\bnext week\b/.test(t)) { end = endOfDayMs(addDays(now, 14)); label = 'in the next 14 days'; }
  else { end = endOfDayMs(addDays(now, 7)); label = 'in the next 7 days'; }
  const [tk, asg, ex] = await Promise.all([tasks.pending(200), assignmentsRepository.pending(100), examsRepository.upcoming(50)]);
  const items = [
    ...tk.filter((x) => x.due_at).map((x) => ({ at: x.due_at, kind: 'Task', text: x.title })),
    ...asg.filter((x) => x.due_at).map((x) => ({ at: x.due_at, kind: 'Assignment', text: `${x.title}${x.subject_name ? ` (${x.subject_name})` : ''}` })),
    ...ex.map((x) => ({ at: x.exam_at, kind: 'Exam', text: `${x.title}${x.subject_name ? ` (${x.subject_name})` : ''}` })),
  ].sort((a, b) => a.at - b.at);
  const overdue = items.filter((x) => x.at < Date.now() && x.kind !== 'Exam');
  const due = items.filter((x) => x.at >= Date.now() && x.at <= end);
  if (!due.length && !overdue.length) return reply(`Nothing is due ${label}. You're clear!`, { intent: 'due' });
  const out = [];
  if (overdue.length) out.push(`⚠ Overdue:\n${overdue.slice(0, 6).map((x) => `• ${x.kind}: ${x.text} — was due ${fmtWhen(x.at)}`).join('\n')}`);
  if (due.length) out.push(`Due ${label}:\n${due.slice(0, 12).map((x) => `• ${x.kind}: ${x.text} — ${fmtWhen(x.at)}`).join('\n')}`);
  return reply(out.join('\n\n'), { intent: 'due' });
}
const endOfDayMs = (d) => { const c = new Date(d); c.setHours(23, 59, 59, 999); return c.getTime(); };

async function allReminders() {
  const list = await remindersRepository.user();
  if (!list.length) return reply('You have no reminders. Say "Set reminder at 10 PM good night" to add one.', { intent: 'reminders' });
  return reply(`All reminders:\n${list.map((r) => `• ${r.enabled ? '' : '(off) '}${r.title} — ${repeatLabel(r).toLowerCase()} at ${fmtTime(r.time)}`).join('\n')}`, { intent: 'reminders' });
}

async function toggleReminderIntent(t) {
  const on = /\b(resume|turn on|enable|switch on)\b/.test(t);
  const list = await remindersRepository.user();
  const needle = t.replace(/\b(pause|turn off|disable|switch off|resume|turn on|enable|switch on|the|my|reminder|reminders)\b/g, '').trim();
  const hits = needle ? list.filter((r) => r.title.toLowerCase().includes(needle)) : [];
  if (hits.length !== 1) return reply(hits.length ? `Several reminders match: ${hits.map((h) => `"${h.title}"`).join(', ')}. Which one?` : `Which reminder? For example: "Pause the good night reminder".`, { intent: 'clarify' });
  try { await setEnabled(hits[0].id, on); } catch (e) { return reply(`I couldn't change it: ${e.message}`, { intent: 'error' }); }
  return reply(`"${hits[0].title}" is now ${on ? 'on' : 'off'}.`, { intent: 'toggle_reminder' });
}

async function filteredTasks(t) {
  const all = await tasks.pending(300);
  const start = startOfDay().getTime(), end = start + 86400000;
  const high = /\b(high|top) priority\b/.test(t);
  const list = high ? all.filter((x) => x.priority === 2) : all.filter((x) => x.due_at && x.due_at < end);
  const label = high ? 'high-priority' : 'due today or overdue';
  if (!list.length) return reply(`No ${label} tasks. Nice and clear.`, { intent: 'tasks' });
  return reply(`${list.length} ${label} task${list.length > 1 ? 's' : ''}:\n${list.slice(0, 10).map((x) => `• ${x.title}${x.due_at ? ` — ${fmtWhen(x.due_at)}` : ''}`).join('\n')}`, { intent: 'tasks' });
}

async function daySummary(userName) {
  const lectures = await timetableRepository.forDay(isoWeekday());
  const pend = await tasks.countPending();
  const rem = (await remindersRepository.upcoming(1))[0];
  const asg = (await assignmentsRepository.pending(3)).filter((a) => a.due_at - Date.now() < 48 * 3600000);
  const o = overall(await attendanceRepository.summary());
  const out = [`${userName}, here is your day (${fmtDateLong(new Date())}):`];
  out.push(lectures.length ? `• ${lectures.length} lecture${lectures.length > 1 ? 's' : ''}: ${lectures.map((l) => `${l.subject_name} ${fmtTime(l.start_time)}`).join(', ')}` : '• No lectures today');
  out.push(`• ${pend} pending task${pend === 1 ? '' : 's'}`);
  if (asg.length) out.push(`• Due soon: ${asg.map((a) => a.title).join(', ')}`);
  if (rem) out.push(`• Next reminder: ${rem.title}, ${fmtWhen(rem.next_at)}`);
  if (o.pct !== null) out.push(`• Overall attendance ${o.pct.toFixed(1)}%`);
  return reply(out.join('\n'), { intent: 'summary' });
}

async function spendingIntent(t) {
  const now = new Date();
  let from, to, label;
  if (/\btoday\b/.test(t)) { from = to = todayStr(); label = 'today'; }
  else if (/\bweek\b/.test(t)) { from = toDateStr(addDays(now, -6)); to = todayStr(); label = 'in the last 7 days'; }
  else { ({ from, to } = monthRange(monthKeyOf(now))); label = 'this month'; }
  const r = await expenseRepository.totals(from, to);
  return reply(`You spent ${formatPaise(r.expense)} ${label}${r.income ? ` and earned ${formatPaise(r.income)}` : ''}.`, { intent: 'spending' });
}

async function addExpenseIntent(text) {
  const m = text.match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return reply('How much was it? For example: "Spent 150 on lunch".', { intent: 'clarify' });
  const paise = Math.round(parseFloat(m[1].replace(',', '.')) * 100);
  const note = text.replace(/^(add|log|record)\s+(an?\s+)?(expense|spend)\s*(of)?/i, '').replace(/\b(i )?spent\b/i, '').replace(/(rs\.?|₹)?\s*\d+(?:[.,]\d{1,2})?/i, '').replace(/^\s*(on|for)\s+/i, '').trim();
  try { await expenseRepository.add({ kind: 'expense', amountPaise: paise, date: todayStr(), paymentMethod: 'cash', note: note ? cap(note) : null }); } catch (e) { return reply(`I couldn't add that: ${e.message}`, { intent: 'error' }); }
  return reply(`Added an expense of ${formatPaise(paise)}${note ? ` for ${note}` : ''} (cash, today).`, { intent: 'add_expense' });
}

async function khataIntent() {
  const k = await khataRepository.summary();
  if (!k.people) return reply('Your Khata has no people yet. Add them in the Khata screen.', { intent: 'khata', navigate: { screen: 'Khata' } });
  return reply(`My Khata:\n• You will get (lena): ${formatPaise(k.receivable)}\n• You have to give (dena): ${formatPaise(k.payable)}\n• Net: ${formatPaise(k.net)}`, { intent: 'khata' });
}

async function addTask(text) {
  const title = text.replace(/^(add|create|new)\s+(a\s+)?task\s*(to|:)?\s*/i, '').trim();
  if (!title) return reply('What is the task called? e.g. "Add task submit DBMS journal".', { intent: 'clarify' });
  await tasks.insert({ title: cap(title), priority: 1, status: 'pending' });
  return reply(`Added task "${cap(title)}".`, { intent: 'add_task' });
}

async function addNote(text) {
  const body = text.replace(/^(add|save|create|new)\s+(a\s+)?(note|idea)\s*(that|:)?\s*/i, '').trim();
  if (!body) return reply('What should the note say?', { intent: 'clarify' });
  const isIdea = /idea/i.test(text.slice(0, 20));
  await notesRepository.insert({ title: cap(body.slice(0, 40)), body, is_idea: isIdea ? 1 : 0, pinned: 0 });
  return reply(`Saved your ${isIdea ? 'idea' : 'note'}.`, { intent: 'add_note' });
}

// ---------- What should I do now ------------------------------------------------------------
export async function suggestNow(now = new Date()) {
  const day = await getDaySchedule(now);
  const ms = now.getTime();
  const current = day.find((i) => i.type === 'lecture' && i.at <= ms && ms < i.endAt);
  if (current) return { text: `You have ${current.title} right now (${current.subtitle}). Focus on the lecture.`, kind: 'lecture' };
  const soon = day.find((i) => i.type === 'lecture' && i.at > ms && i.at - ms <= 45 * 60000);
  if (soon) return { text: `${soon.title} starts in ${fmtCountdown(soon.at - ms)} (${soon.subtitle}). Get ready.`, kind: 'lecture' };
  const due = (await assignmentsRepository.pending(5)).find((a) => a.due_at - ms < 36 * 3600000);
  if (due) return { text: `"${due.title}" is due ${fmtWhen(due.due_at)}. Work on that assignment now.`, kind: 'assignment' };
  const revs = await revisionsRepository.due(todayStr());
  if (revs.length) return { text: `Revise "${revs[0].topic}"${revs[0].subject_name ? ` (${revs[0].subject_name})` : ''}. It's due for revision${revs.length > 1 ? `, plus ${revs.length - 1} more` : ''}.`, kind: 'revision' };
  const plan = (await studyPlanRepository.forDate(todayStr())).find((p) => !p.done);
  if (plan) return { text: `Your study plan has "${plan.title}" (${plan.planned_min} min). Start with that.`, kind: 'study' };
  const task = (await tasks.pending(1))[0];
  if (task) return { text: `Top pending task: "${task.title}"${task.due_at ? `, due ${fmtWhen(task.due_at)}` : ''}.`, kind: 'task' };
  const rem = (await remindersRepository.upcoming(1))[0];
  if (rem) return { text: `Nothing urgent. Next up: "${rem.title}" ${fmtWhen(rem.next_at)}.`, kind: 'reminder' };
  return { text: 'Nothing urgent right now. A good time to add tasks, a study plan, or take a break.', kind: 'idle' };
}

async function whatNow(userName) {
  const s = await suggestNow();
  return reply(s.text, { intent: 'what_now' });
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
