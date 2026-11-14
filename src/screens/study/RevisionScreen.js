import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen, Card, T, Row, Button, EmptyState, Fab, Loading, Badge, SectionHeader } from '../../components/ui';
import FormSheet from '../../components/FormSheet';
import { useQuery } from '../../hooks/useQuery';
import { revisionsRepository as repo, syllabusRepository } from '../../database/repositories';
import { nextRevision, firstRevisionDate, REVISION_INTERVALS } from '../../services/study/spaced';
import { todayStr, fmtDateStr } from '../../utils/date';
import { attempt, toast, confirm } from '../../utils/ui';

const FIELDS = [
  { key: 'topic', label: 'Topic to revise', required: true, placeholder: 'e.g. DBMS — transactions' },
  { key: 'subject_id', label: 'Subject', type: 'subject' },
];

export default function RevisionScreen() {
  const [editing, setEditing] = useState(null);
  const { data, loading } = useQuery(() => repo.active(), [], []);
  const today = todayStr();
  const due = data.filter((r) => r.next_date <= today), later = data.filter((r) => r.next_date > today);

  const revised = (r) => attempt(async () => {
    const n = nextRevision(r.stage, today);
    await repo.update(r.id, { ...n, last_done: today });
    toast(n.status === 'mastered' ? 'Mastered! Revision complete.' : `Next revision ${fmtDateStr(n.next_date)}`);
  });
  const addWeak = () => attempt(async () => {
    const weak = await syllabusRepository.weakTopics(50);
    const have = new Set(data.map((r) => `${r.subject_id}|${r.topic}`));
    let n = 0;
    for (const w of weak) if (!have.has(`${w.subject_id}|${w.title}`)) { await repo.insert({ subject_id: w.subject_id, topic: w.title, stage: 0, next_date: firstRevisionDate(today), status: 'active' }); n++; }
    toast(n ? `Added ${n} weak topic${n === 1 ? '' : 's'}` : 'No new weak topics to add');
  });

  const row = (r) => (
    <Row key={r.id} icon="refresh-circle-outline" title={r.topic} subtitle={`${r.subject_name || 'General'} · round ${r.stage + 1}/${REVISION_INTERVALS.length} · ${r.next_date <= today ? 'due' : fmtDateStr(r.next_date)}`}
      right={r.next_date <= today ? <Button small title="Revised" onPress={() => revised(r)} /> : null}
      onLongPress={async () => { if (await confirm('Remove from revision?', r.topic, { destructive: true, confirmText: 'Remove' })) repo.remove(r.id); }} />
  );

  return (
    <Screen title="Revision" subtitle="Spaced repetition: 1, 3, 7, 14, 30 days" fab={<Fab onPress={() => setEditing({})} label="Add revision topic" />}>
      {loading && !data.length ? <Loading /> : !data.length ? (
        <EmptyState icon="refresh-circle-outline" title="No revision topics" text="Add what you've just studied. The app schedules the next reviews for you." action="Add topic" onAction={() => setEditing({})} />
      ) : (
        <>
          <SectionHeader title={`Due now (${due.length})`} style={{ marginTop: 0 }} />
          <Card pad={false} style={{ paddingHorizontal: 16 }}>{due.length ? due.map(row) : <T muted style={{ paddingVertical: 12 }}>Nothing due. 🎉</T>}</Card>
          {later.length ? <><SectionHeader title="Upcoming" /><Card pad={false} style={{ paddingHorizontal: 16 }}>{later.map(row)}</Card></> : null}
          <T v="small" faint style={{ textAlign: 'center', marginTop: 10 }}>Long-press an item to remove it</T>
        </>
      )}
      <Button title="Add my weak topics" variant="secondary" small icon="flag-outline" onPress={addWeak} style={{ marginTop: 16, alignSelf: 'center' }} />
      <FormSheet visible={!!editing} title="New revision topic" fields={FIELDS} initial={editing || {}} onClose={() => setEditing(null)}
        onSubmit={(v) => repo.insert({ topic: v.topic.trim(), subject_id: v.subject_id || null, stage: 0, next_date: firstRevisionDate(today), status: 'active' })} />
    </Screen>
  );
}
