import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Animated, Easing, Pressable } from 'react-native';
import Svg, { Path, Circle, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../../theme';
import { T } from '../ui';

/** Number that counts up/down to its new value. */
export function AnimatedNumber({ value, format = (v) => String(Math.round(v)), style, color }) {
  const anim = useRef(new Animated.Value(value)).current;
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setShown(v));
    Animated.timing(anim, { toValue: value, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => anim.removeListener(id);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <T style={style} color={color} accessibilityLabel={format(value)}>{format(shown)}</T>;
}

/** Horizontal progress bar whose fill animates to the new value (0..1+, capped at full width). */
export function AnimatedBar({ value, color, height = 8, track }) {
  const t = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(anim, { toValue: Math.max(0, Math.min(1, value || 0)), duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track || t.surface2, overflow: 'hidden' }}
      accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(1, value || 0) * 100) }}>
      <Animated.View style={{ height: '100%', borderRadius: height, backgroundColor: color || t.primary, width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

/**
 * Tappable bar chart that grows in when data changes.
 * data: [{key, label, values:[v1, v2?]}]  colors: one per series.  Tap a bar to read its exact values.
 */
export function BarChart({ data, colors, series = [], height = 150, format = (v) => String(v), labelEvery = 1, title }) {
  const t = useTheme();
  const grow = useRef(new Animated.Value(0)).current;
  const [sel, setSel] = useState(null);
  const sig = useMemo(() => data.map((d) => d.values.join(',')).join('|'), [data]);
  useEffect(() => { setSel(null); grow.setValue(0); Animated.timing(grow, { toValue: 1, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const chartH = height - 8;
  const narrow = data.length > 20;
  const picked = sel !== null ? data[sel] : null;
  return (
    <View>
      <View style={{ minHeight: 40, marginBottom: 8 }}>
        {picked ? (
          <View accessibilityLiveRegion="polite">
            <T v="small" muted>{picked.full || picked.label}</T>
            <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
              {picked.values.map((v, i) => (
                <T key={i} style={{ fontWeight: '700' }} color={colors[i]}>{series[i] ? `${series[i]} ` : ''}{format(v)}</T>
              ))}
            </View>
          </View>
        ) : <T v="small" faint>{title || 'Tap a bar for details'}</T>}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: narrow ? 2 : 6 }}>
        {data.map((d, i) => (
          <Pressable key={d.key} accessibilityRole="button" accessibilityLabel={`${d.full || d.label}: ${d.values.map(format).join(', ')}`} onPress={() => setSel(sel === i ? null : i)}
            style={{ flex: 1, height: '100%', flexDirection: 'row', alignItems: 'flex-end', gap: 1, opacity: sel === null || sel === i ? 1 : 0.35 }}>
            {d.values.map((v, k) => (
              <Animated.View key={k} style={{
                flex: 1, borderRadius: narrow ? 2 : 6, backgroundColor: v > 0 ? colors[k] : t.surface2,
                height: grow.interpolate({ inputRange: [0, 1], outputRange: [2, Math.max(3, (v / max) * chartH)] }),
              }} />
            ))}
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: narrow ? 2 : 6, marginTop: 6 }}>
        {data.map((d, i) => <View key={d.key} style={{ flex: 1, alignItems: 'center' }}><T v="small" faint style={{ fontSize: 10, width: 44, textAlign: 'center' }}>{i % labelEvery === 0 ? d.label : ''}</T></View>)}
      </View>
      {series.length > 1 ? (
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
          {series.map((s, i) => <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors[i] }} /><T v="small" muted>{s}</T></View>)}
        </View>
      ) : null}
    </View>
  );
}

/** Donut with a sweep-in animation. Tap a legend row / slice via onSelect(index). */
export function DonutChart({ data, size = 170, thickness = 22, selected = null, onSelect, center }) {
  const t = useTheme();
  const sweep = useRef(new Animated.Value(0)).current;
  const [p, setP] = useState(0);
  const sig = data.map((d) => d.total).join(',');
  useEffect(() => {
    sweep.setValue(0);
    const id = sweep.addListener(({ value }) => setP(value));
    Animated.timing(sweep, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => sweep.removeListener(id);
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = data.reduce((a, d) => a + d.total, 0);
  const r = (size - thickness) / 2, C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.surface2} strokeWidth={thickness} fill="none" />
        {total > 0 ? data.map((d, i) => {
          const len = (d.total / total) * C;
          const visible = Math.max(0, Math.min(len, p * C - offset));
          const dash = `${Math.max(0, visible - 2)} ${C}`;
          const el = (
            <Circle key={`${d.name}${i}`} cx={size / 2} cy={size / 2} r={r} stroke={d.color} fill="none" strokeLinecap="butt"
              strokeWidth={selected === i ? thickness + 6 : thickness} strokeDasharray={dash} strokeDashoffset={-offset}
              opacity={selected === null || selected === i ? 1 : 0.35} transform={`rotate(-90 ${size / 2} ${size / 2})`} onPress={() => onSelect && onSelect(selected === i ? null : i)} />
          );
          offset += len;
          return el;
        }) : null}
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center', paddingHorizontal: thickness + 8 }} pointerEvents="none">{center}</View>
    </View>
  );
}

/**
 * Cumulative spending line for the month (area) with last month as a dashed comparison line.
 * Touch / drag to read the exact value for a day.
 */
export function TrendChart({ current, previous = [], height = 150, format, activeDays, monthDays, color }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const [sel, setSel] = useState(null);
  const grow = useRef(new Animated.Value(0)).current;
  const [g, setG] = useState(0);
  const sig = current.join(',') + '|' + previous.join(',');
  useEffect(() => {
    setSel(null); grow.setValue(0);
    const id = grow.addListener(({ value }) => setG(value));
    Animated.timing(grow, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => grow.removeListener(id);
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = monthDays;
  const max = Math.max(1, ...current.slice(0, activeDays), ...previous);
  const pad = 6;
  const x = (i) => (n <= 1 ? 0 : (i / (n - 1)) * (w - 2 * pad)) + pad;
  const y = (v) => height - pad - (v / max) * (height - 2 * pad - 6) * g;
  const line = (arr, upto) => arr.slice(0, upto).map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const cur = line(current, activeDays);
  const area = activeDays > 0 && w ? `${cur} L${x(activeDays - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z` : '';
  const move = (e) => {
    if (!w) return;
    const i = Math.round(((e.nativeEvent.locationX - pad) / (w - 2 * pad)) * (n - 1));
    setSel(Math.max(0, Math.min(n - 1, i)));
  };
  const c = color || t.primary;
  return (
    <View>
      <View style={{ minHeight: 40, marginBottom: 6 }} accessibilityLiveRegion="polite">
        {sel !== null ? (
          <>
            <T v="small" muted>Day {sel + 1}</T>
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <T style={{ fontWeight: '700' }}>{sel < activeDays ? format(current[sel]) : '—'}</T>
              {previous[sel] !== undefined ? <T muted>last month {format(previous[sel])}</T> : null}
            </View>
          </>
        ) : <T v="small" faint>Touch the chart to see spending up to any day</T>}
      </View>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }} onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
        onResponderGrant={move} onResponderMove={move} onResponderRelease={() => {}}>
        {w > 0 ? (
          <Svg width={w} height={height}>
            <Defs><LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={c} stopOpacity="0.25" /><Stop offset="1" stopColor={c} stopOpacity="0" /></LinearGradient></Defs>
            <Line x1={pad} x2={w - pad} y1={height - pad} y2={height - pad} stroke={t.border} strokeWidth={1} />
            {previous.length ? <Path d={line(previous, n)} stroke={t.textFaint} strokeWidth={1.5} strokeDasharray="4 4" fill="none" /> : null}
            {area ? <Path d={area} fill="url(#fill)" /> : null}
            {cur ? <Path d={cur} stroke={c} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
            {sel !== null ? <Line x1={x(sel)} x2={x(sel)} y1={0} y2={height - pad} stroke={t.textFaint} strokeWidth={1} /> : null}
            {sel !== null && sel < activeDays ? <Circle cx={x(sel)} cy={y(current[sel])} r={5} fill={c} stroke={t.surface} strokeWidth={2} /> : null}
          </Svg>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        {[1, Math.ceil(n / 4), Math.ceil(n / 2), Math.ceil((3 * n) / 4), n].map((d, i) => <T key={i} v="small" faint style={{ fontSize: 10 }}>{d}</T>)}
      </View>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: c }} /><T v="small" muted>This month</T></View>
        {previous.length ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 14, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: t.textFaint }} /><T v="small" muted>Last month</T></View> : null}
      </View>
    </View>
  );
}
