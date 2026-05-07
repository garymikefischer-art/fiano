/**
 * Custom Mini-i18n.
 *
 * Vermeidet ESM-only Pakete (siehe p-queue-Lehre — Electron Main ist CommonJS,
 * Renderer ist ESM-Vite, daher hier konservativ ohne external dep).
 *
 * Architektur:
 *  - Sprach-Tabellen sind reguläre TS-Module mit einem flat key-value object.
 *  - Aktuelle Sprache als Modul-State + Subscriber-Pattern (useSyncExternalStore).
 *  - `t(key)` Hook → liefert String aus aktiver Sprache, fallback auf 'en'.
 *  - Persistence via IPC (appDefaults.set/get) — kein separater Speicher.
 */

import { useSyncExternalStore } from 'react';

import { de } from './i18n/de';
import { en } from './i18n/en';
import { es } from './i18n/es';
import { fr } from './i18n/fr';
import { it } from './i18n/it';
import { nl } from './i18n/nl';
import { pl } from './i18n/pl';
import { pt } from './i18n/pt';
import { ru } from './i18n/ru';

export type LanguageCode = 'de' | 'en' | 'es' | 'fr' | 'it' | 'nl' | 'pl' | 'pt' | 'ru';

export interface LanguageMeta {
  code: LanguageCode;
  /** Native-Name (z.B. "Deutsch", "Русский") — für Dropdown-Display. */
  nativeName: string;
}

/** UI-sortiert: User-Vorgabe (DE/EN/IT/RU/ES + FR/PT/NL/PL). */
export const LANGUAGES: LanguageMeta[] = [
  { code: 'de', nativeName: 'Deutsch' },
  { code: 'en', nativeName: 'English' },
  { code: 'it', nativeName: 'Italiano' },
  { code: 'ru', nativeName: 'Русский' },
  { code: 'es', nativeName: 'Español' },
  { code: 'fr', nativeName: 'Français' },
  { code: 'pt', nativeName: 'Português' },
  { code: 'nl', nativeName: 'Nederlands' },
  { code: 'pl', nativeName: 'Polski' },
];

const TABLES: Record<LanguageCode, Record<string, string>> = {
  de, en, es, fr, it, nl, pl, pt, ru,
};

const DEFAULT_LANGUAGE: LanguageCode = 'en';

/* ─── Reactive Store (subscribe + getSnapshot) ─────────────── */

let currentLanguage: LanguageCode = DEFAULT_LANGUAGE;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot(): LanguageCode {
  return currentLanguage;
}

/** Sprache live umschalten. Triggert Re-Render aller useT-Consumer. */
export function setLanguage(code: LanguageCode) {
  if (currentLanguage === code) return;
  if (!TABLES[code]) {
    console.warn(`[i18n] unknown language '${code}', falling back to '${DEFAULT_LANGUAGE}'`);
    code = DEFAULT_LANGUAGE;
  }
  currentLanguage = code;
  for (const cb of listeners) cb();
}

export function getLanguage(): LanguageCode {
  return currentLanguage;
}

/* ─── Hook ──────────────────────────────────────────────────── */

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
    // Fallback-Kette: en → key (oder explicit fallback).
    const enVal = TABLES[DEFAULT_LANGUAGE][key];
    if (enVal !== undefined) return enVal;
    return fallback ?? key;
  };
}
