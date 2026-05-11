/**
 * Expo Dynamic Config — überlagert app.json mit JS-only-Logic.
 *
 * Aktuell hier nur der largeHeap-Plugin (inline) — damit's keinen Plugin-Path-
 * Resolution-Problem gibt wenn man `npx expo prebuild` aus unterschiedlichen
 * CWDs aufruft. Vorher hatten wir `./plugins/with-large-heap.js` registriert,
 * das wurde aber stillschweigend übersprungen — Manifest blieb ohne largeHeap.
 *
 * Wenn expo eine app.config.js + app.json findet, MERGED er beide, mit
 * app.config.js als override-Layer (siehe https://docs.expo.dev/workflow/configuration/).
 */

const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Inline-Plugin: setzt android:largeHeap="true" auf das <application>-Element.
 * Default Android-Heap 256 MB → mit largeHeap typisch 384-512 MB.
 */
function withLargeHeap(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application && application.$) {
      application.$['android:largeHeap'] = 'true';
      console.log('[withLargeHeap] android:largeHeap=true ins AndroidManifest gepatcht.');
    } else {
      console.warn('[withLargeHeap] Kein <application>-Element gefunden — largeHeap NICHT gesetzt.');
    }
    return cfg;
  });
}

module.exports = ({ config }) => {
  // `config` enthält die mergte app.json. Wir hängen unser Plugin an.
  return withLargeHeap(config);
};
