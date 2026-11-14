import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { GradientFill } from '../components/glass';

const ICONS = {
  Home: ['home-outline', 'home'], Assistant: ['chatbubble-ellipses-outline', 'chatbubble-ellipses'], Reminders: ['alarm-outline', 'alarm'],
  College: ['school-outline', 'school'], Routine: ['repeat-outline', 'repeat'], Progress: ['stats-chart-outline', 'stats-chart'],
};

/** Floating pill tab bar. The focused tab expands to show its label. */
export default function TabBar({ state, navigation }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 4 }]}>
      <View style={[styles.bar, { backgroundColor: t.bar, borderColor: t.glassBorder, shadowColor: t.mode === 'dark' ? '#000' : t.shadow }]}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const [off, on] = ICONS[route.name];
          return (
            <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={route.name} accessibilityState={{ selected: focused }}
              onPress={() => {
                const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
              }}
              style={[styles.item, focused && { overflow: 'hidden' }]}>
              {focused ? <GradientFill from={t.primary} to={t.primary2} /> : null}
              <Ionicons name={focused ? on : off} size={20} color={focused ? '#fff' : t.textMuted} />
              {focused ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', marginLeft: 6 }}>{route.name}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 30, borderWidth: 1, padding: 6, width: '100%', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 22 },
});
