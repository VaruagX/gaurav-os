import React, { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Native from '../../../modules/reminder-native';
import { Screen, Card, T, Icon, Row, Chip, Input, Button, Stat, EmptyState, SectionHeader, Loading, Sheet, Badge } from '../../components/ui';
import { useTheme, space } from '../../theme';
import { useQuery } from '../../hooks/useQuery';
import { khataRepository as K, DuplicateContactError } from '../../database/repositories';
import { formatPaise, TYPE_LABEL } from '../../services/khata/money';
import { allKhataModel, exportPdf } from '../../services/khata/exports';
import { exportLedgerCsv } from '../../services/khata/ledgerExport';
import { timeAgo } from '../../services/khata/format';
import { AnimatedBar, BarChart } from '../../components/finance/charts';
import { fmtDateStr, todayStr } from '../../utils/date';
import { showError, toast, confirm } from '../../utils/ui';

const initials = (n) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

export function Avatar({ name, size = 40 }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <T style={{ fontWeight: '700', fontSize: size * 0.38 }}>{initials(name)}</T>
    </View>
  );
}

const SORTS = [{ id: 'amount', label: 'Biggest' }, { id: 'overdue', label: 'Overdue first' }, { id: 'recent', label: 'Recent' }, { id: 'name', label: 'Name' }];
const FILTERS = [{ id: 'all', label: 'All' }, { id: 'lena', label: 'Lena' }, { id: 'dena', label: 'Dena' }, { id: 'overdue', label: 'Overdue' }, { id: 'nophone', label: 'No phone' }];

export function sortPeople(list, sort) {
  const a = [...list];
  if (sort === 'name') return a.sort((x, y) => x.name.localeCompare(y.name));
  if (sort === 'recent') return a.sort((x, y) => (y.last_date || '').localeCompare(x.last_date || ''));
  if (sort === 'overdue') return a.sort((x, y) => (y.overdueP > 0) - (x.overdueP > 0) || y.overdueP - x.overdueP || Math.abs(y.net_paise) - Math.abs(x.net_paise));
  return a.sort((x, y) => (x.net_paise === 0) - (y.net_paise === 0) || Math.abs(y.net_paise) - Math.abs(x.net_paise));
}

export default function KhataScreen() {
  const nav = useNavigation();
  const t = useTheme();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('amount');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', androidContactId: null });
  const [busy, setBusy] = useState(false);

  const { data, loading } = useQuery(async () => {
    const today = todayStr();
    const [people, summary, recent, ins, last] = await Promise.all([K.listBalances(search), K.summary(), K.recent(6), K.insights(today), K.lastReminders()]);
    const enriched = people.map((p) => ({ ...p, overdueP: ins.people.get(p.id)?.overduePaise || 0, lastRemindedAt: last.get(p.id) || null }));
    return { people: enriched, summary, recent, ins };
  }, [search]);

  const s = data?.summary, ins = data?.ins;
  const list = sortPeople((data?.people || []).filter((p) => (
    filter === 'all' ? true : filter === 'lena' ? p.net_paise > 0 : filter === 'dena' ? p.net_paise < 0 : filter === 'overdue' ? p.overdueP > 0 : !String(p.phone).replace(/\D/g, ''))), sort);

  const openAdd = () => { setForm({ name: '', phone: '', androidContactId: null }); setAdding(true); };
  const choose = async () => {
    if (!Native?.pickContact) return showError(new Error('Choosing from contacts needs the installed Android app.'));
    try { const c = await Native.pickContact(); if (c) setForm({ name: c.name, phone: c.phone, androidContactId: c.contactId || null }); } catch (e) { showError(e, 'Contacts'); }
  };
  const save = async () => {
    setBusy(true);
    try {
      const r = await K.addContact(form); setAdding(false);
      if (r.restored) toast('Person restored with their history');
      nav.navigate('KhataPerson', { id: r.id });
    } catch (e) {
      if (e instanceof DuplicateContactError) {
        setAdding(false);
        if (await confirm('Already in your khata', `${e.existing.name}${e.existing.phone ? ` (${e.existing.phone})` : ''} is already saved. Open that person instead?`, { confirmText: 'Open' })) nav.navigate('KhataPerson', { id: e.existing.id });
      } else showError(e, 'Cannot add person');
    } finally { setBusy(false); }
  };
  const exportAll = async () => { try { await exportPdf(allKhataModel({ summary: s, people: data.people })); } catch (e) { showError(e, 'Export PDF'); } };
  const exportCsv = async () => { try { const n = await exportLedgerCsv(); toast(`Exported ${n} entries`); } catch (e) { showError(e, 'Export CSV'); } };

  const total = (s?.receivable || 0) + (s?.payable || 0);
  const maxTop = Math.max(1, ...(data?.people || []).map((p) => Math.abs(p.net_paise)));
  const top = [...(data?.people || [])].filter((p) => p.net_paise > 0).sort((a, b) => b.net_paise - a.net_paise).slice(0, 5);
  const agingTotal = ins ? ins.agingReceivable.reduce((a, b) => a + b.total, 0) : 0;

  return (
    <Screen title="My Khata" subtitle="Who owes whom" right={<Button small title="Add Person" icon="person-add-outline" onPress={openAdd} />}>
      {loading && !data ? <Loading /> : (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable style={{ flex: 1 }} onPress={() => setFilter(filter === 'lena' ? 'all' : 'lena')} accessibilityRole="button" accessibilityLabel="Show people who owe me">
              <View style={{ backgroundColor: t.glass, borderRadius: 16, borderWidth: filter === 'lena' ? 1.5 : 0.5, borderColor: filter === 'lena' ? t.success : t.border, padding: 14 }}>
                <T v="caption" muted>MUJHE LENA HAI</T><T v="title" color={t.success} style={{ marginTop: 4 }}>{formatPaise(s.receivable)}</T>
              </View>
            </Pressable>
            <Pressable style={{ flex: 1 }} onPress={() => setFilter(filter === 'dena' ? 'all' : 'dena')} accessibilityRole="button" accessibilityLabel="Show people I owe">
              <View style={{ backgroundColor: t.glass, borderRadius: 16, borderWidth: filter === 'dena' ? 1.5 : 0.5, borderColor: filter === 'dena' ? t.danger : t.border, padding: 14 }}>
                <T v="caption" muted>MUJHE DENA HAI</T><T v="title" color={t.danger} style={{ marginTop: 4 }}>{formatPaise(s.payable)}</T>
              </View>
            </Pressable>
          </View>

          {total > 0 ? (
            <View style={{ marginTop: 10 }}>
              <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: t.surface2 }}>
                <View style={{ flex: s.receivable, backgroundColor: t.success }} /><View style={{ flex: s.payable, backgroundColor: t.danger }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                <T v="small" muted>Net <T v="small" style={{ fontWeight: '700' }} color={s.net >= 0 ? t.success : t.danger}>{formatPaise(s.net, { sign: true })}</T> · {s.outstanding} outstanding of {s.people}</T>
                <T v="small" muted>{Math.round((s.receivable / total) * 100)}% lena</T>
              </View>
            </View>
          ) : null}

          {ins.overdue.amount > 0 ? (
            <Card onPress={() => { setFilter('overdue'); setSort('overdue'); }} accessibilityLabel="Show overdue people" style={{ marginTop: 12, borderColor: t.danger }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon name="alert-circle-outline" size={26} color={t.danger} />
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '700' }} color={t.danger}>{formatPaise(ins.overdue.amount)} overdue</T>
                  <T v="small" muted>from {ins.overdue.people} {ins.overdue.people === 1 ? 'person' : 'people'} past their due date. Tap to see who.</T>
                </View>
              </View>
            </Card>
          ) : null}

          {data.people.length ? (
            <>
              <SectionHeader title="Money you are owed" />
              <Card>
                {agingTotal === 0 ? <T muted>Nobody owes you anything right now.</T> : (
                  <>
                    <T v="small" muted style={{ marginBottom: 10 }}>How old is the money still to come ({formatPaise(agingTotal)})</T>
                    {ins.agingReceivable.map((b, i) => (
                      <View key={b.label} style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T v="small">{b.label}</T><T v="small" style={{ fontWeight: '700' }}>{formatPaise(b.total)}</T></View>
                        <AnimatedBar value={agingTotal ? b.total / agingTotal : 0} height={7} color={[t.success, t.warning, '#D9864C', t.danger][i]} style={{ marginTop: 4 }} />
                      </View>
                    ))}
                  </>
                )}
              </Card>

              {top.length ? (
                <>
                  <SectionHeader title="Biggest amounts due" />
                  <Card>
                    {top.map((p) => (
                      <Pressable key={p.id} accessibilityRole="button" onPress={() => nav.navigate('KhataPerson', { id: p.id })} style={{ marginBottom: 12 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <T v="small" numberOfLines={1} style={{ flex: 1 }}>{p.name}</T><T v="small" style={{ fontWeight: '700' }}>{formatPaise(p.net_paise)}</T>
                        </View>
                        <AnimatedBar value={p.net_paise / maxTop} height={7} color={p.overdueP > 0 ? t.danger : t.success} style={{ marginTop: 4 }} />
                      </Pressable>
                    ))}
                  </Card>
                </>
              ) : null}

              <SectionHeader title="Last 6 months" />
              <Card>
                <BarChart data={ins.trend.map((m) => ({ key: m.key, label: m.label, full: m.label, values: [m.receivable, m.payable] }))}
                  colors={[t.success, t.danger]} series={['Lena', 'Dena']} format={formatPaise} height={120} />
                {ins.collected > 0 ? <T v="small" muted style={{ marginTop: 12 }}>Collected this month: <T v="small" style={{ fontWeight: '700' }} color={t.success}>{formatPaise(ins.collected)}</T></T> : null}
              </Card>
            </>
          ) : null}

          <SectionHeader title="People" />
          <Input placeholder="Search name or phone" value={search} onChangeText={setSearch} autoCorrect={false} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
            {FILTERS.map((f) => <Chip key={f.id} label={f.label} selected={filter === f.id} onPress={() => setFilter(f.id)} small />)}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
            <T v="small" faint style={{ alignSelf: 'center' }}>Sort</T>
            {SORTS.map((o) => <Chip key={o.id} label={o.label} icon={sort === o.id ? 'checkmark' : undefined} selected={sort === o.id} onPress={() => setSort(o.id)} small />)}
          </ScrollView>

          {!list.length ? (
            <Card>
              <EmptyState icon="people-outline" title={search || filter !== 'all' ? 'No matching people' : 'Your khata is empty'}
                text={search || filter !== 'all' ? 'Try a different search or filter.' : 'Add a person, then record what they owe you or what you owe them.'}
                action={search || filter !== 'all' ? undefined : 'Add Person'} onAction={openAdd} />
            </Card>
          ) : (
            <Card pad={false} style={{ paddingHorizontal: 16 }}>
              {list.map((p) => (
                <Row key={p.id} left={<Avatar name={p.name} />} title={p.name}
                  subtitle={[p.phone || 'No phone number', p.lastRemindedAt ? `reminded ${timeAgo(p.lastRemindedAt)}` : null].filter(Boolean).join(' · ')}
                  onPress={() => nav.navigate('KhataPerson', { id: p.id })}
                  right={<View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <T style={{ fontWeight: '700' }} color={p.net_paise > 0 ? t.success : p.net_paise < 0 ? t.danger : t.textMuted}>{p.net_paise === 0 ? 'Settled' : formatPaise(Math.abs(p.net_paise))}</T>
                    {p.overdueP > 0 ? <Badge label="OVERDUE" tone="danger" /> : p.net_paise !== 0 ? <T v="small" muted>{p.net_paise > 0 ? 'Lena' : 'Dena'}</T> : null}
                  </View>} />
              ))}
            </Card>
          )}

          {data.recent.length ? (
            <>
              <SectionHeader title="Recent transactions" />
              <Card pad={false} style={{ paddingHorizontal: 16 }}>
                {data.recent.map((e) => (
                  <Row key={e.id} left={<Avatar name={e.contact_name} size={34} />} title={e.contact_name}
                    subtitle={`${TYPE_LABEL[e.type]} · ${fmtDateStr(e.date)}${e.note ? ` · ${e.note}` : ''}`}
                    onPress={() => nav.navigate('KhataPerson', { id: e.contact_id })}
                    right={<T style={{ fontWeight: '700' }} color={e.type === 'lena' || e.type === 'received' ? t.success : t.danger}>{formatPaise(e.amount_paise)}</T>} />
                ))}
              </Card>
            </>
          ) : null}

          <SectionHeader title="Export" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Summary PDF" icon="document-text-outline" variant="secondary" small onPress={exportAll} disabled={!data.people.length} style={{ flex: 1 }} />
            <Button title="Full ledger CSV" icon="download-outline" variant="secondary" small onPress={exportCsv} disabled={!data.people.length} style={{ flex: 1 }} />
          </View>
        </>
      )}

      <Sheet visible={adding} title="Add person" onClose={() => setAdding(false)} footer={<Button title="Save person" loading={busy} onPress={save} disabled={!form.name.trim()} />}>
        <Button title="Choose from contacts" icon="people-outline" variant="secondary" onPress={choose} style={{ marginBottom: 16 }} />
        <T v="small" muted style={{ marginBottom: 12 }}>…or enter details yourself:</T>
        <Input label="NAME" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="e.g. Rahul Sharma" />
        <Input label="PHONE NUMBER" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" placeholder="e.g. 98765 43210" hint="Needed for SMS and WhatsApp reminders." />
      </Sheet>
    </Screen>
  );
}
