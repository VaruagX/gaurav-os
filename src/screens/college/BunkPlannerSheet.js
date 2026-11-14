import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Sheet, T, Chip, Card, Badge, SectionHeader } from '../../components/ui';
import { useTheme } from '../../theme';
import { timetableRepository, examsRepository } from '../../database/repositories';
import { bunkProjection, lecturesBetween, mustAttend } from '../../services/college/lectureLogic';
import { addDays, toDateStr, isoWeekday, WEEKDAYS, fmtTime, fmtDateStr, todayStr } from '../../utils/date';

/** "What if I skip…?" planner + "how many must I attend before the exam?" for subjects under target. */
export default function BunkPlannerSheet({ visible, onClose, summary }) {
  const t = useTheme();
  const [rows, setRows] = useState([]);
  const [exam, setExam] = useState(null);
  const [offset, setOffset] = useState(1);
  const [skip, setSkip] = useState(new Set());

  useEffect(() => {
    if (!visible) return;
    setSkip(new Set());
    timetableRepository.week().then(setRows);
    examsRepository.upcoming(1).then((e) => setExam(e[0] || null));
  }, [visible]);

  const date = addDays(new Date(), offset);
  const day = rows.filter((l) => l.weekday === isoWeekday(date));
  const skips = {};
  day.filter((l) => skip.has(l.id)).forEach((l) => { skips[l.subject_id] = (skips[l.subject_id] || 0) + 1; });
  const proj = bunkProjection(summary, skips);
  const toggle = (id) => setSkip((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const examDate = exam ? toDateStr(new Date(exam.exam_at)) : null;
  const left = examDate ? lecturesBetween(rows, todayStr(), examDate) : {};
  const weak = summary.filter((s) => s.total > 0 && (s.present / s.total) * 100 < s.target_pct);

  return (
    <Sheet visible={visible} title="Bunk planner" onClose={onClose}>
      <T v="small" muted style={{ marginBottom: 8 }}>Pick a day, tick the lectures you might skip, and see what happens to your attendance.</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {[1, 2, 3, 4, 5, 6, 7].map((o) => { const d = addDays(new Date(), o); return <Chip key={o} small label={`${WEEKDAYS[isoWeekday(d) - 1]} ${d.getDate()}`} selected={offset === o} onPress={() => { setOffset(o); setSkip(new Set()); }} />; })}
      </View>
      <View style={{ marginTop: 12 }}>
        {day.length ? day.map((l) => (
          <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '600' }}>{l.subject_name}</T>
              <T v="small" muted>{fmtTime(l.start_time)} – {fmtTime(l.end_time)}</T>
            </View>
            <Chip label={skip.has(l.id) ? 'Skipping' : 'Attend'} selected={skip.has(l.id)} onPress={() => toggle(l.id)} small />
          </View>
        )) : <T muted>No lectures on {fmtDateStr(toDateStr(date))}.</T>}
      </View>
      {proj.length ? (
        <Card style={{ marginTop: 8 }}>
          {proj.map((p) => (
            <View key={p.id} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>{p.name}</T>
                <Badge label={p.safe ? 'SAFE' : 'BELOW TARGET'} tone={p.safe ? 'success' : 'danger'} />
              </View>
              <T v="small" muted>{p.before === null ? '—' : p.before.toFixed(1)}% → <T v="small" color={p.safe ? t.success : t.danger} style={{ fontWeight: '700' }}>{p.after.toFixed(1)}%</T> after missing {p.skips} (target {p.target}%)</T>
            </View>
          ))}
        </Card>
      ) : null}

      <SectionHeader title={exam ? `Before ${exam.title} · ${fmtDateStr(examDate)}` : 'Before your next exam'} />
      {!exam ? <T muted>Add an exam in College → Exams to see how many lectures you must attend before it.</T>
        : !weak.length ? <T muted>All subjects are at or above target. Keep it up.</T>
        : weak.map((s) => {
          const rem = left[s.id] || 0; const need = mustAttend(s.present, s.total, s.target_pct, rem);
          return <T key={s.id} style={{ marginBottom: 6 }}><T style={{ fontWeight: '700' }}>{s.name}: </T>{need === null ? `even attending all ${rem} remaining lectures won't reach ${s.target_pct}%` : `attend ${need} of the next ${rem} lectures to reach ${s.target_pct}%`}</T>;
        })}
    </Sheet>
  );
}
