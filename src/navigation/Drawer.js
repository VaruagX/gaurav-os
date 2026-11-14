import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Dimensions, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useSettings } from '../hooks/useSettings';
import { GlassBackground, GradientFill, Glass } from '../components/glass';
import { DrawerContext } from './drawerContext';

const TABS = new Set(['Home', 'Assistant', 'Reminders', 'College', 'Routine', 'Progress']);

// [icon, label, route, params?]
export const MENU = [
  { title: 'Main', items: [
    ['home-outline', 'Home', 'Home'], ['chatbubble-ellipses-outline', 'Assistant', 'Assistant'], ['alarm-outline', 'Reminders', 'Reminders'],
    ['school-outline', 'College', 'College'], ['repeat-outline', 'Routine', 'Routine'], ['stats-chart-outline', 'Progress', 'Progress'],
  ] },
  { title: 'Money & life', items: [
    ['wallet-outline', 'Money', 'Expenses'], ['book-outline', 'My Khata', 'Khata'], ['checkbox-outline', 'Tasks', 'Tasks'],
    ['create-outline', 'Notes & ideas', 'Module', { module: 'notes' }], ['flag-outline', 'Goals', 'Module', { module: 'goals' }],
    ['lock-closed-outline', 'Vault', 'Vault'],
  ] },
  { title: 'Study', items: [
    ['calendar-number-outline', 'Study planner', 'StudyPlanner'], ['timer-outline', 'Focus timer', 'FocusTimer'], ['refresh-circle-outline', 'Revision', 'Revision'],
    ['albums-outline', 'Flashcards', 'Flashcards'], ['help-circle-outline', 'MCQ practice', 'Mcq'],
  ] },
  { title: 'College', items: [
    ['checkmark-done-outline', 'Attendance', 'Attendance'], ['calendar-outline', 'Timetable', 'Timetable'], ['document-text-outline', 'Assignments', 'Assignments'],
    ['ribbon-outline', 'Exams', 'Exams'], ['list-outline', 'Syllabus', 'Syllabus'], ['flask-outline', 'Practicals', 'Practicals'], ['trophy-outline', 'Marks', 'Marks'],
  ] },
  { title: 'Tools', items: [
    ['call-outline', 'AI caller assistant', 'CallAssistant'], ['time-outline', 'Reminder history', 'ReminderHistory'], ['settings-outline', 'Settings', 'Settings'],
  ] },
];

/** Slide-out navigation drawer. Wrap the navigator; pass the navigation ref so it can navigate from outside the tree. */
export default function DrawerHost({ navRef, children }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const width = Math.min(320, Dimensions.get('window').width * 0.84);
  const x = useRef(new Animated.Value(-width)).current; // panel translateX
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState('Home');
  const openRef = useRef(false);

  const animate = useCallback((to, done) => Animated.timing(x, { toValue: to, duration: 240, useNativeDriver: true }).start(done), [x]);
  const open = useCallback(() => {
    const r = navRef?.current?.getCurrentRoute?.();
    setCurrent(r?.params?.module || r?.name || 'Home');
    openRef.current = true; setVisible(true); animate(0);
  }, [animate, navRef]);
  const close = useCallback((cb) => {
    openRef.current = false; animate(-width, () => { if (!openRef.current) setVisible(false); if (typeof cb === 'function') cb(); });
  }, [animate, width]);
  const ctx = useMemo(() => ({ open, close, toggle: () => (openRef.current ? close() : open()) }), [open, close]);

  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => sub.remove();
  }, [visible, close]);

  const go = (route, params) => {
    close(() => {
      const nav = navRef?.current;
      if (!nav) return;
      if (TABS.has(route)) nav.navigate('Tabs', { screen: route });
      else nav.navigate(route, params);
    });
  };

  const scrim = x.interpolate({ inputRange: [-width, 0], outputRange: [0, 1], extrapolate: 'clamp' });

  // Swipe from the left edge to open.
  const edge = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dx > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderGrant: () => { setVisible(true); setCurrent(navRef?.current?.getCurrentRoute?.()?.params?.module || navRef?.current?.getCurrentRoute?.()?.name || 'Home'); },
    onPanResponderMove: (_, g) => x.setValue(Math.min(0, -width + g.dx)),
    onPanResponderRelease: (_, g) => { if (g.dx > width * 0.3 || g.vx > 0.5) { openRef.current = true; animate(0); } else { openRef.current = false; animate(-width, () => setVisible(false)); } },
  }), [animate, navRef, width, x]);
  // Swipe left on the panel to close.
  const panel = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dx < -10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => x.setValue(Math.max(-width, Math.min(0, g.dx))),
    onPanResponderRelease: (_, g) => { if (g.dx < -width * 0.25 || g.vx < -0.5) close(); else { openRef.current = true; animate(0); } },
  }), [animate, close, width, x]);

  const initial = (s.userName || 'G').trim().charAt(0).toUpperCase();

  return (
    <DrawerContext.Provider value={ctx}>
      <View style={{ flex: 1 }}>
        {children}
        {!visible ? <View {...edge.panHandlers} style={{ position: 'absolute', left: 0, top: 80, bottom: 120, width: 14 }} /> : null}
        {visible ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay, opacity: scrim }]}>
              <Pressable style={{ flex: 1 }} onPress={() => close()} accessibilityLabel="Close menu" />
            </Animated.View>
            <Animated.View {...panel.panHandlers} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width, transform: [{ translateX: x }], backgroundColor: t.bg,
              borderRightWidth: StyleSheet.hairlineWidth, borderColor: t.glassBorder, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, elevation: 24, overflow: 'hidden' }}>
              <GlassBackground />
              <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 12 }}>
                <Glass strong radius={22} style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
                  <View style={{ width: 48, height: 48, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                    <GradientFill from={t.primary} to={t.primary2} />
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{initial}</Text>
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{s.userName || 'Gaurav'}</Text>
                    <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 2 }}>GAURAV OS · Personal assistant</Text>
                  </View>
                </Glass>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 24 }}>
                {MENU.map((sec) => (
                  <View key={sec.title} style={{ marginBottom: 6 }}>
                    <Text style={{ color: t.textFaint, fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', marginTop: 14, marginBottom: 6, marginLeft: 12 }}>{sec.title}</Text>
                    {sec.items.map(([icon, label, route, params]) => {
                      const on = current === (params?.module || route);
                      return (
                        <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={() => go(route, params)}
                          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, borderRadius: 16, marginBottom: 2,
                            backgroundColor: on ? t.glassStrong : pressed ? t.glass : 'transparent', borderWidth: on ? StyleSheet.hairlineWidth : 0, borderColor: t.glassBorder })}>
                          <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: on ? 'transparent' : t.glass }}>
                            {on ? <GradientFill from={t.primary} to={t.primary2} /> : null}
                            <Ionicons name={icon} size={18} color={on ? '#fff' : t.textMuted} />
                          </View>
                          <Text style={{ color: on ? t.text : t.textMuted, fontWeight: on ? '700' : '600', fontSize: 15, marginLeft: 12, flex: 1 }}>{label}</Text>
                          {on ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.primary }} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            </Animated.View>
          </View>
        ) : null}
      </View>
    </DrawerContext.Provider>
  );
}
