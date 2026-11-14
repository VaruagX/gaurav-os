import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Screen, Card, T, Button, Chip, Sheet, Input, Badge, IconButton, SectionHeader, Loading, Field } from '../../components/ui';
import { useTheme, space } from '../../theme';
import { useQuery } from '../../hooks/useQuery';
import { expenseRepository as X } from '../../database/repositories';
import { monthKeyOf, shiftMonth, monthLabel, budgetState, daysInMonth } from '../../services/expenses/finance';
import { formatPaise, parseRupees, paiseToInput } from '../../services/khata/money';
import { AnimatedBar, BarChart } from '../../components/finance/charts';
import { showError, toast, confirm } from '../../utils/ui';

const tone = (l) => (l === 'over' ? 'danger' : l === 'warn' ? 'warning' : 'success');
const word = (l) => (l === 'over' ? 'OVER BUDGET' : l === 'warn' ? '80% USED' : 'ON TRACK');

export default function BudgetScreen() {
  const t = useTheme();
  const { params } = useRoute();
  const [month, setMonth] = useState(params?.month || monthKeyOf(new Date()));
  const [edit, setEdit] = useState(null); // {categoryId|null, name, value}
  const [pickCat, setPickCat] = useState(false);
  const { data, loading } = useQuery(async () => ({
    status: await X.budgetStatus(month), cats: await X.categories('expense'), history: await X.budgetHistory(6, monthKeyOf(new Date())),
    explicit: (await X.budgets(month)),
  }), [month]);

  const color = (s) => (s.level === 'over' ? t.danger : s.level === 'warn' ? t.warning : t.success);
  const save = async () => {
    const txt = String(edit.value).trim();
    const paise = txt === '' ? 0 : parseRupees(txt);
    if (paise === null) return showError(new Error('Enter an amount like 20000 or 1500.50.'), 'Invalid amount');
    try { await X.setBudget(month, edit.categoryId, paise); setEdit(null); toast(paise === 0 ? 'Budget removed' : 'Budget saved'); } catch (e) { showError(e); }
  };
  const remove = async () => {
    if (await confirm('Remove budget?', `${edit.name} will have no budget from ${monthLabel(month)} onward. Earlier months keep theirs.`, { destructive: true, confirmText: 'Remove' })) {
      try { await X.setBudget(month, edit.categoryId, 0); setEdit(null); } catch (e) { showError(e); }
    }
  };

  const o = data?.status.overall ? budgetState(data.status.overall.spent, data.status.overall.budget) : null;
  const unused = data ? data.cats.filter((c) => !data.status.categories.some((b) => b.category_id === c.id)) : [];
  const dim = daysInMonth(month);
  const today = new Date(); const isCur = month === monthKeyOf(today);

  return (
    <Screen title="Budgets" subtitle="Alerts at 80% and 100%">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md }}>
        <IconButton name="chevron-back" bg label="Previous month" onPress={() => setMonth(shiftMonth(month, -1))} />
        <T v="heading">{monthLabel(month)}</T>
        <IconButton name="chevron-forward" bg label="Next month" onPress={() => setMonth(shiftMonth(month, 1))} />
      </View>
      {loading && !data ? <Loading /> : !data ? null : (
        <>
          <Card>
            <T v="caption" muted>MONTHLY BUDGET</T>
            {!o ? (
              <>
                <T style={{ marginTop: 6 }} muted>You haven't set a monthly budget. Spent so far this month: {formatPaise(data.status.spent)}.</T>
                <Button title="Set monthly budget" icon="add" onPress={() => setEdit({ categoryId: null, name: 'Monthly budget', value: '' })} style={{ marginTop: 12 }} />
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                  <T style={{ fontSize: 28, fontWeight: '700' }}>{formatPaise(o.spent)}</T>
                  <Badge label={word(o.level)} tone={tone(o.level)} />
                </View>
                <T muted>of {formatPaise(o.budget)} · {o.pct}% used</T>
                <AnimatedBar value={o.spent / o.budget} height={12} color={color(o)} style={{ marginTop: 12 }} />
                <T style={{ marginTop: 10 }}>{o.remaining >= 0 ? `${formatPaise(o.remaining)} remaining` : `${formatPaise(-o.remaining)} over budget`}{isCur ? ` · ${dim - today.getDate()} days left` : ''}</T>
                <Button title="Change budget" variant="secondary" small onPress={() => setEdit({ categoryId: null, name: 'Monthly budget', value: paiseToInput(o.budget), existing: true })} style={{ marginTop: 12, alignSelf: 'flex-start' }} />
              </>
            )}
          </Card>

          <SectionHeader title="Category budgets" action="Add" onAction={() => setPickCat(true)} />
          {!data.status.categories.length ? <Card><T muted>Set a limit for a category such as Food or Travel to track it separately.</T></Card> : data.status.categories.map((c) => {
            const s = budgetState(c.spent, c.budget);
            return (
              <Card key={c.category_id} style={{ marginBottom: 10 }} onPress={() => setEdit({ categoryId: c.category_id, name: c.name, value: paiseToInput(c.budget), existing: true })} accessibilityLabel={`Edit ${c.name} budget`}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <T v="heading">{c.name}</T><Badge label={word(s.level)} tone={tone(s.level)} />
                </View>
                <AnimatedBar value={c.spent / c.budget} color={color(s)} style={{ marginTop: 10 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                  <T v="small" muted>{formatPaise(c.spent)} of {formatPaise(c.budget)}</T>
                  <T v="small" color={s.remaining < 0 ? t.danger : t.textMuted}>{s.remaining >= 0 ? `${formatPaise(s.remaining)} left` : `${formatPaise(-s.remaining)} over`}</T>
                </View>
              </Card>
            );
          })}

          {data.history.length ? (
            <>
              <SectionHeader title="Budget history" />
              <Card>
                <BarChart data={[...data.history].reverse().map((h) => ({ key: h.month, label: monthLabel(h.month, true).split(' ')[0], full: monthLabel(h.month), values: [h.budget, h.spent] }))}
                  colors={[t.textFaint, t.primary]} series={['Budget', 'Spent']} format={formatPaise} height={130} />
                {data.history.map((h) => { const s = budgetState(h.spent, h.budget); return (
                  <Pressable key={h.month} accessibilityRole="button" onPress={() => setMonth(h.month)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 }}>
                    <T>{monthLabel(h.month)}</T>
                    <T muted>{formatPaise(h.spent)}{h.budget ? ` / ${formatPaise(h.budget)}` : ''}</T>
                    {h.budget ? <Badge label={s.level === 'over' ? 'OVER' : s.level === 'warn' ? '80%+' : 'OK'} tone={tone(s.level)} /> : <Badge label="NO BUDGET" />}
                  </Pressable>); })}
              </Card>
            </>
          ) : null}
        </>
      )}

      <Sheet visible={pickCat} title="Choose a category" onClose={() => setPickCat(false)}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {unused.map((c) => <Chip key={c.id} label={c.name} onPress={() => { setPickCat(false); setEdit({ categoryId: c.id, name: c.name, value: '' }); }} />)}
          {!unused.length ? <T muted>Every category already has a budget.</T> : null}
        </View>
      </Sheet>

      <Sheet visible={!!edit} title={edit ? `${edit.name} · ${monthLabel(month, true)}` : ''} onClose={() => setEdit(null)}
        footer={<View style={{ flexDirection: 'row', gap: 10 }}>{edit?.existing ? <Button title="Remove" variant="danger" onPress={remove} style={{ flex: 1 }} /> : null}<Button title="Save" onPress={save} style={{ flex: 2 }} /></View>}>
        <Input label="MONTHLY LIMIT (₹)" value={edit?.value ?? ''} onChangeText={(v) => setEdit({ ...edit, value: v.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad" placeholder="e.g. 20000" autoFocus />
        <T v="small" muted>Applies from {monthLabel(month)} and carries forward to later months until you change it. Earlier months keep their own budget.</T>
      </Sheet>
    </Screen>
  );
}
