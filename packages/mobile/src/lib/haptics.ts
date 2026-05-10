/**
 * Haptik-Helper (Phase 9.4.26).
 *
 * Lazy-Load von `expo-haptics` mit try/catch — wenn das Native-Modul (noch)
 * nicht verlinkt ist (Phone wartet auf Rebuild), sind die Calls no-op statt
 * App-Crash. Gleicher Pattern wie pushNotifications.ts.
 *
 * iOS: nutzt Taptic Engine.
 * Android: vibrationsbasierte Approximation (ältere Geräte ggf. nur schwach).
 *
 * Klassen:
 *  - selection   — leichter Tick beim Wechsel (Tab, Picker)
 *  - light       — UI-Tap (Mode-Card, Bell, Avatar)
 *  - medium      — Markierungen, Add-Clip
 *  - heavy       — schwere Aktion / Bestätigung
 *  - success     — Done / Saved
 *  - warning     — destructive-Confirm
 *  - error       — Fehlermeldung / blockierte Aktion
 */

type HapticsModule = typeof import('expo-haptics');

let cached: HapticsModule | null | undefined = undefined;
let warned = false;

function getModule(): HapticsModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('expo-haptics') as HapticsModule;
  } catch {
    cached = null;
    if (!warned) {
      warned = true;
      console.warn('[haptics] expo-haptics nicht verfügbar — Native-Build mit `npm run android` nötig.');
    }
  }
  return cached;
}

export const haptic = {
  selection() {
    const H = getModule();
    H?.selectionAsync().catch(() => {});
  },
  light() {
    const H = getModule();
    H?.impactAsync(H.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium() {
    const H = getModule();
    H?.impactAsync(H.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  heavy() {
    const H = getModule();
    H?.impactAsync(H.ImpactFeedbackStyle.Heavy).catch(() => {});
  },
  success() {
    const H = getModule();
    H?.notificationAsync(H.NotificationFeedbackType.Success).catch(() => {});
  },
  warning() {
    const H = getModule();
    H?.notificationAsync(H.NotificationFeedbackType.Warning).catch(() => {});
  },
  error() {
    const H = getModule();
    H?.notificationAsync(H.NotificationFeedbackType.Error).catch(() => {});
  },
};
