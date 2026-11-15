import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Card, T, Chip, SectionHeader } from '../../components/ui';
import { useTheme } from '../../theme';
import { timetableRepository } from '../../database/repositories';
import { overallRecovery, OVERALL_TARGET } from '../../services/college/attendance';
import { fmtDateStr, parseDateStr, fmtTime, WEEKDAYS_LONG, isoWeekday } from '../../utils/date';

/** Overall attendance: "when does it reach 75%?" — updates automatically as attendance changes. */
export default function TargetPlanner({ summary }) {
  const t = useTheme();
  const [rows, setRows] = useState([]);
  const [days, setDays] = useState(0);
  useEffect(() => { timetableRepository.week().then(setRows); }, [summary]);
  const r = useMemo(() => overallRecovery(summary, rows, days), [summary, rows, days]);
  const f = (v) => (v === null || v === undefined ? '—' : `${v.toFixed(1)}%`);

  let body;
  if (r.ok) body = <T style={{ color: t.success, fontWeight: '700' }}>Overall stays at {f(r.afterAbsence)}, above {OVERALL_TARGET}%. You're safe{days ? ` even if you miss ${days} day${days > 1 ? 's' : ''}` : ''}.</T>;
  else if (!rows.length) body = <T muted>Add your timetable (College → Timetable) so I can calculate the date you reach {OVERALL_TARGET}%.</T>;
  else if (!r.reachable) body = <T style={{ color: t.danger }}>Can't reach {OVERALL_TARGET}% within the timetable horizon.</T>;
  else {
    const d = parseDateStr(r.date);
    body = (
      <>
        <T v="small" muted>{days ? `After missing ${days} day${days > 1 ? 's' : ''} your overall drops to ${f(r.afterAbsence)}. ` : `Now ${f(r.now)}. `}Attend every lecture and you reach {OVERALL_TARGET}% on:</T>
        <T v="title" color={t.warning} style={{ marginTop: 6 }}>{WEEKDAYS_LONG[isoWeekday(d) - 1]}, {fmtDateStr(r.date)} {d.getFullYear()}</T>
        <T style={{ marginTop: 4, fontWeight: '600' }}>{r.lecture.subject_name} · {fmtTime(r.lecture.start_time)} – {fmtTime(r.lecture.end_time)}</T>
        <T v="small" muted style={{ marginTop: 4 }}>That's after attending {r.attended} lecture{r.attended === 1 ? '' : 's'} in a row.</T>
      </>
    );
  }
  return (
    <>
      <SectionHeader title={`Reach ${OVERALL_TARGET}% overall`} />
      <Card>
        <T v="small" muted style={{ marginBottom: 8 }}>If I'm absent for the next… class days (from tomorrow):</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {[0, 1, 2, 3, 4, 5, 7].map((n) => <Chip key={n} small label={n === 0 ? 'None' : `${n} day${n > 1 ? 's' : ''}`} selected={days === n} onPress={() => setDays(n)} />)}
        </View>
        {body}
      </Card>
    </>
  );
}
