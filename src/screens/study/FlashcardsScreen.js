import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Screen, Card, T, Row, Button, EmptyState, Fab, Loading, Segmented, Badge, ProgressBar } from '../../components/ui';
import FormSheet from '../../components/FormSheet';
import { useTheme } from '../../theme';
import { useQuery } from '../../hooks/useQuery';
import { flashcardsRepository as repo } from '../../database/repositories';
import { gradeCard } from '../../services/study/spaced';
import { todayStr } from '../../utils/date';
import { attempt, confirm } from '../../utils/ui';

const FIELDS = [
  { key: 'front', label: 'Question / term', type: 'multiline', required: true },
  { key: 'back', label: 'Answer / definition', type: 'multiline', required: true },
  { key: 'subject_id', label: 'Subject', type: 'subject' },
];

export default function FlashcardsScreen() {
  const t = useTheme();
  const [tab, setTab] = useState('review');
  const [flipped, setFlipped] = useState(false);
  const [editing, setEditing] = useState(null);
  const [session, setSession] = useState({ done: 0 });
  const { data, loading } = useQuery(async () => ({ due: await repo.due(todayStr()), all: await repo.withSubject() }), []);
  const due = data?.due || [];
  const card = due[0];

  const grade = (ok) => attempt(async () => { await repo.update(card.id, gradeCard(card, ok, todayStr())); setFlipped(false); setSession((s) => ({ done: s.done + 1 })); });
  const save = async (v) => {
    const row = { front: v.front.trim(), back: v.back.trim(), subject_id: v.subject_id || null };
    if (editing?.id) await repo.update(editing.id, row); else await repo.insert({ ...row, box: 0, next_review: todayStr(), correct: 0, wrong: 0 });
  };

  return (
    <Screen title="Flashcards" subtitle={data ? `${due.length} due · ${data.all.length} total` : ''} fab={<Fab onPress={() => setEditing({})} label="Add flashcard" />}>
      <Segmented value={tab} onChange={setTab} options={[{ label: 'Review', value: 'review' }, { label: 'All cards', value: 'all' }]} />
      <View style={{ height: 14 }} />
      {loading && !data ? <Loading /> : tab === 'review' ? (
        !data.all.length ? <EmptyState icon="albums-outline" title="No flashcards" text="Create cards for definitions, formulas and key facts." action="Add flashcard" onAction={() => setEditing({})} />
        : !card ? <EmptyState icon="checkmark-circle-outline" title="All caught up" text={`Reviewed ${session.done} card${session.done === 1 ? '' : 's'} this session. Missed cards come back right away; others return on a schedule.`} />
        : (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel={flipped ? 'Answer. Tap to hide' : 'Question. Tap to show answer'} onPress={() => setFlipped((f) => !f)}>
              <Card style={{ minHeight: 220, justifyContent: 'center', alignItems: 'center' }}>
                <T v="caption" muted>{flipped ? 'ANSWER' : `QUESTION${card.subject_name ? ` · ${card.subject_name}` : ''}`}</T>
                <T v="title" style={{ textAlign: 'center', marginTop: 12 }}>{flipped ? card.back : card.front}</T>
                {!flipped ? <T v="small" faint style={{ marginTop: 18 }}>Tap to reveal</T> : null}
              </Card>
            </Pressable>
            {flipped ? (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Button title="Missed" icon="close" variant="secondary" onPress={() => grade(false)} style={{ flex: 1 }} />
                <Button title="Got it" icon="checkmark" onPress={() => grade(true)} style={{ flex: 1 }} />
              </View>
            ) : null}
            <T v="small" muted style={{ textAlign: 'center', marginTop: 12 }}>Box {card.box + 1}/5 · {due.length - 1} more after this</T>
          </>
        )
      ) : (
        !data.all.length ? <EmptyState icon="albums-outline" title="No flashcards yet" /> : (
          <Card pad={false} style={{ paddingHorizontal: 16 }}>
            {data.all.map((c) => <Row key={c.id} title={c.front} subtitle={`${c.subject_name || 'General'} · box ${c.box + 1} · ✓${c.correct} ✗${c.wrong}`} onPress={() => setEditing(c)} />)}
          </Card>
        )
      )}
      <FormSheet visible={!!editing} title={editing?.id ? 'Edit flashcard' : 'New flashcard'} fields={FIELDS} initial={editing || {}} onSubmit={save} onClose={() => setEditing(null)}
        onDelete={editing?.id ? async () => { if (!(await confirm('Delete card?', editing.front, { destructive: true, confirmText: 'Delete' }))) throw new Error('Cancelled'); await repo.remove(editing.id); } : undefined} />
    </Screen>
  );
}
