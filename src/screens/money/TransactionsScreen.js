import React, { useMemo, useState } from 'react';
import { View, SectionList, ScrollView } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { T, Input, Chip, Sheet, Button, DateField, ScreenHeader, Fab, EmptyState, Card, IconButton } from '../../components/ui';
import { useTheme, space } from '../../theme';
import { useQuery } from '../../hooks/useQuery';
import { expenseRepository as X } from '../../database/repositories';
import { PAYMENT_METHODS, methodLabel, monthKeyOf, monthRange, shiftMonth } from '../../services/expenses/finance';
import { formatPaise } from '../../services/khata/money';
import { fmtDateLong, parseDateStr, todayStr, addDaysStr } from '../../utils/date';
import TxRow from '../../components/finance/TxRow';
import QuickAddSheet from './QuickAddSheet';
import TransactionDetailSheet from './TransactionDetailSheet';
import { Alert } from 'react-native';

const DATE_PRESETS = () => {
  const cur = monthKeyOf(new Date()), last = shiftMonth(cur, -1);
  return [
    { id: 'all', label: 'All time', from: null, to: null }, { id: 'month', label: 'This month', ...monthRange(cur) },
    { id: 'last', label: 'Last month', ...monthRange(last) }, { id: '7', label: 'Last 7 days', from: addDaysStr(todayStr(), -6), to: todayStr() },
    { id: '30', label: 'Last 30 days', from: addDaysStr(todayStr(), -29), to: todayStr() },
  ];
};

export default function TransactionsScreen() {
  const t = useTheme();
  const { params } = useRoute();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState(params?.kind || null);
  const [categoryId, setCategoryId] = useState(params?.categoryId || null);
  const [method, setMethod] = useState(null);
  const [range, setRange] = useState({ from: params?.from || null, to: params?.to || null });
  const [sheet, setSheet] = useState(null); // 'category' | 'method' | 'date'
  const [detail, setDetail] = useState(null);
  const [add, setAdd] = useState(null);
  const filters = { search, kind, categoryId, method, from: range.from, to: range.to };
  const { data: rows } = useQuery(() => X.list({ ...filters, limit: 1000 }), [search, kind, categoryId, method, range.from, range.to], []);
  const { data: cats } = useQuery(async () => [...(await X.categories('expense')), ...(await X.categories('income'))], [], []);

  const income = rows.filter((r) => r.kind === 'income').reduce((a, r) => a + r.amount_paise, 0);
  const expense = rows.filter((r) => r.kind === 'expense').reduce((a, r) => a + r.amount_paise, 0);
  const sections = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => { if (!m.has(r.date)) m.set(r.date, []); m.get(r.date).push(r); });
    return [...m.entries()].map(([date, data]) => ({ date, data, net: data.reduce((a, r) => a + (r.kind === 'income' ? r.amount_paise : -r.amount_paise), 0) }));
  }, [rows]);

  const active = !!(kind || categoryId || method || range.from || search);
  const clear = () => { setSearch(''); setKind(null); setCategoryId(null); setMethod(null); setRange({ from: null, to: null }); };
  const catName = categoryId === 'none' ? 'Uncategorised' : cats.find((c) => c.id === categoryId)?.name;
  const preset = DATE_PRESETS().find((p) => p.from === range.from && p.to === range.to);
  const dateLabel = !range.from ? 'Date' : preset ? preset.label : `${range.from} → ${range.to}`;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: space.lg }}>
        <ScreenHeader title="Transactions" subtitle={`${rows.length} ${rows.length === 1 ? 'transaction' : 'transactions'}`} />
        <Input placeholder="Search note, category or amount" value={search} onChangeText={setSearch} autoCorrect={false} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
          <Chip label="All" selected={!kind} onPress={() => setKind(null)} small />
          <Chip label="Expenses" selected={kind === 'expense'} onPress={() => setKind(kind === 'expense' ? null : 'expense')} small />
          <Chip label="Income" selected={kind === 'income'} onPress={() => setKind(kind === 'income' ? null : 'income')} small />
          <Chip label={catName || 'Category'} icon="pricetag-outline" selected={!!categoryId} onPress={() => setSheet('category')} small />
          <Chip label={method ? methodLabel(method) : 'Payment'} icon="card-outline" selected={!!method} onPress={() => setSheet('method')} small />
          <Chip label={dateLabel} icon="calendar-outline" selected={!!range.from} onPress={() => setSheet('date')} small />
          {active ? <Chip label="Clear" icon="close" onPress={clear} small /> : null}
        </ScrollView>
        {rows.length ? (
          <View style={{ flexDirection: 'row', gap: 16, paddingBottom: 8 }}>
            <T v="small" muted>In <T v="small" color={t.success} style={{ fontWeight: '700' }}>{formatPaise(income)}</T></T>
            <T v="small" muted>Out <T v="small" style={{ fontWeight: '700' }}>{formatPaise(expense)}</T></T>
            <T v="small" muted>Net <T v="small" style={{ fontWeight: '700' }} color={income - expense >= 0 ? t.success : t.danger}>{formatPaise(income - expense, { sign: true })}</T></T>
          </View>
        ) : null}
      </View>

      <SectionList sections={sections} keyExtractor={(r) => String(r.id)} stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 160 }}
        ListEmptyComponent={<EmptyState icon="search-outline" title={active ? 'No matching transactions' : 'No transactions yet'} text={active ? 'Try changing or clearing the filters.' : 'Tap + to add your first one.'} action={active ? 'Clear filters' : undefined} onAction={clear} />}
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 4 }}>
            <T v="caption" muted>{fmtDateLong(parseDateStr(section.date)).toUpperCase()}</T>
            <T v="small" muted>{formatPaise(section.net, { sign: true })}</T>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <View style={{ backgroundColor: t.glass, paddingHorizontal: 14, borderTopLeftRadius: index === 0 ? 16 : 0, borderTopRightRadius: index === 0 ? 16 : 0, borderBottomLeftRadius: index === section.data.length - 1 ? 16 : 0, borderBottomRightRadius: index === section.data.length - 1 ? 16 : 0 }}>
            <TxRow tx={item} onPress={() => setDetail(item)} />
          </View>
        )} />

      <Fab onPress={() => setAdd({ kind: 'expense' })} label="Add transaction" bottom={28} />

      <Sheet visible={sheet === 'category'} title="Category" onClose={() => setSheet(null)}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="All categories" selected={!categoryId} onPress={() => { setCategoryId(null); setSheet(null); }} />
          <Chip label="Uncategorised" selected={categoryId === 'none'} onPress={() => { setCategoryId('none'); setSheet(null); }} />
          {cats.map((c) => <Chip key={c.id} label={c.name} selected={categoryId === c.id} onPress={() => { setCategoryId(c.id); setSheet(null); }} />)}
        </View>
      </Sheet>
      <Sheet visible={sheet === 'method'} title="Payment method" onClose={() => setSheet(null)}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="Any" selected={!method} onPress={() => { setMethod(null); setSheet(null); }} />
          {PAYMENT_METHODS.map((m) => <Chip key={m.id} label={m.label} icon={m.icon} selected={method === m.id} onPress={() => { setMethod(m.id); setSheet(null); }} />)}
        </View>
      </Sheet>
      <Sheet visible={sheet === 'date'} title="Date" onClose={() => setSheet(null)} footer={<Button title="Done" onPress={() => setSheet(null)} />}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {DATE_PRESETS().map((p) => <Chip key={p.id} label={p.label} selected={range.from === p.from && range.to === p.to} onPress={() => { setRange({ from: p.from, to: p.to }); if (p.id !== 'all') setSheet(null); else setSheet(null); }} />)}
        </View>
        <T v="caption" muted style={{ marginBottom: 6 }}>CUSTOM RANGE</T>
        <DateField label="From" value={range.from} onChange={(d) => setRange({ from: d, to: range.to && d && range.to < d ? d : range.to || d })} allowClear />
        <DateField label="To" value={range.to} onChange={(d) => setRange({ from: range.from && d && range.from > d ? d : range.from || d, to: d })} allowClear />
      </Sheet>

      <TransactionDetailSheet tx={detail} onClose={() => setDetail(null)} onEdit={(tx) => { setDetail(null); setAdd({ entry: tx }); }} />
      <QuickAddSheet visible={!!add} entry={add?.entry} defaultKind={add?.kind} onClose={() => setAdd(null)} onSaved={(a) => a?.length && Alert.alert(a[0].title, a.map((x) => x.text).join('\n'))} />
    </SafeAreaView>
  );
}
