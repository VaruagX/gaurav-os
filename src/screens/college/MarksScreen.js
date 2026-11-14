import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen, Card, T, Row, Badge, EmptyState, Fab, Loading, Stat, SectionHeader, ProgressBar, BarChart } from '../../components/ui';
import FormSheet from '../../components/FormSheet';
import { useQuery } from '../../hooks/useQuery';
import { marksRepository as repo } from '../../database/repositories';
import { confirm } from '../../utils/ui';

const KINDS = [{ label: 'Internal', value: 'internal' }, { label: 'Practical', value: 'practical' }, { label: 'Theory', value: 'theory' }];
const FIELDS = [
  { key: 'subject_id', label: 'Subject', type: 'subject', required: true },
  { key: 'kind', label: 'Type', type: 'segmented', options: KINDS },
  { key: 'title', label: 'Exam / component', required: true, placeholder: 'e.g. Internal 1' },
  { key: 'obtained', label: 'Marks obtained', type: 'number', required: true },
  { key: 'total', label: 'Out of', type: 'number', required: true },
  { key: 'semester', label: 'Semester', type: 'select', options: ['1', '2', '3', '4', '5', '6', '7', '8'].map((s) => ({ label: `Sem ${s}`, value: s })) },
];

const pc = (o, t) => (t > 0 ? (o / t) * 100 : 0);

export default function MarksScreen() {
  const [editing, setEditing] = useState(null);
  const { data, loading } = useQuery(async () => ({ rows: await repo.withSubject(), sems: await repo.semesterSummary() }), []);
  const rows = data?.rows || [];
  const bySem = {};
  rows.forEach((r) => { (bySem[r.semester] ||= []).push(r); });

  const save = async (v) => {
    if (v.obtained > v.total) throw new Error('Marks obtained cannot exceed the total.');
    if (!(v.total > 0)) throw new Error('Total must be greater than zero.');
    const row = { subject_id: v.subject_id, kind: v.kind || 'internal', title: v.title.trim(), obtained: v.obtained, total: v.total, semester: v.semester || '1' };
    if (editing?.id) await repo.update(editing.id, row); else await repo.insert(row);
  };

  return (
    <Screen title="Marks" subtitle="Internal, practical and theory performance" fab={<Fab onPress={() => setEditing({ kind: 'internal', semester: '1' })} label="Add marks" />}>
      {loading && !data ? <Loading /> : !rows.length ? (
        <EmptyState icon="trophy-outline" title="No marks recorded" text="Add marks to see subject and semester performance." action="Add marks" onAction={() => setEditing({ kind: 'internal', semester: '1' })} />
      ) : (
        <>
          {data.sems.length ? (
            <Card>
              <T v="caption" muted>SEMESTER PERFORMANCE</T>
              <View style={{ marginTop: 12 }}>
                <BarChart height={100} maxOverride={100} data={data.sems.map((s) => ({ label: `S${s.semester}`, value: Math.round(pc(s.obtained, s.total)) }))} format={(v) => `${v}%`} />
              </View>
            </Card>
          ) : null}
          {Object.keys(bySem).sort().reverse().map((sem) => {
            const list = bySem[sem];
            const o = list.reduce((a, r) => a + r.obtained, 0), tt = list.reduce((a, r) => a + r.total, 0);
            return (
              <View key={sem}>
                <SectionHeader title={`Semester ${sem} · ${pc(o, tt).toFixed(1)}%`} />
                <Card pad={false} style={{ paddingHorizontal: 16 }}>
                  {list.map((r) => (
                    <Row key={r.id} title={`${r.subject_name} — ${r.title}`} subtitle={r.kind} onPress={() => setEditing(r)}
                      right={<View style={{ alignItems: 'flex-end' }}><T style={{ fontWeight: '700' }}>{r.obtained}/{r.total}</T><T v="small" muted>{pc(r.obtained, r.total).toFixed(0)}%</T></View>} />
                  ))}
                </Card>
              </View>
            );
          })}
        </>
      )}
      <FormSheet visible={!!editing} title={editing?.id ? 'Edit marks' : 'Add marks'} fields={FIELDS} initial={editing || {}} onSubmit={save} onClose={() => setEditing(null)}
        onDelete={editing?.id ? async () => { if (!(await confirm('Delete entry?', editing.title, { destructive: true, confirmText: 'Delete' }))) throw new Error('Cancelled'); await repo.remove(editing.id); } : undefined} />
    </Screen>
  );
}
