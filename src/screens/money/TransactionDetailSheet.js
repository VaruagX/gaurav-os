import React from 'react';
import { View } from 'react-native';
import { Sheet, T, Button, Badge } from '../../components/ui';
import { useTheme } from '../../theme';
import { formatPaise } from '../../services/khata/money';
import { methodLabel } from '../../services/expenses/finance';
import { fmtDateStr, fmtDateTime, parseDateStr } from '../../utils/date';
import { txTitle } from '../../components/finance/TxRow';

const Line = ({ k, v }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
    <T muted>{k}</T><T style={{ fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 16 }}>{v}</T>
  </View>
);

export default function TransactionDetailSheet({ tx, onClose, onEdit }) {
  const t = useTheme();
  if (!tx) return null;
  const income = tx.kind === 'income';
  return (
    <Sheet visible={!!tx} title="Transaction" onClose={onClose}
      footer={<Button title="Edit or delete" icon="create-outline" onPress={() => onEdit(tx)} />}>
      <View style={{ alignItems: 'center', paddingVertical: 12 }}>
        <Badge label={income ? 'INCOME' : 'EXPENSE'} tone={income ? 'success' : 'danger'} />
        <T style={{ fontSize: 40, fontWeight: '700', marginTop: 10 }} color={income ? t.success : t.text}>{income ? '+' : '-'}{formatPaise(tx.amount_paise)}</T>
        <T muted style={{ marginTop: 2 }} numberOfLines={2}>{txTitle(tx)}</T>
      </View>
      <Line k="Date" v={`${fmtDateStr(tx.date)} ${parseDateStr(tx.date).getFullYear()}`} />
      <Line k="Category" v={tx.category || 'Uncategorised'} />
      <Line k="Payment method" v={methodLabel(tx.payment_method)} />
      <Line k="Note" v={tx.note || '—'} />
      <Line k="Added on" v={fmtDateTime(tx.created_at)} />
    </Sheet>
  );
}
