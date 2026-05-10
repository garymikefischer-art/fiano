/**
 * Expo-Config-Plugin: setzt android:largeHeap="true" auf das <application>-Element
 * im AndroidManifest.xml.
 *
 * `expo-build-properties` unterstuetzt diese Flag nicht direkt — wir schreiben sie
 * deshalb selbst rein. Wirkt erst nach `npx expo prebuild --clean` + `run:android`.
 *
 * Hintergrund: Default Android-Heap ist 256 MB. Mit largeHeap=true bekommt die App
 * deutlich mehr (typisch 384-512 MB phone-spezifisch). Auf User's Vivo V40 Lite
 * crasht die App ohne dieses Flag im 9:16-Tab durch OOM.
 */

const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withLargeHeap(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application && application.$) {
      application.$['android:largeHeap'] = 'true';
    }
    return cfg;
  });
};
