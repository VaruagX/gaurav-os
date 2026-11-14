import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Sheet, Input, NumberInput, Field, Chip, Segmented, SwitchRow, DateField, TimeField, SubjectPicker, WeekdayPicker, Button } from './ui';
import { subjectsRepository, categoriesRepository } from '../database/repositories';
import { showError } from '../utils/ui';
import { toDateStr, timeStrOf, toEpoch } from '../utils/date';

/**
 * Config-driven form in a bottom sheet.
 * fields: [{key,label,type,required,options,placeholder,hint,kind}]
 * types: text | multiline | number | date | time | datetime | select | segmented | toggle | subject | weekdays | category
 * `datetime` stores epoch ms; `weekdays` stores an array of ISO weekdays.
 */
export default function FormSheet({ visible, title, fields, initial, onSubmit, onClose, onDelete, submitLabel = 'Save' }) {
  const [values, setValues] = useState({});
  const [subjects, setSubjects] = useState([]);
  const [cats, setCats] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setValues({ ...initial });
    if (fields.some((f) => f.type === 'subject')) subjectsRepository.active().then(setSubjects).catch(() => {});
    fields.filter((f) => f.type === 'category').forEach((f) => categoriesRepository.list(f.kind).then((l) => setCats((c) => ({ ...c, [f.kind]: l }))));
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setValues((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    for (const f of fields) {
      const v = values[f.key];
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
      if (f.required && empty) return showError(new Error(`${f.label} is required.`), 'Missing information');
      if (f.type === 'number' && !empty && Number.isNaN(Number(v))) return showError(new Error(`${f.label} must be a number.`), 'Invalid value');
    }
    setBusy(true);
    try {
      const out = { ...values };
      fields.forEach((f) => { if (f.type === 'number' && out[f.key] !== undefined && out[f.key] !== '' && out[f.key] !== null) out[f.key] = Number(out[f.key]); });
      await onSubmit(out);
      onClose();
    } catch (e) { showError(e); } finally { setBusy(false); }
  };

  const render = (f) => {
    const v = values[f.key];
    switch (f.type) {
      case 'multiline': return <Input key={f.key} label={f.label} hint={f.hint} multiline value={v ?? ''} onChangeText={(s) => set(f.key, s)} placeholder={f.placeholder} />;
      case 'number': return <Field key={f.key} label={f.label} hint={f.hint}><NumberInput value={v} onChange={(s) => set(f.key, s)} placeholder={f.placeholder} /></Field>;
      case 'date': return <DateField key={f.key} label={f.label} value={v} onChange={(d) => set(f.key, d)} allowClear={!f.required} />;
      case 'time': return <TimeField key={f.key} label={f.label} value={v} onChange={(d) => set(f.key, d)} />;
      case 'datetime': {
        const d = v ? new Date(v) : null;
        const date = d ? toDateStr(d) : null, time = d ? timeStrOf(d) : null;
        return (
          <View key={f.key}>
            <DateField label={f.label} value={date} onChange={(nd) => set(f.key, toEpoch(nd, time || '09:00'))} />
            <TimeField value={time} onChange={(nt) => set(f.key, toEpoch(date || toDateStr(new Date()), nt))} />
          </View>
        );
      }
      case 'select': return (
        <Field key={f.key} label={f.label} hint={f.hint}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {f.options.map((o) => <Chip key={String(o.value)} label={o.label} selected={v === o.value} onPress={() => set(f.key, o.value)} />)}
          </View>
        </Field>
      );
      case 'segmented': return <Field key={f.key} label={f.label}><Segmented options={f.options} value={v} onChange={(x) => set(f.key, x)} /></Field>;
      case 'toggle': return <SwitchRow key={f.key} label={f.label} hint={f.hint} value={!!v} onValueChange={(x) => set(f.key, x ? 1 : 0)} />;
      case 'subject': return <Field key={f.key} label={f.label}><SubjectPicker subjects={subjects} value={v} onChange={(x) => set(f.key, x)} allowNone={!f.required} /></Field>;
      case 'weekdays': return <Field key={f.key} label={f.label}><WeekdayPicker value={v || []} onChange={(x) => set(f.key, x)} single={f.single} /></Field>;
      case 'category': return (
        <Field key={f.key} label={f.label}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(cats[f.kind] || []).map((c) => <Chip key={c.id} label={c.name} selected={v === c.id} onPress={() => set(f.key, c.id)} />)}
          </View>
        </Field>
      );
      default: return <Input key={f.key} label={f.label} hint={f.hint} value={v ?? ''} onChangeText={(s) => set(f.key, s)} placeholder={f.placeholder} />;
    }
  };

  return (
    <Sheet visible={visible} title={title} onClose={onClose}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {onDelete ? <Button title="Delete" variant="danger" onPress={async () => { setBusy(true); try { await onDelete(); onClose(); } catch (e) { if (e.message !== 'Cancelled') showError(e); } finally { setBusy(false); } }} style={{ flex: 1 }} /> : null}
          <Button title={submitLabel} onPress={submit} loading={busy} style={{ flex: 2 }} />
        </View>
      }>
      {fields.map(render)}
    </Sheet>
  );
}
