import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen, Card, T, Row, Badge, EmptyState, Fab, Chip, Button, Loading, IconButton, Sheet } from '../../components/ui';
import FormSheet from '../../components/FormSheet';
import { useQuery } from '../../hooks/useQuery';
import { timetableRepository as repo, attendanceRepository, subjectsRepository } from '../../database/repositories';
import { WEEKDAYS, WEEKDAYS_LONG, isoWeekday, fmtTime, todayStr, addDays, toDateStr, fmtDateStr } from '../../utils/date';
import { confirm, attempt, toast } from '../../utils/ui';

const FIELDS = [
  { key: 'subject_id', label: 'Subject', type: 'subject', required: true },
  { key: 'weekdays', label: 'Day(s)', type: 'weekdays' },
  { key: 'start_time', label: 'Starts', type: 'time', required: true },
  { key: 'end_time', label: 'Ends', type: 'time', required: true },
  { key: 'kind', label: 'Type', type: 'segmented', options: [{ label: 'Theory', value: 'theory' }, { label: 'Practical', value: 'practical' }] },
  { key: 'room', label: 'Classroom / lab' },
  { key: 'teacher', label: 'Teacher (optional)' },
];
const SLOT_BASE = 1000; // timetable-driven attendance uses slot = 1000 + timetable id, so re-marking never duplicates

export default function TimetableScreen() {
  const nav = useNavigation();
  const [day, setDay] = useState(isoWeekday());
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(false);
  // Attendance is marked for the selected weekday of the current week (past days can be filled in; future days can't).
  const dateStr = toDateStr(addDays(new Date(), day - isoWeekday()));
  const { data, loading } = useQuery(async () => ({ rows: await repo.forDay(day), att: await attendanceRepository.forDate(dateStr), subjects: await subjectsRepository.active() }), [day, dateStr]);
  const canMark = dateStr <= todayStr();

  const save = async (v) => {
    if (v.start_time >= v.end_time) throw new Error('End time must be after start time.');
    const base = { subject_id: v.subject_id, start_time: v.start_time, end_time: v.end_time, kind: v.kind || 'theory', room: v.room || null, teacher: v.teacher || null };
    if (editing?.id) await repo.update(editing.id, { ...base, weekday: (v.weekdays && v.weekdays[0]) || day });
    else {
      const days = v.weekdays?.length ? v.weekdays : [day];
      for (const d of days) {
        try { await repo.insert({ ...base, weekday: d }); } catch (e) { if (!/UNIQUE/i.test(e.message)) throw e; }
      }
    }
  };

  const resetDay = () => attempt(async () => {
    setMenu(false);
    if (!(await confirm(`Clear ${WEEKDAYS_LONG[day - 1]}?`, 'Removes all lectures on this day. Attendance already marked is kept.', { destructive: true, confirmText: 'Clear day' }))) return;
    for (const r of await repo.forDay(day)) await repo.remove(r.id);
    toast('Day cleared');
  });
  const resetAll = () => attempt(async () => {
    setMenu(false);
    if (!(await confirm('Reset the whole timetable?', 'Removes every lecture from the weekly timetable so you can import or add a new one. Subjects and attendance already marked are kept.', { destructive: true, confirmText: 'Reset timetable' }))) return;
    for (const r of await repo.week()) await repo.remove(r.id);
    toast('Timetable reset');
  });

  const markLecture = (l, status) => attempt(async () => { await attendanceRepository.mark(l.subject_id, dateStr, status, { slot: SLOT_BASE + l.id, kind: l.kind }); toast(`Marked ${status}`); });

  return (
    <Screen title="Timetable" subtitle="Weekly lectures" right={<View style={{ flexDirection: 'row', gap: 8 }}>
        <IconButton name="image-outline" bg label="Import timetable from photo" onPress={() => nav.navigate('TimetableImport')} />
        <IconButton name="ellipsis-horizontal" bg label="Timetable options" onPress={() => setMenu(true)} />
      </View>} fab={<Fab onPress={() => setEditing({ weekdays: [day], kind: 'theory' })} label="Add lecture" />}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
        {WEEKDAYS.map((w, i) => <Chip key={w} label={w} selected={day === i + 1} onPress={() => setDay(i + 1)} small />)}
      </View>
      <T v="small" muted style={{ marginBottom: 8 }}>{fmtDateStr(dateStr)}{dateStr === todayStr() ? ' · today' : ''}{canMark ? ' — mark Present or Absent for each lecture' : ' — upcoming, attendance opens on the day'}</T>
      {loading && !data ? <Loading /> : !data?.rows.length ? (
        <EmptyState icon="calendar-outline" title="No lectures this day"
          text="Add lectures one by one, or import your whole week from a photo of the timetable." action="Import from photo" onAction={() => nav.navigate('TimetableImport')} />
      ) : data.rows.map((l) => {
        const m = data.att.find((a) => a.subject_id === l.subject_id && a.slot === SLOT_BASE + l.id);
        return (
          <Card key={l.id} style={{ marginBottom: 10 }} onPress={() => setEditing({ ...l, weekdays: [l.weekday] })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T v="heading">{l.subject_name}</T>
                <T muted>{fmtTime(l.start_time)} – {fmtTime(l.end_time)}{l.room ? ` · ${l.room}` : ''}</T>
                {l.teacher ? <T v="small" faint>{l.teacher}</T> : null}
              </View>
              <Badge label={l.kind === 'practical' ? 'PRACTICAL' : 'THEORY'} />
            </View>
            {canMark ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Button small title="Present" icon="checkmark" variant={m?.status === 'present' ? 'primary' : 'secondary'} onPress={() => markLecture(l, 'present')} style={{ flex: 1 }} />
                <Button small title="Absent" icon="close" variant={m?.status === 'absent' ? 'primary' : 'secondary'} onPress={() => markLecture(l, 'absent')} style={{ flex: 1 }} />
              </View>
            ) : null}
          </Card>
        );
      })}
      <Sheet visible={menu} title="Timetable options" onClose={() => setMenu(false)}>
        <Row icon="image-outline" title="Import from photo" subtitle="Read a new timetable from a picture" onPress={() => { setMenu(false); nav.navigate('TimetableImport'); }} />
        <Row icon="backspace-outline" title={`Clear ${WEEKDAYS_LONG[day - 1]}`} subtitle="Remove only this day's lectures" onPress={resetDay} />
        <Row icon="refresh" title="Reset whole timetable" subtitle="Remove every lecture and start again" onPress={resetAll} />
      </Sheet>

      <FormSheet visible={!!editing} title={editing?.id ? 'Edit lecture' : 'New lecture'} fields={editing?.id ? FIELDS.map((f) => (f.key === 'weekdays' ? { ...f, single: true, label: 'Day' } : f)) : FIELDS}
        initial={editing || {}} onSubmit={save} onClose={() => setEditing(null)}
        onDelete={editing?.id ? async () => { if (!(await confirm('Delete lecture?', 'Removes it from the timetable. Attendance history is kept.', { destructive: true, confirmText: 'Delete' }))) throw new Error('Cancelled'); await repo.remove(editing.id); } : undefined} />
    </Screen>
  );
}
