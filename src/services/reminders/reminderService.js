import { Platform, PermissionsAndroid } from 'react-native';
import Native from '../../../modules/reminder-native';
import { remindersRepository as repo } from '../../database/repositories';
import { nextOccurrence, parseWeekdays } from './schedule';
import { toEpoch } from '../../utils/date';

export const nativeAvailable = Platform.OS === 'android' && !!Native;

export const MODES = [
  { id: 'normal', label: 'Normal', hint: 'Notification + speaks once' },
  { id: 'persistent', label: 'Persistent', hint: 'Stays until completed, with Complete / Snooze' },
  { id: 'alarm', label: 'Alarm', hint: 'Alarm sound + repeats speech until stopped' },
];

export const LANGUAGES = [
  { tag: 'en-US', label: 'English (US)' }, { tag: 'en-IN', label: 'English (India)' }, { tag: 'en-GB', label: 'English (UK)' },
  { tag: 'hi-IN', label: 'Hindi' }, { tag: 'mr-IN', label: 'Marathi' },
];

export const blankReminder = (defaults = {}) => ({
  title: '', message: '', mode: 'normal', speak_enabled: 1, lang: defaults.defaultVoiceLang || 'en-US',
  rate: Number(defaults.defaultVoiceRate || 1), pitch: Number(defaults.defaultVoicePitch || 1),
  snooze_min: Number(defaults.defaultSnoozeMin || 10), repeat: 'once', time: '08:00', weekdays: '',
  once_at: null, enabled: 1, source: 'user', source_id: null,
});

/** Validate user input; returns an error string or null. */
export function validateReminder(r, now = Date.now()) {
  if (!String(r.title || '').trim()) return 'Give the reminder a title.';
  if (!/^\d{1,2}:\d{2}$/.test(r.time || '')) return 'Pick a time.';
  if (r.repeat === 'once' && (!r.once_at || r.once_at <= now)) return 'Pick a date and time in the future.';
  if ((r.repeat === 'weekdays' || r.repeat === 'weekly') && !parseWeekdays(r.weekdays).length) return 'Select at least one weekday.';
  if (r.snooze_min < 1 || r.snooze_min > 120) return 'Snooze must be between 1 and 120 minutes.';
  return null;
}

const toNativeJson = (r) => JSON.stringify({
  id: r.id, title: r.title, message: r.message || '', mode: r.mode, speak: !!r.speak_enabled, lang: r.lang,
  rate: r.rate, pitch: r.pitch, snoozeMin: r.snooze_min, repeat: r.repeat, time: r.time,
  weekdays: parseWeekdays(r.weekdays), onceAt: r.once_at || 0, enabled: !!r.enabled,
});

/** Push one DB reminder to the native alarm layer and store the real next trigger time. */
export async function syncToNative(id) {
  const r = await repo.get(id);
  if (!r) return null;
  let next = nextOccurrence(r);
  if (nativeAvailable) {
    try {
      const t = await Native.scheduleReminder(toNativeJson(r));
      next = r.enabled ? t : null;
    } catch (e) {
      throw new Error(`Could not schedule alarm: ${e.message}`);
    }
  } else if (!r.enabled) next = null;
  await repo.update(id, { next_at: next ?? null });
  return next ?? null;
}

/** Create or update a reminder, schedule it, and return its id. */
export async function saveReminder(input) {
  const data = { ...input };
  if (data.repeat === 'once' && data.once_at) {
    const d = new Date(data.once_at);
    data.time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const err = validateReminder(data);
  if (err && data.enabled) throw new Error(err);
  data.title = data.title.trim();
  data.message = (data.message || '').trim();
  let id = data.id;
  if (id) await repo.update(id, data); else id = await repo.insert(data);
  await syncToNative(id);
  return id;
}

export async function deleteReminder(id) {
  if (nativeAvailable) await Native.cancelReminder(id);
  await repo.remove(id);
}

export async function setEnabled(id, enabled) {
  const r = await repo.get(id);
  if (!r) return;
  if (enabled && r.repeat === 'once' && (!r.once_at || r.once_at <= Date.now())) {
    throw new Error('This one-time reminder is in the past. Edit it to pick a new time.');
  }
  await repo.update(id, { enabled: enabled ? 1 : 0 });
  await syncToNative(id);
}

export async function completeReminder(id) {
  const r = await repo.get(id);
  if (!r) return;
  await repo.addHistory(id, r.title, 'completed');
  if (nativeAvailable) await Native.stopActiveReminder();
}

/** Create/replace a reminder owned by another module (assignment, exam, routine step...). */
export async function upsertLinkedReminder(source, sourceId, fields) {
  const existing = await repo.findBySource(source, sourceId);
  const data = { ...blankReminder(), ...fields, source, source_id: sourceId };
  if (existing) { await repo.update(existing.id, data); await syncToNative(existing.id); return existing.id; }
  const id = await repo.insert(data);
  await syncToNative(id);
  return id;
}

export async function removeLinkedReminder(source, sourceId) {
  const existing = await repo.findBySource(source, sourceId);
  if (existing) await deleteReminder(existing.id);
}

/** Convenience for "remind me N minutes before <epoch>". Returns null when that moment already passed. */
export async function upsertDeadlineReminder(source, sourceId, title, whenMs, beforeMin, message) {
  const at = whenMs - beforeMin * 60000;
  if (at <= Date.now()) { await removeLinkedReminder(source, sourceId); return null; }
  return upsertLinkedReminder(source, sourceId, {
    title, message, mode: 'persistent', repeat: 'once', once_at: at, time: '00:00', enabled: 1,
  });
}

/** Re-send every enabled reminder to AlarmManager (idempotent; run at startup). */
export async function rescheduleAllFromDb() {
  const list = await repo.list();
  for (const r of list) {
    if (r.repeat === 'once' && r.once_at && r.once_at <= Date.now() && r.enabled) {
      await repo.update(r.id, { enabled: 0, next_at: null });
      continue;
    }
    if (r.enabled) { try { await syncToNative(r.id); } catch (e) { /* keep going */ } }
    else if (nativeAvailable) await Native.cancelReminder(r.id);
  }
}

/** Pull fired/completed/snoozed events recorded by the native layer into reminder history. */
export async function syncNativeEvents() {
  if (!nativeAvailable) return 0;
  let events = [];
  try { events = JSON.parse(await Native.takePendingEvents()); } catch (e) { return 0; }
  for (const ev of events) {
    const r = await repo.get(ev.reminderId);
    if (!r) continue;
    await repo.addHistory(r.id, r.title, ev.type, ev.at, ev.detail || null);
    if ((ev.type === 'fired' || ev.type === 'missed') && r.repeat === 'once') {
      await repo.update(r.id, { enabled: 0, next_at: null });
    } else if (ev.type === 'fired') {
      await repo.update(r.id, { next_at: nextOccurrence(r) });
    }
  }
  return events.length;
}

export const previewVoice = (text, lang, rate, pitch) => {
  if (!nativeAvailable) return Promise.reject(new Error('Voice preview needs the installed Android app.'));
  return Native.speak(text || 'This is a voice preview.', lang, rate, pitch);
};
export const stopPreview = () => (nativeAvailable ? Native.stopSpeaking() : null);

export async function getAvailableLanguages() {
  if (!nativeAvailable) return LANGUAGES;
  try {
    const ok = await Native.getAvailableLanguages(LANGUAGES.map((l) => l.tag));
    const filtered = LANGUAGES.filter((l) => ok.includes(l.tag));
    return filtered.length ? filtered : LANGUAGES.slice(0, 1);
  } catch (e) { return LANGUAGES; }
}

export async function getDeviceStatus() {
  if (!nativeAvailable) return null;
  return Native.getStatus();
}

export async function requestNotificationPermission() {
  if (Platform.OS !== 'android' || Platform.Version < 33) return true;
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

export const device = {
  openExactAlarm: () => Native?.openExactAlarmSettings(),
  openNotifications: () => Native?.openNotificationSettings(),
  openBattery: () => Native?.openBatterySettings(),
  openAutostart: () => Native?.openAutostartSettings(),
  openFullScreen: () => Native?.openFullScreenIntentSettings(),
  openAppDetails: () => Native?.openAppDetails(),
  openAccessibility: () => Native?.openAccessibilitySettings(),
};

export { toEpoch };
