import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import { settingsRepository } from '../database/repositories';

const hashPin = (pin) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `gauravos:${pin}`);

export async function biometricsAvailable() {
  try { return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync()); } catch (e) { return false; }
}
export async function enableLock(pin) {
  if (!/^\d{4,6}$/.test(pin || '')) throw new Error('PIN must be 4 to 6 digits.');
  await settingsRepository.set('lockPin', await hashPin(pin));
  await settingsRepository.set('appLock', '1');
}
export async function disableLock() { await settingsRepository.set('appLock', '0'); await settingsRepository.set('lockPin', ''); }
export async function checkPin(pin) { return (await hashPin(pin)) === (await settingsRepository.get('lockPin')); }
export async function authenticate() {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock GAURAV OS', fallbackLabel: 'Use PIN', disableDeviceFallback: true, cancelLabel: 'Use PIN' });
  return !!r.success;
}
