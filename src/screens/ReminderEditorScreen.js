import React, { useEffect, useState } from 'react';
import { View, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  Screen, Card, T, Input, Field, Segmented, Chip, SwitchRow, Button, DateField, TimeField, WeekdayPicker, Stepper, Loading, SectionHeader,
} from '../components/ui';
import { remindersRepository as repo } from '../database/repositories';
import {
  blankReminder, saveReminder, deleteReminder, MODES, LANGUAGES, getAvailableLanguages, previewVoice, stopPreview,
  requestNotificationPermission, getDeviceStatus, device, nativeAvailable,
} from '../services/reminders/reminderService';
import { parseWeekdays, serializeWeekdays, nextOccurrence } from '../services/reminders/schedule';
import { useSettings } from '../hooks/useSettings';
import { toDateStr, timeStrOf, toEpoch, fmtWhen, addDays } from '../utils/date';
import { confirm, showError, toast } from '../utils/ui';

const REPEATS = [{ label: 'Once', value: 'once' }, { label: 'Daily', value: 'daily' }, { label: 'Weekly', value: 'weekly' }, { label: 'Days', value: 'weekdays' }];

export default function ReminderEditorScreen() {
  const nav = useNavigation();
  const { params } = useRoute();
  const settings = useSettings();
  const id = params?.id;
  const [r, setR] = useState(null);
  const [date, setDate] = useState(toDateStr(new Date()));
  const [langs, setLangs] = useState(LANGUAGES);
  const [saving, setSaving] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    (async () => {
      if (id) {
        const row = await repo.get(id);
        if (!row) { nav.goBack(); return; }
        setR(row);
        if (row.once_at) setDate(toDateStr(new Date(row.once_at)));
      } else {
        const b = blankReminder(settings);
        // sensible default: next full hour
        const d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0);
        b.time = timeStrOf(d); setDate(toDateStr(d));
        setR(b);
      }
    })();
    getAvailableLanguages().then(setLangs);
    return () => { stopPreview(); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!r) return <Screen title={id ? 'Edit reminder' : 'New reminder'}><Loading /></Screen>;
  const set = (k, v) => setR((s) => ({ ...s, [k]: v }));
  const days = parseWeekdays(r.weekdays);
  const preview = nextOccurrence({ ...r, once_at: r.repeat === 'once' ? toEpoch(date, r.time) : null });

  const onPreview = async () => {
    setSpeaking(true);
    try { await previewVoice(r.message || r.title, r.lang, r.rate, r.pitch); } catch (e) { showError(e, 'Voice preview'); } finally { setSpeaking(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const data = { ...r, once_at: r.repeat === 'once' ? toEpoch(date, r.time) : null };
      if (data.repeat === 'weekly' && days.length > 1) data.weekdays = String(days[0]);
      if (data.repeat === 'weekdays' || data.repeat === 'weekly') { /* keep */ } else data.weekdays = '';
      await saveReminder(data);
      if (nativeAvailable) {
        await requestNotificationPermission();
        const st = await getDeviceStatus();
        if (st && !st.exactAlarms) {
          Alert.alert('Allow exact alarms', 'Android needs the "Alarms & reminders" permission so this reminder fires on time.', [
            { text: 'Later', style: 'cancel' }, { text: 'Open settings', onPress: () => device.openExactAlarm() }]);
        }
      }
      toast('Reminder saved');
      nav.goBack();
    } catch (e) { showError(e, 'Cannot save reminder'); } finally { setSaving(false); }
  };

  const remove = async () => {
    if (await confirm('Delete reminder?', `"${r.title}" will be cancelled and removed.`, { destructive: true, confirmText: 'Delete' })) {
      try { await deleteReminder(id); nav.goBack(); } catch (e) { showError(e); }
    }
  };

  return (
    <Screen title={id ? 'Edit reminder' : 'New reminder'}>
      <Input label="TITLE" value={r.title} onChangeText={(v) => set('title', v)} placeholder="Good Night" />
      <Input label="SPOKEN MESSAGE" multiline value={r.message} onChangeText={(v) => set('message', v)}
        placeholder="Good night, Gaurav! It's time to sleep. Sweet dreams!" hint="Read aloud by the phone's text-to-speech. Leave empty to speak the title." />

      <Field label="REPEAT"><Segmented options={REPEATS} value={r.repeat} onChange={(v) => {
        set('repeat', v);
        if (v === 'weekly' && days.length !== 1) set('weekdays', '1');
        if (v === 'weekdays' && !days.length) set('weekdays', '1,2,3,4,5');
      }} /></Field>
      {r.repeat === 'once' ? <DateField label="DATE" value={date} onChange={setDate} /> : null}
      {r.repeat === 'weekly' || r.repeat === 'weekdays' ? (
        <Field label={r.repeat === 'weekly' ? 'DAY OF WEEK' : 'SELECTED DAYS'}>
          <WeekdayPicker single={r.repeat === 'weekly'} value={days} onChange={(d) => set('weekdays', serializeWeekdays(d))} />
        </Field>
      ) : null}
      <TimeField label="TIME" value={r.time} onChange={(v) => set('time', v)} />
      {preview ? <T v="small" muted style={{ marginTop: -8, marginBottom: 16 }}>Next: {fmtWhen(preview)}</T> : null}

      <Field label="MODE">
        {MODES.map((m) => (
          <Card key={m.id} pad style={{ marginBottom: 8, borderColor: r.mode === m.id ? undefined : undefined, borderWidth: r.mode === m.id ? 1.5 : 0.5 }} onPress={() => set('mode', m.id)}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}><T v="heading">{m.label}</T><T v="small" muted>{m.hint}</T></View>
              {r.mode === m.id ? <T style={{ fontWeight: '700' }}>✓</T> : null}
            </View>
          </Card>
        ))}
      </Field>

      <SectionHeader title="Voice" />
      <SwitchRow label="Speak the message" value={!!r.speak_enabled} onValueChange={(v) => set('speak_enabled', v ? 1 : 0)} hint="Off = notification (and alarm sound) only" />
      {r.speak_enabled ? (
        <>
          <Field label="LANGUAGE">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {langs.map((l) => <Chip key={l.tag} label={l.label} selected={r.lang === l.tag} onPress={() => set('lang', l.tag)} />)}
            </View>
          </Field>
          <Field label="SPEED"><Stepper label="speed" value={r.rate} min={0.5} max={2} step={0.1} format={(v) => `${v.toFixed(1)}×`} onChange={(v) => set('rate', v)} /></Field>
          <Field label="PITCH"><Stepper label="pitch" value={r.pitch} min={0.5} max={2} step={0.1} format={(v) => `${v.toFixed(1)}`} onChange={(v) => set('pitch', v)} /></Field>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <Button title={speaking ? 'Speaking…' : 'Preview voice'} icon="volume-high-outline" variant="secondary" onPress={onPreview} loading={false} disabled={speaking} style={{ flex: 1 }} />
            {speaking ? <Button title="Stop" variant="ghost" onPress={() => stopPreview()} /> : null}
          </View>
        </>
      ) : null}

      {r.mode !== 'normal' ? (
        <Field label="SNOOZE DURATION"><Stepper label="snooze minutes" value={r.snooze_min} min={1} max={60} step={1} format={(v) => `${v} min`} onChange={(v) => set('snooze_min', v)} /></Field>
      ) : null}
      <SwitchRow label="Enabled" value={!!r.enabled} onValueChange={(v) => set('enabled', v ? 1 : 0)} />

      <Button title={id ? 'Save changes' : 'Create reminder'} onPress={save} loading={saving} />
      {id ? <Button title="Delete reminder" variant="danger" onPress={remove} style={{ marginTop: 10 }} /> : null}
    </Screen>
  );
}
