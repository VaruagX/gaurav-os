import React, { useCallback, useEffect, useState } from 'react';
import { View, Switch } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Screen, Card, T, Row, Badge, EmptyState, Fab, Loading, Button, IconButton, Segmented } from '../components/ui';
import { useTheme } from '../theme';
import { useQuery } from '../hooks/useQuery';
import { remindersRepository as repo } from '../database/repositories';
import { setEnabled, syncNativeEvents, getDeviceStatus, nativeAvailable } from '../services/reminders/reminderService';
import { repeatLabel } from '../services/reminders/schedule';
import { fmtTime, fmtWhen, fmtDateTime } from '../utils/date';
import { attempt } from '../utils/ui';

const MODE_TONE = { normal: 'neutral', persistent: 'warning', alarm: 'danger' };

export default function RemindersScreen() {
  const nav = useNavigation();
  const t = useTheme();
  const [status, setStatus] = useState(null);
  const { data, loading, reload } = useQuery(() => repo.user(), [], []);

  useFocusEffect(useCallback(() => { syncNativeEvents().then(reload); getDeviceStatus().then(setStatus).catch(() => {}); }, [reload]));

  const problems = status ? [
    !status.notifications && 'Notifications are off',
    !status.exactAlarms && 'Exact alarms are not allowed',
    !status.batteryUnrestricted && 'Battery optimisation may delay reminders',
  ].filter(Boolean) : [];

  return (
    <Screen title="Reminders" back={false} subtitle="Voice reminders that speak even when the app is closed"
      right={<IconButton name="time-outline" label="Reminder history" bg onPress={() => nav.navigate('ReminderHistory')} />}
      fab={<Fab onPress={() => nav.navigate('ReminderEditor')} label="New reminder" />}>
      {!nativeAvailable ? (
        <Card style={{ marginBottom: 12 }}><T v="heading">Preview mode</T><T muted>Alarms and voice only run in the installed Android app (not Expo Go).</T></Card>
      ) : null}
      {problems.length ? (
        <Card onPress={() => nav.navigate('ReminderSetup')} style={{ marginBottom: 12, borderColor: t.warning }}>
          <T v="heading" color={t.warning}>Reminders may not be reliable</T>
          <T muted style={{ marginTop: 4 }}>{problems.join(' · ')}</T>
          <T v="small" style={{ marginTop: 8, fontWeight: '600' }}>Fix in Reminder Setup →</T>
        </Card>
      ) : null}

      {loading && !data.length ? <Loading /> : !data.length ? (
        <EmptyState icon="alarm-outline" title="No reminders yet" text="Create a spoken reminder such as a daily Good Night message." action="Create reminder" onAction={() => nav.navigate('ReminderEditor')} />
      ) : (
        data.map((r) => (
          <Card key={r.id} style={{ marginBottom: 10, opacity: r.enabled ? 1 : 0.6 }} onPress={() => nav.navigate('ReminderEditor', { id: r.id })}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <T v="title" style={{ fontSize: 24 }}>{r.repeat === 'once' && r.once_at ? fmtTime(r.time) : fmtTime(r.time)}</T>
                <T v="heading" style={{ marginTop: 2 }} numberOfLines={1}>{r.title}</T>
                <T v="small" muted>{repeatLabel(r)}{r.next_at && r.enabled ? ` · next ${fmtWhen(r.next_at)}` : r.enabled ? '' : ' · off'}</T>
                {r.message ? <T v="small" faint numberOfLines={1} style={{ marginTop: 2 }}>“{r.message}”</T> : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                <Switch accessibilityLabel={`Enable ${r.title}`} value={!!r.enabled} trackColor={{ false: t.border, true: t.success }} thumbColor="#FFF"
                  onValueChange={(v) => attempt(() => setEnabled(r.id, v), 'Cannot change reminder')} />
                <Badge label={r.mode.toUpperCase()} tone={MODE_TONE[r.mode]} />
              </View>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}
