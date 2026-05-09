/**
 * Barrel-Export für alle 9 Locale-Maps.
 *
 * Plattform-neutrale i18n-Daten — beide Apps (Desktop / Mobile) importieren von hier.
 * Der Hook (`useT()`) und die Persistierung der aktiven Sprache bleiben pro App
 * eigenständig (Desktop nutzt useSyncExternalStore + IPC, Mobile nutzt Zustand +
 * AsyncStorage).
 */

import { de } from './locales/de';
import { en } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { it } from './locales/it';
import { nl } from './locales/nl';
import { pl } from './locales/pl';
import { pt } from './locales/pt';
import { ru } from './locales/ru';

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

export const TRANSLATIONS = { de, en, es, fr, it, nl, pl, pt, ru } as const;

export type TranslationKey = keyof typeof en;

export { de, en, es, fr, it, nl, pl, pt, ru };
