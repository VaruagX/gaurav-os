import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Screen, Card, T, Icon, Row, Button, Stat, EmptyState, SectionHeader, Loading, Sheet, Input, Badge, IconButton, SwitchRow } from '../../components/ui';
import { useTheme } from '../../theme';
import { useQuery } from '../../hooks/useQuery';
import { useSettings } from '../../hooks/useSettings';
import { khataRepository as K, DuplicateContactError } from '../../database/repositories';
import { formatPaise, TYPE_LABEL } from '../../services/khata/money';
import { reminderMessage, openReminder } from '../../services/khata/share';
import { outstandingLots, overdueLots } from '../../services/khata/analytics';
import { timeAgo } from '../../services/khata/format';
import { todayStr } from '../../utils/date';
import { personStatementModel, receiptModel, exportPdf, sendReminderWithImage } from '../../services/khata/exports';
import { fmtDateStr } from '../../utils/date';
import { confirm, showError, toast } from '../../utils/ui';
import KhataEntrySheet from './KhataEntrySheet';
import { Avatar } from './KhataScreen';

const ICON = { lena: 'arrow-down-circle-outline', received: 'checkmark-circle-outline', dena: 'arrow-up-circle-outline', given: 'checkmark-done-circle-outline' };

export default function KhataPersonScreen() {
  const nav = useNavigation();
  const { params } = useRoute();
  const t = useTheme();
  const settings = useSettings();
  const id = params.id;
  const [sheet, setSheet] = useState(null);      // {mode, entry}
  const [editingPerson, setEditingPerson] = useState(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [withImage, setWithImage] = useState(true);
  const [sending, setSending] = useState(false);

  const { data, loading } = useQuery(async () => {
    const contact = await K.getContact(id);
    if (!contact) return null;
    const entries = await K.entriesFor(id);
    const lots = outstandingLots(entries.filter((e) => e.status === 'active'));
    const overdue = new Set((lots.dir > 0 ? overdueLots(lots.lots, todayStr()) : []).map((l) => l.id));
    const lastRem = (await K.reminderLogFor(id, 1))[0] || null;
    return { contact, totals: await K.personTotals(id), entries, overdue, lastRem };
  }, [id]);

  if (!loading && !data) return <Screen title="My Khata"><EmptyState icon="alert-circle-outline" title="Person not found" /></Screen>;
  if (!data) return <Screen title="My Khata"><Loading /></Screen>;

  const { contact, totals, entries, overdue, lastRem } = data;
  const out = totals.outstanding;
  const color = out > 0 ? t.success : out < 0 ? t.danger : t.textMuted;
  const message = reminderMessage(contact.name, out);

  const saveEntry = async (v) => {
    const sheetEntry = sheet.entry;
    if (sheetEntry?.id) { await K.updateEntry(sheetEntry.id, v); return; }
    // A payment larger than what is owed flips the balance to the other side: make that explicit.
    const clears = (v.type === 'received' && out > 0) || (v.type === 'given' && out < 0);
    if ((v.type === 'received' || v.type === 'given') && clears && v.amountPaise > Math.abs(out)) {
      const ok = await confirm('Payment is more than the balance', `The balance is ${formatPaise(Math.abs(out))} but you entered ${formatPaise(v.amountPaise)}. After this, ${v.type === 'received' ? `you will owe ${contact.name} ${formatPaise(v.amountPaise - out)}` : `${contact.name} will owe you ${formatPaise(v.amountPaise + out)}`}. Continue?`, { confirmText: 'Continue' });
      if (!ok) throw new Error('Cancelled');
    }
    await K.addEntry({ contactId: id, ...v });
  };

  const deleteEntry = async (e) => {
    if (!(await confirm('Delete this transaction?', `${TYPE_LABEL[e.type]} ${formatPaise(e.amount_paise)} will be removed from the balance. It stays in the history as “deleted” and can be restored.`, { destructive: true, confirmText: 'Delete' }))) throw new Error('Cancelled');
    await K.deleteEntry(e.id);
  };

  const settle = async () => {
    const amt = formatPaise(Math.abs(out));
    if (!(await confirm('Full settlement', out > 0 ? `Record ${amt} received from ${contact.name} and clear the balance?` : `Record ${amt} paid to ${contact.name} and clear the balance?`, { confirmText: 'Settle' }))) return;
    try { await K.settle(id, new Date().toISOString().slice(0, 10)); toast('Settled'); } catch (e) { showError(e); }
  };

  const statement = () => personStatementModel({ contact, totals, entries });

  const exportStatement = async () => {
    try { await exportPdf(statement()); } catch (e) { showError(e, 'Export PDF'); }
  };
  const exportReceipt = async (e) => {
    try { await exportPdf(receiptModel({ contact, entry: e, outstanding: out })); } catch (err) { showError(err, 'Receipt PDF'); }
  };

  // Opens SMS / WhatsApp with the message (and optionally the balance image) prefilled. Never sends by itself.
  const remind = async (channel) => {
    setSending(true);
    try {
      if (withImage) {
        const r = await sendReminderWithImage(channel, contact, message, statement());
        if (r.ok) { setReminderOpen(false); K.logReminder({ contactId: id, channel, amountPaise: Math.abs(out) }); return; }
        toast(`Image could not be attached (${r.reason}). Opening text only.`);
      }
      const r2 = await openReminder(channel, contact.phone, message, { countryCode: '91' });
      if (r2.ok) { setReminderOpen(false); K.logReminder({ contactId: id, channel, amountPaise: Math.abs(out) }); } else showError(new Error(r2.reason), channel === 'sms' ? 'SMS' : 'WhatsApp');
    } finally { setSending(false); }
  };

  const savePerson = async () => {
    try { await K.updateContact(id, editingPerson); setEditingPerson(null); }
    catch (e) { showError(e instanceof DuplicateContactError ? new Error(`${e.existing.name} already uses that phone number.`) : e, 'Cannot save'); }
  };

  const removePerson = async () => {
    const hasHistory = entries.length > 0;
    const ok = await confirm(`Remove ${contact.name}?`, hasHistory
      ? 'Their transactions are never deleted. They will be hidden from your khata and restored with full history if you add the same number again.'
      : 'They have no transactions, so they will be deleted.', { destructive: true, confirmText: 'Remove' });
    if (!ok) return;
    try { await K.removeContact(id); setEditingPerson(null); nav.goBack(); } catch (e) { showError(e); }
  };

  return (
    <Screen title={contact.name} subtitle={contact.phone || 'No phone number'}
      right={<IconButton name="create-outline" bg label="Edit person" onPress={() => setEditingPerson({ name: contact.name, phone: contact.phone })} />}>
      <Card style={{ alignItems: 'center' }}>
        <Avatar name={contact.name} size={56} />
        <T v="caption" muted style={{ marginTop: 12 }}>{out > 0 ? 'THEY OWE ME' : out < 0 ? 'I OWE THEM' : 'ALL SETTLED'}</T>
        <T v="display" color={color} style={{ marginTop: 2 }}>{formatPaise(Math.abs(out))}</T>
        <T v="small" muted>Outstanding balance</T>
      </Card>

      {lastRem ? <T v="small" muted style={{ textAlign: 'center', marginTop: 8 }}>Last reminder opened {timeAgo(lastRem.at)} via {lastRem.channel === 'sms' ? 'SMS' : 'WhatsApp'}.</T> : null}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <Stat label="MUJHE LENA HAI" value={formatPaise(totals.lena)} sub={totals.received ? `received ${formatPaise(totals.received)}` : undefined} />
        <Stat label="MUJHE DENA HAI" value={formatPaise(totals.dena)} sub={totals.given ? `given ${formatPaise(totals.given)}` : undefined} />
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Button title="Add transaction" icon="add" onPress={() => setSheet({ mode: 'transaction' })} style={{ flex: 1 }} />
        <Button title="Record payment" icon="cash-outline" variant="secondary" onPress={() => setSheet({ mode: 'payment' })} style={{ flex: 1 }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <Button title="Settle fully" icon="checkmark-done" variant="secondary" onPress={settle} disabled={out === 0} style={{ flex: 1 }} />
        <Button title="Send reminder" icon="paper-plane-outline" variant="secondary" onPress={() => setReminderOpen(true)} disabled={out === 0} style={{ flex: 1 }} />
      </View>
      <Button title="Export statement PDF" icon="document-text-outline" variant="secondary" onPress={exportStatement} disabled={!entries.length} style={{ marginTop: 10 }} />

      <SectionHeader title={`Ledger · ${entries.filter((e) => e.status === 'active').length} entries`} />
      {!entries.length ? (
        <Card><EmptyState icon="receipt-outline" title="No transactions yet" text="Add what they owe you or what you owe them." action="Add transaction" onAction={() => setSheet({ mode: 'transaction' })} /></Card>
      ) : (
        <Card pad={false} style={{ paddingHorizontal: 16 }}>
          {entries.map((e) => {
            const deleted = e.status === 'deleted';
            const good = e.type === 'lena' || e.type === 'received';
            return (
              <View key={e.id} style={{ opacity: deleted ? 0.55 : 1 }}>
                <Row icon={ICON[e.type]} title={TYPE_LABEL[e.type]}
                  subtitle={`${fmtDateStr(e.date)}${e.due_date ? ` · due ${fmtDateStr(e.due_date)}` : ''}${e.note ? ` · ${e.note}` : ''}${deleted ? ' · deleted' : ''}`}
                  onPress={deleted ? undefined : () => setSheet({ mode: 'transaction', entry: e })}
                  right={deleted ? <Button small variant="secondary" title="Restore" onPress={() => K.restoreEntry(e.id)} /> : (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {overdue.has(e.id) ? <Badge label="OVERDUE" tone="danger" /> : null}
                      <T style={{ fontWeight: '700', marginLeft: 6 }} color={good ? t.success : t.danger}>{formatPaise(e.amount_paise)}</T>
                      <IconButton name="document-text-outline" size={20} label="Export receipt PDF" onPress={() => exportReceipt(e)} />
                    </View>
                  )} />
              </View>
            );
          })}
        </Card>
      )}
      {entries.length ? <T v="small" faint style={{ textAlign: 'center', marginTop: 8 }}>Tap an entry to edit or delete it. Deleted entries stay in the history.</T> : null}

      <KhataEntrySheet visible={!!sheet} mode={sheet?.mode} entry={sheet?.entry} outstanding={out} onSave={saveEntry} onClose={() => setSheet(null)}
        onDelete={sheet?.entry ? () => deleteEntry(sheet.entry) : undefined}
        onReceipt={sheet?.entry ? () => exportReceipt(sheet.entry) : undefined} />

      <Sheet visible={reminderOpen} title="Send reminder" onClose={() => setReminderOpen(false)}>
        <T muted style={{ marginBottom: 8 }}>This message will be prefilled. Nothing is sent until you press Send in the app.</T>
        <Card style={{ marginBottom: 14, backgroundColor: t.surface2 }}><T>{message}</T></Card>
        <SwitchRow label="Attach balance image" value={withImage} onValueChange={setWithImage}
          hint="A picture of this person's khata summary. WhatsApp opens their chat with the image and message ready. SMS apps differ: if yours can't take images it falls back to text." />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="SMS" icon="chatbubble-outline" loading={sending} onPress={() => remind('sms')} style={{ flex: 1 }} />
          <Button title="WhatsApp" icon="logo-whatsapp" variant="secondary" loading={sending} onPress={() => remind('whatsapp')} style={{ flex: 1 }} />
        </View>
        {!contact.phone ? <T v="small" color={t.warning} style={{ marginTop: 10 }}>No phone number saved. Edit this person to add one.</T> : null}
      </Sheet>

      <Sheet visible={!!editingPerson} title="Edit person" onClose={() => setEditingPerson(null)}
        footer={<View style={{ flexDirection: 'row', gap: 10 }}><Button title="Remove" variant="danger" onPress={removePerson} style={{ flex: 1 }} /><Button title="Save" onPress={savePerson} style={{ flex: 2 }} /></View>}>
        <Input label="NAME" value={editingPerson?.name || ''} onChangeText={(v) => setEditingPerson({ ...editingPerson, name: v })} />
        <Input label="PHONE NUMBER" value={editingPerson?.phone || ''} onChangeText={(v) => setEditingPerson({ ...editingPerson, phone: v })} keyboardType="phone-pad" />
      </Sheet>
    </Screen>
  );
}
