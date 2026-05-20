/**
 * EAS Update (OTA) Helper — Phase D2 (2026-05-20).
 *
 * Wrapper um expo-updates für JS-only Over-the-Air-Updates. Damit lassen
 * sich Bug-Fixes / JS-Changes ohne Store-Review + ohne Native-Rebuild
 * ausrollen (`eas update --branch <channel>`).
 *
 * Auto-Check beim App-Start passiert NATIV via app.json
 * `updates.checkAutomatically: ON_LOAD` — Download im Hintergrund, Apply
 * beim nächsten Start. Diese Helper sind für den manuellen
 * "Check for updates"-Button im Settings-Screen.
 *
 * ⚠️ expo-updates ist in Dev-Builds (`expo run:android`) deaktiviert —
 * `Updates.isEnabled` ist dann false. Echtes OTA-Testing braucht einen
 * Production/Preview-Build (`eas build`).
 */
import * as Updates from 'expo-updates';

export type OtaCheckResult = 'dev' | 'none' | 'downloaded' | 'error';

/**
 * Prüft auf ein OTA-Update und lädt es ggf. herunter. Der Reload (Apply)
 * wird NICHT automatisch ausgeführt — der Caller entscheidet (User-Prompt),
 * damit der User nicht mitten in einer Aktion rausgeworfen wird.
 */
export async function checkForOtaUpdate(): Promise<OtaCheckResult> {
  // Dev-Build / Expo Go → keine Updates möglich.
  if (__DEV__ || !Updates.isEnabled) return 'dev';
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return 'none';
    await Updates.fetchUpdateAsync();
    return 'downloaded';
  } catch (err) {
    console.warn('[updates] OTA-Check fehlgeschlagen:', err);
    return 'error';
  }
}

/** Startet die App mit dem heruntergeladenen Update neu. */
export async function applyOtaUpdate(): Promise<void> {
  // Phase R10 (Bug-2): warten bis das AppAlert-<Modal> fertig fade-out ist — reloadAsync() mid-Modal → weißer Screen nach dem Reload (Android, Expo SDK 52).
  await new Promise((r) => setTimeout(r, 450));
  try {
    await Updates.reloadAsync();
  } catch (err) {
    console.warn('[updates] reloadAsync fehlgeschlagen:', err);
  }
}
