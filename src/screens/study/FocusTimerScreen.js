import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Vibration, AppState } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { Screen, Card, T, Button, Segmented, Chip, Field, Input, Stepper, SubjectPicker, ProgressBar, Loading } from '../../components/ui';
import { useTheme } from '../../theme';
import { useQuery } from '../../hooks/useQuery';
import { subjectsRepository, studySessionsRepository as sessions, settingsRepository } from '../../database/repositories';
import { upsertLinkedReminder, removeLinkedReminder } from '../../services/reminders/reminderService';
import { todayStr, fmtDuration } from '../../utils/date';
import { toast, showError } from '../../utils/ui';

const KEY = 'activeTimer';
const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

/**
 * Focus / Pomodoro timer. State is persisted (settings key activeTimer) and the phase end is also
 * scheduled as a native reminder, so it still rings when the app is closed.
 */
export default function FocusTimerScreen() {
  const t = useTheme();
  const subjects = useQuery(() => subjectsRepository.active(), [], []);
  const today = useQuery(() => sessions.secondsOn(todayStr()), [], 0);
  const [cfg, setCfg] = useState({ mode: 'focus', focusMin: 25, breakMin: 5, subjectId: null, topic: '' });
  const [timer, setTimer] = useState(null); // {phase, startedAt, endAt, cycle, focusedSec}
  const [tick, setTick] = useState(Date.now());
  const [ready, setReady] = useState(false);
  const finishing = useRef(false);
  useKeepAwake(timer ? 'focus-timer' : undefined);

  useEffect(() => {
    (async () => {
      try {
        const saved = JSON.parse((await settingsRepository.get(KEY)) || 'null');
        if (saved?.timer) { setCfg(saved.cfg); setTimer(saved.timer); }
      } catch (e) { /* ignore corrupt state */ }
      setReady(true);
    })();
  }, []);

  const persist = useCallback((c, tm) => settingsRepository.set(KEY, tm ? JSON.stringify({ cfg: c, timer: tm }) : ''), []);

  const schedulePhaseEnd = (c, tm) => upsertLinkedReminder('timer', 1, {
    title: tm.phase === 'focus' ? 'Focus session complete' : 'Break is over',
    message: tm.phase === 'focus' ? 'Great work! Time for a break.' : 'Break is over. Ready for the next focus session?',
    mode: 'normal', repeat: 'once', once_at: tm.endAt, time: '00:00', enabled: 1, speak_enabled: 1,
  }).catch(() => {});

  const start = async () => {
    const now = Date.now();
    const tm = { phase: 'focus', startedAt: now, endAt: now + cfg.focusMin * 60000, cycle: 1 };
    setTimer(tm); await persist(cfg, tm); schedulePhaseEnd(cfg, tm);
  };

  const logFocus = async (tm, seconds) => {
    if (seconds < 30) return false;
    await sessions.insert({ subject_id: cfg.subjectId || null, topic: cfg.topic || null, mode: cfg.mode === 'pomodoro' ? 'pomodoro' : 'focus', seconds: Math.round(seconds), date: todayStr(), started_at: tm.startedAt });
    return true;
  };

  const stop = async (save = true) => {
    if (!timer) return;
    const elapsed = timer.phase === 'focus' ? Math.min(Date.now(), timer.endAt) - timer.startedAt : 0;
    try {
      if (save && timer.phase === 'focus' && await logFocus(timer, elapsed / 1000)) toast(`Saved ${fmtDuration(elapsed / 1000)} of study`);
    } catch (e) { showError(e); }
    await removeLinkedReminder('timer', 1).catch(() => {});
    setTimer(null); persist(cfg, null);
  };

  // Tick + phase transitions
  useEffect(() => {
    if (!timer) return undefined;
    const id = setInterval(() => setTick(Date.now()), 500);
    return () => clearInterval(id);
  }, [timer]);

  useEffect(() => {
    if (!timer || tick < timer.endAt || finishing.current) return;
    finishing.current = true;
    (async () => {
      try {
        Vibration.vibrate([0, 400, 200, 400]);
        if (timer.phase === 'focus') {
          await logFocus(timer, (timer.endAt - timer.startedAt) / 1000);
          if (cfg.mode === 'pomodoro') {
            const long = timer.cycle % 4 === 0;
            const next = { phase: 'break', startedAt: Date.now(), endAt: Date.now() + (long ? cfg.breakMin * 3 : cfg.breakMin) * 60000, cycle: timer.cycle };
            setTimer(next); await persist(cfg, next); schedulePhaseEnd(cfg, next);
          } else { setTimer(null); await persist(cfg, null); toast('Focus session complete'); }
        } else {
          const next = { phase: 'focus', startedAt: Date.now(), endAt: Date.now() + cfg.focusMin * 60000, cycle: timer.cycle + 1 };
          setTimer(next); await persist(cfg, next); schedulePhaseEnd(cfg, next);
        }
      } catch (e) { showError(e); } finally { finishing.current = false; }
    })();
  }, [tick, timer]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <Screen title="Focus timer"><Loading /></Screen>;
  const running = !!timer;
  const remaining = timer ? timer.endAt - tick : cfg.focusMin * 60000;
  const total = timer ? timer.endAt - timer.startedAt : cfg.focusMin * 60000;
  const isBreak = timer?.phase === 'break';

  return (
    <Screen title="Focus timer" subtitle={`Studied today: ${fmtDuration(today.data || 0)}`}>
      <Card style={{ alignItems: 'center', paddingVertical: 36 }}>
        <T v="caption" muted>{running ? (isBreak ? 'BREAK' : `FOCUS${cfg.mode === 'pomodoro' ? ` · CYCLE ${timer.cycle}` : ''}`) : 'READY'}</T>
        <T style={{ fontSize: 68, fontWeight: '700', letterSpacing: -2, marginVertical: 8, fontVariant: ['tabular-nums'] }} accessibilityLabel={`Time remaining ${fmt(remaining)}`}>{fmt(remaining)}</T>
        <ProgressBar value={running ? 1 - remaining / total : 0} style={{ width: '80%' }} color={isBreak ? t.success : t.primary} />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
          {!running ? <Button title="Start" icon="play" onPress={start} style={{ minWidth: 140 }} /> : (
            <>
              <Button title="Finish & save" icon="checkmark" onPress={() => stop(true)} />
              <Button title="Discard" variant="danger" onPress={() => stop(false)} />
            </>
          )}
        </View>
      </Card>

      {!running ? (
        <View style={{ marginTop: 20 }}>
          <Field label="MODE"><Segmented value={cfg.mode} onChange={(v) => setCfg({ ...cfg, mode: v })} options={[{ label: 'Focus', value: 'focus' }, { label: 'Pomodoro', value: 'pomodoro' }]} /></Field>
          <Field label="FOCUS LENGTH">
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {[15, 25, 45, 60, 90].map((m) => <Chip key={m} label={`${m} min`} selected={cfg.focusMin === m} onPress={() => setCfg({ ...cfg, focusMin: m })} />)}
            </View>
            <Stepper label="focus minutes" value={cfg.focusMin} min={5} max={180} step={5} format={(v) => `${v} min`} onChange={(v) => setCfg({ ...cfg, focusMin: v })} />
          </Field>
          {cfg.mode === 'pomodoro' ? <Field label="BREAK LENGTH" hint="Every 4th break is three times longer."><Stepper label="break minutes" value={cfg.breakMin} min={1} max={30} step={1} format={(v) => `${v} min`} onChange={(v) => setCfg({ ...cfg, breakMin: v })} /></Field> : null}
          <Field label="SUBJECT"><SubjectPicker subjects={subjects.data} value={cfg.subjectId} onChange={(v) => setCfg({ ...cfg, subjectId: v })} /></Field>
          <Input label="TOPIC (OPTIONAL)" value={cfg.topic} onChangeText={(v) => setCfg({ ...cfg, topic: v })} placeholder="What are you working on?" />
        </View>
      ) : <T muted style={{ textAlign: 'center', marginTop: 16 }}>You'll get a spoken alert when this phase ends, even if the app is closed.</T>}
    </Screen>
  );
}
