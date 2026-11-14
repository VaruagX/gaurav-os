import React from 'react';
import { View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen, Card, T, Icon, SectionHeader, Row, Badge, Stat } from '../components/ui';
import { useTheme, radius } from '../theme';
import { Glass } from '../components/glass';
import { useQuery } from '../hooks/useQuery';
import { attendanceRepository, assignmentsRepository, examsRepository, timetableRepository } from '../database/repositories';
import { overall, shortages } from '../services/college/attendance';
import { fmtWhen, fmtCountdown, isoWeekday, addDays, toEpoch, toDateStr } from '../utils/date';

const MODULES = [
  { icon: 'checkmark-done-outline', label: 'Attendance', route: 'Attendance' },
  { icon: 'calendar-outline', label: 'Timetable', route: 'Timetable' },
  { icon: 'document-text-outline', label: 'Assignments', route: 'Assignments' },
  { icon: 'ribbon-outline', label: 'Exams', route: 'Exams' },
  { icon: 'list-outline', label: 'Syllabus', route: 'Syllabus' },
  { icon: 'flask-outline', label: 'Practicals', route: 'Practicals' },
  { icon: 'trophy-outline', label: 'Marks', route: 'Marks' },
  { icon: 'book-outline', label: 'Study planner', route: 'StudyPlanner' },
  { icon: 'timer-outline', label: 'Focus timer', route: 'FocusTimer' },
  { icon: 'refresh-circle-outline', label: 'Revision', route: 'Revision' },
  { icon: 'albums-outline', label: 'Flashcards', route: 'Flashcards' },
  { icon: 'help-circle-outline', label: 'MCQ practice', route: 'Mcq' },
];

export default function CollegeScreen() {
  const nav = useNavigation();
  const t = useTheme();
  const { data } = useQuery(async () => {
    const [summary, asg, ex] = await Promise.all([attendanceRepository.summary(), assignmentsRepository.pending(2), examsRepository.upcoming(1)]);
    let next = null;
    for (let i = 0; i < 7 && !next; i++) {
      const d = addDays(new Date(), i);
      const l = (await timetableRepository.forDay(isoWeekday(d))).find((x) => toEpoch(toDateStr(d), x.start_time) > Date.now());
      if (l) next = { ...l, at: toEpoch(toDateStr(d), l.start_time) };
    }
    return { summary, asg, ex, next };
  }, []);

  const o = data ? overall(data.summary) : null;
  const sh = data ? shortages(data.summary) : [];

  return (
    <Screen title="College" back={false} subtitle="Attendance, timetable, studies and exams">
      {data ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat label="Attendance" value={o.pct === null ? '—' : `${o.pct.toFixed(0)}%`} sub={o.total ? `${o.present}/${o.total} lectures` : 'not started'} />
            <Stat label="Next exam" value={data.ex[0] ? fmtCountdown(data.ex[0].exam_at - Date.now()) : '—'} sub={data.ex[0]?.title || 'none saved'} />
          </View>
          {sh.length ? (
            <Card onPress={() => nav.navigate('Attendance')} style={{ marginTop: 10, borderColor: t.danger }}>
              <T v="heading" color={t.danger}>Attendance shortage</T>
              {sh.slice(0, 3).map((s) => <T key={s.id} muted>{s.name}: {s.pct.toFixed(0)}% — attend next {s.needed} to reach {s.target_pct}%</T>)}
            </Card>
          ) : null}
          {data.next ? (
            <Card style={{ marginTop: 10 }}>
              <T v="caption" muted>NEXT LECTURE</T>
              <T v="heading" style={{ marginTop: 4 }}>{data.next.subject_name}</T>
              <T muted>{fmtWhen(data.next.at)} · {data.next.kind === 'practical' ? 'Practical' : 'Theory'}{data.next.room ? ` · ${data.next.room}` : ''}</T>
            </Card>
          ) : null}
        </>
      ) : null}
      <SectionHeader title="Modules" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
        {MODULES.map((m) => (
          <Pressable key={m.route} accessibilityRole="button" accessibilityLabel={m.label} onPress={() => nav.navigate(m.route)} style={{ width: '50%', padding: 4 }}>
            <Glass radius={radius.md} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.glassStrong, alignItems: 'center', justifyContent: 'center' }}><Icon name={m.icon} size={20} color={t.primary} /></View>
              <T style={{ fontWeight: '600', flex: 1 }} numberOfLines={1}>{m.label}</T>
            </Glass>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
