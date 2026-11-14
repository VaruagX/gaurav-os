import React, { useState } from 'react';
import { View } from 'react-native';
import { Sheet, Row, T, Card, IconButton, EmptyState } from '../../components/ui';
import FormSheet from '../../components/FormSheet';
import { useTheme } from '../../theme';
import { useQuery } from '../../hooks/useQuery';
import { archivesRepository, attendanceRepository, timetableRepository } from '../../database/repositories';
import { pct, overall } from '../../services/college/attendance';
import { fmtDateTime } from '../../utils/date';
import { confirm, toast } from '../../utils/ui';

/** Save the current semester (timetable + attendance totals), then optionally wipe it for a fresh start. */
export function ArchiveForm({ visible, onClose, summary }) {
  const submit = async (v) => {
    const timetable = await timetableRepository.week();
    await archivesRepository.add(v.name.trim(), { summary, timetable: timetable.map((r) => ({ weekday: r.weekday, start: r.start_time, end: r.end_time, subject: r.subject_name, kind: r.kind, room: r.room })) });
    await attendanceRepository.resetAll();
    if (v.clear_timetable) for (const r of timetable) await timetableRepository.remove(r.id);
    toast('Semester saved. Attendance reset.');
  };
  return (
    <FormSheet visible={visible} title="Save semester & start fresh" submitLabel="Archive & reset" onClose={onClose} onSubmit={submit}
      initial={{ name: `Semester ${new Date().getFullYear()}`, clear_timetable: 1 }}
      fields={[
        { key: 'name', label: 'Name', required: true, hint: 'The current attendance numbers are saved under this name, then attendance is reset to zero.' },
        { key: 'clear_timetable', label: 'Also clear the weekly timetable', type: 'toggle' },
      ]} />
  );
}

/** List of saved semesters, each openable to see its final attendance table. */
export function ArchiveList({ visible, onClose }) {
  const t = useTheme();
  const list = useQuery(() => (visible ? archivesRepository.list() : []), [visible], []);
  const [open, setOpen] = useState(null);
  const view = async (id) => { const r = await archivesRepository.get(id); setOpen({ ...r, data: JSON.parse(r.data) }); };
  const remove = async (a) => { if (await confirm('Delete saved semester?', `"${a.name}" is removed permanently.`, { destructive: true, confirmText: 'Delete' })) { await archivesRepository.remove(a.id); } };
  const o = open ? overall(open.data.summary) : null;
  return (
    <>
      <Sheet visible={visible && !open} title="Past semesters" onClose={onClose}>
        {!list.data.length ? <EmptyState icon="archive-outline" title="Nothing saved yet" text="Use “Save semester & start fresh” in the tools menu before you reset." />
          : list.data.map((a) => <Row key={a.id} icon="archive-outline" title={a.name} subtitle={fmtDateTime(a.created_at)} onPress={() => view(a.id)} right={<IconButton name="trash-outline" size={18} label="Delete" onPress={() => remove(a)} />} />)}
      </Sheet>
      <Sheet visible={!!open} title={open?.name || ''} onClose={() => setOpen(null)}>
        {open ? (
          <>
            <T muted style={{ marginBottom: 8 }}>Overall {o.pct === null ? '—' : `${o.pct.toFixed(2)}%`} · {o.present}/{o.total} lectures</T>
            {open.data.summary.map((s) => (
              <View key={s.id} style={{ flexDirection: 'row', paddingVertical: 6 }}>
                <T style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>{s.name}</T>
                <T muted>{s.present}/{s.total}</T>
                <T style={{ width: 64, textAlign: 'right', fontWeight: '700' }} color={pct(s.present, s.total) !== null && pct(s.present, s.total) < s.target_pct ? t.danger : t.success}>{s.total ? pct(s.present, s.total).toFixed(1) : '—'}%</T>
              </View>
            ))}
          </>
        ) : null}
      </Sheet>
    </>
  );
}
