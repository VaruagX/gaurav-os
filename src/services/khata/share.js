import { Linking } from 'react-native';
import { formatPaise } from './money';

/** Digits only; 10-digit Indian numbers get the country code (default 91) so WhatsApp can route them. */
export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  return digits.length > 10 ? digits.slice(-10) : digits; // stored comparison key: last 10 digits
}

/** International digits for WhatsApp: "+91 98765 43210" / "098765 43210" / "9876543210" -> "919876543210". */
export function whatsappNumber(raw, countryCode = '91') {
  const original = String(raw || '').trim();
  const digits = original.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (original.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  const local = digits.replace(/^0+/, '');
  if (local.length === 10) return `${countryCode}${local}`;
  if (local.length > 10) return local; // already carries a country code
  return `${countryCode}${local}`;
}

/** Reminder text. netPaise > 0: they owe me. netPaise < 0: I owe them. 0: nothing to say. */
export function reminderMessage(name, netPaise) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  if (netPaise > 0) return `Hello ${first}, aapke ${formatPaise(netPaise)} pending hain. Kripya payment kar dein. Thank you.`;
  if (netPaise < 0) return `Hello ${first}, mujhe aapko ${formatPaise(-netPaise)} dena hai. Main jaldi payment kar dunga. Thank you.`;
  return null;
}

export const smsUrl = (phone, message) => `sms:${String(phone || '').replace(/[^\d+]/g, '')}?body=${encodeURIComponent(message)}`;
export const whatsappUrl = (phone, message, countryCode) => `whatsapp://send?phone=${whatsappNumber(phone, countryCode)}&text=${encodeURIComponent(message)}`;
export const whatsappWebUrl = (phone, message, countryCode) => `https://wa.me/${whatsappNumber(phone, countryCode)}?text=${encodeURIComponent(message)}`;

/**
 * Opens the target app with the message prefilled. NEVER sends: the user reviews and presses Send there.
 * Returns {ok, reason}. `linking` is injectable for tests.
 */
export async function openReminder(channel, phone, message, { countryCode = '91', linking = Linking } = {}) {
  if (!message) return { ok: false, reason: 'Nothing is pending with this person.' };
  if (!String(phone || '').replace(/[^\d]/g, '')) return { ok: false, reason: 'This person has no phone number saved.' };
  const candidates = channel === 'sms'
    ? [smsUrl(phone, message)]
    : [whatsappUrl(phone, message, countryCode), whatsappWebUrl(phone, message, countryCode)];
  for (const url of candidates) {
    try {
      if (await linking.canOpenURL(url)) { await linking.openURL(url); return { ok: true, url }; }
    } catch (e) { /* try next */ }
  }
  return { ok: false, reason: channel === 'sms' ? 'No SMS app found on this phone.' : 'WhatsApp is not installed on this phone.' };
}
