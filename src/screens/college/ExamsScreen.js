import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen, Card, T, Badge, EmptyState, Fab, Loading, Chip, Button } from '../../components/ui';
import { createExamPlan } from '../../services/study/examPlanService';
import FormSheet from '../../components/FormSheet';
import { useTheme } from '../../theme';
import { useQuery } from '../../hooks/useQuery';
import { examsRepository as repo } from '../../database/repositories';
import { upsertDeadlineReminder, removeLinkedReminder } from '../../services/reminders/reminderService';
import { fmtWhen, fmtCountdown } from '../../utils/date';
import { confirm, attempt, toast } from '../../utils/ui';

const PREP = [{ label: 'Not started', value: 'not_started' }, { label: 'In progress', value: 'in_progress' }, { label: 'Ready', value: 'ready' }];
const REMIND = [{ label: 'None', value: 0 }, { label: '1 hour before', value: 60 }, { label: '1 day before', value: 1440 }, { label: '3 days before', value: 4320 }];
const TONE = { not_started: 'danger', in_progress: 'warning', ready: 'success' };

const FIELDS = [
  { key: 'title', label: 'Exam', required: true, placeholder: 'e.g. DBMS Internal 1' },
  { key: 'subject_id', label: 'Subject', type: 'subject' },
  { key: 'exam_at', label: 'Date & time', type: 'datetime', required: true },
  { key: 'room', label: 'Room / venue' },
  { key: 'prep_status', label: 'Preparation', type: 'select', options: PREP },
  { key: 'remind_before_min', label: 'Reminder', type: 'select', options: REMIND },
  { key: 'notes', label: 'Notes / syllabus covered', type: 'multiline' },
];

export default function ExamsScreen() {
  const t = useTheme();
  const [editing, setEditing] = useState(null);
  const { data, loading } = useQuery(() => repo.withSubject(), [], []);
  const now = Date.now();
  const upcoming = data.filter((e) => e.exam_at >= now), past = data.filter((e) => e.exam_at < now);

  const save = async (v) => {
    const row = { title: v.title.trim(), subject_id: v.subject_id || null, exam_at: v.exam_at, room: v.room || null, prep_status: v.prep_status || 'not_started', notes: v.notes || null, remind_before_min: v.remind_before_min || null };
    let id = editing?.id;
    if (id) await repo.update(id, row); else id = await repo.insert(row);
    if (row.remind_before_min) await upsertDeadlineReminder('exam', id, `Exam: ${row.title}`, row.exam_at, row.remind_before_min, `Reminder: ${row.title} is coming up.`);
    else await removeLinkedReminder('exam', id);
  };
  const card = (e, isPast) => (
    <Card key={e.id} style={{ marginBottom: 10, opacity: isPast ? 0.6 : 1 }} onPress={() => setEditing(e)}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <T v="heading">{e.title}</T>
          <T muted>{e.subject_name || 'Exam'} · {fmtWhen(e.exam_at)}{e.room ? ` · ${e.room}` : ''}</T>
        </View>
        {!isPast ? <View style={{ alignItems: 'flex-end' }}><T v="title">{fmtCountdown(e.exam_at - now)}</T><T v="small" muted>to go</T></View> : null}
      </View>
      {!isPast ? <Button small variant="secondary" icon="calendar-number-outline" title="Make study plan" style={{ marginTop: 10, alignSelf: 'flex-start' }}
        onPress={() => attempt(async () => { const n = await createExamPlan(e); toast(`Study plan added: ${n} tasks`); }, 'Study plan')} /> : null}
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {PREP.map((p) => <Chip key={p.value} small label={p.label} selected={e.prep_status === p.value} onPress={() => repo.update(e.id, { prep_status: p.value })} />)}
      </View>
    </Card>
  );

  return (
    <Screen title="Exams" subtitle="Schedule, countdown and preparation" fab={<Fab onPress={() => setEditing({ prep_status: 'not_started', remind_before_min: 1440 })} label="Add exam" />}>
      {loading && !data.length ? <Loading /> : !data.length ? (
        <EmptyState icon="ribbon-outline" title="No exams saved" text="Add your exam schedule to get a countdown and reminders." action="Add exam" onAction={() => setEditing({ prep_status: 'not_started', remind_before_min: 1440 })} />
      ) : (
        <>
          {upcoming.map((e) => card(e, false))}
          {past.length ? <T v="caption" muted style={{ marginVertical: 8 }}>PAST</T> : null}
          {past.map((e) => card(e, true))}
        </>
      )}
      <FormSheet visible={!!editing} title={editing?.id ? 'Edit exam' : 'New exam'} fields={FIELDS} initial={editing || {}} onSubmit={save} onClose={() => setEditing(null)}
        onDelete={editing?.id ? async () => { if (!(await confirm('Delete exam?', editing.title, { destructive: true, confirmText: 'Delete' }))) throw new Error('Cancelled'); await removeLinkedReminder('exam', editing.id); await repo.remove(editing.id); } : undefined} />
    </Screen>
  );
}
