import React from 'react';
import { View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen, Card, T, Icon, Row, Checkbox, EmptyState, SectionHeader, Stat, ProgressBar, Chip, IconButton, Badge, Loading, ErrorNote } from '../components/ui';
import { useTheme, space, radius } from '../theme';
import { Glass, GradientFill } from '../components/glass';
import { useDrawer } from '../navigation/drawerContext';
import { useQuery } from '../hooks/useQuery';
import { useNow } from '../hooks/useNow';
import { useSettings } from '../hooks/useSettings';
import {
  tasksRepository as tasks, remindersRepository as reminders, dailyGoalsRepository as dgoals, studySessionsRepository as sessions,
  assignmentsRepository as assignments, examsRepository as exams, habitsRepository as habits, routinesRepository as routines,
  eventsRepository as events,
} from '../database/repositories';
import { getDaySchedule } from '../services/daySchedule';
import { suggestNow } from '../services/assistant/engine';
import { dailyReport } from '../services/study/analytics';
import { greeting, fmtDateLong, fmtClock, fmtWhen, fmtCountdown, todayStr, fmtDuration, isoWeekday, addDays, toEpoch, toDateStr, fmtTime } from '../utils/date';
import { timetableRepository, khataRepository } from '../database/repositories';
import { formatPaise } from '../services/khata/money';
import { expenseRepository } from '../database/repositories';
import { monthKeyOf, monthRange } from '../services/expenses/finance';

const ICON = { lecture: 'school-outline', reminder: 'alarm-outline', assignment: 'document-text-outline', exam: 'ribbon-outline', study: 'book-outline', routine: 'repeat-outline' };

async function load() {
  const today = todayStr();
  const [schedule, rems, pend, goals, secToday, asg, ex, report, hint, evs] = await Promise.all([
    getDaySchedule(new Date()), reminders.upcoming(3), tasks.pending(4), dgoals.forDate(today), sessions.secondsOn(today),
    assignments.pending(3), exams.upcoming(2), dailyReport(), suggestNow(), events.upcoming(today, 2),
  ]);
  // Upcoming lectures: remaining today, then fall back to the next days.
  const lectures = [];
  for (let i = 0; i < 7 && lectures.length < 3; i++) {
    const d = addDays(new Date(), i);
    const rows = await timetableRepository.forDay(isoWeekday(d));
    rows.forEach((l) => { const at = toEpoch(toDateStr(d), l.start_time); if (at > Date.now() && lectures.length < 3) lectures.push({ ...l, at }); });
  }
  const pendCount = await tasks.countPending();
  const nowHm = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  const ongoing = (await timetableRepository.forDay(isoWeekday(new Date()))).find((l) => l.start_time <= nowHm && nowHm < l.end_time) || null;
  const khata = await khataRepository.summary();
  const mr = monthRange(monthKeyOf(new Date()));
  const money = { ...(await expenseRepository.totals(mr.from, mr.to)), balance: (await expenseRepository.balance()).balance };
  return { ongoing, money, khata, schedule, rems, pend, pendCount, goals, secToday, asg, ex, report, hint, lectures, evs };
}

export default function HomeScreen() {
  const nav = useNavigation();
  const drawer = useDrawer();
  const t = useTheme();
  const now = useNow(30000);
  const s = useSettings();
  const { data, loading, error, reload } = useQuery(load, []);

  const quick = [
    { icon: 'add-circle-outline', label: 'Task', go: () => nav.navigate('Tasks') },
    { icon: 'alarm-outline', label: 'Reminder', go: () => nav.navigate('ReminderEditor') },
    { icon: 'timer-outline', label: 'Focus', go: () => nav.navigate('FocusTimer') },
    { icon: 'checkmark-done-outline', label: 'Attendance', go: () => nav.navigate('Attendance') },
    { icon: 'create-outline', label: 'Note', go: () => nav.navigate('Module', { module: 'notes' }) },
    { icon: 'flag-outline', label: 'Goal', go: () => nav.navigate('Module', { module: 'goals' }) },
  ];
  const goalMin = Number(s.dailyStudyGoalMin) || 120;
  const studyFrac = data ? data.secToday / 60 / goalMin : 0;
  const isEmpty = data && !data.schedule.length && !data.pend.length && !data.rems.length && !data.goals.length && !data.lectures.length && !data.asg.length;

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}
      right={null}>
      <View style={{ paddingTop: space.md, flexDirection: 'row', alignItems: 'center' }}>
        <IconButton name="menu" label="Open menu" bg onPress={drawer.open} />
        <View style={{ flex: 1, marginLeft: space.md }}>
          <T v="caption" muted>GAURAV OS</T>
          <T muted style={{ marginTop: 1 }}>{fmtDateLong(now)} · {fmtClock(now.getTime())}</T>
        </View>
        <IconButton name="settings-outline" label="Settings" bg onPress={() => nav.navigate('Settings')} />
      </View>
      <T v="display" style={{ marginTop: space.xl }}>{greeting(now)},</T>
      <T v="display" color={t.primary} style={{ marginTop: -2 }}>{s.userName}</T>

      <ErrorNote error={error} onRetry={reload} />

      {/* Assistant hero */}
      <Pressable accessibilityRole="button" accessibilityLabel="Open assistant" onPress={() => nav.navigate('Assistant')}
        style={({ pressed }) => [{ marginTop: space.xl, borderRadius: radius.lg + 4, overflow: 'hidden', backgroundColor: t.primary, borderWidth: 1, borderColor: t.glassHighlight, shadowColor: t.primary, shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8 }, pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] }]}>
        <GradientFill from={t.primary} to={t.primary2} />
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: space.lg + 2 }}>
          <View style={{ flex: 1 }}>
            <T v="caption" color="#fff" style={{ opacity: 0.75 }}>ASSISTANT</T>
            <T v="heading" color="#fff" style={{ marginTop: 4 }}>{data ? data.hint.text : 'Ask me anything about your day'}</T>
          </View>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center', marginLeft: 12 }}>
            <Icon name="mic" size={22} color="#fff" />
          </View>
        </View>
      </Pressable>

      {data && (data.ongoing || data.lectures[0]) ? (
        <Card onPress={() => nav.navigate('Attendance')} accessibilityLabel="Open attendance" style={{ marginTop: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.glassStrong, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <Icon name={data.ongoing ? 'radio-button-on' : 'school-outline'} size={22} color={data.ongoing ? t.success : t.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="caption" muted>{data.ongoing ? 'HAPPENING NOW' : 'NEXT LECTURE'}</T>
              {data.ongoing
                ? <><T v="heading" style={{ marginTop: 2 }}>{data.ongoing.subject_name}</T><T v="small" muted>until {fmtTime(data.ongoing.end_time)}{data.ongoing.room ? ` · ${data.ongoing.room}` : ''}</T></>
                : <><T v="heading" style={{ marginTop: 2 }}>{data.lectures[0].subject_name}</T><T v="small" muted>in {fmtCountdown(data.lectures[0].at - now.getTime())} · {fmtTime(data.lectures[0].start_time)}{data.lectures[0].room ? ` · ${data.lectures[0].room}` : ''}</T></>}
            </View>
            <Icon name="chevron-forward" size={18} />
          </View>
        </Card>
      ) : null}

      {/* Quick actions */}
      <SectionHeader title="Quick actions" style={{ marginTop: space.xl }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
        {quick.map((q) => (
          <Pressable key={q.label} accessibilityRole="button" accessibilityLabel={q.label} onPress={q.go} style={({ pressed }) => [{ width: '33.33%', padding: 4 }, pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] }]}>
            <Glass radius={radius.md} style={{ alignItems: 'center', paddingVertical: 16 }}>
              <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: t.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={q.icon} size={22} color={t.primary} />
              </View>
              <T v="small" style={{ marginTop: 8, fontWeight: '600' }}>{q.label}</T>
            </Glass>
          </Pressable>
        ))}
      </View>

      {data ? (
        <Card onPress={() => nav.navigate('Expenses')} accessibilityLabel="Open Money" style={{ marginTop: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <T v="caption" muted>MONEY · THIS MONTH</T>
              <T muted style={{ marginTop: 4 }}>Spent <T style={{ fontWeight: '700' }}>{formatPaise(data.money.expense)}</T>  ·  Earned <T style={{ fontWeight: '700' }} color={t.success}>{formatPaise(data.money.income)}</T>  ·  Balance <T style={{ fontWeight: '700' }}>{formatPaise(data.money.balance)}</T></T>
            </View>
            <Icon name="chevron-forward" size={18} />
          </View>
        </Card>
      ) : null}
      {data ? (
        <Card onPress={() => nav.navigate('Khata')} accessibilityLabel="Open My Khata" style={{ marginTop: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <T v="caption" muted>MY KHATA</T>
              <T muted style={{ marginTop: 4 }}>Lena <T style={{ fontWeight: '700' }} color={t.success}>{formatPaise(data.khata.receivable)}</T>  ·  Dena <T style={{ fontWeight: '700' }} color={t.danger}>{formatPaise(data.khata.payable)}</T></T>
            </View>
            <Icon name="chevron-forward" size={18} />
          </View>
        </Card>
      ) : null}

      {loading && !data ? <Loading /> : null}

      {data && isEmpty ? (
        <Card style={{ marginTop: space.xl }}>
          <EmptyState icon="rocket-outline" title="Your day is a blank page"
            text="Add your timetable, tasks or a reminder and this dashboard fills up with your real schedule." action="Add a reminder" onAction={() => nav.navigate('ReminderEditor')} />
        </Card>
      ) : null}

      {data ? (
        <>
          {/* Productivity summary */}
          <SectionHeader title="Today's summary" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat label="Studied" value={fmtDuration(data.secToday)} sub={`goal ${goalMin}m`} />
            <Stat label="Tasks done" value={String(data.report.tasksDone)} sub={`${data.pendCount} pending`} />
            <Stat label="Habits" value={`${data.report.habitsDone}/${data.report.habitsDue}`} sub={data.report.score === null ? 'none due' : `${data.report.score}% of plan`} />
          </View>
          <Card style={{ marginTop: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T v="small" muted>Study progress</T><T v="small" muted>{Math.min(100, Math.round(studyFrac * 100))}%</T>
            </View>
            <ProgressBar value={studyFrac} style={{ marginTop: 8 }} color={studyFrac >= 1 ? t.success : t.primary} />
          </Card>

          {/* Schedule */}
          <SectionHeader title="Today's schedule" />
          <Card>
            {data.schedule.length ? data.schedule.slice(0, 6).map((i) => (
              <Row key={i.key} icon={ICON[i.type]} title={i.title} subtitle={i.subtitle} right={i.type === 'study' ? null : <T v="small" muted>{fmtClock(i.at)}</T>} />
            )) : <T muted>Nothing scheduled today.</T>}
          </Card>

          {/* Upcoming reminders */}
          <SectionHeader title="Upcoming reminders" action="All" onAction={() => nav.navigate('Reminders')} />
          <Card>
            {data.rems.length ? data.rems.map((r) => (
              <Row key={r.id} icon="alarm-outline" title={r.title} subtitle={fmtWhen(r.next_at)} right={r.mode !== 'normal' ? <Badge label={r.mode.toUpperCase()} /> : null}
                onPress={() => nav.navigate('ReminderEditor', { id: r.id })} />
            )) : <T muted>No upcoming reminders.</T>}
          </Card>

          {/* Tasks */}
          <SectionHeader title="Pending tasks" action={`See all${data.pendCount ? ` (${data.pendCount})` : ''}`} onAction={() => nav.navigate('Tasks')} />
          <Card>
            {data.pend.length ? data.pend.map((x) => (
              <Row key={x.id} left={<Checkbox label={`Complete ${x.title}`} onPress={() => tasks.complete(x.id)} />} title={x.title}
                subtitle={x.due_at ? `Due ${fmtWhen(x.due_at)}` : x.category} />
            )) : <T muted>All clear. Add a task from Quick actions.</T>}
          </Card>

          {/* Daily goals */}
          <SectionHeader title="Daily goals" action="Manage" onAction={() => nav.navigate('Routine')} />
          <Card>
            {data.goals.length ? data.goals.map((g) => (
              <Row key={g.id} left={<Checkbox checked={!!g.done} label={g.title} onPress={() => dgoals.setDone(g.id, !g.done)} />} title={g.title} />
            )) : <T muted>No goals for today. Set them in the Routine tab.</T>}
          </Card>

          {/* Lectures */}
          <SectionHeader title="Upcoming lectures" action="Timetable" onAction={() => nav.navigate('Timetable')} />
          <Card>
            {data.lectures.length ? data.lectures.map((l) => (
              <Row key={`${l.id}-${l.at}`} icon="school-outline" title={l.subject_name}
                subtitle={`${fmtWhen(l.at)} · ${l.kind === 'practical' ? 'Practical' : 'Theory'}${l.room ? ` · ${l.room}` : ''}`}
                right={<T v="small" muted>in {fmtCountdown(l.at - now.getTime())}</T>} />
            )) : <T muted>No lectures in your timetable yet.</T>}
          </Card>

          {/* Deadlines */}
          <SectionHeader title="Deadlines & exams" action="Assignments" onAction={() => nav.navigate('Assignments')} />
          <Card>
            {data.asg.length || data.ex.length || data.evs.length ? (
              <>
                {data.asg.map((a) => <Row key={`a${a.id}`} icon="document-text-outline" title={a.title} subtitle={`${a.subject_name || 'Assignment'} · due ${fmtWhen(a.due_at)}`}
                  right={a.due_at < now.getTime() ? <Badge label="OVERDUE" tone="danger" /> : null} onPress={() => nav.navigate('Assignments')} />)}
                {data.ex.map((e) => <Row key={`e${e.id}`} icon="ribbon-outline" title={e.title} subtitle={`${e.subject_name || 'Exam'} · ${fmtWhen(e.exam_at)}`}
                  right={<T v="small" muted>{fmtCountdown(e.exam_at - now.getTime())}</T>} onPress={() => nav.navigate('Exams')} />)}
                {data.evs.map((e) => <Row key={`v${e.id}`} icon="calendar-outline" title={e.title} subtitle={e.date} onPress={() => nav.navigate('Module', { module: 'events' })} />)}
              </>
            ) : <T muted>No upcoming deadlines.</T>}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
