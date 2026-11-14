import React, { useState } from 'react';
import {
  View, Text, Pressable, Animated, TextInput, ScrollView, Modal, ActivityIndicator, Switch as RNSwitch, StyleSheet, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { useTheme, space, radius, type } from '../theme';
import { useDrawer } from '../navigation/drawerContext';
import { GlassBackground, GradientFill, Glass } from './glass';
import { fmtTime, fmtDateStr, toDateStr, parseDateStr, timeStrOf } from '../utils/date';

export const Icon = ({ name, size = 20, color, style }) => {
  const t = useTheme();
  return <Ionicons name={name} size={size} color={color || t.text} style={style} />;
};

export function T({ v = 'body', muted, faint, color, style, children, ...rest }) {
  const t = useTheme();
  const c = color || (faint ? t.textFaint : muted ? t.textMuted : t.text);
  // Big custom font sizes need a matching line height, otherwise commas/descenders get clipped.
  const flat = style ? StyleSheet.flatten(style) : null;
  const fix = flat && flat.fontSize && !flat.lineHeight && flat.fontSize * 1.2 > (type[v].lineHeight || 0) ? { lineHeight: Math.round(flat.fontSize * 1.25) } : null;
  return <Text {...rest} style={[type[v], { color: c }, style, fix]}>{children}</Text>;
}

export function Card({ children, style, onPress, onLongPress, pad = true, accessibilityLabel }) {
  const t = useTheme();
  const inner = [{ padding: pad ? space.lg : 0 }, style];
  if (onPress || onLongPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} onLongPress={onLongPress}
        style={({ pressed }) => pressed && { opacity: 0.8, transform: [{ scale: 0.985 }] }}>
        <Glass style={inner}>{children}</Glass>
      </Pressable>
    );
  }
  return <Glass style={inner}>{children}</Glass>;
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, small, style, accessibilityLabel }) {
  const t = useTheme();
  const map = {
    primary: { bg: t.primary, fg: t.onPrimary, border: t.glassHighlight, grad: true },
    secondary: { bg: t.glassStrong, fg: t.text, border: t.glassBorder },
    ghost: { bg: 'transparent', fg: t.text, border: 'transparent' },
    danger: { bg: t.mode === 'dark' ? 'rgba(240,119,109,0.12)' : 'rgba(210,69,59,0.08)', fg: t.danger, border: t.danger },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || title} accessibilityState={{ disabled: !!off }}
      disabled={off} onPress={onPress}
      style={({ pressed }) => [styles.btn, small && styles.btnSmall, { backgroundColor: map.bg, borderColor: map.border, opacity: off ? 0.45 : pressed ? 0.82 : 1, overflow: 'hidden' },
        map.grad && { shadowColor: t.primary, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5 }, pressed && { transform: [{ scale: 0.975 }] }, style]}>
      {map.grad ? <GradientFill from={t.primary} to={t.primary2} /> : null}
      {loading ? <ActivityIndicator size="small" color={map.fg} /> : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 16 : 18} color={map.fg} style={title ? { marginRight: 8 } : null} /> : null}
          {title ? <Text style={{ color: map.fg, fontSize: small ? 13 : 15, fontWeight: '600' }}>{title}</Text> : null}
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ name, onPress, size = 22, color, label, style, bg }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label || name} onPress={onPress} hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, bg && { backgroundColor: t.glassStrong, borderWidth: StyleSheet.hairlineWidth, borderColor: t.glassBorder }, pressed && { opacity: 0.6, transform: [{ scale: 0.92 }] }, style]}>
      <Ionicons name={name} size={size} color={color || t.text} />
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon, small, style }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={onPress} disabled={!onPress}
      style={[styles.chip, small && { paddingVertical: 4, paddingHorizontal: 10 },
        { backgroundColor: selected ? t.primary : t.glass, borderColor: selected ? t.glassHighlight : t.glassBorder }, style]}>
      {icon ? <Ionicons name={icon} size={14} color={selected ? t.onPrimary : t.textMuted} style={{ marginRight: 5 }} /> : null}
      <Text style={{ color: selected ? t.onPrimary : t.text, fontSize: small ? 12 : 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tone = 'neutral' }) {
  const t = useTheme();
  const c = { neutral: t.textMuted, success: t.success, warning: t.warning, danger: t.danger }[tone];
  return (
    <View style={[styles.badge, { borderColor: c }]}>
      <Text style={{ color: c, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Field({ label, hint, children }) {
  return (
    <View style={{ marginBottom: space.lg }}>
      {label ? <T v="caption" muted style={{ marginBottom: 6 }}>{label}</T> : null}
      {children}
      {hint ? <T v="small" faint style={{ marginTop: 4 }}>{hint}</T> : null}
    </View>
  );
}

export function Input({ label, hint, multiline, style, ...props }) {
  const t = useTheme();
  const input = (
    <TextInput
      placeholderTextColor={t.textFaint} selectionColor={t.text} multiline={multiline} accessibilityLabel={label || props.placeholder}
      {...props}
      style={[styles.input, { backgroundColor: t.glass, borderColor: t.glassBorder, color: t.text }, multiline && { minHeight: 90, textAlignVertical: 'top' }, style]}
    />
  );
  return label || hint ? <Field label={label} hint={hint}>{input}</Field> : input;
}

export function NumberInput({ value, onChange, ...props }) {
  return <Input keyboardType="decimal-pad" value={value === null || value === undefined ? '' : String(value)}
    onChangeText={(s) => onChange(s.replace(',', '.').replace(/[^0-9.]/g, ''))} {...props} />;
}

export function SwitchRow({ label, hint, value, onValueChange, disabled }) {
  const t = useTheme();
  return (
    <View style={[styles.rowBetween, { marginBottom: space.lg, opacity: disabled ? 0.5 : 1 }]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <T>{label}</T>
        {hint ? <T v="small" muted>{hint}</T> : null}
      </View>
      <RNSwitch accessibilityLabel={label} value={!!value} onValueChange={onValueChange} disabled={disabled}
        trackColor={{ false: t.border, true: t.success }} thumbColor="#FFFFFF" />
    </View>
  );
}

export function Segmented({ options, value, onChange }) {
  const t = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: t.glass, borderColor: t.glassBorder }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={[styles.segItem, on && { backgroundColor: t.primary }]}>
            <Text style={{ color: on ? t.onPrimary : t.textMuted, fontWeight: '600', fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ value, color, height = 6, style }) {
  const t = useTheme();
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <View style={[{ height, borderRadius: height, backgroundColor: t.glassStrong, overflow: 'hidden' }, style]}
      accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}>
      <View style={{ width: `${v * 100}%`, height: '100%', backgroundColor: color || t.primary, borderRadius: height }} />
    </View>
  );
}

export function EmptyState({ icon = 'sparkles-outline', title, text, action, onAction }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.xl }}>
      <View style={[styles.emptyIcon, { backgroundColor: t.glassStrong }]}><Ionicons name={icon} size={26} color={t.textMuted} /></View>
      <T v="heading" style={{ marginTop: space.md, textAlign: 'center' }}>{title}</T>
      {text ? <T muted style={{ textAlign: 'center', marginTop: 4 }}>{text}</T> : null}
      {action ? <Button title={action} onPress={onAction} variant="secondary" small style={{ marginTop: space.lg }} /> : null}
    </View>
  );
}

export function SectionHeader({ title, action, onAction, style }) {
  const t = useTheme();
  return (
    <View style={[styles.rowBetween, { marginTop: space.xl, marginBottom: space.sm }, style]}>
      <T v="caption" muted>{title}</T>
      {action ? <Pressable onPress={onAction} hitSlop={8}><T v="small" color={t.primary} style={{ fontWeight: '700' }}>{action}</T></Pressable> : null}
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return <View style={{ padding: space.xxl, alignItems: 'center' }}><ActivityIndicator color={t.textMuted} /></View>;
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <Card style={{ marginBottom: space.md }}>
      <T color="#E07268" v="heading">Couldn't load data</T>
      <T muted>{error.message}</T>
      {onRetry ? <Button title="Retry" small variant="secondary" onPress={onRetry} style={{ marginTop: 8, alignSelf: 'flex-start' }} /> : null}
    </Card>
  );
}

export function Row({ icon, title, subtitle, right, onPress, onLongPress, left, style }) {
  const t = useTheme();
  const content = (
    <View style={[styles.listRow, style]}>
      {left || (icon ? <View style={[styles.rowIcon, { backgroundColor: t.glassStrong }]}><Ionicons name={icon} size={18} color={t.text} /></View> : null)}
      <View style={{ flex: 1 }}>
        <T v="body" style={{ fontWeight: '600' }} numberOfLines={2}>{title}</T>
        {subtitle ? <T v="small" muted numberOfLines={2}>{subtitle}</T> : null}
      </View>
      {right}
    </View>
  );
  if (!onPress && !onLongPress) return content;
  return <Pressable accessibilityRole="button" onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>{content}</Pressable>;
}

export const Divider = () => { const t = useTheme(); return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />; };

export function Checkbox({ checked, onPress, label }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!checked }} accessibilityLabel={label} onPress={onPress} hitSlop={8}
      style={[styles.check, { borderColor: checked ? t.primary : t.textFaint, backgroundColor: checked ? t.primary : 'transparent' }]}>
      {checked ? <Ionicons name="checkmark" size={16} color={t.onPrimary} /> : null}
    </Pressable>
  );
}

/** Bottom sheet modal for forms. */
export function Sheet({ visible, title, onClose, children, footer }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: t.overlay }} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.glassBorder, paddingBottom: insets.bottom + space.lg }]}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: space.md, marginTop: -space.xs }} />
          <View style={styles.rowBetween}>
            <T v="title" style={{ flex: 1 }}>{title}</T>
            <IconButton name="close" onPress={onClose} label="Close" />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ marginTop: space.md, maxHeight: 520 }} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          {footer ? <View style={{ marginTop: space.md }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ScreenHeader({ title, subtitle, back = true, right }) {
  const nav = useNavigation();
  const drawer = useDrawer();
  return (
    <View style={styles.header}>
      {back && nav.canGoBack() ? <IconButton name="chevron-back" onPress={() => nav.goBack()} label="Go back" bg style={{ marginRight: space.md }} /> : null}
      {!back ? <IconButton name="menu" onPress={drawer.open} label="Open menu" bg style={{ marginRight: space.md }} /> : null}
      <View style={{ flex: 1 }}>
        <T v="title" numberOfLines={1}>{title}</T>
        {subtitle ? <T v="small" muted>{subtitle}</T> : null}
      </View>
      {right}
    </View>
  );
}

export function Screen({ title, subtitle, back, right, children, scroll = true, onRefresh, refreshing, footer, padBottom = 24, fab }) {
  const t = useTheme();
  const fade = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => { Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start(); }, [fade]);
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: padBottom + 100 }}
      keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.textMuted} /> : undefined}>
      {children}
    </ScrollView>
  ) : <View style={{ flex: 1, paddingHorizontal: space.lg }}>{children}</View>;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <GlassBackground />
      <View style={{ paddingHorizontal: space.lg }}>
        {title ? <ScreenHeader title={title} subtitle={subtitle} back={back} right={right} /> : null}
      </View>
      <Animated.View style={{ flex: 1, opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>{body}</Animated.View>
      {footer}
      {fab}
    </SafeAreaView>
  );
}

export function Fab({ onPress, icon = 'add', label, bottom = 110 }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label || 'Add'} onPress={onPress}
      style={({ pressed }) => [styles.fab, { bottom, backgroundColor: t.primary, borderWidth: 1, borderColor: t.glassHighlight, overflow: 'hidden', shadowColor: t.primary, opacity: pressed ? 0.85 : 1 }]}>
      <GradientFill from={t.primary} to={t.primary2} />
      <Ionicons name={icon} size={26} color={t.onPrimary} />
    </Pressable>
  );
}

export function Stat({ label, value, sub, style }) {
  const t = useTheme();
  return (
    <Glass radius={radius.md} style={[{ flex: 1, padding: space.md }, style]}>
      <T v="caption" muted>{label}</T>
      <T v="title" style={{ marginTop: 4 }}>{value}</T>
      {sub ? <T v="small" muted>{sub}</T> : null}
    </Glass>
  );
}

/** Vertical bar chart. data: [{label, value}] */
export function BarChart({ data, height = 110, color, format = (v) => String(v), maxOverride }) {
  const t = useTheme();
  const max = Math.max(maxOverride || 0, ...data.map((d) => d.value), 1);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 8 }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}
            accessibilityLabel={`${d.label}: ${format(d.value)}`}>
            <View style={{ width: '100%', height: Math.max(3, (d.value / max) * (height - 8)), borderRadius: 6, backgroundColor: d.value > 0 ? (color || t.primary) : t.glass }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        {data.map((d, i) => <T key={i} v="small" faint style={{ flex: 1, textAlign: 'center', fontSize: 11 }}>{d.label}</T>)}
      </View>
    </View>
  );
}

// ---------- Date / time pickers (native Android dialogs) ------------------------------------
export function DateField({ label, value, onChange, placeholder = 'Pick a date', allowClear }) {
  const t = useTheme();
  const open = () => DateTimePickerAndroid.open({
    value: value ? parseDateStr(value) : new Date(), mode: 'date',
    onChange: (e, d) => { if (e.type === 'set' && d) onChange(toDateStr(d)); },
  });
  return (
    <Field label={label}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={label || 'Pick date'} onPress={open} style={[styles.picker, { backgroundColor: t.glass, borderColor: t.glassBorder, flex: 1 }]}>
          <Ionicons name="calendar-outline" size={18} color={t.textMuted} />
          <T style={{ marginLeft: 10 }} muted={!value}>{value ? fmtDateStr(value) : placeholder}</T>
        </Pressable>
        {allowClear && value ? <IconButton name="close-circle" onPress={() => onChange(null)} label="Clear date" /> : null}
      </View>
    </Field>
  );
}

export function TimeField({ label, value, onChange, placeholder = 'Pick a time' }) {
  const t = useTheme();
  const open = () => {
    const base = new Date();
    if (value) { const [h, m] = value.split(':').map(Number); base.setHours(h, m, 0, 0); }
    DateTimePickerAndroid.open({ value: base, mode: 'time', is24Hour: false, onChange: (e, d) => { if (e.type === 'set' && d) onChange(timeStrOf(d)); } });
  };
  return (
    <Field label={label}>
      <Pressable accessibilityRole="button" accessibilityLabel={label || 'Pick time'} onPress={open} style={[styles.picker, { backgroundColor: t.glass, borderColor: t.glassBorder }]}>
        <Ionicons name="time-outline" size={18} color={t.textMuted} />
        <T style={{ marginLeft: 10 }} muted={!value}>{value ? fmtTime(value) : placeholder}</T>
      </Pressable>
    </Field>
  );
}

/** Date + time → returns epoch ms via onChange({date, time}). */
export function DateTimeField({ label, date, time, onChange }) {
  return (
    <View>
      <DateField label={label} value={date} onChange={(d) => onChange({ date: d, time })} />
      <TimeField value={time} onChange={(tm) => onChange({ date, time: tm })} />
    </View>
  );
}

export function SubjectPicker({ subjects, value, onChange, allowNone = true }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {allowNone ? <Chip label="None" selected={!value} onPress={() => onChange(null)} /> : null}
      {subjects.map((s) => <Chip key={s.id} label={s.name} selected={value === s.id} onPress={() => onChange(s.id)} />)}
    </View>
  );
}

export function WeekdayPicker({ value, onChange, single }) {
  const names = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const t = useTheme();
  const toggle = (n) => {
    if (single) return onChange([n]);
    onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n]);
  };
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {names.map((nm, i) => {
        const on = value.includes(i + 1);
        return (
          <Pressable key={i} accessibilityRole="button" accessibilityLabel={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]}
            accessibilityState={{ selected: on }} onPress={() => toggle(i + 1)}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.primary : t.glass, borderWidth: 1, borderColor: on ? t.glassHighlight : t.glassBorder }}>
            <Text style={{ color: on ? t.onPrimary : t.text, fontWeight: '700' }}>{nm}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function useSheetState(initial = null) {
  const [state, setState] = useState(initial);
  return [state, setState];
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 20, borderRadius: radius.md, borderWidth: 1 },
  btnSmall: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 1 },
  badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  segment: { flexDirection: 'row', borderRadius: radius.md, borderWidth: 1, padding: 3 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm + 2 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: space.lg, borderWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
  fab: { position: 'absolute', right: 20, bottom: 110, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
  picker: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13 },
});

/** − value + control for numeric tuning (voice speed/pitch, minutes...). */
export function Stepper({ value, onChange, min, max, step = 1, format = (v) => String(v), label }) {
  const t = useTheme();
  const clamp = (v) => Math.round(Math.max(min, Math.min(max, v)) * 100) / 100;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: t.glass, borderRadius: radius.md, borderWidth: 1, borderColor: t.glassBorder, padding: 4 }}>
      <IconButton name="remove" label={`Decrease ${label || ''}`} onPress={() => onChange(clamp(value - step))} />
      <T v="heading" accessibilityLabel={`${label || 'Value'} ${format(value)}`}>{format(value)}</T>
      <IconButton name="add" label={`Increase ${label || ''}`} onPress={() => onChange(clamp(value + step))} />
    </View>
  );
}
