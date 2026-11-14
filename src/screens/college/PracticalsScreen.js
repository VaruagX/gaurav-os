import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen, Card, T, Row, Checkbox, EmptyState, Fab, Loading, SubjectPicker, Chip, Badge, ProgressBar, Button } from '../../components/ui';
import FormSheet from '../../components/FormSheet';
import { useQuery } from '../../hooks/useQuery';
import { practicalsRepository as repo, subjectsRepository } from '../../database/repositories';
import { confirm } from '../../utils/ui';

const JOURNAL = [{ label: 'Pending', value: 'pending' }, { label: 'Written', value: 'written' }, { label: 'Submitted', value: 'submitted' }];
const FIELDS = [
  { key: 'number', label: 'Experiment no.', type: 'number', required: true },
  { key: 'title', label: 'Title / aim', required: true },
  { key: 'program_done', label: 'Program completed', type: 'toggle' },
  { key: 'journal_status', label: 'Journal', type: 'select', options: JOURNAL },
  { key: 'viva_questions', label: 'Viva questions (one per line)', type: 'multiline' },
];

export default function PracticalsScreen() {
  const [subjectId, setSubjectId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(null);
  const subjects = useQuery(() => subjectsRepository.active(), [], []);
  useEffect(() => { if (!subjectId && subjects.data.length) setSubjectId(subjects.data[0].id); }, [subjects.data, subjectId]);
  const { data, loading } = useQuery(() => (subjectId ? repo.forSubject(subjectId) : []), [subjectId], []);
  const done = data.filter((p) => p.program_done).length;

  const add = async () => setEditing({ number: await repo.nextNumber(subjectId), journal_status: 'pending', program_done: 0 });
  const save = async (v) => {
    const row = { number: v.number, title: v.title.trim(), program_done: v.program_done ? 1 : 0, journal_status: v.journal_status || 'pending', viva_questions: v.viva_questions || null };
    if (editing?.id) await repo.update(editing.id, row); else await repo.insert({ ...row, subject_id: subjectId });
  };

  if (!subjects.loading && !subjects.data.length) return <Screen title="Practicals"><EmptyState icon="flask-outline" title="Add a subject first" text="Create subjects under College → Attendance." /></Screen>;

  return (
    <Screen title="Practicals" subtitle={data.length ? `${done}/${data.length} programs done` : 'Experiments, journal and viva'} fab={subjectId ? <Fab onPress={add} label="Add experiment" /> : null}>
      <SubjectPicker subjects={subjects.data} value={subjectId} onChange={setSubjectId} allowNone={false} />
      {data.length ? <ProgressBar value={done / data.length} style={{ marginTop: 14 }} /> : null}
      <View style={{ height: 12 }} />
      {loading && !data.length ? <Loading /> : !data.length ? (
        <EmptyState icon="flask-outline" title="No experiments yet" text="List your experiments to track programs, journal status and viva questions." action="Add experiment" onAction={add} />
      ) : data.map((p) => (
        <Card key={p.id} style={{ marginBottom: 10 }}>
          <Row left={<Checkbox checked={!!p.program_done} label={`Program ${p.number} done`} onPress={() => repo.update(p.id, { program_done: p.program_done ? 0 : 1 })} />}
            title={`${p.number}. ${p.title}`} subtitle={p.program_done ? 'Program completed' : 'Program pending'} onPress={() => setEditing(p)} style={{ paddingTop: 0 }} />
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <T v="small" muted>Journal:</T>
            {JOURNAL.map((j) => <Chip key={j.value} small label={j.label} selected={p.journal_status === j.value} onPress={() => repo.update(p.id, { journal_status: j.value })} />)}
          </View>
          {p.viva_questions ? (
            <View style={{ marginTop: 10 }}>
              <Button small variant="ghost" title={open === p.id ? 'Hide viva questions' : 'Viva questions'} icon="help-circle-outline" onPress={() => setOpen(open === p.id ? null : p.id)} style={{ alignSelf: 'flex-start' }} />
              {open === p.id ? p.viva_questions.split('\n').filter(Boolean).map((q, i) => <T key={i} muted style={{ marginLeft: 6, marginTop: 2 }}>{i + 1}. {q}</T>) : null}
            </View>
          ) : null}
        </Card>
      ))}
      <FormSheet visible={!!editing} title={editing?.id ? 'Edit experiment' : 'New experiment'} fields={FIELDS} initial={editing || {}} onSubmit={save} onClose={() => setEditing(null)}
        onDelete={editing?.id ? async () => { if (!(await confirm('Delete experiment?', editing.title, { destructive: true, confirmText: 'Delete' }))) throw new Error('Cancelled'); await repo.remove(editing.id); } : undefined} />
    </Screen>
  );
}
