/** Money helpers. All amounts are integer paise; floating point is never used for storage or arithmetic. */

/** "2,000.50" | "₹ 2000" | "1.5" -> 200050 | 200000 | 150; null if invalid / zero / negative / >2 decimals. */
export function parseRupees(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const paise = parseInt(whole, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

/** 200050 -> "2,000.50" (Indian digit grouping), whole rupees drop the decimals: 200000 -> "2,000". */
export function formatPaise(paise, { sign = false } = {}) {
  const neg = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100), p = abs % 100;
  let r = String(rupees);
  if (r.length > 3) r = r.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + r.slice(-3);
  const body = p ? `${r}.${String(p).padStart(2, '0')}` : r;
  return `${neg ? '-' : sign && abs > 0 ? '+' : ''}₹${body}`;
}

/** Paise back to an editable string: 200050 -> "2000.50", 200000 -> "2000". */
export const paiseToInput = (paise) => {
  const r = Math.floor(paise / 100), p = paise % 100;
  return p ? `${r}.${String(p).padStart(2, '0')}` : String(r);
};

/** Signed effect of an entry on "how much they owe me". */
export const SIGN = { lena: 1, given: 1, dena: -1, received: -1 };
export const signedAmount = (e) => (e.status === 'deleted' ? 0 : SIGN[e.type] * e.amount_paise);

export const TYPE_LABEL = {
  lena: 'Mujhe Lena Hai', dena: 'Mujhe Dena Hai', received: 'Payment Received', given: 'Payment Given',
};
