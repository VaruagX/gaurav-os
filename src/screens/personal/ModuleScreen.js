import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Screen, Card, T, Row, Badge, EmptyState, Fab, Loading, Stat, Input, ProgressBar, Button } from '../../components/ui';
import FormSheet from '../../components/FormSheet';
import { useQuery } from '../../hooks/useQuery';
import { MODULES } from './modules';
import { confirm, attempt } from '../../utils/ui';

/** Generic list + form screen for the config-driven personal modules. */
export default function ModuleScreen() {
  const { params } = useRoute();
  const cfg = MODULES[params.module];
  const [editing, setEditing] = useState(null);
  useEffect(() => { if (params?.add) setEditing(MODULES[params.module]?.defaults?.() || {}); }, [params?.add]); // eslint-disable-line react-hooks/exhaustive-deps
  const [q, setQ] = useState('');
  const { data, loading } = useQuery(() => (cfg.load ? cfg.load() : cfg.repo.list()), [params.module], []);

  const rows = (cfg.sort ? cfg.sort(data) : data).filter((r) => {
    if (!q.trim()) return true;
    const it = cfg.item(r);
    return `${it.title} ${it.subtitle || ''}`.toLowerCase().includes(q.toLowerCase());
  });
  const stats = cfg.summary ? cfg.summary(data) : [];

  const save = async (v) => {
    const row = cfg.toRow(v);
    if (editing?.id) await cfg.repo.update(editing.id, row); else await cfg.repo.insert(row);
  };

  return (
    <Screen title={cfg.title} fab={<Fab onPress={() => setEditing(cfg.defaults())} label={`Add to ${cfg.title}`} />}>
      {stats.length ? <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>{stats.map((s) => <Stat key={s.label} label={s.label} value={String(s.value)} sub={s.sub} />)}</View> : null}
      {cfg.searchable && data.length ? <Input placeholder="Search…" value={q} onChangeText={setQ} /> : null}
      {loading && !data.length ? <Loading /> : !data.length ? (
        <EmptyState icon={cfg.icon} title={cfg.empty.title} text={cfg.empty.text} action="Add" onAction={() => setEditing(cfg.defaults())} />
      ) : (
        <Card pad={false} style={{ paddingHorizontal: 16 }}>
          {rows.map((r) => {
            const it = cfg.item(r);
            const acts = (cfg.actions || []).filter((a) => !a.when || a.when(r));
            return (
              <View key={r.id}>
                <Row title={it.title} subtitle={it.subtitle} onPress={() => setEditing(r)}
                  right={<View style={{ alignItems: 'flex-end', gap: 6 }}>
                    {it.badge ? <Badge label={it.badge} tone={/OVERDUE|PAST|EXPIRING|UNSOLVED/.test(it.badge) ? 'danger' : /SOON/.test(it.badge) ? 'warning' : 'neutral'} /> : null}
                    {acts.map((a) => <Button key={a.label} small variant="secondary" title={a.label} icon={a.icon} onPress={() => attempt(() => a.run(r))} />)}
                  </View>} />
                {it.progress !== undefined ? <ProgressBar value={it.progress} style={{ marginBottom: 10 }} /> : null}
              </View>
            );
          })}
        </Card>
      )}
      <FormSheet visible={!!editing} title={editing?.id ? `Edit` : `New`} fields={cfg.fields} initial={editing || {}} onSubmit={save} onClose={() => setEditing(null)}
        onDelete={editing?.id ? async () => { if (!(await confirm('Delete this entry?', 'This cannot be undone.', { destructive: true, confirmText: 'Delete' }))) throw new Error('Cancelled'); await cfg.repo.remove(editing.id); } : undefined} />
    </Screen>
  );
}
