/**
 * Push-Notifications-Helper (Phase 9.4.16).
 *
 * Lazy-Load: `expo-notifications` ist ein **Native-Modul** und braucht einen
 * neuen Build (`npm run android` / `expo prebuild + run:ios`). Wenn das alte
 * APK ohne Linking läuft, würde ein top-level `import` die App beim Boot
 * crashen ("Cannot find native module 'ExpoPushTokenManager'").
 *
 * Deshalb: require() innerhalb der Helper, mit Cache + try/catch. Wenn das
 * Modul nicht da ist → no-op + console.warn. Nach dem Native-Rebuild funktioniert
 * alles automatisch ohne Code-Change.
 */

import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined = undefined;
let handlerConfigured = false;
let warned = false;

function getModule(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('expo-notifications') as NotificationsModule;
  } catch (e) {
    cached = null;
    if (!warned) {
      warned = true;
      console.warn(
        '[push] expo-notifications nicht verfügbar — Native-Build mit `npm run android` / `expo run:ios` nötig.',
      );
    }
  }
  return cached;
}

function ensureHandler(N: NotificationsModule) {
  if (handlerConfigured) return;
  handlerConfigured = true;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Holt + cached den aktuellen Permission-Status. Fragt nur an wenn 'undetermined'.
 * Wenn das Native-Modul fehlt → 'denied' (no-op statt Crash).
 */
export async function ensureNotificationPermissions(): Promise<'granted' | 'denied' | 'undetermined'> {
  const N = getModule();
  if (!N) return 'denied';
  ensureHandler(N);

  const current = await N.getPermissionsAsync();
  if (current.status === 'granted') return 'granted';
  if (current.status === 'denied' && !current.canAskAgain) return 'denied';

  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('default', {
      name: 'fiano',
      importance: N.AndroidImportance.DEFAULT,
      lightColor: '#ff1039',
    });
  }

  const next = await N.requestPermissionsAsync();
  return (next.status as 'granted' | 'denied' | 'undetermined') ?? 'undetermined';
}

interface ScheduleOpts {
  title: string;
  body: string;
  /** Sekunden in der Zukunft. 0/undefined = sofort. */
  delaySec?: number;
  data?: Record<string, unknown>;
}

/**
 * Plant eine lokale Notification ohne Backend.
 * Stiller no-op wenn Permission/Native-Modul nicht vorhanden — nicht crashen.
 */
export async function scheduleLocalNotification({
  title,
  body,
  delaySec,
  data,
}: ScheduleOpts): Promise<string | null> {
  const N = getModule();
  if (!N) return null;
  ensureHandler(N);

  try {
    const status = await ensureNotificationPermissions();
    if (status !== 'granted') return null;

    const trigger = delaySec && delaySec > 0
      ? { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySec, repeats: false }
      : null;

    const id = await N.scheduleNotificationAsync({
      content: { title, body, data: data ?? {} },
      trigger: trigger as any,
    });
    return id;
  } catch {
    return null;
  }
}

export async function cancelAllLocalNotifications(): Promise<void> {
  const N = getModule();
  if (!N) return;
  try {
    await N.cancelAllScheduledNotificationsAsync();
  } catch {
    // ignore
  }
}
