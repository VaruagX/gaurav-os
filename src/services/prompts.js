import Native from '../../modules/reminder-native';
import { subscribe } from '../database/db';
import {
  settingsRepository, timetableRepository, attendanceRepository, cancelledRepository, tasksRepository,
} from '../database/repositories';
import { buildLecturePrompts, buildBriefingPrompts, backupPrompt, SLOT_BASE } from './college/lectureLogic';
import { syncSubscriptionReminders } from './subscriptions';
import { overall } from './college/attendance';
import { todayStr, toDateStr, isoWeekday, WEEKDAYS_LONG, fmtTime } from '../utils/date';

const available = () => !!Native?.setPrompts;
const last = {};

async function pushGroup(group, prompts) {
  const json = JSON.stringify(prompts);
  if (last[group] === json) return;
  await Native.setPrompts(group, json);
  last[group] = json;
}

/** Push every scheduled prompt (lecture questions, briefing, backup nudge) to the native layer. Safe to call often. */
export async function syncPrompts() {
  if (!available()) return;
  const s = await settingsRepository.getAll();
  const rows = await timetableRepository.week();
  await pushGroup('lecture', s.lecturePrompts === '1' ? buildLecturePrompts(rows, { delayMin: Number(s.lectureDelayMin) || 0 }) : []);
  await pushGroup('briefing', s.briefingEnabled === '1'
    ? buildBriefingPrompts(rows, { time: s.briefingTime || '07:30', name: s.userName, pending: await tasksRepository.countPending() }) : []);
  await pushGroup('backup', s.backupReminder === '1' ? [backupPrompt()] : []);
  if (Native.setQuickAdd) await Native.setQuickAdd(s.quickAdd === '1').catch(() => {});
}

/** Home-screen widget content: today's lectures with their status + overall attendance. */
export async function pushWidget() {
  if (!Native?.setWidgetData) return;
  const today = todayStr();
  const [rows, marks, cancelled, summary] = await Promise.all([
    timetableRepository.forDay(isoWeekday()), attendanceRepository.forDate(today), cancelledRepository.forDate(today), attendanceRepository.summary(),
  ]);
  const o = overall(summary);
  const cancelledIds = new Set(cancelled.map((c) => c.timetable_id));
  const sym = (l) => {
    if (cancelledIds.has(l.id)) return '–';
    const m = marks.find((x) => x.subject_id === l.subject_id && x.slot === SLOT_BASE + l.id);
    return m ? (m.status === 'present' ? '✓' : '✗') : '•';
  };
  const lines = rows.slice(0, 4).map((l) => `${sym(l)}  ${fmtTime(l.start_time)}  ${l.subject_name}`);
  if (rows.length > 4) lines[3] = `+${rows.length - 3} more lectures`;
  await Native.setWidgetData(JSON.stringify({
    title: `Today · ${WEEKDAYS_LONG[isoWeekday() - 1]}`, pct: o.pct === null ? '' : `${o.pct.toFixed(1)}%`,
    lines: rows.length ? lines : ['No lectures today'],
  }));
}

/** Import Present / Absent / Not held button taps recorded while the app was closed. Returns how many were applied. */
export async function syncPromptEvents() {
  if (!Native?.takePromptEvents) return 0;
  let events = [];
  try { events = JSON.parse(await Native.takePromptEvents()); } catch (e) { return 0; }
  let n = 0;
  for (const e of events) {
    if (e.group !== 'lecture') continue;
    let d; try { d = JSON.parse(e.data); } catch (x) { continue; }
    const date = toDateStr(new Date(e.firedAt || e.at));
    if (e.action === 'present' || e.action === 'absent') {
      await attendanceRepository.mark(d.subject, date, e.action, { slot: SLOT_BASE + d.tt, kind: d.kind || 'theory' }); n++;
    } else if (e.action === 'cancelled') { await cancelledRepository.set(d.tt, date, true); n++; }
  }
  return n;
}

/** Keep native prompts + widget in step with the database (debounced). Call once after the DB is ready. */
export function startPromptSync() {
  let timer = null;
  const run = () => { syncPrompts().catch(() => {}); pushWidget().catch(() => {}); syncSubscriptionReminders().catch(() => {}); };
  const unsub = subscribe(() => { clearTimeout(timer); timer = setTimeout(run, 1500); });
  run();
  return () => { clearTimeout(timer); unsub(); };
}
