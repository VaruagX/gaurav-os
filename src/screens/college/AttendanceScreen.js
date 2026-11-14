import React, { useState } from 'react';
import { run } from '../../database/db';
import { View, StyleSheet } from 'react-native';
import { Screen, Card, T, Button, NumberInput, ProgressBar, Badge, EmptyState, Fab, SectionHeader, Row, Sheet, Stat, Loading, Chip, IconButton } from '../../components/ui';
import FormSheet from '../../components/FormSheet';
import { useTheme } from '../../theme';
import { useQuery } from '../../hooks/useQuery';
import { subjectsRepository, attendanceRepository, timetableRepository, cancelledRepository } from '../../database/repositories';
import { pct, classesNeeded, classesCanSkip, attendanceStatus, overall, shortages } from '../../services/college/attendance';
import { todayStr, fmtDateStr, isoWeekday, fmtTime, WEEKDAYS_LONG } from '../../utils/date';
import { confirm, attempt, toast } from '../../utils/ui';
import BunkPlannerSheet from './BunkPlannerSheet';
import { ArchiveForm, ArchiveList } from './SemesterSheets';
import { pendingLectures } from '../../services/college/lectureLogic';

const SUBJECT_FIELDS = [
  { key: 'name', label: 'Subject name', required: true, placeholder: 'e.g. DBMS' },
  { key: 'code', label: 'Code (optional)' },
  { key: 'kind', label: 'Type', type: 'segmented', options: [{ label: 'Theory', value: 'theory' }, { label: 'Practical', value: 'practical' }, { label: 'Both', value: 'both' }] },
  { key: 'teacher', label: 'Teacher (optional)' },
  { key: 'target_pct', label: 'Target attendance %', type: 'number' },
];

export default function AttendanceScreen() {
  const t = useTheme();
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tools, setTools] = useState(false);
  const [fill, setFill] = useState(null); // { [subjectId]: { p, a } }
  const [countsFor, setCountsFor] = useState(null);
  const [planner, setPlanner] = useState(false);
  const [archiveForm, setArchiveForm] = useState(false);
  const [archives, setArchives] = useState(false);
  const { data, loading } = useQuery(async () => ({ summary: await attendanceRepository.summary(), today: await attendanceRepository.forDate(todayStr()), lectures: await timetableRepository.forDay(isoWeekday()), cancelled: await cancelledRepository.forDate(todayStr()) }), []);
  const hist = useQuery(() => (detail ? attendanceRepository.forSubject(detail.id) : []), [detail?.id], []);

  // Timetable lectures use slot = 1000 + timetable id (same as the Timetable screen) so re-marking never duplicates.
  const markLecture = (l, status) => attempt(async () => {
    await cancelledRepository.set(l.id, todayStr(), false);
    await attendanceRepository.mark(l.subject_id, todayStr(), status, { slot: 1000 + l.id, kind: l.kind }); toast(`Marked ${status}`);
  });
  const notHeld = (l) => attempt(async () => { await attendanceRepository.unmark(l.subject_id, todayStr(), 1000 + l.id); await cancelledRepository.set(l.id, todayStr(), true); toast('Marked as not held — not counted'); });
  const holiday = () => attempt(async () => {
    setTools(false);
    if (!(await confirm('Holiday today?', "Marks all of today's lectures as not held so they don't count.", { confirmText: 'Mark holiday' }))) return;
    for (const l of data.lectures) { await attendanceRepository.unmark(l.subject_id, todayStr(), 1000 + l.id); await cancelledRepository.set(l.id, todayStr(), true); }
    toast('Holiday marked');
  });
  const mark = (s, status) => attempt(() => attendanceRepository.mark(s.id, todayStr(), status));
  const save = async (v) => {
    const row = { name: v.name.trim(), code: v.code || null, kind: v.kind || 'theory', teacher: v.teacher || null, target_pct: v.target_pct ?? 75 };
    if (editing?.id) await subjectsRepository.update(editing.id, row); else await subjectsRepository.insert(row);
  };

  const openFill = () => {
    setFill(Object.fromEntries((data?.summary || []).map((x) => [x.id, { p: String(x.present), a: String(x.total - x.present) }])));
    setTools(false);
  };
  const saveFill = () => attempt(async () => {
    for (const x of data.summary) {
      const v = fill[x.id];
      const p = Math.max(0, Math.round(Number(v?.p) || 0)), a = Math.max(0, Math.round(Number(v?.a) || 0));
      if (p === x.present && a === x.total - x.present) continue;
      try { await attendanceRepository.setCounts(x.id, p, a); } catch (e) { throw new Error(`${x.name}: ${e.message}`); }
    }
    setFill(null); toast('Attendance updated');
  }, 'Could not save');
  const resetAll = () => attempt(async () => {
    setTools(false);
    if (!(await confirm('Reset ALL attendance?', 'Every present/absent record for every subject is deleted (subjects and timetable are kept). This cannot be undone.', { destructive: true, confirmText: 'Reset all' }))) return;
    await attendanceRepository.resetAll(); toast('Attendance reset');
  });
  const resetToday = () => attempt(async () => {
    setTools(false);
    if (!(await confirm("Clear today's marks?", "Removes the Present/Absent marks you gave today so you can mark them again.", { destructive: true, confirmText: 'Clear today' }))) return;
    await run(`DELETE FROM attendance WHERE date = ? AND note IS NOT 'manual'`, [todayStr()]); toast("Today's marks cleared");
  });
  const resetSubject = (sub) => attempt(async () => {
    if (!(await confirm(`Reset ${sub.name}?`, 'All attendance for this subject is deleted. This cannot be undone.', { destructive: true, confirmText: 'Reset' }))) return;
    await attendanceRepository.resetSubject(sub.id); setDetail(null); toast('Subject reset');
  });

  const summary = data?.summary || [];
  const o = overall(summary);
  const sh = shortages(summary);

  return (
    <Screen title="Attendance" subtitle="Tap Present or Absent for today's lecture" right={<IconButton name="ellipsis-horizontal" bg label="Attendance tools" onPress={() => setTools(true)} />} fab={<Fab onPress={() => setEditing({ kind: 'theory', target_pct: 75 })} label="Add subject" />}>
      {loading && !data ? <Loading /> : !summary.length ? (
        <EmptyState icon="school-outline" title="No subjects yet" text="Add your subjects here, or build your timetable in College → Timetable and today's lectures will show up on this screen." action="Add subject" onAction={() => setEditing({ kind: 'theory', target_pct: 75 })} />
      ) : (
        <>
          <SectionHeader title={`Today's schedule · ${WEEKDAYS_LONG[isoWeekday() - 1]}`} style={{ marginTop: 0 }} />
          {data.lectures.length ? data.lectures.map((l) => {
            const m = data.today.find((a) => a.subject_id === l.subject_id && a.slot === 1000 + l.id);
            const isCancelled = data.cancelled.some((c) => c.timetable_id === l.id);
            const nowHm = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
            const isPending = pendingLectures([l], data.today, new Set(data.cancelled.map((c) => c.timetable_id)), nowHm).length > 0;
            return (
              <Card key={l.id} style={{ marginBottom: 10, opacity: isCancelled ? 0.65 : 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <T v="heading">{l.subject_name}</T>
                    <T v="small" muted>{fmtTime(l.start_time)} – {fmtTime(l.end_time)}{l.room ? ` · ${l.room}` : ''}</T>
                  </View>
                  <Badge label={isCancelled ? 'NOT HELD' : isPending ? 'PENDING' : l.kind === 'practical' ? 'PRACTICAL' : 'THEORY'} tone={isPending ? 'warning' : 'neutral'} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <Button small title="Present" icon="checkmark" variant={m?.status === 'present' ? 'primary' : 'secondary'} onPress={() => markLecture(l, 'present')} style={{ flex: 1 }} />
                  <Button small title="Absent" icon="close" variant={m?.status === 'absent' ? 'primary' : 'secondary'} onPress={() => markLecture(l, 'absent')} style={{ flex: 1 }} />
                  <Button small title="" icon="ban-outline" accessibilityLabel="Lecture not held" variant={isCancelled ? 'primary' : 'secondary'} onPress={() => notHeld(l)} />
                </View>
              </Card>
            );
          }) : <Card style={{ marginBottom: 10 }}><T muted>No lectures in your timetable for today. Add them in College → Timetable.</T></Card>}
          <SectionHeader title="Overall" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat label="Overall" value={o.pct === null ? '—' : `${o.pct.toFixed(1)}%`} sub={`${o.present}/${o.total}`} />
            <Stat label="Below target" value={String(sh.length)} sub={sh.length ? 'needs attention' : 'all good'} />
          </View>
          <Card pad={false} style={{ marginTop: 10 }}>
            <View style={{ flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: t.glassStrong }}>
              <T v="caption" muted style={{ width: 22 }}>#</T>
              <T v="caption" muted style={{ flex: 1 }}>COURSE</T>
              {['Present', 'Absent', 'Total', '%'].map((h) => <T key={h} v="caption" muted style={{ width: h === '%' ? 54 : 50, textAlign: 'right' }}>{h}</T>)}
            </View>
            {summary.map((s, i) => {
              const p = pct(s.present, s.total);
              const low = p !== null && p < s.target_pct;
              return (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.glassBorder }}>
                  <T v="small" muted style={{ width: 22 }}>{i + 1}</T>
                  <T v="small" style={{ flex: 1, fontWeight: '600' }} numberOfLines={2}>{s.name}</T>
                  <T v="small" style={{ width: 50, textAlign: 'right' }}>{s.present}</T>
                  <T v="small" style={{ width: 50, textAlign: 'right' }}>{s.total - s.present}</T>
                  <T v="small" style={{ width: 50, textAlign: 'right' }}>{s.total}</T>
                  <T v="small" color={p === null ? t.textMuted : low ? t.danger : t.success} style={{ width: 54, textAlign: 'right', fontWeight: '700' }}>{p === null ? '—' : p.toFixed(2)}</T>
                </View>
              );
            })}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, backgroundColor: t.glassStrong, borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.glassBorder }}>
              <T v="small" style={{ flex: 1, fontWeight: '800' }}>Overall</T>
              <T v="small" style={{ width: 50, textAlign: 'right', fontWeight: '800' }}>{o.present}</T>
              <T v="small" style={{ width: 50, textAlign: 'right', fontWeight: '800' }}>{o.total - o.present}</T>
              <T v="small" style={{ width: 50, textAlign: 'right', fontWeight: '800' }}>{o.total}</T>
              <T v="small" style={{ width: 54, textAlign: 'right', fontWeight: '800' }}>{o.pct === null ? '—' : o.pct.toFixed(2)}</T>
            </View>
          </Card>
          {summary.map((s) => {
            const p = pct(s.present, s.total);
            const st = attendanceStatus(s.present, s.total, s.target_pct);
            const need = classesNeeded(s.present, s.total, s.target_pct);
            const skip = classesCanSkip(s.present, s.total, s.target_pct);
            const todayRow = data.today.find((a) => a.subject_id === s.id);
            const inSchedule = data.lectures.some((l) => l.subject_id === s.id);
            const color = st.level === 'short' ? t.danger : st.level === 'borderline' ? t.warning : t.success;
            return (
              <Card key={s.id} style={{ marginTop: 10 }} onPress={() => setDetail(s)} onLongPress={() => setEditing(s)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <T v="heading">{s.name}</T>
                    <T v="small" muted>{s.present}/{s.total} attended · target {s.target_pct}%</T>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T v="title" color={st.level === 'none' ? t.textMuted : color}>{p === null ? '—' : `${p.toFixed(0)}%`}</T>
                    <Badge label={st.label.toUpperCase()} tone={st.level === 'short' ? 'danger' : st.level === 'borderline' ? 'warning' : st.level === 'safe' ? 'success' : 'neutral'} />
                  </View>
                </View>
                <ProgressBar value={(p || 0) / 100} color={color} style={{ marginTop: 10 }} />
                {s.total > 0 ? (
                  <T v="small" muted style={{ marginTop: 8 }}>
                    {need > 0 ? `Attend the next ${need} lecture${need === 1 ? '' : 's'} in a row to reach ${s.target_pct}%.` : `You can miss ${skip} more lecture${skip === 1 ? '' : 's'} and stay at ${s.target_pct}%.`}
                  </T>
                ) : null}
                {inSchedule ? null : <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' }}>
                  <Button small title="Present" icon="checkmark" variant={todayRow?.status === 'present' ? 'primary' : 'secondary'} onPress={() => mark(s, 'present')} style={{ flex: 1 }} />
                  <Button small title="Absent" icon="close" variant={todayRow?.status === 'absent' ? 'primary' : 'secondary'} onPress={() => mark(s, 'absent')} style={{ flex: 1 }} />
                </View>}
                {todayRow && !inSchedule ? <T v="small" faint style={{ marginTop: 6 }}>Today: marked {todayRow.status}. Tap again to add another lecture.</T> : null}
              </Card>
            );
          })}
          <T v="small" faint style={{ marginTop: 12, textAlign: 'center' }}>Tap a subject for history · long-press to edit</T>
        </>
      )}

      <Sheet visible={!!detail} title={detail ? `${detail.name} — history` : ''} onClose={() => setDetail(null)}>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Button small variant="secondary" icon="create-outline" title="Set counts" style={{ flex: 1 }} onPress={() => { const d = detail; setDetail(null); setCountsFor({ ...d, p: String(d.present), a: String(d.total - d.present) }); }} />
          <Button small variant="danger" icon="refresh" title="Reset" style={{ flex: 1 }} onPress={() => resetSubject(detail)} />
        </View>
        {!hist.data.filter((a) => a.note !== 'manual').length ? <T muted>No lectures marked day by day yet{detail && detail.total ? ` (${detail.total} counted from manual entry)` : ''}.</T> : hist.data.filter((a) => a.note !== 'manual').map((a) => (
          <Row key={a.id} title={`${fmtDateStr(a.date)}${a.slot > 1 && a.slot < 1000 ? ` · lecture ${a.slot}` : ''}`} subtitle={a.kind}
            right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Badge label={a.status.toUpperCase()} tone={a.status === 'present' ? 'success' : 'danger'} />
              <IconButton name="swap-horizontal" size={18} label="Toggle status" onPress={() => attendanceRepository.update(a.id, { status: a.status === 'present' ? 'absent' : 'present' })} />
              <IconButton name="trash-outline" size={18} label="Delete entry" onPress={async () => { if (await confirm('Delete this entry?', 'Attendance will be recalculated.', { destructive: true, confirmText: 'Delete' })) attendanceRepository.remove(a.id); }} />
            </View>} />
        ))}
      </Sheet>

      <BunkPlannerSheet visible={planner} onClose={() => setPlanner(false)} summary={summary} />
      <ArchiveForm visible={archiveForm} onClose={() => setArchiveForm(false)} summary={summary} />
      <ArchiveList visible={archives} onClose={() => setArchives(false)} />

      <Sheet visible={tools} title="Attendance tools" onClose={() => setTools(false)}>
        <Row icon="create-outline" title="Fill attendance manually" subtitle="Type Present / Absent counts for each subject, e.g. from your college ERP" onPress={openFill} />
        <Row icon="sunny-outline" title="Holiday today" subtitle="Mark all of today's lectures as not held" onPress={holiday} />
        <Row icon="speedometer-outline" title="Bunk planner" subtitle="What happens to my % if I skip lectures?" onPress={() => { setTools(false); setPlanner(true); }} />
        <Row icon="archive-outline" title="Save semester & start fresh" subtitle="Keep this semester's numbers, then reset" onPress={() => { setTools(false); setArchiveForm(true); }} />
        <Row icon="albums-outline" title="Past semesters" subtitle="View saved attendance tables" onPress={() => { setTools(false); setArchives(true); }} />
        <Row icon="backspace-outline" title="Clear today's marks" subtitle="Mark today's lectures again" onPress={resetToday} />
        <Row icon="refresh" title="Reset all attendance" subtitle="Start fresh, e.g. after a new timetable or semester" onPress={resetAll} />
      </Sheet>

      <Sheet visible={!!fill} title="Fill attendance" onClose={() => setFill(null)}
        footer={<Button title="Save" icon="checkmark" onPress={saveFill} />}>
        <T v="small" muted style={{ marginBottom: 10 }}>Enter the totals so far. Lectures you mark from now on are added on top.</T>
        {fill ? summary.map((x) => (
          <View key={x.id} style={{ marginBottom: 12 }}>
            <T style={{ fontWeight: '700', marginBottom: 6 }} numberOfLines={1}>{x.name}</T>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><T v="caption" muted style={{ marginBottom: 4 }}>PRESENT</T><NumberInput value={fill[x.id]?.p} onChange={(v) => setFill((f) => ({ ...f, [x.id]: { ...f[x.id], p: v.replace(/\./g, '') } }))} /></View>
              <View style={{ flex: 1 }}><T v="caption" muted style={{ marginBottom: 4 }}>ABSENT</T><NumberInput value={fill[x.id]?.a} onChange={(v) => setFill((f) => ({ ...f, [x.id]: { ...f[x.id], a: v.replace(/\./g, '') } }))} /></View>
            </View>
          </View>
        )) : null}
      </Sheet>

      <FormSheet visible={!!countsFor} title={countsFor ? `${countsFor.name} — set counts` : ''} fields={[{ key: 'p', label: 'Present', type: 'number', required: true }, { key: 'a', label: 'Absent', type: 'number', required: true }]}
        initial={countsFor || {}} onClose={() => setCountsFor(null)} onSubmit={async (v) => { await attendanceRepository.setCounts(countsFor.id, Math.round(v.p), Math.round(v.a)); toast('Attendance updated'); }} />

      <FormSheet visible={!!editing} title={editing?.id ? 'Edit subject' : 'New subject'} fields={SUBJECT_FIELDS} initial={editing || {}} onSubmit={save} onClose={() => setEditing(null)}
        onDelete={editing?.id ? async () => {
          if (!(await confirm('Delete subject?', 'This also deletes its attendance, timetable slots, syllabus, practicals and marks.', { destructive: true, confirmText: 'Delete' }))) throw new Error('Cancelled');
          await subjectsRepository.remove(editing.id);
        } : undefined} />
    </Screen>
  );
}
