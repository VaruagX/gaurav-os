import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, AppState } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Screen, Card, T, Row, Badge, Button, Chip, Stepper, SwitchRow, SectionHeader, Field } from '../components/ui';
import { useQuery } from '../hooks/useQuery';
import { useSettings } from '../hooks/useSettings';
import { settingsRepository, callLogRepository } from '../database/repositories';
import {
  callNativeAvailable, CALL_LANGS, TIMEOUT_MIN, TIMEOUT_MAX, OUTCOME_LABEL, OUTCOME_TONE, getStatus, requestPermissions, requestRole,
  pushConfig, syncCallEvents, simulateCall, canEnable, missingRequirements,
} from '../services/caller/callAssistant';
import { device } from '../services/reminders/reminderService';
import { fmtDateTime } from '../utils/date';
import { showError, toast } from '../utils/ui';

export default function CallAssistantScreen() {
  const nav = useNavigation();
  const s = useSettings();
  const [st, setSt] = useState(null);
  const [testing, setTesting] = useState(false);
  const log = useQuery(() => callLogRepository.recent(30), [], []);
  const enabled = s.callAssistantEnabled === '1';

  const refresh = useCallback(async () => {
    try { setSt(await getStatus()); await syncCallEvents(); log.reload(); } catch (e) { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => {
    refresh();
    const sub = AppState.addEventListener('change', (a) => a === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]));

  const save = async (k, v) => { await settingsRepository.set(k, v); await pushConfig(); };

  const toggle = async (on) => {
    if (on && !canEnable(st)) return showError(new Error(`Grant these first: ${missingRequirements(st).join(', ')}.`), 'Permissions needed');
    await save('callAssistantEnabled', on ? '1' : '0');
    toast(on ? 'Caller assistant on' : 'Caller assistant off');
  };

  const grant = async () => { await requestPermissions(); await refresh(); await pushConfig(); };
  const role = async () => { try { const ok = await requestRole(); if (!ok) showError(new Error('This phone did not offer the call-screening role.')); } catch (e) { showError(e); } };

  const test = async () => {
    setTesting(true);
    try {
      await simulateCall('Rahul');
      // wait for the native flow to finish, then import its result
      const t0 = Date.now();
      while (Date.now() - t0 < (Number(s.callTimeoutSec) + 25) * 1000) {
        await new Promise((r) => setTimeout(r, 1500));
        if ((await syncCallEvents()) > 0) break;
      }
      log.reload();
    } catch (e) { showError(e, 'Test failed'); } finally { setTesting(false); }
  };

  const row = (title, ok, sub, fix, onFix) => (
    <Row title={title} subtitle={sub} left={<Badge label={ok ? 'OK' : 'FIX'} tone={ok ? 'success' : 'warning'} />}
      right={!ok && onFix ? <Button small variant="secondary" title={fix} onPress={onFix} /> : null} />
  );

  return (
    <Screen title="AI caller assistant" subtitle="Hears who is calling and lets you answer by voice">
      {!callNativeAvailable ? <Card><T muted>This feature needs the installed Android app.</T></Card> : (
        <>
          <Card>
            <SwitchRow label="Announce incoming calls" value={enabled} onValueChange={toggle}
              hint={'Says "<Name> ka call aaya hai. Kya aap call uthana chahte ho?" then listens for "haan, uthao" or "nahi".'} />
            <T v="small" muted>No reply within the timeout = the phone just keeps ringing normally.</T>
          </Card>

          <SectionHeader title="Setup" />
          <Card pad={false} style={{ paddingHorizontal: 16 }}>
            {st ? (
              <>
                {row('Phone state', st.phoneState, 'Detects when a call rings or ends', 'Grant', grant)}
                {row('Answer phone calls', st.answerCalls, 'Lets the app accept or reject the ringing call', 'Grant', grant)}
                {row('Microphone', st.microphone, 'To hear your reply', 'Grant', grant)}
                {row('Contacts (recommended)', st.contacts, 'To say the caller’s name; otherwise “unknown number”', 'Grant', grant)}
                {row('Caller identification role', st.roleHeld, st.roleAvailable ? 'Lets the app see the number before ringing. It never blocks calls.' : 'Not offered by this phone', 'Set', st.roleAvailable ? role : null)}
                {row('Ready service (instant voice + mic)', st.readyRunning || !enabled, enabled ? 'Starts when you open the app. After a reboot, open GAURAV OS once.' : 'Runs while the assistant is on', 'Start', async () => { await pushConfig(); await refresh(); })}
                {row('Far-voice listener (offline yes/no)', st.keywordReady || !enabled, enabled ? 'Loads when the assistant starts (a few seconds after opening the app).' : 'Loads when the assistant is on', 'Start', async () => { await pushConfig(); await refresh(); })}
                {row('Speaker helper (answer on speaker)', st.speakerHelper, 'Android lets only the phone app change call audio. This accessibility helper taps the Speaker button on the call screen after answering. Needed for "on speaker".', 'Enable', () => device.openAccessibility())}
                {row('Speech recogniser', st.recognizer, 'A speech service (Google) must be installed', 'Info', null)}
              </>
            ) : <T muted style={{ paddingVertical: 12 }}>Checking…</T>}
          </Card>
          <Card style={{ marginTop: 10 }}>
            <T v="heading">Redmi / HyperOS</T>
            <T muted style={{ marginTop: 4 }}>Allow Autostart and set Battery to “No restrictions” for GAURAV OS, or the system may stop it from waking for calls.</T>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <Button small variant="secondary" title="Autostart" onPress={() => device.openAutostart()} />
              <Button small variant="secondary" title="Battery" onPress={() => device.openBattery()} />
              <Button small variant="secondary" title="Reminder setup" onPress={() => nav.navigate('ReminderSetup')} />
            </View>
          </Card>

          <SectionHeader title="Settings" />
          <Field label="ANNOUNCEMENT LANGUAGE">
            <View style={{ gap: 8 }}>
              {CALL_LANGS.map((l) => <Chip key={l.id} label={l.label} selected={(s.callLang || 'both') === l.id} onPress={() => save('callLang', l.id)} />)}
            </View>
            <T v="small" faint style={{ marginTop: 6 }}>Example: “{CALL_LANGS.find((l) => l.id === (s.callLang || 'both'))?.sample}”</T>
          </Field>
          <Field label="WAIT FOR YOUR ANSWER" hint="After the announcement, how long to listen before leaving the phone ringing.">
            <Stepper label="response timeout seconds" value={Number(s.callTimeoutSec) || 8} min={TIMEOUT_MIN} max={TIMEOUT_MAX} step={1} format={(v) => `${v} sec`} onChange={(v) => save('callTimeoutSec', v)} />
          </Field>

          <SwitchRow label="Answer on speaker" value={s.callSpeaker !== '0'} onValueChange={(v) => save('callSpeaker', v ? '1' : '0')}
            hint="After you say yes the call is picked up, call volume is raised, and the Speaker button is pressed for you (needs the Speaker helper above)." />
          <SwitchRow label="Lower ringtone while listening" value={s.callDuckRing !== '0'} onValueChange={(v) => save('callDuckRing', v ? '1' : '0')}
            hint="Helps the microphone hear you from further away. The ring volume is restored afterwards." />

          <SectionHeader title="Test" />
          <Card>
            <T muted>Runs the real announcement and microphone flow with a pretend caller “Rahul”. Say “yes” / “yeah” or “no”. No real call is touched.</T>
            <Button title={testing ? 'Listening…' : 'Simulate a call'} icon="call-outline" variant="secondary" loading={testing} onPress={test} style={{ marginTop: 12 }} />
          </Card>

          <SectionHeader title="Recent calls handled" />
          {!log.data.length ? <Card><T muted>Nothing yet.</T></Card> : (
            <Card pad={false} style={{ paddingHorizontal: 16 }}>
              {log.data.map((r) => (
                <Row key={r.id} title={r.name || 'Unknown number'} subtitle={`${fmtDateTime(r.at)}${r.detail ? ` · ${r.detail}` : ''}`}
                  right={<Badge label={OUTCOME_LABEL[r.outcome] || r.outcome} tone={OUTCOME_TONE[r.outcome] || 'neutral'} />} />
              ))}
            </Card>
          )}

          <SectionHeader title="Honest limits" />
          <Card>
            <T style={{ marginBottom: 6 }}>• Answer/reject uses Android’s official ANSWER_PHONE_CALLS permission. It works on the incoming call only; it can’t answer calls from other calling apps.</T>
            <T style={{ marginBottom: 6 }}>• On Android 13+ the Speaker helper may show “restricted setting”: open App info → ⋮ → Allow restricted settings, then enable it under Accessibility.</T>
            <T style={{ marginBottom: 6 }}>• Far-voice listening uses a small offline English yes/no model with automatic gain. It hears much further than normal speech recognition, but a noisy room or a phone very far away can still defeat any microphone. Say “yes”, “yeah”, “okay” or “no”.</T>
            <T style={{ marginBottom: 6 }}>• Your voice is heard by the phone’s microphone, not a Bluetooth headset mic. The announcement plays on the current audio route.</T>
            <T style={{ marginBottom: 6 }}>• Phones may restrict the microphone for apps started from the background. If so, the announcement still plays but your voice can’t be heard and the call just rings. The log will show it.</T>
            <T>• Force-stopping the app disables it until you open the app again.</T>
          </Card>
        </>
      )}
    </Screen>
  );
}
