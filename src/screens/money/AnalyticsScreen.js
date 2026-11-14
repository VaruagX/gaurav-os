import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen, Card, T, Chip, DateField, SectionHeader, Stat, EmptyState, Loading, Segmented } from '../../components/ui';
import { useTheme } from '../../theme';
import { useQuery } from '../../hooks/useQuery';
import { expenseRepository as X } from '../../database/repositories';
import { bucketize, monthKeyOf, monthRange, shiftMonth, eachDay } from '../../services/expenses/finance';
import { formatPaise } from '../../services/khata/money';
import { BarChart, DonutChart } from '../../components/finance/charts';
import { todayStr, addDaysStr, parseDateStr, MONTHS, fmtDateStr } from '../../utils/date';

const PRESETS = [
  { id: '7', label: '7 days' }, { id: '30', label: '30 days' }, { id: '90', label: '90 days' },
  { id: 'month', label: 'This month' }, { id: 'last', label: 'Last month' }, { id: 'year', label: 'This year' }, { id: 'custom', label: 'Custom' },
];

function rangeFor(id, custom) {
  const today = todayStr(), cur = monthKeyOf(new Date());
  switch (id) {
    case '7': return { from: addDaysStr(today, -6), to: today };
    case '30': return { from: addDaysStr(today, -29), to: today };
    case '90': return { from: addDaysStr(today, -89), to: today };
    case 'month': return monthRange(cur);
    case 'last': return monthRange(shiftMonth(cur, -1));
    case 'year': return { from: `${cur.slice(0, 4)}-01-01`, to: today };
    default: return custom;
  }
}
const defaultGran = (from, to) => { const n = eachDay(from, to).length; return n <= 31 ? 'day' : n <= 120 ? 'week' : 'month'; };

export default function AnalyticsScreen() {
  const nav = useNavigation();
  const t = useTheme();
  const [preset, setPreset] = useState('30');
  const [custom, setCustom] = useState({ from: addDaysStr(todayStr(), -13), to: todayStr() });
  const [gran, setGran] = useState(null);
  const [selCat, setSelCat] = useState(null);
  const range = rangeFor(preset, custom);
  const valid = range.from && range.to && range.from <= range.to && eachDay(range.from, range.to).length <= 800;
  const g = gran || (valid ? defaultGran(range.from, range.to) : 'day');

  const { data, loading } = useQuery(async () => {
    if (!valid) return null;
    const [totals, cats, daily] = await Promise.all([X.totals(range.from, range.to), X.byCategory(range.from, range.to), X.daily(range.from, range.to)]);
    return { totals, cats, daily };
  }, [range.from, range.to]);

  const buckets = data ? bucketize(data.daily, range.from, range.to, g) : [];
  const days = valid ? eachDay(range.from, range.to).length : 0;
  const bucketLabel = (b) => {
    const s = parseDateStr(b.start), e = parseDateStr(b.end);
    return g === 'day' ? `${s.getDate()} ${MONTHS[s.getMonth()]}` : g === 'week' ? `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]}` : `${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
  };
  const spendBars = buckets.map((b) => ({ key: b.key, label: b.label, full: bucketLabel(b), values: [b.expense] }));
  const cmpBars = buckets.map((b) => ({ key: b.key, label: b.label, full: bucketLabel(b), values: [b.income, b.expense] }));
  const every = Math.max(1, Math.ceil(buckets.length / 8));
  const top = buckets.length ? buckets.reduce((a, b) => (b.expense > a.expense ? b : a), buckets[0]) : null;
  const total = data?.totals.expense || 0;
  const cats = data?.cats || [];
  const donut = cats.slice(0, 7).concat(cats.length > 7 ? [{ name: 'Others', color: t.textFaint, total: cats.slice(7).reduce((a, c) => a + c.total, 0) }] : []);

  return (
    <Screen title="Analytics" subtitle={valid ? `${fmtDateStr(range.from)} – ${fmtDateStr(range.to)} · ${days} days` : 'Pick a valid date range'}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {PRESETS.map((p) => <Chip key={p.id} label={p.label} selected={preset === p.id} onPress={() => { setPreset(p.id); setGran(null); setSelCat(null); }} small />)}
      </View>
      {preset === 'custom' ? (
        <View style={{ marginTop: 12 }}>
          <DateField label="From" value={custom.from} onChange={(d) => setCustom({ ...custom, from: d || custom.from })} />
          <DateField label="To" value={custom.to} onChange={(d) => setCustom({ ...custom, to: d || custom.to })} />
          {!valid ? <T color={t.danger} v="small">“From” must be on or before “To” (max ~2 years).</T> : null}
        </View>
      ) : null}

      {!valid ? null : loading && !data ? <Loading /> : (
        <>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Stat label="SPENT" value={formatPaise(data.totals.expense)} sub={`${formatPaise(Math.round(data.totals.expense / days))} / day`} />
            <Stat label="EARNED" value={formatPaise(data.totals.income)} sub={`${data.totals.count} transactions`} />
          </View>

          <SectionHeader title="Spending over time" />
          <Segmented value={g} onChange={setGran} options={[{ label: 'Daily', value: 'day' }, { label: 'Weekly', value: 'week' }, { label: 'Monthly', value: 'month' }]} />
          <Card style={{ marginTop: 10 }}>
            {data.totals.expense === 0 ? <T muted>No spending in this period.</T> : (
              <>
                <BarChart data={spendBars} colors={[t.primary]} format={formatPaise} labelEvery={every} height={150} />
                {top && top.expense > 0 ? <T v="small" muted style={{ marginTop: 12 }}>Highest {g === 'day' ? 'day' : g === 'week' ? 'week' : 'month'}: {bucketLabel(top)} — {formatPaise(top.expense)}.</T> : null}
              </>
            )}
          </Card>

          <SectionHeader title="Income vs expenses" />
          <Card>
            {data.totals.expense === 0 && data.totals.income === 0 ? <T muted>No income or spending in this period.</T> : (
              <>
                <BarChart data={cmpBars} colors={[t.success, t.danger]} series={['Income', 'Expense']} format={formatPaise} labelEvery={every} height={150} />
                <T v="small" muted style={{ marginTop: 12 }}>{data.totals.income >= data.totals.expense ? `You kept ${formatPaise(data.totals.income - data.totals.expense)} more than you spent.` : `You spent ${formatPaise(data.totals.expense - data.totals.income)} more than you earned.`}</T>
              </>
            )}
          </Card>

          <SectionHeader title="By category" />
          <Card>
            {!donut.length ? <T muted>No spending in this period.</T> : (
              <>
                <View style={{ alignItems: 'center', marginBottom: 12 }}>
                  <DonutChart data={donut} size={190} thickness={26} selected={selCat} onSelect={setSelCat}
                    center={<><T v="small" muted>{selCat !== null ? donut[selCat].name : 'Total'}</T><T style={{ fontWeight: '700', fontSize: 18 }}>{formatPaise(selCat !== null ? donut[selCat].total : total)}</T>{selCat !== null ? <T v="small" muted>{Math.round((donut[selCat].total / total) * 100)}%</T> : null}</>} />
                </View>
                {donut.map((c, i) => (
                  <Pressable key={`${c.name}${i}`} accessibilityRole="button" onPress={() => (c.category_id ? nav.navigate('ExpenseTransactions', { categoryId: c.category_id, from: range.from, to: range.to, kind: 'expense' }) : setSelCat(selCat === i ? null : i))}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, opacity: selCat === null || selCat === i ? 1 : 0.4 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.color }} />
                    <T style={{ flex: 1 }}>{c.name}</T>
                    <T muted>{Math.round((c.total / total) * 100)}%</T>
                    <T style={{ fontWeight: '700', minWidth: 80, textAlign: 'right' }}>{formatPaise(c.total)}</T>
                  </Pressable>
                ))}
                <T v="small" faint style={{ marginTop: 6 }}>Tap a category to see its transactions.</T>
              </>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
