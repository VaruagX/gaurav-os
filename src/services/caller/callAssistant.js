import { Platform, PermissionsAndroid } from 'react-native';
import Native from '../../../modules/reminder-native';
import { settingsRepository, callLogRepository } from '../../database/repositories';

export const callNativeAvailable = Platform.OS === 'android' && !!Native?.setCallAssistantConfig;

export const CALL_LANGS = [
  { id: 'both', label: 'Hinglish + English (recommended)', sample: 'Gaurav, Rahul ka call aaya hai. Kya aap call uthana chahte ho? Say yes or no.' },
  { id: 'hinglish-hi', label: 'Hinglish (Hindi voice)', sample: 'Gaurav, Rahul ka call aaya hai. Kya aap call uthana chahte ho?' },
  { id: 'hinglish-en', label: 'Hinglish (English-India voice)', sample: 'Gaurav, Rahul ka call aaya hai. Kya aap call uthana chahte ho?' },
  { id: 'english', label: 'English', sample: 'Gaurav, Rahul is calling. Do you want to answer?' },
];

export const TIMEOUT_MIN = 4, TIMEOUT_MAX = 20;

export const OUTCOME_LABEL = {
  answered: 'Answered', rejected: 'Rejected', no_response: 'No response (kept ringing)', call_ended: 'Call ended first',
  tts_failed: 'Voice failed', failed: 'Failed', sim_answer: 'Test: would answer', sim_reject: 'Test: would reject',
};
export const OUTCOME_TONE = { answered: 'success', rejected: 'warning', failed: 'danger', tts_failed: 'danger', sim_answer: 'success', sim_reject: 'warning' };

/** Clamp/validate user settings before they reach the native layer. */
export function normalizeConfig(raw) {
  const t = Math.round(Number(raw.callTimeoutSec));
  return {
    enabled: raw.callAssistantEnabled === '1' || raw.callAssistantEnabled === true,
    lang: CALL_LANGS.some((l) => l.id === raw.callLang) ? raw.callLang : 'both',
    timeoutSec: Number.isFinite(t) ? Math.min(TIMEOUT_MAX, Math.max(TIMEOUT_MIN, t)) : 8,
    user: String(raw.userName || 'Gaurav').trim() || 'Gaurav',
    speaker: raw.callSpeaker !== '0' && raw.callSpeaker !== false,
    duckRing: raw.callDuckRing !== '0' && raw.callDuckRing !== false,
  };
}

/** Required to enable: phone state (call events), answer-calls (answer/reject), microphone (listen). */
export function missingRequirements(st) {
  if (!st) return ['Android app'];
  return [!st.phoneState && 'Phone state', !st.answerCalls && 'Answer calls', !st.microphone && 'Microphone'].filter(Boolean);
}
export const canEnable = (st) => missingRequirements(st).length === 0;

export async function pushConfig() {
  if (!callNativeAvailable) return;
  const all = await settingsRepository.getAll();
  const cfg = normalizeConfig(all);
  // Never leave the native side enabled without the permissions it needs.
  if (cfg.enabled && !canEnable(await getStatus())) cfg.enabled = false;
  await Native.setCallAssistantConfig(JSON.stringify(cfg));
  // The "ready" service keeps the voice warm and holds the microphone allowance. It must be started while the
  // app is visible, so this runs at app start, when the app returns to the foreground, and when settings change.
  if (cfg.enabled) await Native.startCallReady().catch(() => false); else await Native.stopCallReady().catch(() => {});
}

export const getStatus = () => (callNativeAvailable ? Native.getCallAssistantStatus() : Promise.resolve(null));

export async function requestPermissions() {
  const P = PermissionsAndroid.PERMISSIONS;
  const res = await PermissionsAndroid.requestMultiple([P.READ_PHONE_STATE, P.ANSWER_PHONE_CALLS, P.RECORD_AUDIO, P.READ_CONTACTS]);
  return res;
}

export const requestRole = () => Native.requestCallScreeningRole();

export async function syncCallEvents() {
  if (!callNativeAvailable) return 0;
  let events = [];
  try { events = JSON.parse(await Native.takeCallEvents()); } catch (e) { return 0; }
  for (const e of events) await callLogRepository.add(e.name, e.outcome, e.detail, e.at);
  return events.length;
}

/** Runs the full announce → listen → parse flow against a fake caller. Never touches a real call. */
export async function simulateCall(name) {
  const started = await Native.simulateCall(name);
  if (!started) throw new Error('Could not start the test (is another announcement running?).');
}
