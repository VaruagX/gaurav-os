import { TYPE_LABEL, paiseToInput } from './money';

/** CSV-safe cell: quotes/newlines escaped, and spreadsheet formulas (=,+,-,@) neutralised. */
export function cell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Entire ledger (including deleted entries, marked) as CSV text. rows: entries joined with contact name/phone. */
export function ledgerCsv(rows) {
  const head = ['Date', 'Person', 'Phone', 'Type', 'Amount (INR)', 'Due date', 'Note', 'Status'];
  const lines = [head.map(cell).join(',')];
  for (const r of rows) {
    lines.push([r.date, r.contact_name, r.contact_phone, TYPE_LABEL[r.type], paiseToInput(r.amount_paise), r.due_date || '', r.note || '', r.status === 'deleted' ? 'deleted' : 'active'].map(cell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
