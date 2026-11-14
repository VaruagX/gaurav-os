import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen, Card, T, Icon, Segmented, Stat, ProgressBar, BarChart, SectionHeader, Row, Loading, Button, EmptyState, Badge } from '../components/ui';
import { useTheme, radius } from '../theme';
import { useQuery } from '../hooks/useQuery';
import { dailyReport, weeklyReport, habitOverview, achievementsSummary } from '../services/study/analytics';
import { attendanceRepository, assignmentsRepository, goalsRepository, codingRepository, reportsRepository } from '../database/repositories';
import { pct } from '../services/college/attendance';
import { fmtDuration, WEEKDAYS, isoWeekday, parseDateStr, lastNDays, todayStr, fmtDateStr } from '../utils/date';
import { activityStreak } from '../services/routine/habits';
import { toast, attempt } from '../utils/ui';

const PERSONAL = [
  ['notes', 'create-outline', 'Notes & ideas'], ['goals', 'flag-outline', 'Goals'], ['events', 'calendar-outline', 'Events'],
  ['coding', 'code-slash-outline', 'Coding'], ['english', 'chatbubbles-outline', 'English'], ['subscriptions', 'card-outline', 'Subscriptions'], ['purchases', 'bag-handle-outline', 'Warranties'], ['achievements', 'trophy-outline', 'Achievements'],
];

async function load() {
  const [daily, weekly, habits, att, asg, goals, ach, codeDays, savedWeekly] = await Promise.all([
    dailyReport(), weeklyReport(), habitOverview(30), attendanceRepository.summary(), assignmentsRepository.stats(), goalsRepository.stats(),
    achievementsSummary(), codingRepository.allDates(), reportsRepository.list('weekly', 6),
  ]);
  const week = lastNDays(7);
  const code = await codingRepository.byDay(week[0], week[6]);
  return { daily, weekly, habits, att, asg, goals, ach, codingStreak: activityStreak(new Set(codeDays.map((d) => d.date))), code, savedWeekly };
}

const dayLabel = (d) => WEEKDAYS[isoWeekday(parseDateStr(d)) - 1][0];

function milestones(a, streak) {
  const hours = a.studySeconds / 3600;
  return [
    hours >= 1 && `Studied ${Math.floor(hours)}+ hours in total`,
    a.tasksCompleted >= 10 && `Completed ${a.tasksCompleted} tasks`,
    a.assignments.submitted >= 5 && `Submitted ${a.assignments.submitted} assignments`,
    a.goals.done >= 1 && `Completed ${a.goals.done} goal${a.goals.done === 1 ? '' : 's'}`,
    streak >= 7 && `${streak}-day coding streak`,
  ].filter(Boolean);
}

export default function ProgressScreen() {
  const nav = useNavigation();
  const t = useTheme();
  const [view, setView] = useState('weekly');
  const { data, loading, reload } = useQuery(load, []);

  const saveSnapshot = () => attempt(async () => {
    if (view === 'daily') await reportsRepository.save('daily', data.daily.date, data.daily); else await reportsRepository.save('weekly', data.weekly.to, data.weekly);
    toast('Report saved');
  });

  return (
    <Screen title="Progress" back={false} subtitle="Everything here comes from your saved data" onRefresh={reload} refreshing={loading && !!data}>
      <Segmented value={view} onChange={setView} options={[{ label: 'Today', value: 'daily' }, { label: 'This week', value: 'weekly' }, { label: 'Personal', value: 'personal' }]} />
      <View style={{ height: 14 }} />
      {loading && !data ? <Loading /> : !data ? null : view === 'daily' ? (
        <>
          <Card style={{ alignItems: 'center' }}>
            <T v="caption" muted>PRODUCTIVITY SCORE</T>
            <T v="display" style={{ marginTop: 4 }}>{data.daily.score === null ? '—' : `${data.daily.score}%`}</T>
            <T v="small" muted>{data.daily.score === null ? 'Add goals or habits to get a score' : `${data.daily.goalsDone + data.daily.habitsDone} of ${data.daily.goalsTotal + data.daily.habitsDue} planned items done`}</T>
          </Card>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Stat label="Studied" value={fmtDuration(data.daily.studySeconds)} />
            <Stat label="Tasks done" value={String(data.daily.tasksDone)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Stat label="Routine steps" value={String(data.daily.routineStepsDone)} />
            <Stat label="Habits" value={`${data.daily.habitsDone}/${data.daily.habitsDue}`} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Stat label="Lectures" value={data.daily.lecturesTotal ? `${data.daily.lecturesAttended}/${data.daily.lecturesTotal}` : '—'} sub="attended" />
            <Stat label="Reminders" value={String(data.daily.remindersCompleted)} sub="completed" />
          </View>
          <Button title="Save today's report" variant="secondary" small style={{ marginTop: 14, alignSelf: 'center' }} onPress={saveSnapshot} />
        </>
      ) : view === 'weekly' ? (
        <>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T v="caption" muted>STUDY TIME · 7 DAYS</T><T v="heading">{fmtDuration(data.weekly.studySeconds)}</T>
            </View>
            <View style={{ marginTop: 14 }}>
              <BarChart data={data.weekly.daily.map((d) => ({ label: dayLabel(d.date), value: Math.round(d.seconds / 60) }))} format={(v) => `${v} min`} />
            </View>
          </Card>
          {data.weekly.perSubject.length ? (
            <Card style={{ marginTop: 10 }}>
              <T v="caption" muted>BY SUBJECT</T>
              {data.weekly.perSubject.map((s) => (
                <View key={s.name} style={{ marginTop: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T>{s.name}</T><T muted>{fmtDuration(s.seconds)}</T></View>
                  <ProgressBar value={s.seconds / data.weekly.perSubject[0].seconds} style={{ marginTop: 4 }} />
                </View>
              ))}
            </Card>
          ) : null}

          <SectionHeader title="Attendance" />
          <Card>
            {data.att.filter((s) => s.total > 0).length ? data.att.filter((s) => s.total > 0).map((s) => {
              const p = pct(s.present, s.total);
              return (
                <View key={s.id} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T>{s.name}</T><T color={p < s.target_pct ? t.danger : t.text} style={{ fontWeight: '700' }}>{p.toFixed(0)}%</T></View>
                  <ProgressBar value={p / 100} color={p < s.target_pct ? t.danger : t.success} style={{ marginTop: 4 }} />
                </View>
              );
            }) : <T muted>No attendance recorded yet.</T>}
          </Card>

          <SectionHeader title="This week at a glance" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat label="Tasks done" value={String(data.weekly.tasksDone)} />
            <Stat label="Topics done" value={String(data.weekly.topicsCompleted)} />
            <Stat label="Routine steps" value={String(data.weekly.routineStepsDone)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Stat label="Goals" value={data.weekly.goalsTotal ? `${data.weekly.goalsDone}/${data.weekly.goalsTotal}` : '—'} sub="daily goals" />
            <Stat label="MCQ accuracy" value={data.weekly.mcqAttempts ? `${Math.round((data.weekly.mcqCorrect / data.weekly.mcqAttempts) * 100)}%` : '—'} sub={`${data.weekly.mcqAttempts} attempts`} />
          </View>

          <SectionHeader title="Assignments" />
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T>Submitted</T><T style={{ fontWeight: '700' }}>{data.asg.submitted}/{data.asg.total}</T></View>
            <ProgressBar value={data.asg.total ? data.asg.submitted / data.asg.total : 0} style={{ marginTop: 8 }} color={t.success} />
          </Card>

          <SectionHeader title="Coding practice" />
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}><T muted>{data.weekly.codingProblems} problems this week</T><T muted>🔥 {data.codingStreak}-day streak</T></View>
            <BarChart height={70} data={lastNDays(7).map((d) => ({ label: dayLabel(d), value: data.code.find((c) => c.date === d)?.n || 0 }))} />
          </Card>

          <SectionHeader title="Habit consistency (30 days)" />
          <Card>
            {data.habits.length ? data.habits.map((h) => (
              <View key={h.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T>{h.name}</T><T muted>{h.consistency === null ? '—' : `${h.consistency}%`} · 🔥{h.streak}</T></View>
                <ProgressBar value={(h.consistency || 0) / 100} style={{ marginTop: 4 }} />
              </View>
            )) : <T muted>No habits tracked yet.</T>}
          </Card>

          <SectionHeader title="Goal completion" />
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T>Personal goals completed</T><T style={{ fontWeight: '700' }}>{data.goals.done}/{data.goals.total}</T></View>
            <ProgressBar value={data.goals.total ? data.goals.done / data.goals.total : 0} style={{ marginTop: 8 }} />
          </Card>

          <Button title="Save this week's report" variant="secondary" small style={{ marginTop: 14, alignSelf: 'center' }} onPress={saveSnapshot} />
          {data.savedWeekly.length ? (
            <>
              <SectionHeader title="Saved weekly reports" />
              <Card pad={false} style={{ paddingHorizontal: 16 }}>
                {data.savedWeekly.map((r) => { const d = JSON.parse(r.data); return <Row key={r.id} title={`Week ending ${fmtDateStr(r.period_key)}`} subtitle={`${fmtDuration(d.studySeconds)} studied · ${d.tasksDone} tasks · ${d.codingProblems} problems`} />; })}
              </Card>
            </>
          ) : null}
        </>
      ) : (
        <>
          <SectionHeader title="Achievements" style={{ marginTop: 0 }} />
          <Card>
            {(() => { const m = milestones(data.ach, data.codingStreak); return m.length ? m.map((x) => <Row key={x} icon="ribbon-outline" title={x} />) : <T muted>Milestones appear automatically as you study, finish tasks and reach goals.</T>; })()}
          </Card>
          <SectionHeader title="Personal" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
            {PERSONAL.map(([key, icon, label]) => (
              <Pressable key={key} accessibilityRole="button" accessibilityLabel={label} onPress={() => nav.navigate('Module', { module: key })} style={{ width: '50%', padding: 4 }}>
                <View style={{ backgroundColor: t.glass, borderRadius: radius.md, borderWidth: 1, borderColor: t.glassBorder, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Icon name={icon} size={22} /><T style={{ fontWeight: '600', flex: 1 }} numberOfLines={1}>{label}</T>
                </View>
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" accessibilityLabel="Expenses" onPress={() => nav.navigate('Expenses')} style={{ width: '50%', padding: 4 }}>
              <View style={{ backgroundColor: t.glass, borderRadius: radius.md, borderWidth: 1, borderColor: t.glassBorder, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon name="wallet-outline" size={22} /><T style={{ fontWeight: '600', flex: 1 }}>Expenses</T>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="My Khata" onPress={() => nav.navigate('Khata')} style={{ width: '50%', padding: 4 }}>
              <View style={{ backgroundColor: t.glass, borderRadius: radius.md, borderWidth: 1, borderColor: t.glassBorder, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon name="book-outline" size={22} /><T style={{ fontWeight: '600', flex: 1 }}>My Khata</T>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Document locker" onPress={() => nav.navigate('Vault')} style={{ width: '50%', padding: 4 }}>
              <View style={{ backgroundColor: t.glass, borderRadius: radius.md, borderWidth: 1, borderColor: t.glassBorder, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon name="lock-closed-outline" size={22} /><T style={{ fontWeight: '600', flex: 1 }}>Document locker</T>
              </View>
            </Pressable>
          </View>
          <Button title="Settings & backup" icon="settings-outline" variant="secondary" onPress={() => nav.navigate('Settings')} style={{ marginTop: 20 }} />
        </>
      )}
    </Screen>
  );
}
