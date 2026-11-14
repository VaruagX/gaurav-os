import React, { useCallback, useEffect, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { GlassBackground, Glass } from './glass';
import { Icon, T } from './ui';
import { authenticate, biometricsAvailable, checkPin } from '../services/appLock';

/** Full-screen PIN / fingerprint gate shown over the app while locked. */
export default function LockScreen({ onUnlock }) {
  const t = useTheme();
  const [pin, setPin] = useState('');
  const [bio, setBio] = useState(false);
  const [bad, setBad] = useState(false);

  const tryBio = useCallback(async () => { if (await authenticate().catch(() => false)) onUnlock(); }, [onUnlock]);
  useEffect(() => { biometricsAvailable().then((ok) => { setBio(ok); if (ok) tryBio(); }); }, [tryBio]);

  const press = async (d) => {
    const next = (pin + d).slice(0, 6);
    setPin(next); setBad(false);
    if (next.length >= 4 && (await checkPin(next))) onUnlock();
    else if (next.length === 6) { setBad(true); setPin(''); }
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', bio ? 'bio' : '', '0', 'del'];
  return (
    <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
      <GlassBackground />
      <Icon name="lock-closed" size={34} color={t.primary} />
      <T v="title" style={{ marginTop: 12 }}>GAURAV OS is locked</T>
      <T muted style={{ marginTop: 4 }}>{bad ? 'Wrong PIN, try again' : 'Enter your PIN'}</T>
      <View style={{ flexDirection: 'row', gap: 12, marginVertical: 24 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => <View key={i} style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: i < pin.length ? t.primary : t.glassStrong, borderWidth: 1, borderColor: t.glassBorder }} />)}
      </View>
      <View style={{ width: 270, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {keys.map((k, i) => (
          <Pressable key={i} disabled={!k} accessibilityRole="button" accessibilityLabel={k === 'del' ? 'Delete' : k === 'bio' ? 'Use fingerprint' : k}
            onPress={() => (k === 'del' ? setPin((p) => p.slice(0, -1)) : k === 'bio' ? tryBio() : press(k))}
            style={({ pressed }) => ({ width: 78, height: 78, marginBottom: 12, borderRadius: 39, alignItems: 'center', justifyContent: 'center', opacity: k ? 1 : 0, backgroundColor: pressed ? t.glassStrong : t.glass, borderWidth: 1, borderColor: t.glassBorder })}>
            {k === 'del' ? <Icon name="backspace-outline" size={24} /> : k === 'bio' ? <Icon name="finger-print" size={28} color={t.primary} /> : <Text style={{ color: t.text, fontSize: 26, fontWeight: '600' }}>{k}</Text>}
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}
