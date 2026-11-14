import React from 'react';
import { Screen, Card, Row, EmptyState, Button, Loading, Badge } from '../components/ui';
import { useQuery } from '../hooks/useQuery';
import { remindersRepository as repo } from '../database/repositories';
import { fmtDateTime } from '../utils/date';
import { confirm, attempt } from '../utils/ui';

const LABEL = { fired: 'Fired', completed: 'Completed', snoozed: 'Snoozed', stopped: 'Stopped', missed: 'Missed', voice_failed: 'Voice failed' };
const TONE = { fired: 'neutral', completed: 'success', snoozed: 'warning', stopped: 'neutral', missed: 'danger', voice_failed: 'danger' };

export default function ReminderHistoryScreen() {
  const { data, loading } = useQuery(() => repo.history(200), [], []);
  return (
    <Screen title="Reminder history" subtitle="What actually happened on this phone">
      {loading && !data.length ? <Loading /> : !data.length ? (
        <EmptyState icon="time-outline" title="No history yet" text="Fired, completed and snoozed reminders are logged here." />
      ) : (
        <Card pad={false} style={{ paddingHorizontal: 16 }}>
          {data.map((h) => (
            <Row key={h.id} title={h.title} subtitle={`${fmtDateTime(h.at)}${h.detail ? ` · ${h.detail}` : ''}`} right={<Badge label={LABEL[h.event] || h.event} tone={TONE[h.event]} />} />
          ))}
        </Card>
      )}
      {data.length ? <Button title="Clear history" variant="danger" small style={{ marginTop: 16, alignSelf: 'center' }}
        onPress={async () => { if (await confirm('Clear history?', 'This removes all reminder history entries.', { destructive: true, confirmText: 'Clear' })) attempt(() => repo.clearHistory()); }} /> : null}
    </Screen>
  );
}
