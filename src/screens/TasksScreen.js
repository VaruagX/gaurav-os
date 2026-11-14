import React, { useEffect, useState } from 'react';
import { useRoute } from '@react-navigation/native';
import { View } from 'react-native';
import { Screen, Card, Row, Checkbox, Badge, EmptyState, Fab, Segmented, Loading, SectionHeader, T, Button } from '../components/ui';
import FormSheet from '../components/FormSheet';
import { useQuery } from '../hooks/useQuery';
import { tasksRepository as repo, categoriesRepository } from '../database/repositories';
import { fmtWhen } from '../utils/date';
import { confirm, attempt } from '../utils/ui';

const FIELDS = [
  { key: 'title', label: 'Task', required: true, placeholder: 'e.g. Submit DBMS journal' },
  { key: 'notes', label: 'Notes', type: 'multiline' },
  { key: 'priority', label: 'Priority', type: 'segmented', options: [{ label: 'Low', value: 0 }, { label: 'Normal', value: 1 }, { label: 'High', value: 2 }] },
  { key: 'due_at', label: 'Due (optional)', type: 'datetime' },
  { key: 'category_id', label: 'Category', type: 'category', kind: 'task' },
];

export default function TasksScreen() {
  const [tab, setTab] = useState('pending');
  const [editing, setEditing] = useState(null);
  const { params } = useRoute();
  useEffect(() => { if (params?.add) setEditing({ priority: 1 }); }, [params?.add]);
  const { data, loading } = useQuery(async () => ({ pending: await repo.pending(300), done: await repo.completed(100) }), []);
  const list = data ? data[tab] : [];

  const save = async (v) => {
    const row = { title: v.title.trim(), notes: v.notes || null, priority: v.priority ?? 1, due_at: v.due_at || null, category_id: v.category_id || null };
    if (editing?.id) await repo.update(editing.id, row); else await repo.insert(row);
  };

  return (
    <Screen title="Tasks" subtitle={data ? `${data.pending.length} pending` : ''} fab={<Fab onPress={() => setEditing({ priority: 1 })} label="Add task" />}>
      <Segmented value={tab} onChange={setTab} options={[{ label: 'Pending', value: 'pending' }, { label: 'Completed', value: 'done' }]} />
      <View style={{ height: 12 }} />
      {loading ? <Loading /> : !list.length ? (
        <EmptyState icon="checkbox-outline" title={tab === 'pending' ? 'No pending tasks' : 'Nothing completed yet'}
          text={tab === 'pending' ? 'Add a task to start planning your day.' : 'Completed tasks appear here.'}
          action={tab === 'pending' ? 'Add task' : undefined} onAction={() => setEditing({ priority: 1 })} />
      ) : (
        <Card pad={false} style={{ paddingHorizontal: 16 }}>
          {list.map((x) => (
            <Row key={x.id}
              left={<Checkbox checked={x.status === 'done'} label={`Complete ${x.title}`} onPress={() => (x.status === 'done' ? repo.reopen(x.id) : repo.complete(x.id))} />}
              title={x.title}
              subtitle={[x.category, x.due_at ? `Due ${fmtWhen(x.due_at)}` : null, x.notes].filter(Boolean).join(' · ') || undefined}
              right={x.priority === 2 && x.status !== 'done' ? <Badge label="HIGH" tone="danger" /> : null}
              onPress={() => setEditing(x)} />
          ))}
        </Card>
      )}
      {tab === 'done' && list.length ? <Button title="Clear completed" variant="danger" small style={{ marginTop: 16, alignSelf: 'center' }}
        onPress={async () => { if (await confirm('Clear completed tasks?', 'This permanently deletes all completed tasks.', { destructive: true, confirmText: 'Delete' })) attempt(() => repo.clearCompleted()); }} /> : null}
      <FormSheet visible={!!editing} title={editing?.id ? 'Edit task' : 'New task'} fields={FIELDS} initial={editing || {}}
        onSubmit={save} onClose={() => setEditing(null)}
        onDelete={editing?.id ? async () => { if (await confirm('Delete task?', editing.title, { destructive: true, confirmText: 'Delete' })) await repo.remove(editing.id); else throw new Error('Cancelled'); } : undefined} />
    </Screen>
  );
}
