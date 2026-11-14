import { requireOptionalNativeModule } from 'expo-modules-core';

// Resolves to null when the native module is unavailable (e.g. Expo Go / web).
const Native = requireOptionalNativeModule('ReminderNative');
export default Native;
