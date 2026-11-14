import React, { useEffect, useState } from 'react';
import { View, TextInput, ScrollView, Pressable } from 'react-native';
import { Sheet, T, Chip, Button, Input, Field, DateField, Icon } from '../../components/ui';
import { useTheme, radius } from '../../theme';
import { expenseRepository as X } from '../../database/repositories';
import { PAYMENT_METHODS, monthKeyOf } from '../../services/expenses/finance';
import { parseRupees, paiseToInput } from '../../services/khata/money';
import { checkBudgetAlerts } from '../../services/expenses/alerts';
import { todayStr, addDaysStr } from '../../utils/date';
import { showError, toast, confirm } from '../../utils/ui';

/**
 * Quick Add / Edit sheet: large amount, expense|income toggle, category, date, payment method, note.
 * Saves straight to SQLite, then checks the 80% / 100% budget alerts for expenses.
 */
export default function QuickAddSheet({ visible, entry, defaultKind = 'expense', onClose, onSaved, onDeleted }) {
  const t = useTheme();
  const editing = !!entry?.id;
  const [kind, setKind] = useState('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [date, setDate] = useState(todayStr());
  const [method, setMethod] = useState('upi');
  const [note, setNote] = useState('');
  const [cats, setCats] = useState({ expense: [], income: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    (async () => setCats({ expense: await X.categories('expense'), income: await X.categories('income') }))();
    if (editing) { setKind(entry.kind); setAmount(paiseToInput(entry.amount_paise)); setCategoryId(entry.category_id); setDate(entry.date); setMethod(entry.payment_method); setNote(entry.note || ''); }
    else { setKind(defaultKind); setAmount(''); setCategoryId(null); setDate(todayStr()); setMethod('upi'); setNote(''); }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const accent = kind === 'income' ? t.success : t.danger;
  const list = cats[kind] || [];
  const today = todayStr(), yesterday = addDaysStr(today, -1);

  const submit = async () => {
    const paise = parseRupees(amount);
    if (!paise) return showError(new Error('Enter an amount greater than zero (up to 2 decimals).'), 'Invalid amount');
    setBusy(true);
    try {
      const payload = { kind, amountPaise: paise, date, categoryId, paymentMethod: method, note };
      const month = monthKeyOf(new Date(`${date}T00:00:00`));
      const before = kind === 'expense' ? await X.budgetStatus(month) : null;
      if (editing) await X.update(entry.id, payload); else await X.add(payload);
      const alerts = before ? await checkBudgetAlerts(before, await X.budgetStatus(month)) : [];
      onClose();
      onSaved && onSaved(alerts);
      toast(editing ? 'Saved' : kind === 'income' ? 'Income added' : 'Expense added');
    } catch (e) { showError(e); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!(await confirm('Delete this transaction?', 'It will be removed from your totals, charts and budgets. This cannot be undone.', { destructive: true, confirmText: 'Delete' }))) return;
    try { await X.remove(entry.id); onClose(); onDeleted && onDeleted(); toast('Deleted'); } catch (e) { showError(e); }
  };

  return (
    <Sheet visible={visible} title={editing ? 'Edit transaction' : 'Add transaction'} onClose={onClose}
      footer={<View style={{ flexDirection: 'row', gap: 10 }}>
        {editing ? <Button title="Delete" variant="danger" onPress={remove} style={{ flex: 1 }} /> : null}
        <Button title={editing ? 'Save changes' : kind === 'income' ? 'Save income' : 'Save expense'} loading={busy} onPress={submit} style={{ flex: 2 }} />
      </View>}>
      <View style={{ flexDirection: 'row', backgroundColor: t.surface2, borderRadius: radius.md, padding: 4, marginBottom: 16 }}>
        {['expense', 'income'].map((k) => (
          <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: kind === k }} onPress={() => { setKind(k); setCategoryId(null); }}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.sm + 2, backgroundColor: kind === k ? (k === 'income' ? t.success : t.danger) : 'transparent' }}>
            <T style={{ fontWeight: '700' }} color={kind === k ? '#fff' : t.textMuted}>{k === 'expense' ? 'Expense' : 'Income'}</T>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
        <T style={{ fontSize: 40, fontWeight: '700', marginRight: 6 }} color={accent}>₹</T>
        <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={t.textFaint}
          autoFocus={!editing} accessibilityLabel="Amount in rupees" selectionColor={accent} maxLength={12}
          style={{ fontSize: 48, fontWeight: '700', color: accent, minWidth: 90, textAlign: 'center', padding: 0 }} />
      </View>

      <Field label="CATEGORY">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {list.map((c) => <Chip key={c.id} label={c.name} selected={categoryId === c.id} onPress={() => setCategoryId(categoryId === c.id ? null : c.id)} />)}
        </View>
      </Field>

      <Field label="DATE">
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Chip label="Today" selected={date === today} onPress={() => setDate(today)} />
          <Chip label="Yesterday" selected={date === yesterday} onPress={() => setDate(yesterday)} />
        </View>
      </Field>
      <DateField value={date} onChange={(d) => setDate(d || today)} />

      <Field label="PAYMENT METHOD">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {PAYMENT_METHODS.map((m) => <Chip key={m.id} label={m.label} icon={m.icon} selected={method === m.id} onPress={() => setMethod(m.id)} />)}
        </ScrollView>
      </Field>

      <Input label="NOTE (OPTIONAL)" value={note} onChangeText={setNote} placeholder="e.g. lunch with friends" />
    </Sheet>
  );
}
