import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen, Card, T, Row, Checkbox, EmptyState, Fab, Loading, Segmented, ProgressBar, SectionHeader, Button, Stat, Badge } from '../../components/ui';
import FormSheet from '../../components/FormSheet';
import { useQuery } from '../../hooks/useQuery';
import { useSettings } from '../../hooks/useSettings';
import { studyPlanRepository as plan, studySessionsRepository as sessions, settingsRepository } from '../../database/repositories';
import { todayStr, addDaysStr, fmtDuration, fmtDateTime, fmtDateStr } from '../../utils/date';
import { confirm, attempt } from '../../utils/ui';
import { Stepper } from '../../components/ui';

const PLAN_FIELDS = [
  { key: 'title', label: 'What will you study?', required: true, placeholder: 'e.g. DBMS — normalisation' },
  { key: 'subject_id', label: 'Subject', type: 'subject' },
  { key: 'planned_min', label: 'Planned minutes', type: 'number', required: true },
];
const SESSION_FIELDS = [
  { key: 'subject_id', label: 'Subject', type: 'subject' },
  { key: 'topic', label: 'Topic (optional)' },
  { key: 'minutes', label: 'Minutes studied', type: 'number', required: true },
  { key: 'date', label: 'Date', type: 'date', required: true },
];

export default function StudyPlannerScreen() {
  const nav = useNavigation();
  const s = useSettings();
  const [which, setWhich] = useState('today');
  const [editing, setEditing] = useState(null);
  const [logging, setLogging] = useState(false);
  const date = which === 'today' ? todayStr() : addDaysStr(todayStr(), 1);
  const goalMin = Number(s.dailyStudyGoalMin) || 120;
  const { data, loading } = useQuery(async () => ({ items: await plan.forDate(date), secToday: await sessions.secondsOn(todayStr()), recent: await sessions.recent(15) }), [date]);

  const save = async (v) => {
    const row = { title: v.title.trim(), subject_id: v.subject_id || null, planned_min: v.planned_min || 30 };
    if (editing?.id) await plan.update(editing.id, row); else await plan.insert({ ...row, date, done: 0 });
  };
  const items = data?.items || [];
  const plannedTotal = items.reduce((a, i) => a + i.planned_min, 0);

  return (
    <Screen title="Study planner" subtitle="Plan sessions, track time against your goal" fab={<Fab onPress={() => setEditing({ planned_min: 45 })} label="Add study item" />}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <T v="caption" muted>TODAY'S STUDY GOAL</T>
          <T v="small" muted>{Math.round((data?.secToday || 0) / 60)} / {goalMin} min</T>
        </View>
        <ProgressBar value={((data?.secToday || 0) / 60) / goalMin} style={{ marginTop: 10 }} />
        <View style={{ marginTop: 14 }}>
          <T v="small" muted style={{ marginBottom: 6 }}>Daily goal</T>
          <Stepper label="daily goal minutes" value={goalMin} min={15} max={720} step={15} format={(v) => `${v} min`} onChange={(v) => settingsRepository.set('dailyStudyGoalMin', v)} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <Button title="Start focus" icon="timer-outline" onPress={() => nav.navigate('FocusTimer')} style={{ flex: 1 }} />
          <Button title="Log time" variant="secondary" onPress={() => setLogging(true)} style={{ flex: 1 }} />
        </View>
      </Card>

      <SectionHeader title="Plan" />
      <Segmented value={which} onChange={setWhich} options={[{ label: 'Today', value: 'today' }, { label: 'Tomorrow', value: 'tomorrow' }]} />
      <View style={{ height: 12 }} />
      {loading && !data ? <Loading /> : !items.length ? (
        <EmptyState icon="book-outline" title="Nothing planned" text={`Plan what you'll study ${which}.`} action="Add item" onAction={() => setEditing({ planned_min: 45 })} />
      ) : (
        <Card pad={false} style={{ paddingHorizontal: 16 }}>
          {items.map((i) => (
            <Row key={i.id} left={<Checkbox checked={!!i.done} label={i.title} onPress={() => plan.setDone(i.id, !i.done)} />} title={i.title}
              subtitle={`${i.planned_min} min${i.subject_name ? ` · ${i.subject_name}` : ''}`} onPress={() => setEditing(i)} />
          ))}
          <T v="small" muted style={{ paddingVertical: 10 }}>{plannedTotal} min planned · {items.filter((i) => i.done).length}/{items.length} done</T>
        </Card>
      )}

      <SectionHeader title="Study history" />
      {!data?.recent.length ? <T muted>No sessions logged yet. Finish a focus session or log time manually.</T> : (
        <Card pad={false} style={{ paddingHorizontal: 16 }}>
          {data.recent.map((r) => (
            <Row key={r.id} title={r.subject_name || 'General study'} subtitle={`${fmtDateTime(r.started_at)}${r.topic ? ` · ${r.topic}` : ''} · ${r.mode}`}
              right={<T style={{ fontWeight: '700' }}>{fmtDuration(r.seconds)}</T>}
              onLongPress={async () => { if (await confirm('Delete session?', 'It will no longer count toward your totals.', { destructive: true, confirmText: 'Delete' })) attempt(() => sessions.remove(r.id)); }} />
          ))}
        </Card>
      )}
      <T v="small" faint style={{ marginTop: 8, textAlign: 'center' }}>Long-press a session to delete it</T>

      <FormSheet visible={!!editing} title={editing?.id ? 'Edit study item' : 'New study item'} fields={PLAN_FIELDS} initial={editing || {}} onSubmit={save} onClose={() => setEditing(null)}
        onDelete={editing?.id ? async () => { await plan.remove(editing.id); } : undefined} />
      <FormSheet visible={logging} title="Log study time" fields={SESSION_FIELDS} initial={{ date: todayStr(), minutes: 30 }} onClose={() => setLogging(false)}
        onSubmit={async (v) => { if (!(v.minutes > 0)) throw new Error('Minutes must be greater than zero.'); await sessions.insert({ subject_id: v.subject_id || null, topic: v.topic || null, mode: 'manual', seconds: Math.round(v.minutes * 60), date: v.date, started_at: Date.now() }); }} />
    </Screen>
  );
}
