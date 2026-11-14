import React, { useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Defs, RadialGradient, LinearGradient, Stop, Rect, Circle } from 'react-native-svg';
import { useTheme } from '../theme';

/** Soft ambient colour glows behind every screen — this is what the glass surfaces "refract". */
export function GlassBackground() {
  const t = useTheme();
  const dark = t.mode === 'dark';
  const a = dark ? 0.55 : 0.5;
  const { width: W, height: H } = Dimensions.get('screen');
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          {[['g1', t.glow1], ['g2', t.glow2], ['g3', t.glow3]].map(([id, c]) => (
            <RadialGradient key={id} id={id} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={c} stopOpacity={a} />
              <Stop offset="1" stopColor={c} stopOpacity="0" />
            </RadialGradient>
          ))}
        </Defs>
        <Circle cx={W * 0.12} cy={H * 0.04} r="300" fill="url(#g1)" />
        <Circle cx={W * 1.05} cy={H * 0.34} r="260" fill="url(#g2)" />
        <Circle cx={-W * 0.05} cy={H * 0.82} r="280" fill="url(#g3)" opacity={dark ? 0.7 : 0.8} />
      </Svg>
    </View>
  );
}

/** Diagonal two-stop gradient that fills its parent (measured in pixels so Android always paints the full area). */
export function GradientFill({ from, to, opacity = 1 }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w > 0 ? (
        <Svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
          <Defs>
            <LinearGradient id="gf" x1="0" y1="0" x2={size.w} y2={size.h} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={from} stopOpacity={opacity} />
              <Stop offset="1" stopColor={to} stopOpacity={opacity} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={size.w} height={size.h} fill="url(#gf)" />
        </Svg>
      ) : null}
    </View>
  );
}

/** Frosted-glass surface: translucent fill, bright hairline border and a top-edge light catch. */
export function Glass({ children, style, strong, radius = 22, pad, tint }) {
  const t = useTheme();
  return (
    <View style={[{
      backgroundColor: tint || (strong ? t.glassStrong : t.glass), borderColor: t.glassBorder, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius,
      overflow: 'hidden',
      padding: pad,
    }, style]}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: radius * 0.6, right: radius * 0.6, height: 1, backgroundColor: t.glassHighlight, opacity: t.mode === 'dark' ? 0.35 : 0.9 }} />
      {children}
    </View>
  );
}
