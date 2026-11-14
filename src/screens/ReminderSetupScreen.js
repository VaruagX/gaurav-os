import React, { useCallback, useState } from 'react';
import { View, AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, Card, T, Row, Button, Badge, SectionHeader } from '../components/ui';
import {
  getDeviceStatus, device, requestNotificationPermission, upsertLinkedReminder, nativeAvailable,
} from '../services/reminders/reminderService';
import { toast, showError } from '../utils/ui';

const STEPS_HYPEROS = [
  'Settings → Apps → Manage apps → GAURAV OS → Autostart: turn ON.',
  'Same page → Battery saver (or "Battery") → choose "No restrictions".',
  'Same page → Notifications: allow all, incl. "Lock screen" and "Floating notifications".',
  'Settings → Apps → Permissions → Other permissions → GAURAV OS: allow "Display pop-up windows while running in the background" and "Show on lock screen".',
  'Open the Recents screen, long-press the GAURAV OS card and tap the lock icon so the app is not cleaned up.',
  'Settings → Battery → turn OFF any aggressive power-saving mode while testing.',
];

export default function ReminderSetupScreen() {
  const [st, setSt] = useState(null);
  const refresh = useCallback(() => { getDeviceStatus().then(setSt).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]));

  const test = async (mode) => {
    try {
      const at = Date.now() + 15000;
      await upsertLinkedReminder('test', mode === 'alarm' ? 2 : 1, {
        title: mode === 'alarm' ? 'Test alarm' : 'Test reminder', message: 'This is a GAURAV OS test. Your voice reminders are working.',
        mode, repeat: 'once', once_at: at, time: '00:00', enabled: 1, speak_enabled: 1,
      });
      toast('Test scheduled in 15 seconds. Lock your phone and wait.');
    } catch (e) { showError(e); }
  };

  const row = (title, ok, fix, onFix) => (
    <Row title={title} subtitle={ok ? 'OK' : 'Needs attention'} left={<Badge label={ok ? 'OK' : 'FIX'} tone={ok ? 'success' : 'warning'} />}
      right={!ok && onFix ? <Button title={fix} small variant="secondary" onPress={onFix} /> : null} />
  );

  return (
    <Screen title="Reminder setup" subtitle="Make reminders reliable on your phone">
      {!nativeAvailable ? <Card><T muted>This screen works in the installed Android app.</T></Card> : (
        <>
          <Card pad={false} style={{ paddingHorizontal: 16 }}>
            {st ? (
              <>
                {row('Notifications', st.notifications, 'Allow', async () => { const ok = await requestNotificationPermission(); if (!ok) device.openNotifications(); refresh(); })}
                {row('Exact alarms (Alarms & reminders)', st.exactAlarms, 'Open', () => device.openExactAlarm())}
                {row('Battery: unrestricted', st.batteryUnrestricted, 'Allow', () => device.openBattery())}
                {row('Full-screen alarm over lock screen', st.fullScreenIntent, 'Open', () => device.openFullScreen())}
              </>
            ) : <T muted>Checking…</T>}
          </Card>

          <SectionHeader title="Test it" />
          <Card>
            <T muted>Schedules a spoken reminder 15 seconds from now. Lock the phone (and close the app) to test the real thing.</T>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Button title="Test reminder" variant="secondary" onPress={() => test('normal')} style={{ flex: 1 }} />
              <Button title="Test alarm" variant="secondary" onPress={() => test('alarm')} style={{ flex: 1 }} />
            </View>
          </Card>

          <SectionHeader title={`Redmi / Xiaomi / POCO (HyperOS, MIUI)${st?.manufacturer ? ` — detected: ${st.manufacturer}` : ''}`} />
          <Card>
            <T muted style={{ marginBottom: 8 }}>HyperOS kills background apps aggressively. Do these once:</T>
            {STEPS_HYPEROS.map((s, i) => <T key={i} style={{ marginBottom: 6 }}>{i + 1}. {s}</T>)}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <Button title="Autostart page" small variant="secondary" onPress={() => device.openAutostart()} />
              <Button title="App settings" small variant="secondary" onPress={() => device.openAppDetails()} />
            </View>
          </Card>

          <SectionHeader title="Limitations (honest version)" />
          <Card>
            <T style={{ marginBottom: 6 }}>• If you <T style={{ fontWeight: '700' }}>Force stop</T> the app from Android Settings, Android cancels all its alarms until you open it again. Reminders cannot work in that state.</T>
            <T style={{ marginBottom: 6 }}>• Swiping the app away from Recents is fine on stock Android, but some Xiaomi builds treat it like a force stop — use the lock-in-Recents step above.</T>
            <T style={{ marginBottom: 6 }}>• Speech needs a text-to-speech engine and the language voice installed (Settings → Additional settings → Languages → Text-to-speech).</T>
            <T>• Alarms are rebuilt automatically after a reboot, app update, clock change or timezone change.</T>
          </Card>
        </>
      )}
    </Screen>
  );
}
