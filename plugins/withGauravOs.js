/**
 * Config plugin that keeps GAURAV OS native customisations alive across `expo prebuild`:
 *  - lets the main activity show over the lock screen (alarm-mode full-screen reminders)
 *  - signs release builds with keystore/gaurav-os.jks (see keystore/README.md)
 * Reminder permissions/receivers/services come from modules/reminder-native's own manifest.
 */
const { withAndroidManifest, withAppBuildGradle, createRunOncePlugin } = require('expo/config-plugins');

function withLockScreen(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const main = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity');
    if (main) {
      main.$['android:showWhenLocked'] = 'true';
      main.$['android:turnScreenOn'] = 'true';
    }
    return cfg;
  });
}

const SIGNING = `
    signingConfigs {
        release {
            def props = new Properties()
            def f = rootProject.file("../keystore/keystore.properties")
            if (f.exists()) {
                f.withInputStream { props.load(it) }
                storeFile rootProject.file("../keystore/" + props['storeFile'])
                storePassword props['storePassword']
                keyAlias props['keyAlias']
                keyPassword props['keyPassword']
            }
        }`;

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (!g.includes('keystore.properties')) {
      g = g.replace(/signingConfigs\s*\{/, SIGNING.trimStart().replace(/^signingConfigs \{\n?/, 'signingConfigs {\n') );
      // release buildType: use the release signing config when a keystore is configured
      g = g.replace(
        /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
        '$1signingConfig rootProject.file("../keystore/keystore.properties").exists() ? signingConfigs.release : signingConfigs.debug'
      );
    }
    cfg.modResults.contents = g;
    return cfg;
  });
}

const withGauravOs = (config) => withReleaseSigning(withLockScreen(config));
module.exports = createRunOncePlugin(withGauravOs, 'with-gaurav-os', '1.0.0');
