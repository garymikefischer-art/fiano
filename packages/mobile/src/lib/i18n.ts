/**
 * Mobile-i18n — analog Desktop src/renderer/src/lib/i18n.ts.
 *
 * Architektur:
 *  - Sprach-Tabellen kommen aus @fiano/shared/i18n (geteilt mit Desktop, 9 Locales).
 *  - useSyncExternalStore + Subscriber-Pattern → triggert Re-Render aller useT-Consumer
 *    bei setLanguage().
 *  - Persistence via expo-secure-store (gleicher Speicher wie der Auth-Token).
 *  - Initial-Load:
 *     1. persist override → wenn vorhanden, nutzen
 *     2. sonst → Device-Locale via expo-localization
 *     3. sonst → 'en'
 */

import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import { getLocales } from 'expo-localization';

import {
  TRANSLATIONS,
  LANGUAGES as SHARED_LANGUAGES,
  type LanguageCode as SharedLanguageCode,
  type LanguageMeta as SharedLanguageMeta,
} from '@fiano/shared/i18n';

export type LanguageCode = SharedLanguageCode;
export type LanguageMeta = SharedLanguageMeta;

export const LANGUAGES: LanguageMeta[] = SHARED_LANGUAGES;

const SUPPORTED: ReadonlySet<LanguageCode> = new Set(SHARED_LANGUAGES.map((l) => l.code));
const TABLES: Record<LanguageCode, Record<string, string>> = TRANSLATIONS;
const DEFAULT_LANGUAGE: LanguageCode = 'en';
const STORAGE_KEY = 'fiano.lang';

/* ─── Reactive Store ─────────────────────────────────────────── */

let currentLanguage: LanguageCode = DEFAULT_LANGUAGE;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): LanguageCode {
  return currentLanguage;
}

/** Sprache live umschalten + persistieren. Triggert Re-Render aller useT-Consumer. */
export function setLanguage(code: LanguageCode) {
  if (!SUPPORTED.has(code)) {
    console.warn(`[i18n] unknown language '${code}', falling back to '${DEFAULT_LANGUAGE}'`);
    code = DEFAULT_LANGUAGE;
  }
  if (currentLanguage === code) return;
  currentLanguage = code;
  for (const cb of listeners) cb();
  // Persist async — wir warten nicht, UI hat schon umgeschaltet.
  void SecureStore.setItemAsync(STORAGE_KEY, code).catch(() => {});
}

export function getLanguage(): LanguageCode {
  return currentLanguage;
}

/* ─── Init ───────────────────────────────────────────────────── */

/**
 * Beim App-Start aufrufen (vor erstem Render bzw. parallel zu auth.init).
 *
 * Reihenfolge:
 *   1. SecureStore-Override lesen
 *   2. fallback auf Device-Locale (expo-localization)
 *   3. fallback auf 'en'
 */
export async function initLanguage(): Promise<LanguageCode> {
  try {
    const stored = await SecureStore.getItemAsync(STORAGE_KEY);
    if (stored && SUPPORTED.has(stored as LanguageCode)) {
      currentLanguage = stored as LanguageCode;
      for (const cb of listeners) cb();
      return currentLanguage;
    }
  } catch {
    // SecureStore-Lesen fehlgeschlagen — wir fallen auf Device-Locale.
  }

  try {
    const locales = getLocales();
    const primary = locales[0]?.languageCode?.toLowerCase();
    if (primary && SUPPORTED.has(primary as LanguageCode)) {
      currentLanguage = primary as LanguageCode;
      for (const cb of listeners) cb();
      return currentLanguage;
    }
  } catch {
    // expo-localization kann auf älteren Geräten throw'n — egal, wir bleiben bei DEFAULT.
  }

  currentLanguage = DEFAULT_LANGUAGE;
  for (const cb of listeners) cb();
  return currentLanguage;
}

/* ─── Hook ───────────────────────────────────────────────────── */

/**
 * Hook: liefert die `t(key)`-Funktion gebunden an die aktive Sprache.
 * Re-rendert wenn `setLanguage()` aufgerufen wird.
 *
 * Usage: `const t = useT(); t('sidebar.home');`
 */
export function useT(): (key: string, fallback?: string) => string {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return (key: string, fallback?: string) => {
    const table = TABLES[lang];
    const val = table[key];
    if (val !== undefined) return val;
    const enVal = TABLES[DEFAULT_LANGUAGE][key];
    if (enVal !== undefined) return enVal;
    return fallback ?? key;
  };
}

/**
 * Hook: gibt den aktiven Sprach-Code zurück und triggert Re-Render bei Wechsel.
 * Praktisch wenn man die Sprache anzeigt (z.B. Native-Name in Settings) ohne `t()`.
 */
export function useLanguage(): LanguageCode {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
