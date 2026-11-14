import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Constants from 'expo-constants';
import { Screen, Card, T, Input, Field, Segmented, Chip, SwitchRow, Button, Stepper, SectionHeader, Row, Icon, TimeField, Sheet } from '../components/ui';
import { ACCENTS } from '../theme';
import { enableLock, disableLock } from '../services/appLock';
import { useThemePreference } from '../theme';
import { useSettings } from '../hooks/useSettings';
import { settingsRepository } from '../database/repositories';
import { LANGUAGES, getAvailableLanguages, previewVoice } from '../services/reminders/reminderService';
import { pushConfig } from '../services/caller/callAssistant';
import { createBackup, pickBackup, applyBackup } from '../services/backup/backupService';
import { LATEST_VERSION } from '../database/migrations';
import { confirm, showError, toast } from '../utils/ui';
import { fmtDateTime } from '../utils/date';

export default function SettingsScreen() {
  const nav = useNavigation();
  const s = useSettings();
  const [pref, setPref] = useThemePreference();
  const [langs, setLangs] = useState(LANGUAGES);
  const [busy, setBusy] = useState(null);
  const [pinSheet, setPinSheet] = useState(false);
  const [pin, setPin] = useState('');
  const route = useRoute();
  React.useEffect(() => { getAvailableLanguages().then(setLangs); }, []);
  const set = (k, v) => settingsRepository.set(k, v);

  const backup = async () => {
    setBusy('backup');
    try { await createBackup(); toast('Backup created'); } catch (e) { showError(e, 'Backup failed'); } finally { setBusy(null); }
  };
  // Opened from the weekly "Back up now" notification.
  React.useEffect(() => { if (route.params?.backup) backup(); }, [route.params?.backup]); // eslint-disable-line react-hooks/exhaustive-deps
  const savePin = async () => { try { await enableLock(pin); setPinSheet(false); setPin(''); toast('App lock is on'); } catch (e) { showError(e, 'PIN'); } };

  const restore = async () => {
    setBusy('restore');
    try {
      const picked = await pickBackup();
      if (!picked) return;
      const { tasks, reminders, subjects, notes } = picked.summary;
      const ok = await confirm('Replace all current data?',
        `Restore "${picked.name}"?\n\nIt contains ${tasks} tasks, ${reminders} reminders, ${subjects} subjects and ${notes} notes.\nEverything currently in the app will be replaced. This cannot be undone.`, { destructive: true, confirmText: 'Restore' });
      if (!ok) { await picked.db.closeAsync(); return; }
      await applyBackup(picked);
      toast('Backup restored');
    } catch (e) { showError(e, 'Restore failed'); } finally { setBusy(null); }
  };

  return (
    <Screen title="Settings">
      <SectionHeader title="Profile" style={{ marginTop: 0 }} />
      <Input label="YOUR NAME" value={s.userName} onChangeText={(v) => { set('userName', v).then(() => pushConfig()).catch(() => {}); }} hint="Used in greetings and spoken messages." />

      <SectionHeader title="Appearance" />
      <Segmented value={pref} onChange={(v) => { setPref(v); set('theme', v); }} options={[{ label: 'System', value: 'system' }, { label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }]} />

      <Field label="ACCENT COLOUR">
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {Object.entries(ACCENTS).map(([k, c]) => (
            <Chip key={k} label={k[0].toUpperCase() + k.slice(1)} selected={s.accent === k} onPress={() => set('accent', k)} icon="color-palette-outline" />
          ))}
        </View>
      </Field>
      <SwitchRow label="Pure black dark mode" hint="Deeper blacks, saves battery on AMOLED screens." value={s.pureBlack === '1'} onValueChange={(v) => set('pureBlack', v ? '1' : '0')} />

      <SectionHeader title="Smart notifications" />
      <SwitchRow label="Ask attendance after each lecture" hint="When a lecture ends you get 'Did you attend…?' with Present / Absent / Not held buttons." value={s.lecturePrompts === '1'} onValueChange={(v) => set('lecturePrompts', v ? '1' : '0')} />
      {s.lecturePrompts === '1' ? <Field label="ASK AFTER LECTURE ENDS"><Stepper label="delay" value={Number(s.lectureDelayMin) || 0} min={0} max={60} step={5} format={(v) => (v ? `${v} min later` : 'right away')} onChange={(v) => set('lectureDelayMin', v)} /></Field> : null}
      <SwitchRow label="Morning briefing" hint="A daily notification listing today's lectures and pending tasks." value={s.briefingEnabled === '1'} onValueChange={(v) => set('briefingEnabled', v ? '1' : '0')} />
      {s.briefingEnabled === '1' ? <TimeField label="BRIEFING TIME" value={s.briefingTime} onChange={(v) => set('briefingTime', v)} /> : null}
      <SwitchRow label="Weekly backup reminder" hint="Sunday 8 PM nudge; tapping it opens the backup share sheet." value={s.backupReminder === '1'} onValueChange={(v) => set('backupReminder', v ? '1' : '0')} />
      <SwitchRow label="Quick-add notification" hint="Keeps a Task / Expense / Note shortcut in your notification shade." value={s.quickAdd === '1'} onValueChange={(v) => set('quickAdd', v ? '1' : '0')} />
      <T v="small" faint style={{ marginBottom: 12 }}>Tip: long-press your home screen → Widgets → "GAURAV OS agenda" for today's lectures and quick-add buttons.</T>

      <SectionHeader title="Security" />
      <SwitchRow label="App lock" hint="Ask for your PIN or fingerprint when the app opens." value={s.appLock === '1'} onValueChange={async (v) => { if (v) setPinSheet(true); else { await disableLock(); toast('App lock is off'); } }} />
      <Sheet visible={pinSheet} title="Set a PIN" onClose={() => { setPinSheet(false); setPin(''); }} footer={<Button title="Turn on lock" icon="lock-closed-outline" onPress={savePin} />}>
        <Input label="4 to 6 digit PIN" value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secureTextEntry hint="Fingerprint is used first when your phone has one set up; the PIN is the fallback." />
      </Sheet>

      <SectionHeader title="Voice defaults" />
      <Field label="LANGUAGE">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{langs.map((l) => <Chip key={l.tag} label={l.label} selected={s.defaultVoiceLang === l.tag} onPress={() => set('defaultVoiceLang', l.tag)} />)}</View>
      </Field>
      <Field label="SPEED"><Stepper label="speed" value={Number(s.defaultVoiceRate)} min={0.5} max={2} step={0.1} format={(v) => `${v.toFixed(1)}×`} onChange={(v) => set('defaultVoiceRate', v)} /></Field>
      <Field label="PITCH"><Stepper label="pitch" value={Number(s.defaultVoicePitch)} min={0.5} max={2} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => set('defaultVoicePitch', v)} /></Field>
      <Field label="DEFAULT SNOOZE"><Stepper label="snooze" value={Number(s.defaultSnoozeMin)} min={1} max={60} step={1} format={(v) => `${v} min`} onChange={(v) => set('defaultSnoozeMin', v)} /></Field>
      <SwitchRow label="Assistant speaks replies" value={s.speakAssistant === '1'} onValueChange={(v) => set('speakAssistant', v ? '1' : '0')} />
      <Button title="Preview voice" icon="volume-high-outline" variant="secondary" onPress={() => previewVoice(`Hello ${s.userName}, this is your GAURAV OS voice.`, s.defaultVoiceLang, Number(s.defaultVoiceRate), Number(s.defaultVoicePitch)).catch((e) => showError(e, 'Voice preview'))} />

      <SectionHeader title="Reminders" />
      <Card pad={false} style={{ paddingHorizontal: 16 }}>
        <Row icon="shield-checkmark-outline" title="Reminder setup & reliability" subtitle="Permissions, battery settings, Redmi / HyperOS guide, test" onPress={() => nav.navigate('ReminderSetup')} right={<Icon name="chevron-forward" size={18} />} />
      </Card>

      <SectionHeader title="Calls" />
      <Card pad={false} style={{ paddingHorizontal: 16 }}>
        <Row icon="call-outline" title="AI caller assistant" subtitle="Announce who is calling and answer by voice" onPress={() => nav.navigate('CallAssistant')} right={<Icon name="chevron-forward" size={18} />} />
      </Card>

      <SectionHeader title="Backup & restore" />
      <Card>
        <T muted>Your data lives only on this phone. Create a backup file and save it to Drive or your computer.</T>
        <T v="small" faint style={{ marginTop: 6 }}>Last backup: {s.lastBackupAt ? fmtDateTime(Number(s.lastBackupAt)) : 'never'}</T>
        <T v="small" faint style={{ marginTop: 6 }}>Backups contain the database only. Documents in the Document Locker are encrypted with a key bound to this phone and are not included.</T>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <Button title="Create backup" icon="cloud-upload-outline" onPress={backup} loading={busy === 'backup'} style={{ flex: 1 }} />
          <Button title="Restore" icon="cloud-download-outline" variant="secondary" onPress={restore} loading={busy === 'restore'} style={{ flex: 1 }} />
        </View>
      </Card>

      <SectionHeader title="About" />
      <Card>
        <T v="heading">GAURAV OS</T>
        <T muted>Your Personal Life Assistant.</T>
        <T v="small" faint style={{ marginTop: 8 }}>Version {Constants.expoConfig?.version || '1.0.0'} · database schema v{LATEST_VERSION} · works fully offline, no accounts, no cloud.</T>
      </Card>
    </Screen>
  );
}
