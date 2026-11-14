import React from 'react';
import { View, Pressable } from 'react-native';
import { T } from '../ui';
import { useTheme } from '../../theme';
import { formatPaise } from '../../services/khata/money';
import { methodLabel } from '../../services/expenses/finance';
import { fmtDateStr } from '../../utils/date';

export const txTitle = (r) => r.note || r.category || (r.kind === 'income' ? 'Income' : 'Expense');

/** One transaction line: category-tinted badge, title, details, signed amount. */
export default function TxRow({ tx, onPress, showDate = false }) {
  const t = useTheme();
  const income = tx.kind === 'income';
  const tint = tx.category_color || t.textFaint;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${txTitle(tx)}, ${income ? 'income' : 'expense'} ${formatPaise(tx.amount_paise)}`} onPress={onPress}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, opacity: pressed ? 0.7 : 1 }]}>
      <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: `${tint}33`, alignItems: 'center', justifyContent: 'center' }}>
        <T style={{ fontWeight: '800' }} color={tint}>{(tx.category || (income ? 'I' : 'E'))[0].toUpperCase()}</T>
      </View>
      <View style={{ flex: 1 }}>
        <T style={{ fontWeight: '600' }} numberOfLines={1}>{txTitle(tx)}</T>
        <T v="small" muted numberOfLines={1}>{[tx.note ? tx.category : null, methodLabel(tx.payment_method), showDate ? fmtDateStr(tx.date) : null].filter(Boolean).join(' · ')}</T>
      </View>
      <T style={{ fontWeight: '700' }} color={income ? t.success : t.text}>{income ? '+' : '-'}{formatPaise(tx.amount_paise)}</T>
    </Pressable>
  );
}
