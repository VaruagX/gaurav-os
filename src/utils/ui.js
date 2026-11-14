import { Alert, ToastAndroid, Platform } from 'react-native';

export const toast = (msg) => {
  if (Platform.OS === 'android') ToastAndroid.show(String(msg), ToastAndroid.SHORT);
};

/** Promise-based confirmation dialog. */
export const confirm = (title, message, { confirmText = 'Confirm', destructive = false } = {}) =>
  new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });

export const showError = (e, title = 'Something went wrong') => Alert.alert(title, e?.message || String(e));

/** Run an action; surface errors instead of swallowing them. */
export async function attempt(fn, errTitle) {
  try { return await fn(); } catch (e) { showError(e, errTitle); return undefined; }
}
