import React, { useState } from 'react';
import { View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from '@react-navigation/native';
import { Screen, Card, T, Button, Chip, Checkbox, SectionHeader, Badge, SwitchRow, EmptyState, Loading } from '../../components/ui';
import FormSheet from '../../components/FormSheet';
import Native from '../../../modules/reminder-native';
import { parseTimetable, toSlots } from '../../services/college/timetableOcr';
import { subjectsRepository, timetableRepository } from '../../database/repositories';
import { WEEKDAYS_LONG, fmtTime } from '../../utils/date';
import { attempt, toast, confirm } from '../../utils/ui';

const FIELDS = [
  { key: 'subject', label: 'Subject', required: true },
  { key: 'start_time', label: 'Starts', type: 'time', required: true },
  { key: 'end_time', label: 'Ends', type: 'time', required: true },
  { key: 'kind', label: 'Type', type: 'segmented', options: [{ label: 'Theory', value: 'theory' }, { label: 'Practical', value: 'practical' }] },
  { key: 'room', label: 'Classroom / lab' },
  { key: 'teacher', label: 'Teacher' },
];

export default function TimetableImportScreen() {
  const nav = useNavigation();
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [batch, setBatch] = useState(null);
  const [slots, setSlots] = useState([]);
  const [replace, setReplace] = useState(true);
  const [editing, setEditing] = useState(null);

  const rebuild = (p, b) => setSlots(toSlots(p, b));

  const pick = () => attempt(async () => {
    if (!Native?.recognizeText) throw new Error('Photo reading is only available in the installed Android app.');
    const res = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.length) return;
    setBusy(true);
    try {
      const lines = JSON.parse(await Native.recognizeText(res.assets[0].uri));
      const p = parseTimetable(lines);
      if (p.error) throw new Error(p.error);
      const b = p.batches.length === 1 ? p.batches[0] : null;
      setParsed(p); setBatch(b); rebuild(p, b);
    } finally { setBusy(false); }
  }, 'Could not read the photo');

  const chooseBatch = (b) => { setBatch(b); rebuild(parsed, b); };
  const update = (key, patch) => setSlots((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const save = () => attempt(async () => {
    const chosen = slots.filter((s) => s.include);
    if (!chosen.length) throw new Error('Nothing selected to import.');
    if (replace && !(await confirm('Replace your timetable?', 'The current weekly timetable is replaced by these lectures. Attendance you already marked is kept.', { confirmText: 'Import' }))) return;
    setBusy(true);
    try {
      if (replace) for (const r of await timetableRepository.week()) await timetableRepository.remove(r.id);
      const ids = new Map();
      let added = 0;
      for (const s of chosen) {
        let id = ids.get(s.subject);
        if (!id) {
          const found = await subjectsRepository.findByName(s.subject);
          id = found ? found.id : await subjectsRepository.insert({ name: s.subject, kind: 'both', teacher: s.teacher || null, target_pct: 75 });
          ids.set(s.subject, id);
        }
        try {
          await timetableRepository.insert({ subject_id: id, weekday: s.weekday, start_time: s.start_time, end_time: s.end_time, kind: s.kind, room: s.room || null, teacher: s.teacher || null });
          added += 1;
        } catch (e) { if (!/UNIQUE/i.test(e.message)) throw e; }
      }
      toast(`Imported ${added} lectures, ${ids.size} subjects`);
      nav.goBack();
    } finally { setBusy(false); }
  }, 'Import failed');

  return (
    <Screen title="Import timetable" subtitle="Read your timetable from a photo">
      {!parsed ? (
        busy ? <Loading /> : (
          <EmptyState icon="image-outline" title="Add a photo of your timetable"
            text="Pick a clear, straight-on photo or screenshot. Text is read on your phone — nothing is uploaded. You can review and fix everything before it is saved."
            action="Choose photo" onAction={pick} />
        )
      ) : (
        <>
          {parsed.batches.length > 1 ? (
            <>
              <SectionHeader title="Your batch" style={{ marginTop: 0 }} />
              <View style={{ flexDirection: 'row', gap: 8 }}>{parsed.batches.map((b) => <Chip key={b} label={`Batch ${b}`} selected={batch === b} onPress={() => chooseBatch(b)} />)}</View>
              <T v="small" faint style={{ marginTop: 6 }}>Practical slots list one entry per batch. Only your batch is imported.</T>
            </>
          ) : null}
          {parsed.batches.length > 1 && !batch ? (
            <Card style={{ marginTop: 12 }}><T muted>Choose your batch to see your practicals. Theory lectures appear after you pick.</T></Card>
          ) : null}
          {slots.length ? (
            <>
              <T muted style={{ marginTop: 12 }}>{slots.filter((s) => s.include).length} of {slots.length} lectures selected · tap a lecture to fix it</T>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const day = slots.filter((s) => s.weekday === d);
                if (!day.length) return null;
                return (
                  <View key={d}>
                    <SectionHeader title={WEEKDAYS_LONG[d - 1]} />
                    <Card pad={false}>
                      {day.map((s, i) => (
                        <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, opacity: s.include ? 1 : 0.45, borderTopWidth: i ? 0.5 : 0, borderColor: 'rgba(128,128,128,0.3)' }}>
                          <Checkbox checked={s.include} label={`Include ${s.subject}`} onPress={() => update(s.key, { include: !s.include })} />
                          <View style={{ flex: 1 }}>
                            <T onPress={() => setEditing(s)} style={{ fontWeight: '700' }}>{s.subject}</T>
                            <T v="small" muted onPress={() => setEditing(s)}>{fmtTime(s.start_time)} – {fmtTime(s.end_time)}{s.room ? ` · ${s.room}` : ''}{s.teacher ? ` · ${s.teacher}` : ''}</T>
                          </View>
                          <Badge label={s.kind === 'practical' ? 'PRACTICAL' : 'THEORY'} />
                        </View>
                      ))}
                    </Card>
                  </View>
                );
              })}
              <View style={{ marginTop: 20 }}>
                <SwitchRow label="Replace current timetable" hint="Turn off to add these on top of what you already have." value={replace} onValueChange={setReplace} />
                <Button title={`Import ${slots.filter((s) => s.include).length} lectures`} icon="download-outline" onPress={save} loading={busy} />
                <Button title="Choose another photo" variant="ghost" onPress={pick} style={{ marginTop: 8 }} />
              </View>
            </>
          ) : parsed.batches.length <= 1 ? (
            <EmptyState icon="alert-circle-outline" title="No lectures found" text="Try a sharper photo with the whole table visible." action="Choose another photo" onAction={pick} />
          ) : null}
        </>
      )}
      <FormSheet visible={!!editing} title="Fix lecture" fields={FIELDS} initial={editing || {}} onClose={() => setEditing(null)}
        onSubmit={async (v) => update(editing.key, { subject: v.subject.trim().toUpperCase(), start_time: v.start_time, end_time: v.end_time, kind: v.kind || 'theory', room: v.room || null, teacher: v.teacher || null })} />
    </Screen>
  );
}
