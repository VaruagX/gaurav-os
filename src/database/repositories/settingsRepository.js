import { all, first, run } from '../db';

export const DEFAULTS = {
  userName: 'Gaurav',
  theme: 'system',
  dailyStudyGoalMin: '120',
  defaultVoiceLang: 'en-US',
  defaultVoiceRate: '1',
  defaultVoicePitch: '1',
  defaultSnoozeMin: '10',
  speakAssistant: '1',
  attendanceTarget: '75',
  pomodoroFocusMin: '25',
  pomodoroBreakMin: '5',
  lastBackupAt: '',
  callAssistantEnabled: '0',
  callLang: 'both',
  callTimeoutSec: '8',
  callSpeaker: '1',
  callDuckRing: '1',
  lecturePrompts: '1',
  lectureDelayMin: '0',
  briefingEnabled: '0',
  briefingTime: '07:30',
  backupReminder: '1',
  autoBackup: '0',
  quickAdd: '0',
  accent: 'indigo',
  pureBlack: '0',
  appLock: '0',
  lockPin: '',
};

export const settingsRepository = {
  async get(key) {
    const row = await first('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? row.value : DEFAULTS[key] ?? null;
  },
  async getAll() {
    const rows = await all('SELECT key, value FROM settings');
    const out = { ...DEFAULTS };
    rows.forEach((r) => { out[r.key] = r.value; });
    return out;
  },
  set: (key, value) =>
    run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, String(value ?? ''), Date.now()]
    ),
};
