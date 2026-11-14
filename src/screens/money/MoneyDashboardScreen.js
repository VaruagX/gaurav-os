import React, { useEffect, useState } from 'react';
import { useRoute } from '@react-navigation/native';
import { View, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen, Card, T, Icon, IconButton, Button, Chip, Fab, SectionHeader, EmptyState, Loading, Badge, Sheet, Input } from '../../components/ui';
import { useTheme, space, radius } from '../../theme';
import { useQuery } from '../../hooks/useQuery';
import { expenseRepository as X } from '../../database/repositories';
import {
  monthKeyOf, shiftMonth, monthRange, monthLabel, daysInMonth, cumulative, changePct, monthSummary, budgetState, buildInsights,
} from '../../services/expenses/finance';
import { formatPaise, parseRupees, paiseToInput } from '../../services/khata/money';
import { AnimatedNumber, AnimatedBar, DonutChart, TrendChart } from '../../components/finance/charts';
import TxRow from '../../components/finance/TxRow';
import QuickAddSheet from './QuickAddSheet';
import TransactionDetailSheet from './TransactionDetailSheet';
import { showError, toast } from '../../utils/ui';
import { Alert } from 'react-native';

async function load(month) {
  const today = new Date();
  const cur = monthKeyOf(today), prev = shiftMonth(month, -1);
  const isCurrent = month === cur, isFuture = month > cur;
  const dim = daysInMonth(month);
  const daysElapsed = isCurrent ? today.getDate() : isFuture ? 0 : dim;
  const daysLeft = isCurrent ? dim - today.getDate() : isFuture ? dim : 0;
  const r = monthRange(month), pr = monthRange(prev);
  const [totals, prevTotals, balance, cats, daily, prevDaily, biggest, wd, methods, prevSame, budget, recent, anyRows] = await Promise.all([
    X.totals(r.from, r.to), X.totals(pr.from, pr.to), X.balance(), X.byCategory(r.from, r.to), X.daily(r.from, r.to), X.daily(pr.from, pr.to),
    X.biggestExpense(r.from, r.to), X.weekdayTotals(r.from, r.to), X.methodTotals(r.from, r.to),
    X.spentThroughDay(prev, isCurrent ? today.getDate() : dim), X.budgetStatus(month), X.list({ limit: 5 }), X.list({ limit: 1 }),
  ]);
  const summary = monthSummary(totals);
  const insights = buildInsights({
    month, monthName: monthLabel(month).split(' ')[0], expense: totals.expense, byCategory: cats, biggest, prevSameDaySpent: prevSame, prevMonthSpent: prevTotals.expense,
    budget: budget.overall, weekdayTotals: wd, methodTotals: methods, daysElapsed, daysLeft,
  });
  return {
    month, isCurrent, isFuture, dim, daysElapsed, totals, prevTotals, summary, balance, cats, budget, recent, insights, hasData: anyRows.length > 0,
    cumCur: cumulative(daily, month), cumPrev: cumulative(prevDaily, prev),
    incomeChange: changePct(totals.income, prevTotals.income), expenseChange: changePct(totals.expense, prevSame),
    prevSummary: monthSummary(prevTotals),
  };
}

const Delta = ({ pct, goodWhenDown, onDark }) => {
  const t = useTheme();
  if (pct === null || pct === undefined) return <T v="small" style={{ opacity: 0.7 }} color={onDark ? t.onPrimary : t.textMuted}>no data last month</T>;
  const up = pct > 0, flat = pct === 0;
  const good = flat ? null : goodWhenDown ? !up : up;
  const col = onDark ? t.onPrimary : good === null ? t.textMuted : good ? t.success : t.danger;
  return <T v="small" color={col} style={{ fontWeight: '700' }}>{flat ? '—' : up ? '▲' : '▼'} {Math.abs(pct)}% <T v="small" color={onDark ? t.onPrimary : t.textMuted} style={{ fontWeight: '400', opacity: onDark ? 0.7 : 1 }}>vs last month</T></T>;
};

export default function MoneyDashboardScreen() {
  const nav = useNavigation();
  const t = useTheme();
  const [month, setMonth] = useState(monthKeyOf(new Date()));
  const route = useRoute();
  const [add, setAdd] = useState(null);       // {kind} | {entry}
  const [detail, setDetail] = useState(null);
  useEffect(() => { if (route.params?.add) setAdd({ kind: 'expense' }); }, [route.params?.add]);
  const [selCat, setSelCat] = useState(null);
  const [startSheet, setStartSheet] = useState(null);
  const { data: d, loading } = useQuery(() => load(month), [month]);

  const onSaved = (alerts) => { if (alerts?.length) Alert.alert(alerts[0].title, alerts.map((a) => a.text).join('\n')); };
  const saveStart = async () => {
    const txt = String(startSheet).trim();
    const paise = txt === '' ? 0 : parseRupees(txt);
    if (paise === null) return showError(new Error('Enter an amount like 5000 or 12500.50.'), 'Invalid amount');
    await X.setOpeningBalance(paise); setStartSheet(null); toast('Starting balance saved');
  };

  const top = d?.cats.slice(0, 6) || [];
  const rest = (d?.cats.slice(6) || []).reduce((a, c) => a + c.total, 0);
  const donut = rest > 0 ? [...top, { name: 'Others', color: t.textFaint, total: rest, count: 0 }] : top;
  const ob = d?.budget.overall ? budgetState(d.budget.overall.spent, d.budget.overall.budget) : null;

  return (
    <Screen title="Money" subtitle="Your income, spending and budgets"
      right={<IconButton name="stats-chart-outline" bg label="Analytics" onPress={() => nav.navigate('ExpenseAnalytics')} />}
      fab={<Fab onPress={() => setAdd({ kind: 'expense' })} label="Add transaction" bottom={28} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md }}>
        <IconButton name="chevron-back" label="Previous month" bg onPress={() => setMonth(shiftMonth(month, -1))} />
        <Pressable accessibilityRole="button" accessibilityLabel="Go to this month" onPress={() => setMonth(monthKeyOf(new Date()))}><T v="heading">{monthLabel(month)}</T></Pressable>
        <IconButton name="chevron-forward" label="Next month" bg onPress={() => setMonth(shiftMonth(month, 1))} />
      </View>

      {loading && !d ? <Loading /> : !d ? null : (
        <>
          {/* Hero */}
          <Card style={{ backgroundColor: t.primary, borderColor: t.primary, padding: 20 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit starting balance" onPress={() => setStartSheet(d.balance.opening ? paiseToInput(d.balance.opening) : '')}>
              <T v="caption" color={t.onPrimary} style={{ opacity: 0.7 }}>AVAILABLE BALANCE  ✎</T>
            </Pressable>
            <AnimatedNumber value={d.balance.balance / 100} format={(v) => formatPaise(Math.round(v * 100))} color={t.onPrimary} style={{ fontSize: 40, fontWeight: '700', letterSpacing: -1, marginTop: 4 }} />
            <T v="small" color={t.onPrimary} style={{ opacity: 0.65 }}>All income minus all spending{d.balance.opening ? `, plus your ${formatPaise(d.balance.opening)} starting balance` : ''}</T>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              {[['INCOME', d.totals.income, d.incomeChange, false], ['EXPENSES', d.totals.expense, d.expenseChange, true]].map(([label, val, pct, down]) => (
                <View key={label} style={{ flex: 1, backgroundColor: 'rgba(127,127,127,0.18)', borderRadius: radius.md, padding: 12 }}>
                  <T v="caption" color={t.onPrimary} style={{ opacity: 0.7 }}>{label}</T>
                  <AnimatedNumber value={val / 100} format={(v) => formatPaise(Math.round(v * 100))} color={t.onPrimary} style={{ fontSize: 20, fontWeight: '700', marginTop: 2 }} />
                  <Delta pct={pct} goodWhenDown={down} onDark />
                </View>
              ))}
            </View>
          </Card>

          {/* Savings */}
          <Card style={{ marginTop: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <View>
                <T v="caption" muted>SAVED THIS MONTH</T>
                <AnimatedNumber value={d.summary.savings / 100} format={(v) => formatPaise(Math.round(v * 100))} color={d.summary.savings >= 0 ? t.success : t.danger} style={{ fontSize: 26, fontWeight: '700', marginTop: 2 }} />
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <T style={{ fontSize: 26, fontWeight: '700' }}>{d.summary.savingsPct === null ? '—' : `${Math.round(d.summary.savingsPct)}%`}</T>
                <T v="small" muted>{d.summary.savingsPct === null ? 'add income to see' : 'of income saved'}</T>
              </View>
            </View>
            <AnimatedBar value={(d.summary.savingsPct || 0) / 100} color={t.success} style={{ marginTop: 12 }} />
            {d.prevSummary.savingsPct !== null ? <T v="small" muted style={{ marginTop: 8 }}>Last month you saved {Math.round(d.prevSummary.savingsPct)}% ({formatPaise(d.prevSummary.savings)}).</T> : null}
          </Card>

          {!d.hasData ? (
            <Card style={{ marginTop: 10 }}>
              <EmptyState icon="wallet-outline" title="Nothing recorded yet" text="Add your income and spending. Everything on this screen is calculated from what you enter." action="Add first transaction" onAction={() => setAdd({ kind: 'expense' })} />
            </Card>
          ) : null}

          {/* Trend */}
          {d.hasData ? (
            <>
              <SectionHeader title="Spending trend" />
              <Card>
                {d.totals.expense === 0 && d.cumPrev[d.dim - 1] === 0 ? <T muted>No spending in this or the previous month.</T> : (
                  <TrendChart current={d.cumCur} previous={d.cumPrev.some((v) => v > 0) ? d.cumPrev : []} activeDays={d.isCurrent ? d.daysElapsed : d.isFuture ? 0 : d.dim}
                    monthDays={d.dim} format={formatPaise} />
                )}
              </Card>

              <SectionHeader title="Where it went" action="Details" onAction={() => nav.navigate('ExpenseAnalytics')} />
              <Card>
                {!donut.length ? <T muted>No expenses this month.</T> : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <DonutChart data={donut} size={150} thickness={20} selected={selCat} onSelect={setSelCat}
                      center={<><T v="small" muted>{selCat !== null ? donut[selCat].name : 'Spent'}</T><T style={{ fontWeight: '700', fontSize: 16 }}>{formatPaise(selCat !== null ? donut[selCat].total : d.totals.expense)}</T>{selCat !== null ? <T v="small" muted>{Math.round((donut[selCat].total / d.totals.expense) * 100)}%</T> : null}</>} />
                    <View style={{ flex: 1 }}>
                      {donut.slice(0, 5).map((c, i) => (
                        <Pressable key={`${c.name}${i}`} accessibilityRole="button" onPress={() => (c.category_id ? nav.navigate('ExpenseTransactions', { categoryId: c.category_id, ...monthRange(month) }) : setSelCat(selCat === i ? null : i))}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 8, opacity: selCat === null || selCat === i ? 1 : 0.4 }}>
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.color }} />
                          <T v="small" style={{ flex: 1 }} numberOfLines={1}>{c.name}</T>
                          <T v="small" style={{ fontWeight: '700' }}>{formatPaise(c.total)}</T>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
              </Card>
            </>
          ) : null}

          {/* Budget */}
          <SectionHeader title="Budget" action="Manage" onAction={() => nav.navigate('ExpenseBudgets', { month })} />
          <Card onPress={() => nav.navigate('ExpenseBudgets', { month })} accessibilityLabel="Open budgets">
            {!ob ? (
              <View><T style={{ fontWeight: '600' }}>No monthly budget yet</T><T muted>Set one to see how much you can still spend, with alerts at 80% and 100%.</T></View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <T style={{ fontWeight: '700', fontSize: 20 }}>{formatPaise(ob.spent)} <T muted style={{ fontSize: 14 }}>of {formatPaise(ob.budget)}</T></T>
                  <Badge label={ob.level === 'over' ? 'OVER BUDGET' : ob.level === 'warn' ? '80% USED' : 'ON TRACK'} tone={ob.level === 'over' ? 'danger' : ob.level === 'warn' ? 'warning' : 'success'} />
                </View>
                <AnimatedBar value={ob.spent / ob.budget} color={ob.level === 'over' ? t.danger : ob.level === 'warn' ? t.warning : t.success} style={{ marginTop: 12 }} />
                <T v="small" muted style={{ marginTop: 8 }}>{ob.remaining >= 0 ? `${formatPaise(ob.remaining)} left` : `${formatPaise(-ob.remaining)} over`}{d.isCurrent ? ` · ${d.dim - d.daysElapsed} days to go` : ''}</T>
              </>
            )}
            {d.budget.categories.slice(0, 3).map((c) => { const s = budgetState(c.spent, c.budget); return (
              <View key={c.category_id} style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T v="small">{c.name}</T><T v="small" muted>{formatPaise(c.spent)} / {formatPaise(c.budget)}</T></View>
                <AnimatedBar value={c.spent / c.budget} height={6} color={s.level === 'over' ? t.danger : s.level === 'warn' ? t.warning : c.color} style={{ marginTop: 4 }} />
              </View>); })}
          </Card>

          {/* Insights */}
          {d.insights.length ? (
            <>
              <SectionHeader title="Insights" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={276} decelerationRate="fast" style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: 12 }}>
                {d.insights.map((i) => (
                  <Card key={i.id} style={{ width: 264, borderColor: i.tone === 'bad' ? t.danger : i.tone === 'good' ? t.success : t.border }}>
                    <Icon name={i.icon} size={22} color={i.tone === 'bad' ? t.danger : i.tone === 'good' ? t.success : t.textMuted} />
                    <T v="small" muted style={{ marginTop: 8, fontWeight: '700' }}>{i.title.toUpperCase()}</T>
                    <T style={{ marginTop: 4 }}>{i.text}</T>
                  </Card>
                ))}
              </ScrollView>
            </>
          ) : null}

          {/* Recent */}
          <SectionHeader title="Recent transactions" action="See all" onAction={() => nav.navigate('ExpenseTransactions')} />
          <Card pad={false} style={{ paddingHorizontal: 16 }}>
            {d.recent.length ? d.recent.map((r) => <TxRow key={r.id} tx={r} showDate onPress={() => setDetail(r)} />) : <T muted style={{ paddingVertical: 16 }}>No transactions yet.</T>}
          </Card>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Button title="Add income" icon="arrow-down-circle-outline" variant="secondary" onPress={() => setAdd({ kind: 'income' })} style={{ flex: 1 }} />
            <Button title="Budgets" icon="speedometer-outline" variant="secondary" onPress={() => nav.navigate('ExpenseBudgets', { month })} style={{ flex: 1 }} />
          </View>
        </>
      )}

      <QuickAddSheet visible={!!add} entry={add?.entry} defaultKind={add?.kind} onClose={() => setAdd(null)} onSaved={onSaved} />
      <TransactionDetailSheet tx={detail} onClose={() => setDetail(null)} onEdit={(tx) => { setDetail(null); setAdd({ entry: tx }); }} />
      <Sheet visible={startSheet !== null} title="Starting balance" onClose={() => setStartSheet(null)} footer={<Button title="Save" onPress={saveStart} />}>
        <T muted style={{ marginBottom: 12 }}>Money you already had before you started recording here (bank + cash). Your available balance is this plus all income minus all expenses.</T>
        <Input label="AMOUNT (₹)" value={startSheet ?? ''} onChangeText={setStartSheet} keyboardType="decimal-pad" placeholder="0" />
      </Sheet>
    </Screen>
  );
}
