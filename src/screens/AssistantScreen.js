import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, Pressable, TextInput, PermissionsAndroid, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Native from '../../modules/reminder-native';
import { T, Icon, IconButton, Chip, Card, Sheet } from '../components/ui';
import { useTheme, space, radius } from '../theme';
import { assistantRepository } from '../database/repositories';
import { handleCommand, SUGGESTIONS } from '../services/assistant/engine';
import { GlassBackground, Glass } from '../components/glass';
import { useDrawer } from '../navigation/drawerContext';
import { useSettings } from '../hooks/useSettings';
import { toast } from '../utils/ui';

// Grouped, one-per-line commands. `fill` puts the text in the box (so you can finish it) instead of sending.
const COMMANDS = [
  { title: 'My day', icon: 'sunny-outline', items: [
    { text: 'Summarize my day' }, { text: 'What should I do now?' }] },
  { title: 'Reminders', icon: 'alarm-outline', items: [
    { text: 'Set reminder at 10 PM good night' }, { text: 'Remind me to drink water at 5 PM' }, { text: 'Remind me in 30 minutes', },
    { text: 'Create a daily good night reminder' }, { text: 'Show upcoming reminders' }, { text: 'List all reminders' },
    { text: 'Pause the good night reminder' }, { text: 'Turn on the good night reminder' }, { text: 'Delete the good night reminder' }] },
  { title: 'Classes & attendance', icon: 'school-outline', items: [
    { text: "What are today's classes?" }, { text: "What are tomorrow's classes?" }, { text: 'When is my next class?' }, { text: 'What is tomorrow\'s schedule?' },
    { text: 'Show my attendance' }, { text: 'What is my attendance in ', fill: true }, { text: 'I attended ', fill: true }, { text: 'I missed ', fill: true },
    { text: 'Can I skip tomorrow?' }, { text: 'Can I skip today?' }, { text: 'Show my exams' }, { text: 'Show my assignments' }] },
  { title: 'Tasks & study', icon: 'checkbox-outline', items: [
    { text: 'Show my pending tasks' }, { text: 'Show tasks due today' }, { text: 'Show high priority tasks' }, { text: 'Add task ', fill: true }, { text: 'Mark  complete', fill: true },
    { text: 'Add note ', fill: true }, { text: 'Add idea ', fill: true }, { text: 'Start study mode' }, { text: 'How much did I study today?' }, { text: 'Show my habits' }] },
  { title: 'Money & Khata', icon: 'wallet-outline', items: [
    { text: 'How much did I spend today?' }, { text: 'How much did I spend this month?' }, { text: 'How much did I spend this week?' },
    { text: 'Spent  on ', fill: true }, { text: 'Who owes me money?' }] },
];

function CommandList({ onPick }) {
  const t = useTheme();
  return (
    <View>
      {COMMANDS.map((g) => (
        <View key={g.title} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Icon name={g.icon} size={16} color={t.primary} />
            <T v="caption" muted style={{ marginLeft: 6 }}>{g.title}</T>
          </View>
          {g.items.map((c) => (
            <Pressable key={c.text} accessibilityRole="button" accessibilityLabel={c.text.trim()} onPress={() => onPick(c)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, marginBottom: 6, borderRadius: radius.md, borderWidth: 1,
                borderColor: t.glassBorder, backgroundColor: pressed ? t.glassStrong : t.glass })}>
              <T style={{ flex: 1, fontWeight: '600' }}>{c.text.trim()}{c.fill ? ' …' : ''}</T>
              <Icon name={c.fill ? 'create-outline' : 'arrow-forward'} size={16} color={t.textMuted} />
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function AssistantScreen() {
  const t = useTheme();
  const drawer = useDrawer();
  const [cmdOpen, setCmdOpen] = useState(false);
  const nav = useNavigation();
  const settings = useSettings();
  const [messages, setMessages] = useState([]);
  const [recent, setRecent] = useState([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const listRef = useRef(null);

  const loadHistory = useCallback(async () => {
    const h = await assistantRepository.recent(60);
    setMessages(h.map((m) => ({ id: String(m.id), role: m.role, text: m.text })));
    setRecent((await assistantRepository.recentCommands(6)).map((r) => r.text));
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => { setMuted(settings.speakAssistant === '0'); }, [settings.speakAssistant]);
  useEffect(() => () => { Native?.stopSpeaking?.(); Native?.cancelRecognition?.(); }, []);

  const send = useCallback(async (raw) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput(''); setBusy(true);
    const userMsg = { id: `u${Date.now()}`, role: 'user', text };
    setMessages((m) => [...m, userMsg]);
    try {
      await assistantRepository.add('user', text);
      const res = await handleCommand(text, { userName: settings.userName, pending });
      setPending(res.pending || null);
      await assistantRepository.add('assistant', res.reply, res.intent);
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: 'assistant', text: res.reply, pending: !!res.pending }]);
      setRecent((await assistantRepository.recentCommands(6)).map((r) => r.text));
      if (!muted && Native?.speak) Native.speak(res.reply.replace(/[•⚠✓○\n]+/g, '. '), settings.defaultVoiceLang, Number(settings.defaultVoiceRate) || 1, Number(settings.defaultVoicePitch) || 1).catch(() => {});
      if (res.navigate) setTimeout(() => nav.navigate(res.navigate.screen, res.navigate.params), 600);
    } catch (e) {
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: 'assistant', text: `Something went wrong: ${e.message}` }]);
    } finally { setBusy(false); }
  }, [input, busy, pending, settings, muted, nav]);

  const listen = async () => {
    if (!Native?.recognizeSpeech) return toast('Speech recognition needs the installed Android app.');
    if (listening) { Native.cancelRecognition(); setListening(false); return; }
    if (Platform.OS === 'android') {
      const p = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (p !== PermissionsAndroid.RESULTS.GRANTED) return toast('Microphone permission is needed for voice commands.');
    }
    Native.stopSpeaking?.();
    setListening(true);
    try {
      const heard = await Native.recognizeSpeech(settings.defaultVoiceLang || 'en-US', false);
      setListening(false);
      send(heard);
    } catch (e) { setListening(false); toast(e.message || 'Could not recognise speech.'); }
  };

  useEffect(() => { if (messages.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80); }, [messages.length]);

  const pickCommand = (c) => { setCmdOpen(false); if (c.fill) setInput(c.text); else send(c.text); };

  const renderItem = ({ item }) => {
    const mine = item.role === 'user';
    return (
      <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
        <View style={{ maxWidth: '86%', padding: 12, borderRadius: radius.lg, borderBottomRightRadius: mine ? 4 : radius.lg, borderBottomLeftRadius: mine ? radius.lg : 4,
          backgroundColor: mine ? t.primary : t.glassStrong, borderWidth: 1, borderColor: mine ? t.glassHighlight : t.glassBorder }}>
          <T color={mine ? '#fff' : t.text} selectable>{item.text}</T>
        </View>
        {item.pending ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <Chip label="Yes, do it" selected onPress={() => send('yes')} />
            <Chip label="No" onPress={() => send('no')} />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <GlassBackground />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: space.lg, paddingVertical: space.md, flexDirection: 'row', alignItems: 'center' }}>
          <IconButton name="menu" bg label="Open menu" onPress={drawer.open} style={{ marginRight: space.md }} />
          <View style={{ flex: 1 }}>
            <T v="title">Assistant</T>
            <T v="small" muted>Offline · reads your saved data</T>
          </View>
          <IconButton name={muted ? 'volume-mute-outline' : 'volume-high-outline'} bg label={muted ? 'Unmute spoken replies' : 'Mute spoken replies'}
            onPress={() => { setMuted((m) => !m); Native?.stopSpeaking?.(); }} />
          <IconButton name="trash-outline" bg label="Clear chat" style={{ marginLeft: 8 }}
            onPress={async () => { await assistantRepository.clear(); setMessages([]); setPending(null); setRecent([]); }} />
        </View>

        <FlatList ref={listRef} data={messages} keyExtractor={(m) => m.id} renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 12, flexGrow: 1 }}
          ListEmptyComponent={(
            <View style={{ paddingTop: 8 }}>
              <T v="heading">How can I help?</T>
              <T muted style={{ marginTop: 4, marginBottom: 16 }}>Tap a command, or type or speak your own. I ask before changing your schedule.</T>
              <CommandList onPick={pickCommand} />
            </View>
          )} />

        <View style={{ paddingBottom: 100 }}>
          <View style={{ paddingHorizontal: space.lg, paddingVertical: 8, flexDirection: 'row' }}>
            <Chip label="Commands" icon="list-outline" onPress={() => setCmdOpen(true)} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, gap: 8 }}>
            <TextInput value={input} onChangeText={setInput} onSubmitEditing={() => send()} returnKeyType="send" placeholder={listening ? 'Listening…' : 'Ask or command…'}
              placeholderTextColor={t.textFaint} accessibilityLabel="Message"
              style={{ flex: 1, backgroundColor: t.glassStrong, borderColor: t.glassBorder, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 12, color: t.text, fontSize: 15 }} />
            <Pressable accessibilityRole="button" accessibilityLabel={listening ? 'Stop listening' : 'Speak a command'} onPress={listen}
              style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: listening ? t.danger : t.glassStrong, borderWidth: 1, borderColor: t.glassBorder }}>
              <Icon name={listening ? 'stop' : 'mic'} size={20} color={listening ? '#fff' : t.text} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={() => send()} disabled={busy || !input.trim()}
              style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary, opacity: busy || !input.trim() ? 0.4 : 1 }}>
              <Icon name="arrow-up" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
      <Sheet visible={cmdOpen} title="Commands" onClose={() => setCmdOpen(false)}><CommandList onPick={pickCommand} /></Sheet>
    </SafeAreaView>
  );
}
