import React, { useState } from 'react';
import { View, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Screen, Card, T, Row, Badge, EmptyState, Fab, Segmented, Checkbox, Loading, Button, ProgressBar } from '../../components/ui';
import FormSheet from '../../components/FormSheet';
import { useTheme } from '../../theme';
import { useQuery } from '../../hooks/useQuery';
import { assignmentsRepository as repo } from '../../database/repositories';
import { upsertDeadlineReminder, removeLinkedReminder } from '../../services/reminders/reminderService';
import { fmtWhen, fmtCountdown } from '../../utils/date';
import { confirm, attempt, showError } from '../../utils/ui';

const REMIND = [{ label: 'None', value: 0 }, { label: '1 hour before', value: 60 }, { label: '1 day before', value: 1440 }, { label: '2 days before', value: 2880 }];

export default function AssignmentsScreen() {
  const t = useTheme();
  const [tab, setTab] = useState('pending');
  const [editing, setEditing] = useState(null);
  const { data, loading } = useQuery(async () => ({ list: await repo.withSubject(), stats: await repo.stats() }), []);

  const fields = [
    { key: 'title', label: 'Title', required: true, placeholder: 'e.g. DBMS assignment 3' },
    { key: 'subject_id', label: 'Subject', type: 'subject' },
    { key: 'description', label: 'Details', type: 'multiline' },
    { key: 'due_at', label: 'Submission deadline', type: 'datetime', required: true },
    { key: 'remind_before_min', label: 'Deadline reminder', type: 'select', options: REMIND },
    { key: 'attachment', label: 'Attachment', type: 'text', placeholder: 'Reference or file name (use “Attach file” below)' },
  ];

  const save = async (v) => {
    const row = { title: v.title.trim(), subject_id: v.subject_id || null, description: v.description || null, due_at: v.due_at, attachment: v.attachment || null, remind_before_min: v.remind_before_min || null };
    let id = editing?.id;
    if (id) await repo.update(id, row); else id = await repo.insert({ ...row, status: 'pending' });
    const rem = row.remind_before_min && (editing?.status || 'pending') === 'pending'
      ? await upsertDeadlineReminder('assignment', id, `Due: ${row.title}`, row.due_at, row.remind_before_min, `Your assignment ${row.title} is due soon.`)
      : (await removeLinkedReminder('assignment', id), null);
    if (row.remind_before_min && !rem && (editing?.status || 'pending') === 'pending') throw new Error('Saved, but that reminder time has already passed, so no reminder was set.');
  };

  const attach = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: false });
      if (!res.canceled) setEditing((e) => ({ ...e, attachment: `${res.assets[0].name} | ${res.assets[0].uri}` }));
    } catch (e) { showError(e); }
  };

  const toggle = (a) => attempt(async () => {
    if (a.status === 'submitted') { await repo.reopen(a.id); if (a.remind_before_min) await upsertDeadlineReminder('assignment', a.id, `Due: ${a.title}`, a.due_at, a.remind_before_min, `Your assignment ${a.title} is due soon.`); }
    else { await repo.submit(a.id); await removeLinkedReminder('assignment', a.id); }
  });

  const list = (data?.list || []).filter((a) => (tab === 'pending' ? a.status === 'pending' : a.status === 'submitted'));
  const st = data?.stats;

  return (
    <Screen title="Assignments" subtitle={st ? `${st.submitted} of ${st.total} submitted` : ''} fab={<Fab onPress={() => setEditing({ remind_before_min: 1440 })} label="Add assignment" />}>
      {st?.total ? <ProgressBar value={st.submitted / st.total} style={{ marginBottom: 12 }} /> : null}
      <Segmented value={tab} onChange={setTab} options={[{ label: 'Pending', value: 'pending' }, { label: 'Submitted', value: 'submitted' }]} />
      <View style={{ height: 12 }} />
      {loading && !data ? <Loading /> : !list.length ? (
        <EmptyState icon="document-text-outline" title={tab === 'pending' ? 'No pending assignments' : 'Nothing submitted yet'} action={tab === 'pending' ? 'Add assignment' : undefined} onAction={() => setEditing({ remind_before_min: 1440 })} />
      ) : (
        <Card pad={false} style={{ paddingHorizontal: 16 }}>
          {list.map((a) => {
            const overdue = a.status === 'pending' && a.due_at < Date.now();
            return (
              <Row key={a.id} left={<Checkbox checked={a.status === 'submitted'} label={`Mark ${a.title} ${a.status === 'submitted' ? 'pending' : 'submitted'}`} onPress={() => toggle(a)} />}
                title={a.title} subtitle={`${a.subject_name || 'No subject'} · ${a.status === 'submitted' ? `submitted ${fmtWhen(a.submitted_at)}` : `due ${fmtWhen(a.due_at)}`}`}
                right={a.status === 'pending' ? (overdue ? <Badge label="OVERDUE" tone="danger" /> : <T v="small" muted>{fmtCountdown(a.due_at - Date.now())}</T>) : null}
                onPress={() => setEditing(a)} />
            );
          })}
        </Card>
      )}
      <FormSheet visible={!!editing} title={editing?.id ? 'Edit assignment' : 'New assignment'} fields={fields} initial={editing || {}} onSubmit={save} onClose={() => setEditing(null)}
        onDelete={editing?.id ? async () => { if (!(await confirm('Delete assignment?', editing.title, { destructive: true, confirmText: 'Delete' }))) throw new Error('Cancelled'); await removeLinkedReminder('assignment', editing.id); await repo.remove(editing.id); } : undefined} />
    </Screen>
  );
}
