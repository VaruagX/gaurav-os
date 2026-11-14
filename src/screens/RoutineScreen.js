import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen, Card, T, Row, Checkbox, EmptyState, Button, Loading, SectionHeader, Stat, ProgressBar, IconButton, BarChart, Badge, Chip } from '../components/ui';
import FormSheet from '../components/FormSheet';
import { useTheme } from '../theme';
import { useQuery } from '../hooks/useQuery';
import { routinesRepository as routines, habitsRepository as habits, dailyGoalsRepository as dgoals } from '../database/repositories';
import { habitOverview } from '../services/study/analytics';
import { activityStreak } from '../services/routine/habits';
import { lastNDays, todayStr, addDaysStr, isoWeekday, parseDateStr, endOfDay, fmtTime, WEEKDAYS } from '../utils/date';
import { serializeWeekdays } from '../services/reminders/schedule';
import { confirm, attempt } from '../utils/ui';
import { TEMPLATES } from '../services/routine/routineService';

const HABIT_FIELDS = [
  { key: 'name', label: 'Habit', required: true, placeholder: 'e.g. Read 20 pages' },
  { key: 'weekdays', label: 'Days', type: 'weekdays' },
];
const GOAL_FIELDS = [{ key: 'title', label: 'Goal for today', required: true, placeholder: 'e.g. Finish OS notes' }];

async function load() {
  const today = todayStr();
  const yesterday = addDaysStr(today, -1);
  const iso = isoWeekday(new Date());
  const all = await routines.list();
  const active = all.filter((r) => r.weekdays.split(',').includes(String(iso)));
  const withSteps = [];
  for (const r of all) withSteps.push({ ...r, steps: await routines.stepsForDate(r.id, today) });
  const week = lastNDays(7);
  const done = await routines.doneByDay(week[0], week[6]);
  const doneMap = Object.fromEntries(done.map((d) => [d.date, d.done]));
  const allDone = await routines.doneByDay(addDaysStr(today, -400), today);
  const missed = (await routines.incompleteForDate(yesterday, isoWeekday(parseDateStr(yesterday)))).filter((s) => s.created_at < endOfDay(parseDateStr(yesterday)).getTime());
  const logsWeek = await habits.logsBetween(week[0], week[6]);
  const hov = await habitOverview(30);
  return { routines: withSteps, activeIds: active.map((r) => r.id), week: week.map((d) => ({ date: d, value: doneMap[d] || 0 })), streak: activityStreak(new Set(allDone.map((d) => d.date))), missed, habits: hov, logsWeek, goals: await dgoals.forDate(today), today, yesterday };
}

export default function RoutineScreen() {
  const nav = useNavigation();
  const t = useTheme();
  const [editing, setEditing] = useState(null); // 'habit' | 'goal'
  const { data, loading } = useQuery(load, []);

  const setStep = (s, status) => attempt(() => routines.setStepStatus(s.id, todayStr(), status));
  const recover = (s, mode) => attempt(async () => {
    if (mode === 'today') await dgoals.insert({ date: todayStr(), title: `${s.title} (missed yesterday)`, done: 0 });
    await routines.setStepStatus(s.id, data.yesterday, 'skipped');
  });

  return (
    <Screen title="Routine" back={false} subtitle="Routines, habits and daily goals"
      right={<IconButton name="add-circle-outline" label="New routine" bg onPress={() => nav.navigate('RoutineEditor')} />}>
      {loading && !data ? <Loading /> : (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat label="Routine streak" value={`${data.streak}d`} sub="days with a step done" />
            <Stat label="This week" value={String(data.week.reduce((a, d) => a + d.value, 0))} sub="steps completed" />
          </View>
          <Card style={{ marginTop: 10 }}>
            <BarChart data={data.week.map((d) => ({ label: WEEKDAYS[isoWeekday(parseDateStr(d.date)) - 1][0], value: d.value }))} height={70} />
          </Card>

          {data.missed.length ? (
            <>
              <SectionHeader title={`Missed yesterday (${data.missed.length})`} />
              <Card pad={false} style={{ paddingHorizontal: 16, borderColor: t.warning }}>
                {data.missed.slice(0, 5).map((s) => (
                  <Row key={s.id} title={s.title} subtitle={s.routine_name}
                    right={<View style={{ flexDirection: 'row', gap: 6 }}><Button small variant="secondary" title="Do today" onPress={() => recover(s, 'today')} /><Button small variant="ghost" title="Skip" onPress={() => recover(s, 'skip')} /></View>} />
                ))}
              </Card>
            </>
          ) : null}

          <SectionHeader title="Today's routines" />
          {!data.routines.length ? (
            <Card>
              <EmptyState icon="repeat-outline" title="No routines yet" text="Build a morning or evening routine, or your own sequence." action="Create routine" onAction={() => nav.navigate('RoutineEditor')} />
              <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
                <Chip label="Morning template" onPress={() => nav.navigate('RoutineEditor', { template: 'morning' })} />
                <Chip label="Evening template" onPress={() => nav.navigate('RoutineEditor', { template: 'evening' })} />
              </View>
            </Card>
          ) : data.routines.map((r) => {
            const due = data.activeIds.includes(r.id);
            const done = r.steps.filter((s) => s.log_status === 'done').length;
            return (
              <Card key={r.id} style={{ marginBottom: 10, opacity: due ? 1 : 0.6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <T v="heading">{r.name}</T>
                    <T v="small" muted>{due ? `${done}/${r.steps.length} done` : 'Not scheduled today'}</T>
                  </View>
                  <IconButton name="create-outline" label={`Edit ${r.name}`} onPress={() => nav.navigate('RoutineEditor', { id: r.id })} />
                </View>
                {r.steps.length ? <ProgressBar value={done / r.steps.length} style={{ marginVertical: 8 }} /> : null}
                {r.steps.map((s) => (
                  <Row key={s.id} left={<Checkbox checked={s.log_status === 'done'} label={s.title} onPress={() => setStep(s, s.log_status === 'done' ? null : 'done')} />}
                    title={s.title} subtitle={[s.time ? fmtTime(s.time) : null, s.log_status === 'skipped' ? 'skipped' : null].filter(Boolean).join(' · ') || undefined} />
                ))}
                {!r.steps.length ? <T muted>No steps yet. Tap edit to add some.</T> : null}
              </Card>
            );
          })}

          <SectionHeader title="Habits" action="Add" onAction={() => setEditing('habit')} />
          {!data.habits.length ? <Card><T muted>No habits yet. Add one to build a streak.</T></Card> : data.habits.map((h) => {
            const week = lastNDays(7);
            const set = new Set(data.logsWeek.filter((l) => l.habit_id === h.id).map((l) => l.date));
            const doneToday = set.has(data.today);
            return (
              <Card key={h.id} style={{ marginBottom: 10 }} onLongPress={async () => { if (await confirm('Delete habit?', `"${h.name}" and its history will be removed.`, { destructive: true, confirmText: 'Delete' })) habits.remove(h.id); }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Checkbox checked={doneToday} label={`${h.name} today`} onPress={() => habits.setDone(h.id, data.today, !doneToday)} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <T v="heading">{h.name}</T>
                    <T v="small" muted>🔥 {h.streak}-day streak{h.consistency !== null ? ` · ${h.consistency}% last 30 days` : ''}</T>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                  {week.map((d) => (
                    <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: set.has(d) ? t.primary : t.surface2 }} />
                      <T v="small" faint style={{ fontSize: 10, marginTop: 2 }}>{WEEKDAYS[isoWeekday(parseDateStr(d)) - 1][0]}</T>
                    </View>
                  ))}
                </View>
              </Card>
            );
          })}
          {data.habits.length ? <T v="small" faint style={{ textAlign: 'center' }}>Long-press a habit to delete it</T> : null}

          <SectionHeader title="Daily goals" action="Add" onAction={() => setEditing('goal')} />
          <Card>
            {data.goals.length ? data.goals.map((g) => (
              <Row key={g.id} left={<Checkbox checked={!!g.done} label={g.title} onPress={() => dgoals.setDone(g.id, !g.done)} />} title={g.title}
                right={<IconButton name="close" size={18} label="Remove goal" onPress={() => dgoals.remove(g.id)} />} />
            )) : <T muted>No goals for today. Add up to a few things that make today a win.</T>}
          </Card>
        </>
      )}

      <FormSheet visible={editing === 'habit'} title="New habit" fields={HABIT_FIELDS} initial={{ weekdays: [1, 2, 3, 4, 5, 6, 7] }} onClose={() => setEditing(null)}
        onSubmit={(v) => habits.insert({ name: v.name.trim(), weekdays: serializeWeekdays(v.weekdays?.length ? v.weekdays : [1, 2, 3, 4, 5, 6, 7]) })} />
      <FormSheet visible={editing === 'goal'} title="New daily goal" fields={GOAL_FIELDS} initial={{}} onClose={() => setEditing(null)}
        onSubmit={(v) => dgoals.insert({ date: todayStr(), title: v.title.trim(), done: 0 })} />
    </Screen>
  );
}
