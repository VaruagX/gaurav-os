# GAURAV OS — Your Personal Life Assistant

Offline-first Android personal OS: voice reminders, college, study, routines, goals, notes and analytics.
React Native (Expo SDK 58, JavaScript) + Expo SQLite (raw SQL) + a local Kotlin Expo module for alarms/voice.
No backend, no cloud, no accounts.

## Layout
```
App.js, index.js            app entry (DB init, theme, alarm re-arm, native event sync)
src/theme, components/      design system (charcoal/white, light + dark), reusable UI kit
src/navigation              6-tab floating bar + stack screens
src/screens                 Home, Assistant, Reminders, College (+ sub-screens), Routine, Progress, Settings…
src/database                db.js (open, migrations, transactions), migrations/001-009, repositories/
src/services                reminders/, assistant/, college/, study/, routine/, backup/
modules/reminder-native     Kotlin: ReminderAlarmManager, ReminderReceiver, ReminderService, ReminderNotification,
                            BootReceiver, VoiceEngine, VaultCrypto, ReminderNativeModule
plugins/withGauravOs.js     config plugin (lock-screen flags + release signing) that survives `expo prebuild`
tests/                      node --test suites (DB, reminder maths, assistant, attendance/habit maths)
keystore/                   release keystore (git-ignored) — BACK IT UP
```

## Commands
```bash
npm install
npm test                                   # 23 logic/DB tests (Node built-in SQLite stands in for expo-sqlite)
npx expo prebuild --platform android       # regenerates android/ (config plugin re-applies everything)
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
adb install -r android/app/build/outputs/apk/release/app-release.apk   # install or update in place
```
Drop `-PreactNativeArchitectures=…` to build a universal APK (all ABIs, larger/slower).
Updates work with `adb install -r` as long as the same `keystore/gaurav-os.jks` signs every build.

## Reminders — how they work
Alarms are set with `AlarmManager.setAlarmClock` (exact, Doze-exempt). A `ReminderReceiver` fires, re-arms the next
occurrence immediately, and starts a short-lived `ReminderService` (foreground, mediaPlayback) that posts the notification
and speaks via Android `TextToSpeech` (alarm mode also loops the alarm sound and repeats the message until Stop,
auto-capped at 10 min). Reminders are mirrored in native storage so `BootReceiver` can rebuild everything after reboot,
app update, clock change or timezone change — no JS needed. Fired / completed / snoozed events are queued natively and
imported into **Reminder history** when the app opens.

**Limits (not hidden):** Android cancels all alarms when an app is *Force stopped* from Settings — nothing can fire
until the app is opened again. On Redmi/HyperOS also enable Autostart and set Battery to "No restrictions"
(Settings → Reminders → Reminder setup has buttons and the full guide).

## Security
Document Locker: files are AES-256-GCM encrypted by the native module with a non-exportable Android Keystore key and stored in
app-private `files/vault`. Only title/category live in SQLite. Backups contain the database only (vault keys are device-bound).
