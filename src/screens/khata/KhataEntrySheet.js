import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Sheet, Input, Field, Segmented, DateField, Chip, Button, T } from '../../components/ui';
import { parseRupees, paiseToInput, formatPaise } from '../../services/khata/money';
import { todayStr } from '../../utils/date';
import { showError } from '../../utils/ui';

const TX = [{ label: 'Mujhe Lena Hai', value: 'lena' }, { label: 'Mujhe Dena Hai', value: 'dena' }];
const PAY = [{ label: 'Payment Received', value: 'received' }, { label: 'Payment Given', value: 'given' }];
const ALL = [...TX, ...PAY];

/**
 * Add / edit a ledger entry. mode: 'transaction' (lena/dena) | 'payment' (received/given). Editing shows all four types.
 * `outstanding` (paise, + they owe me) powers the "Full amount" shortcut for payments.
 */
export default function KhataEntrySheet({ visible, mode = 'transaction', entry, outstanding = 0, onSave, onClose, onDelete, onReceipt }) {
  const editing = !!entry?.id;
  const [type, setType] = useState('lena');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [due, setDue] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editing) { setType(entry.type); setAmount(paiseToInput(entry.amount_paise)); setDate(entry.date); setNote(entry.note || ''); setDue(entry.due_date || null); return; }
    setType(mode === 'payment' ? (outstanding < 0 ? 'given' : 'received') : 'lena');
    setAmount(''); setDate(todayStr()); setNote(''); setDue(null);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = editing ? ALL : mode === 'payment' ? PAY : TX;
  const title = editing ? 'Edit transaction' : mode === 'payment' ? 'Record payment' : 'Add transaction';
  const isPayment = type === 'received' || type === 'given';
  // A payment clears debt in one direction: "received" clears what they owe me, "given" clears what I owe.
  const fullFor = (t) => (t === 'received' && outstanding > 0 ? outstanding : t === 'given' && outstanding < 0 ? -outstanding : 0);
  const full = !editing && isPayment ? fullFor(type) : 0;

  const submit = async () => {
    const paise = parseRupees(amount);
    if (!paise) return showError(new Error('Enter an amount greater than zero, with at most 2 decimals.'), 'Invalid amount');
    setBusy(true);
    try { await onSave({ type, amountPaise: paise, date, note: note.trim() || null, dueDate: (type === 'lena' || type === 'dena') ? due : null }); onClose(); } catch (e) { if (e.message !== 'Cancelled') showError(e); } finally { setBusy(false); }
  };

  return (
    <Sheet visible={visible} title={title} onClose={onClose}
      footer={<View style={{ flexDirection: 'row', gap: 10 }}>
        {editing && onDelete ? <Button title="Delete" variant="danger" style={{ flex: 1 }} onPress={async () => { try { await onDelete(); onClose(); } catch (e) { if (e.message !== 'Cancelled') showError(e); } }} /> : null}
        <Button title={editing ? 'Save changes' : 'Save'} loading={busy} onPress={submit} style={{ flex: 2 }} />
      </View>}>
      <Field label="TYPE"><Segmented options={options.length > 2 ? options.map((o) => ({ ...o, label: o.label.replace('Payment ', 'Pay ').replace('Mujhe ', '') })) : options} value={type} onChange={setType} /></Field>
      <Input label="AMOUNT (₹)" value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad" placeholder="0" autoFocus={!editing} />
      {full > 0 ? (
        <View style={{ flexDirection: 'row', marginTop: -8, marginBottom: 14, gap: 8, alignItems: 'center' }}>
          <Chip label={`Full amount ${formatPaise(full)}`} onPress={() => setAmount(paiseToInput(full))} />
          <T v="small" muted>or type a partial amount</T>
        </View>
      ) : null}
      <DateField label="DATE" value={date} onChange={(d) => setDate(d || todayStr())} />
      {type === 'lena' || type === 'dena' ? <DateField label="DUE DATE (OPTIONAL)" value={due} onChange={setDue} allowClear /> : null}
      <Input label="NOTE (OPTIONAL)" value={note} onChangeText={setNote} placeholder="e.g. for lunch, rent, loan" />
      {editing && onReceipt ? <Button title="Export receipt PDF" icon="document-text-outline" variant="secondary" onPress={onReceipt} style={{ marginBottom: 8 }} /> : null}
    </Sheet>
  );
}
