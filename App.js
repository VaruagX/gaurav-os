import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View, ActivityIndicator, Text, StatusBar, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { ThemeProvider, useTheme } from './src/theme';
import Navigation, { navigationRef } from './src/navigation';
import LockScreen from './src/components/LockScreen';
import { startPromptSync, syncPromptEvents, pushWidget } from './src/services/prompts';
import { initDatabase } from './src/database/db';
import { settingsRepository } from './src/database/repositories';
import Native from './modules/reminder-native';
import { Pressable } from 'react-native';
import { pushConfig, syncCallEvents } from './src/services/caller/callAssistant';
import { rescheduleAllFromDb, syncNativeEvents, requestNotificationPermission, nativeAvailable } from './src/services/reminders/reminderService';

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#121316', padding: 24, justifyContent: 'center' }}>
          <Text style={{ color: '#F3F3F0', fontSize: 22, fontWeight: '700' }}>Something went wrong</Text>
          <Text style={{ color: '#9AA0A8', marginTop: 8 }}>{String(this.state.error?.message || this.state.error)}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

/** Shown whenever a reminder/alarm is currently playing, so it can always be stopped from inside the app. */
function ActiveReminderBanner() {
  const t = useTheme();
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!nativeAvailable || !Native?.isReminderActive) return undefined;
    const poll = () => Native.isReminderActive().then(setActive).catch(() => {});
    poll();
    const id = setInterval(poll, 1500);
    return () => clearInterval(id);
  }, []);
  if (!active) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Stop playing reminder"
      onPress={() => { Native.stopActiveReminder().then(() => { setActive(false); syncNativeEvents(); }); }}
      style={{ position: 'absolute', top: 48, left: 16, right: 16, backgroundColor: t.danger, borderRadius: 16, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 12 }}>
      <Text style={{ color: '#fff', fontWeight: '700' }}>Reminder is playing</Text>
      <Text style={{ color: '#fff', fontWeight: '800' }}>STOP</Text>
    </Pressable>
  );
}

/** gauravos://… links from notification buttons and the home-screen widget. */
function openLink(url) {
  if (!url || !url.startsWith('gauravos://')) return;
  const path = url.slice('gauravos://'.length).replace(/\/+$/, '');
  const go = () => {
    const n = navigationRef;
    if (path === 'attendance') n.navigate('Attendance');
    else if (path === 'quick/task') n.navigate('Tasks', { add: true });
    else if (path === 'quick/expense') n.navigate('Expenses', { add: true });
    else if (path === 'quick/note') n.navigate('Module', { module: 'notes', add: true });
    else if (path === 'backup') n.navigate('Settings', { backup: Date.now() });
    else if (path === 'home') n.navigate('Tabs', { screen: 'Home' });
  };
  let tries = 0;
  const wait = () => { if (navigationRef.isReady()) go(); else if (tries++ < 40) setTimeout(wait, 150); };
  wait();
}

function Shell({ locked, onUnlock }) {
  const t = useTheme();
  useEffect(() => {
    Linking.getInitialURL().then(openLink).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => openLink(e.url));
    return () => { sub.remove(); if (stopSync) stopSync(); };
  }, []);
  return (
    <>
      <StatusBar barStyle={t.mode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
      <Navigation />
      <ActiveReminderBanner />
      {locked ? <LockScreen onUnlock={onUnlock} /> : null}
    </>
  );
}

export default function App() {
  const [state, setState] = useState({ ready: false, error: null, theme: 'system', locked: false });
  const setTheme = useCallback((theme) => setState((s) => ({ ...s, theme })), []);

  useEffect(() => {
    let stopSync = null;
    (async () => {
      try {
        await Font.loadAsync(Ionicons.font);
        await initDatabase();
        const theme = await settingsRepository.get('theme');
        const locked = (await settingsRepository.get('appLock')) === '1';
        setState({ ready: true, error: null, theme: theme || 'system', locked });
        // Re-arm alarms (idempotent) and import what the native layer recorded while the app was closed.
        await rescheduleAllFromDb();
        await syncNativeEvents();
        await syncPromptEvents().catch(() => {});
        stopSync = startPromptSync();
        await pushConfig().catch(() => {});
        await syncCallEvents().catch(() => {});
        if (nativeAvailable && !(await settingsRepository.get('askedNotifications'))) {
          await settingsRepository.set('askedNotifications', '1');
          await requestNotificationPermission();
        }
      } catch (e) { setState((s) => ({ ...s, ready: true, error: e })); }
    })();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') settingsRepository.get('appLock').then((v) => { if (v === '1') setState((x) => ({ ...x, locked: true })); }).catch(() => {});
      if (s === 'active') { syncPromptEvents().then(() => pushWidget()).catch(() => {}); syncNativeEvents().catch(() => {}); syncCallEvents().catch(() => {}); pushConfig().catch(() => {}); } });
    return () => { sub.remove(); if (stopSync) stopSync(); };
  }, []);

  if (!state.ready) {
    return <View style={{ flex: 1, backgroundColor: '#16181D', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#F3F3F0" /></View>;
  }
  if (state.error) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121316', padding: 24, justifyContent: 'center' }}>
        <Text style={{ color: '#F3F3F0', fontSize: 22, fontWeight: '700' }}>Could not start GAURAV OS</Text>
        <Text style={{ color: '#9AA0A8', marginTop: 8 }}>{String(state.error.message || state.error)}</Text>
      </View>
    );
  }
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider preference={state.theme} setPreference={setTheme}>
          <Shell locked={state.locked} onUnlock={() => setState((x) => ({ ...x, locked: false }))} />
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
