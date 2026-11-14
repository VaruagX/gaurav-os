import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Screen, Card, T, Row, Input, Field, Segmented, Button, WeekdayPicker, IconButton, Badge, SectionHeader, Loading } from '../components/ui';
import FormSheet from '../components/FormSheet';
import { useQuery } from '../hooks/useQuery';
import { routinesRepository as routines } from '../database/repositories';
import { syncRoutineReminders, deleteRoutine, deleteStep, syncStepReminder, parseStepList, TEMPLATES } from '../services/routine/routineService';
import { parseWeekdays, serializeWeekdays } from '../services/reminders/schedule';
import { fmtTime } from '../utils/date';
import { confirm, showError, toast } from '../utils/ui';

const STEP_FIELDS = [
  { key: 'title', label: 'Step', required: true, placeholder: 'e.g. Breakfast' },
  { key: 'time', label: 'Time (optional)', type: 'time' },
  { key: 'minutes', label: 'Minutes', type: 'number' },
  { key: 'remind', label: 'Remind me at this time (spoken)', type: 'toggle', hint: 'Needs a time. Repeats on the routine days.' },
];

export default function RoutineEditorScreen() {
  const nav = useNavigation();
  const { params } = useRoute();
  const [id, setId] = useState(params?.id || null);
  const [form, setForm] = useState({ name: '', kind: 'custom', days: [1, 2, 3, 4, 5, 6, 7] });
  const [quick, setQuick] = useState('');
  const [editStep, setEditStep] = useState(null);
  const steps = useQuery(() => (id ? routines.steps(id) : []), [id], []);

  useEffect(() => {
    (async () => {
      if (params?.id) {
        const r = await routines.get(params.id);
        if (r) setForm({ name: r.name, kind: r.kind, days: parseWeekdays(r.weekdays) });
      } else if (params?.template) {
        const tpl = TEMPLATES[params.template];
        setForm({ name: tpl.name, kind: tpl.kind, days: [1, 2, 3, 4, 5, 6, 7] });
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = async () => {
    const name = form.name.trim();
    if (!name) throw new Error('Give the routine a name.');
    if (!form.days.length) throw new Error('Select at least one day.');
    const row = { name, kind: form.kind, weekdays: serializeWeekdays(form.days) };
    let rid = id;
    if (rid) await routines.update(rid, row); else {
      rid = await routines.insert(row);
      setId(rid);
      if (params?.template) for (const [title, time] of TEMPLATES[params.template].steps) await routines.addStep(rid, { title, time, minutes: 15, remind: 0 });
    }
    await syncRoutineReminders(rid);
    return rid;
  };

  const save = async () => {
    try { await persist(); toast('Routine saved'); nav.goBack(); }
    catch (e) { showError(e, /UNIQUE/i.test(e.message) ? 'A routine with this name already exists' : 'Cannot save'); }
  };

  const addQuick = async () => {
    const list = parseStepList(quick);
    if (!list.length) return;
    try {
      const rid = await persist();
      for (const title of list) await routines.addStep(rid, { title, minutes: 10, remind: 0 });
      setQuick('');
    } catch (e) { showError(e); }
  };

  const saveStep = async (v) => {
    const rid = await persist();
    if (v.remind && !v.time) throw new Error('Pick a time to enable the reminder.');
    const row = { title: v.title.trim(), time: v.time || null, minutes: v.minutes || 10, remind: v.remind ? 1 : 0 };
    let sid = editStep?.id;
    if (sid) await routines.updateStep(sid, row); else sid = await routines.addStep(rid, row);
    const routine = await routines.get(rid);
    await syncStepReminder({ ...row, id: sid }, routine);
  };

  const remove = async () => {
    if (await confirm('Delete routine?', `"${form.name}" and its history will be removed.`, { destructive: true, confirmText: 'Delete' })) { await deleteRoutine(id); nav.goBack(); }
  };

  return (
    <Screen title={params?.id ? 'Edit routine' : 'New routine'}>
      <Input label="NAME" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="e.g. Morning routine" />
      <Field label="TYPE"><Segmented value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} options={[{ label: 'Morning', value: 'morning' }, { label: 'Evening', value: 'evening' }, { label: 'Custom', value: 'custom' }]} /></Field>
      <Field label="DAYS"><WeekdayPicker value={form.days} onChange={(d) => setForm({ ...form, days: d })} /></Field>

      <SectionHeader title="Steps" action="Add step" onAction={() => setEditStep({ minutes: 10 })} />
      <Card pad={false} style={{ paddingHorizontal: 16 }}>
        {steps.data.length ? steps.data.map((s, i) => (
          <Row key={s.id} title={`${i + 1}. ${s.title}`} subtitle={[s.time ? fmtTime(s.time) : null, `${s.minutes} min`, s.remind ? 'reminder on' : null].filter(Boolean).join(' · ')}
            onPress={() => setEditStep(s)}
            right={<View style={{ flexDirection: 'row' }}>
              <IconButton name="arrow-up" size={18} label="Move up" onPress={() => routines.moveStep(id, s.id, -1)} />
              <IconButton name="arrow-down" size={18} label="Move down" onPress={() => routines.moveStep(id, s.id, 1)} />
            </View>} />
        )) : <T muted style={{ paddingVertical: 14 }}>No steps yet. Add them one by one or type a whole sequence below.</T>}
      </Card>

      <Input label="QUICK ADD SEQUENCE" value={quick} onChangeText={setQuick} style={{ marginTop: 16 }}
        placeholder="Wake up → Get ready → Breakfast → Study → Sleep" hint="Separate steps with → or commas." />
      <Button title="Add these steps" variant="secondary" onPress={addQuick} disabled={!quick.trim()} style={{ marginBottom: 20 }} />

      <Button title="Save routine" onPress={save} />
      {id ? <Button title="Delete routine" variant="danger" onPress={remove} style={{ marginTop: 10 }} /> : null}

      <FormSheet visible={!!editStep} title={editStep?.id ? 'Edit step' : 'New step'} fields={STEP_FIELDS} initial={editStep || {}} onClose={() => setEditStep(null)} onSubmit={saveStep}
        onDelete={editStep?.id ? async () => { await deleteStep(editStep.id); } : undefined} />
    </Screen>
  );
}
