// Turns OCR text boxes of a printed weekly timetable into lecture slots.
// Input lines: [{ text, left, top, right, bottom }]. Pure JS so it can be unit-tested without a device.

const DAY_RES = [/^mon(day)?$/i, /^tue(s|sday)?$/i, /^wed(nesday)?$/i, /^thu(r|rs|rsday|rsday)?$/i, /^fri(day)?$/i, /^sat(urday)?$/i, /^sun(day)?$/i];
const dayOf = (text) => { const s = text.replace(/[^a-z]/gi, ''); const i = DAY_RES.findIndex((r) => r.test(s)); return i < 0 ? 0 : i + 1; };
const TIME_RE = /(\d{1,2})\s*[.:]\s*(\d{2})\s*([AaPp]\.?[Mm]\.?)?/g;
// OCR often reads the digit 0 as the letter O (FFO6), so accept both after the building prefix.
const ROOM_RE = /\b(?:SF|FF|GF|SL|LAB)\s?-?[0-9OoIl]{1,3}(?:\/[0-9OoIl]+)?\b/i;
const fixRoom = (r) => r.replace(/\s+/g, '').toUpperCase().replace(/(?<=\d|^[A-Z]{2,3})O/g, '0').replace(/(?<=[A-Z]{2})O(?=\d)/g, '0');
const pad = (n) => String(n).padStart(2, '0');
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const cx = (b) => (b.left + b.right) / 2;
const cy = (b) => (b.top + b.bottom) / 2;

function times(text) {
  const out = [];
  for (const m of text.matchAll(TIME_RE)) {
    let h = Number(m[1]); const min = Number(m[2]); const ap = (m[3] || '').toLowerCase();
    if (h > 23 || min > 59) continue;
    if (ap.startsWith('p') && h < 12) h += 12;
    else if (ap.startsWith('a') && h === 12) h = 0;
    else if (!ap && h >= 1 && h <= 7) h += 12; // "1.45" with no AM/PM in a college timetable means afternoon
    out.push(`${pad(h)}:${pad(min)}`);
  }
  return out;
}

/** Canonical subject name: upper case, no punctuation, lone "I" dropped ("ELE I IBD" and "ELE -(IBD)" match). */
export function normaliseSubject(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter((w) => w && w !== 'I').join(' ');
}

function parseEntry(lines) {
  let text = lines.join(' ').replace(/\s+/g, ' ').trim();
  let batch = null;
  const bm = text.match(/^([A-C])\s*[:.]\s*/);
  if (bm) { batch = bm[1].toUpperCase(); text = text.slice(bm[0].length); }
  const room = (text.match(ROOM_RE) || [null])[0];
  if (room) text = text.replace(ROOM_RE, ' ');
  let teacher = null;
  const tm = [...text.matchAll(/\(([A-Za-z.\s]{1,8})\)/g)].pop();
  if (tm) { teacher = tm[1].replace(/\s+/g, '').toUpperCase(); text = text.replace(tm[0], ' '); }
  const subject = normaliseSubject(text);
  if (!subject) return null;
  return { batch, subject, teacher, room: room ? fixRoom(room) : null, kind: batch ? 'practical' : 'theory', raw: lines.join(' / ') };
}

/** Split one table cell's lines into per-batch entries ("A:… / B:… / C:…") or a single entry. */
function cellEntries(lines) {
  const groups = [];
  for (const l of lines) {
    if (/^[A-C]\s*[:.]/i.test(l) || !groups.length) groups.push([l]); else groups[groups.length - 1].push(l);
  }
  return groups.map(parseEntry).filter(Boolean);
}

/**
 * @returns {{columns, rows, batches, error?}} rows: [{weekday, cells:[{start,end,entries}]}]
 */
export function parseTimetable(rawLines) {
  const lines = rawLines.filter((l) => l && l.text && l.text.trim()).map((l) => ({ ...l, text: l.text.trim() }));
  // 1. Day labels define the rows.
  const days = lines.filter((l) => dayOf(l.text)).map((l) => ({ ...l, weekday: dayOf(l.text) })).sort((a, b) => cy(a) - cy(b));
  const seen = new Set();
  const labels = days.filter((d) => (seen.has(d.weekday) ? false : seen.add(d.weekday)));
  if (labels.length < 2) return { columns: [], rows: [], batches: [], error: 'Could not find the weekday names (Monday, Tuesday…). Use a sharper, straight-on photo of the table.' };
  const labelRight = Math.max(...labels.map((l) => l.right));
  const spacing = median(labels.slice(1).map((l, i) => cy(l) - cy(labels[i])));
  const rowBands = labels.map((l, i) => ({
    weekday: l.weekday,
    top: i === 0 ? cy(l) - spacing / 2 : (cy(labels[i - 1]) + cy(l)) / 2,
    bottom: i === labels.length - 1 ? cy(l) + spacing / 2 : (cy(l) + cy(labels[i + 1])) / 2,
  }));
  const tableTop = rowBands[0].top;

  // 2. Time header → slot columns.
  const tokens = [];
  const lh = median(lines.map((l) => l.bottom - l.top)) || 12;
  const isHeaderTime = (l) => !/\d+\.\d+\.\d+/.test(l.text) && !/[A-Za-z]{2,}/.test(l.text.replace(/\bto\b/gi, '').replace(/(\d)\s*[ap]\.?m\.?/gi, '$1')) && cy(l) > tableTop - 9 * lh;
  lines.filter((l) => cy(l) < tableTop && l.left > labelRight - 4 && isHeaderTime(l)).forEach((l) => times(l.text).forEach((tm, i, arr) => tokens.push({ time: tm, x: cx(l), y: cy(l) + i * 0.01, w: (l.right - l.left) / Math.max(1, arr.length) })));
  if (tokens.length < 2) return { columns: [], rows: [], batches: [], error: 'Could not read the time headings (e.g. 10.00 AM). Use a sharper photo that includes the header row.' };
  tokens.sort((a, b) => a.x - b.x);
  const tol = Math.max(8, median(tokens.map((t) => t.w)) * 0.5);
  const clusters = [];
  tokens.forEach((t) => { const c = clusters[clusters.length - 1]; if (c && t.x - c.x <= tol) { c.items.push(t); c.x = c.items.reduce((s, i) => s + i.x, 0) / c.items.length; } else clusters.push({ x: t.x, items: [t] }); });
  const columns = clusters.map((c) => {
    const ts = c.items.sort((a, b) => a.y - b.y);
    const start = ts[0].time;
    let end = ts.length > 1 ? ts[ts.length - 1].time : null;
    if (!end) { const [h, m] = start.split(':').map(Number); end = `${pad(Math.min(23, h + 1))}:${pad(m)}`; }
    return { x: c.x, start, end };
  });
  const gaps = columns.slice(1).map((c, i) => c.x - columns[i].x);
  const normal = median(gaps) || 80;
  columns.forEach((c, i) => {
    const prev = i ? c.x - columns[i - 1].x : normal; const next = i < columns.length - 1 ? columns[i + 1].x - c.x : normal;
    // A noticeably larger gap means a LUNCH/RECESS strip sits between the two columns.
    const half = (g) => (g > normal * 1.15 ? normal / 2 : g / 2);
    c.x0 = c.x - half(prev); c.x1 = c.x + half(next);
  });

  // 3. Assign every body text line to the slot columns it covers, per day row.
  const rows = rowBands.map((band) => {
    const body = lines.filter((l) => cy(l) >= band.top && cy(l) < band.bottom && l.left > labelRight - 2 && !dayOf(l.text) && l.text.replace(/[^A-Za-z0-9]/g, '').length > 1
      && !/^(lunch|recess|break)$/i.test(l.text.replace(/[^A-Za-z]/g, '')));
    const items = body.map((l) => {
      const w = Math.max(1, l.right - l.left);
      const cols = columns.map((c, i) => ({ i, ov: Math.min(l.right, c.x1) - Math.max(l.left, c.x0) })).filter((c) => c.ov >= 0.3 * Math.min(w, 60) && c.ov >= 0.25 * w * 0.5).map((c) => c.i);
      return cols.length ? { l, c0: Math.min(...cols), c1: Math.max(...cols) } : null;
    }).filter(Boolean);
    // Merge lines whose column spans overlap into one cell.
    const cells = [];
    items.sort((a, b) => a.c0 - b.c0 || cy(a.l) - cy(b.l)).forEach((it) => {
      const hit = cells.find((c) => it.c0 <= c.c1 && it.c1 >= c.c0);
      if (hit) { hit.items.push(it); hit.c0 = Math.min(hit.c0, it.c0); hit.c1 = Math.max(hit.c1, it.c1); } else cells.push({ c0: it.c0, c1: it.c1, items: [it] });
    });
    return {
      weekday: band.weekday,
      cells: cells.sort((a, b) => a.c0 - b.c0).map((c) => ({
        start: columns[c.c0].start, end: columns[c.c1].end,
        entries: cellEntries(c.items.sort((a, b) => cy(a.l) - cy(b.l) || a.l.left - b.l.left).map((i) => i.l.text)),
      })).filter((c) => c.entries.length),
    };
  });
  // OCR can spell the same subject two ways ("ELE I IBD" / "ELEI IBD"): fold spellings within one edit of the most common one.
  const entries = rows.flatMap((r) => r.cells.flatMap((c) => c.entries));
  const freq = {}; entries.forEach((e) => { freq[e.subject] = (freq[e.subject] || 0) + 1; });
  const key = (x) => x.replace(/ /g, '');
  const edit1 = (a, b) => { if (Math.abs(a.length - b.length) > 1) return false; let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return a.slice(i + 1) === b.slice(i) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i + 1); };
  const names = Object.keys(freq).sort((x, y) => freq[y] - freq[x]);
  const canon = {};
  names.forEach((n) => { const hit = names.find((m) => canon[m] === m && key(m).length >= 4 && (key(m) === key(n) || edit1(key(m), key(n)))); canon[n] = hit || n; });
  entries.forEach((e) => { e.subject = canon[e.subject] || e.subject; });
  const batches = [...new Set(rows.flatMap((r) => r.cells.flatMap((c) => c.entries.map((e) => e.batch).filter(Boolean))))].sort();
  return { columns, rows, batches };
}

/** Flatten a parsed timetable into lecture slots for the chosen batch. */
export function toSlots(parsed, batch) {
  const out = [];
  parsed.rows.forEach((r) => r.cells.forEach((c) => c.entries.forEach((e) => {
    if (e.batch && batch && e.batch !== batch) return;
    if (e.batch && !batch) return;
    out.push({ key: `${r.weekday}-${c.start}-${e.subject}-${e.batch || ''}`, weekday: r.weekday, start_time: c.start, end_time: c.end, subject: e.subject, teacher: e.teacher, room: e.room, kind: e.kind, include: true });
  })));
  return out.sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
}
