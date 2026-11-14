import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Screen, Card, T, Row, Button, EmptyState, Fab, Loading, Segmented, ProgressBar, Badge } from '../../components/ui';
import FormSheet from '../../components/FormSheet';
import { useTheme, radius } from '../../theme';
import { useQuery } from '../../hooks/useQuery';
import { mcqRepository as repo } from '../../database/repositories';
import { attempt, confirm } from '../../utils/ui';

const L = ['A', 'B', 'C', 'D'];
const FIELDS = [
  { key: 'question', label: 'Question', type: 'multiline', required: true },
  { key: 'o0', label: 'Option A', required: true }, { key: 'o1', label: 'Option B', required: true },
  { key: 'o2', label: 'Option C' }, { key: 'o3', label: 'Option D' },
  { key: 'answer_index', label: 'Correct answer', type: 'select', options: L.map((l, i) => ({ label: l, value: i })), required: true },
  { key: 'subject_id', label: 'Subject', type: 'subject' },
  { key: 'explanation', label: 'Explanation (optional)', type: 'multiline' },
];

export default function McqScreen() {
  const t = useTheme();
  const [tab, setTab] = useState('practice');
  const [editing, setEditing] = useState(null);
  const [run, setRun] = useState(null); // {qs, i, picked, score}
  const { data, loading } = useQuery(() => repo.withSubject(), [], []);

  const start = () => attempt(async () => {
    const qs = (await repo.practiceSet(10)).map((q) => ({ ...q, opts: JSON.parse(q.options) }));
    setRun({ qs, i: 0, picked: null, score: 0 });
  });
  const pick = (idx) => {
    if (run.picked !== null) return;
    const q = run.qs[run.i];
    const ok = idx === q.answer_index;
    setRun({ ...run, picked: idx, score: run.score + (ok ? 1 : 0) });
    attempt(() => repo.recordAttempt(q.id, ok));
  };
  const save = async (v) => {
    const options = [v.o0, v.o1, v.o2, v.o3].map((o) => (o || '').trim()).filter(Boolean);
    if (options.length < 2) throw new Error('Add at least two options.');
    const ans = v.answer_index;
    if (ans === undefined || ans === null || ans >= options.length) throw new Error('The correct answer must be one of the options you entered.');
    const row = { question: v.question.trim(), options: JSON.stringify(options), answer_index: ans, explanation: v.explanation || null, subject_id: v.subject_id || null };
    if (editing?.id) await repo.update(editing.id, row); else await repo.insert({ ...row, attempts: 0, correct: 0 });
  };
  const edit = (q) => { const o = JSON.parse(q.options); setEditing({ ...q, o0: o[0], o1: o[1], o2: o[2], o3: o[3] }); };

  const q = run?.qs[run.i];
  const finished = run && run.i >= run.qs.length;

  return (
    <Screen title="MCQ practice" subtitle={data.length ? `${data.length} questions` : ''} fab={<Fab onPress={() => setEditing({ answer_index: 0 })} label="Add question" />}>
      <Segmented value={tab} onChange={(v) => { setTab(v); setRun(null); }} options={[{ label: 'Practice', value: 'practice' }, { label: 'Question bank', value: 'bank' }]} />
      <View style={{ height: 14 }} />
      {loading && !data.length ? <Loading /> : tab === 'practice' ? (
        !data.length ? <EmptyState icon="help-circle-outline" title="No questions yet" text="Add multiple-choice questions to practise." action="Add question" onAction={() => setEditing({ answer_index: 0 })} />
        : !run ? (
          <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
            <T v="heading">Ready to practise?</T>
            <T muted style={{ textAlign: 'center', marginVertical: 8 }}>10 questions, starting with the ones you get wrong most.</T>
            <Button title="Start practice" icon="play" onPress={start} />
          </Card>
        ) : finished ? (
          <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
            <T v="caption" muted>RESULT</T>
            <T v="display" style={{ marginVertical: 6 }}>{run.score}/{run.qs.length}</T>
            <T muted>{Math.round((run.score / run.qs.length) * 100)}% correct</T>
            <Button title="Practise again" onPress={start} style={{ marginTop: 16 }} />
          </Card>
        ) : (
          <>
            <ProgressBar value={run.i / run.qs.length} style={{ marginBottom: 12 }} />
            <T v="small" muted>Question {run.i + 1} of {run.qs.length}</T>
            <T v="title" style={{ marginVertical: 12 }}>{q.question}</T>
            {q.opts.map((o, idx) => {
              const shown = run.picked !== null;
              const correct = idx === q.answer_index, chosen = idx === run.picked;
              const bg = shown ? (correct ? t.success : chosen ? t.danger : t.glass) : t.glass;
              return (
                <Pressable key={idx} accessibilityRole="button" accessibilityLabel={`Option ${L[idx]}: ${o}`} onPress={() => pick(idx)}
                  style={{ padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: shown && (correct || chosen) ? bg : t.border, backgroundColor: shown && (correct || chosen) ? bg : t.surface, marginBottom: 8 }}>
                  <T color={shown && (correct || chosen) ? '#fff' : t.text}>{L[idx]}. {o}</T>
                </Pressable>
              );
            })}
            {run.picked !== null ? (
              <>
                {q.explanation ? <Card style={{ marginTop: 6 }}><T muted>{q.explanation}</T></Card> : null}
                <Button title={run.i + 1 === run.qs.length ? 'See result' : 'Next'} onPress={() => setRun({ ...run, i: run.i + 1, picked: null })} style={{ marginTop: 12 }} />
              </>
            ) : null}
          </>
        )
      ) : (
        !data.length ? <EmptyState icon="help-circle-outline" title="No questions yet" /> : (
          <Card pad={false} style={{ paddingHorizontal: 16 }}>
            {data.map((x) => <Row key={x.id} title={x.question} subtitle={`${x.subject_name || 'General'} · ${x.attempts ? `${Math.round((x.correct / x.attempts) * 100)}% of ${x.attempts}` : 'not attempted'}`} onPress={() => edit(x)} />)}
          </Card>
        )
      )}
      <FormSheet visible={!!editing} title={editing?.id ? 'Edit question' : 'New question'} fields={FIELDS} initial={editing || {}} onSubmit={save} onClose={() => setEditing(null)}
        onDelete={editing?.id ? async () => { if (!(await confirm('Delete question?', editing.question, { destructive: true, confirmText: 'Delete' }))) throw new Error('Cancelled'); await repo.remove(editing.id); } : undefined} />
    </Screen>
  );
}
