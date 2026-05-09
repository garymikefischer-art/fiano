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

// Phase 9.4.1: Locales sind jetzt im @fiano/shared Package — Mobile-App nutzt
// dieselben Übersetzungs-Tabellen. Renderer behält den useT-Hook + Persistierung.
import {
  TRANSLATIONS,
  LANGUAGES as SHARED_LANGUAGES,
  type LanguageCode as SharedLanguageCode,
  type LanguageMeta as SharedLanguageMeta,
} from '@fiano/shared/i18n';

export type LanguageCode = SharedLanguageCode;
export type LanguageMeta = SharedLanguageMeta;

/** UI-sortiert (siehe @fiano/shared/i18n). */
export const LANGUAGES: LanguageMeta[] = SHARED_LANGUAGES;

const TABLES: Record<LanguageCode, Record<string, string>> = TRANSLATIONS;

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
