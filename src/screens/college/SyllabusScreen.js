import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen, Card, T, Row, Checkbox, EmptyState, Fab, Loading, ProgressBar, SubjectPicker, IconButton, Badge, SectionHeader, Button } from '../../components/ui';
import FormSheet from '../../components/FormSheet';
import { useTheme } from '../../theme';
import { useQuery } from '../../hooks/useQuery';
import { syllabusRepository as repo, subjectsRepository } from '../../database/repositories';
import { confirm } from '../../utils/ui';

const FIELDS = [
  { key: 'unit', label: 'Unit / chapter', placeholder: 'Unit 1', required: true },
  { key: 'title', label: 'Topic', required: true, placeholder: 'e.g. Normalisation' },
  { key: 'weak', label: 'Mark as weak topic', type: 'toggle' },
];

export default function SyllabusScreen() {
  const t = useTheme();
  const [subjectId, setSubjectId] = useState(null);
  const [editing, setEditing] = useState(null);
  const subjects = useQuery(() => subjectsRepository.active(), [], []);
  useEffect(() => { if (!subjectId && subjects.data.length) setSubjectId(subjects.data[0].id); }, [subjects.data, subjectId]);
  const { data, loading } = useQuery(() => (subjectId ? repo.forSubject(subjectId) : []), [subjectId], []);

  const units = {};
  data.forEach((tp) => { (units[tp.unit] ||= []).push(tp); });
  const done = data.filter((x) => x.done).length;

  const save = async (v) => {
    const row = { unit: v.unit.trim(), title: v.title.trim(), weak: v.weak ? 1 : 0 };
    if (editing?.id) await repo.update(editing.id, row);
    else await repo.insert({ ...row, subject_id: subjectId, done: 0, sort: data.length });
  };

  if (!subjects.loading && !subjects.data.length) return <Screen title="Syllabus"><EmptyState icon="list-outline" title="Add a subject first" text="Create subjects under College → Attendance." /></Screen>;

  return (
    <Screen title="Syllabus" subtitle={data.length ? `${done}/${data.length} topics complete` : 'Units, chapters and topics'} fab={subjectId ? <Fab onPress={() => setEditing({ unit: Object.keys(units).slice(-1)[0] || 'Unit 1' })} label="Add topic" /> : null}>
      <SubjectPicker subjects={subjects.data} value={subjectId} onChange={setSubjectId} allowNone={false} />
      {data.length ? <ProgressBar value={done / data.length} style={{ marginTop: 14 }} /> : null}
      {loading && !data.length ? <Loading /> : !data.length ? (
        <EmptyState icon="list-outline" title="No topics yet" text="Add units and topics to track what is done and what is weak." action="Add topic" onAction={() => setEditing({ unit: 'Unit 1' })} />
      ) : Object.entries(units).map(([unit, topics]) => (
        <View key={unit}>
          <SectionHeader title={`${unit} · ${topics.filter((x) => x.done).length}/${topics.length}`} />
          <Card pad={false} style={{ paddingHorizontal: 16 }}>
            {topics.map((tp) => (
              <Row key={tp.id} left={<Checkbox checked={!!tp.done} label={tp.title} onPress={() => repo.setDone(tp.id, !tp.done)} />} title={tp.title}
                right={<View style={{ flexDirection: 'row', alignItems: 'center' }}>{tp.weak && !tp.done ? <Badge label="WEAK" tone="danger" /> : null}
                  <IconButton name={tp.weak ? 'flag' : 'flag-outline'} size={18} label={tp.weak ? 'Unmark weak' : 'Mark weak'} color={tp.weak ? t.danger : t.textMuted} onPress={() => repo.setWeak(tp.id, !tp.weak)} /></View>}
                onPress={() => setEditing(tp)} />
            ))}
          </Card>
        </View>
      ))}
      <FormSheet visible={!!editing} title={editing?.id ? 'Edit topic' : 'New topic'} fields={FIELDS} initial={editing || {}} onSubmit={save} onClose={() => setEditing(null)}
        onDelete={editing?.id ? async () => { if (!(await confirm('Delete topic?', editing.title, { destructive: true, confirmText: 'Delete' }))) throw new Error('Cancelled'); await repo.remove(editing.id); } : undefined} />
    </Screen>
  );
}
