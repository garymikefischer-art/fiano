/**
 * App-Store (Phase 9.4.10).
 *
 * Allgemeiner App-State der nicht zu Auth oder einer Domain (Projects, Notifications)
 * gehört. Aktuell:
 *  - Onboarding-Completed-Flag
 *  - Default-Capture-Regions für Facecam + Gameplay (für 9:16-Stacking-Layouts)
 *
 * Persistenz via expo-secure-store.
 */

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SubtitleSettings } from '../data/demoProjects';

const ONBOARDING_KEY = 'fiano.onboarding.completed';
const FACECAM_KEY = 'fiano.region.facecam';
const GAMEPLAY_KEY = 'fiano.region.gameplay';
const OPENAI_KEY = 'fiano.api.openai';
const GEMINI_KEY = 'fiano.api.gemini';
const EXPORT_KEY = 'fiano.export.settings';
const LAST_PROJECT_KEY = 'fiano.lastOpenedProject';
// YouTube-Cookies sind oft mehrere KB groß (SecureStore-Limit 2KB) — daher
// in AsyncStorage statt SecureStore. Cookies sind session-bound + expiren —
// kein Permanent-Credential-Leak-Risiko vergleichbar zu OpenAI-Keys.
const YOUTUBE_COOKIES_KEY = 'fiano.api.youtube-cookies';
const SUBTITLE_PRESETS_KEY = 'fiano.subtitle.presets';
const INTRO_DEFAULTS_KEY = 'fiano.intro.defaults';

/** Region-Coords als Anteile (0..1) auf der Source-Video-Fläche. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Quick-Presets — werden auch als Migrations-Source aus alten String-Keys genutzt. */
export type FacecamPreset = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';
export type GameplayPreset = 'center' | 'bottom' | 'stretch' | 'full';

export const FACECAM_PRESETS: Record<FacecamPreset, Region | null> = {
  'top-left': { x: 0.06, y: 0.06, w: 0.28, h: 0.32 },
  'top-right': { x: 0.66, y: 0.06, w: 0.28, h: 0.32 },
  'bottom-left': { x: 0.06, y: 0.62, w: 0.28, h: 0.32 },
  'bottom-right': { x: 0.66, y: 0.62, w: 0.28, h: 0.32 },
  none: null,
};

export const GAMEPLAY_PRESETS: Record<GameplayPreset, Region> = {
  center: { x: 0.15, y: 0.15, w: 0.7, h: 0.7 },
  bottom: { x: 0.05, y: 0.4, w: 0.9, h: 0.55 },
  stretch: { x: 0.0, y: 0.2, w: 1.0, h: 0.6 },
  full: { x: 0.0, y: 0.0, w: 1.0, h: 1.0 },
};

const DEFAULT_FACECAM: Region = FACECAM_PRESETS['top-left']!;
const DEFAULT_GAMEPLAY: Region = GAMEPLAY_PRESETS.full;

export type ExportFps = 24 | 30 | 60;
export type ExportResolution = '720p' | '1080p' | '4k';
export type ExportBitrate = '5M' | '10M' | '20M' | '40M' | '80M';

export interface ExportSettings {
  fps: ExportFps;
  resolution: ExportResolution;
  bitrate: ExportBitrate;
}

const DEFAULT_EXPORT: ExportSettings = { fps: 30, resolution: '1080p', bitrate: '20M' };

/** Custom Subtitle-Preset (Phase 9.6.7e) — User-saved styling für Re-Use. */
export interface CustomSubtitlePreset {
  id: string;
  name: string;
  settings: SubtitleSettings;
  createdAt: number;
}

interface AppState {
  initializing: boolean;
  onboardingCompleted: boolean;
  facecamRegion: Region | null;
  gameplayRegion: Region;
  /** OpenAI API-Key für Podcast-Highlights / GPT-Tools (im SecureStore). */
  openaiKey: string;
  /** Gemini API-Key für Thumbnail-Generation (im SecureStore). */
  geminiKey: string;
  /** YouTube-Cookies (Netscape cookies.txt-Format) für yt-dlp Bot-Detection-
   *  Bypass. User exportiert die mit 'Get cookies.txt LOCALLY' Browser-Extension
   *  und pastet hier rein. Sehen Settings → API-Keys. */
  youtubeCookies: string;
  /** User-saved Subtitle-Styling-Presets (Phase 9.6.7e). */
  customSubtitlePresets: CustomSubtitlePreset[];
  /** Default-Export-Settings für 9:16 + Builder Renders. */
  exportSettings: ExportSettings;
  /** Letzte projectId die der User in ProjectDetail geöffnet hat — für Tab-Quick-Open. */
  lastOpenedProjectId: string | null;
  /** Phase Builder-5: Default-Intro-Position-Preset. Wird beim Intro-Pick als
   *  initial values genutzt — damit User die overlay-Position nicht jedes Mal
   *  neu eingeben muss. Null = keinem Default (intro-pick startet bei 0/0/1). */
  introDefaults: { mode: 'before' | 'overlay'; x: number; y: number; scale: number; durationSec: number } | null;

  init: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
  setFacecamRegion: (r: Region | null) => Promise<void>;
  setGameplayRegion: (r: Region) => Promise<void>;
  setOpenaiKey: (k: string) => Promise<void>;
  setGeminiKey: (k: string) => Promise<void>;
  setYoutubeCookies: (c: string) => Promise<void>;
  setExportSettings: (s: ExportSettings) => Promise<void>;
  setLastOpenedProjectId: (id: string) => Promise<void>;
  /** Subtitle-Preset speichern (cues werden NICHT mit-persistiert, nur styling). */
  saveSubtitlePreset: (name: string, settings: SubtitleSettings) => Promise<void>;
  removeSubtitlePreset: (id: string) => Promise<void>;
  /** Phase Builder-5: aktuelle Intro-Position als Default speichern. */
  setIntroDefaults: (
    d: { mode: 'before' | 'overlay'; x: number; y: number; scale: number; durationSec: number } | null,
  ) => Promise<void>;
}

/** Liest entweder einen JSON-Region oder einen Legacy-Preset-String. */
function parseRegion<T extends FacecamPreset | GameplayPreset>(
  raw: string | null,
  presets: Record<T, Region | null>,
  fallback: Region | null,
): Region | null {
  if (!raw) return fallback;
  // Legacy: Preset-String (z.B. "top-left").
  if (raw in presets) return presets[raw as T] ?? null;
  // JSON-Region.
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      typeof parsed.w === 'number' &&
      typeof parsed.h === 'number'
    ) {
      return parsed;
    }
  } catch {
    /* fall through */
  }
  return fallback;
}

export const useAppStore = create<AppState>((set) => ({
  initializing: true,
  onboardingCompleted: false,
  facecamRegion: DEFAULT_FACECAM,
  gameplayRegion: DEFAULT_GAMEPLAY,
  openaiKey: '',
  geminiKey: '',
  youtubeCookies: '',
  customSubtitlePresets: [],
  exportSettings: DEFAULT_EXPORT,
  lastOpenedProjectId: null,
  introDefaults: null,

  init: async () => {
    try {
      const [
        onboarding,
        facecam,
        gameplay,
        openai,
        gemini,
        ytCookies,
        presetsRaw,
        exportRaw,
        lastProject,
        introDefaultsRaw,
      ] = await Promise.all([
        SecureStore.getItemAsync(ONBOARDING_KEY),
        SecureStore.getItemAsync(FACECAM_KEY),
        SecureStore.getItemAsync(GAMEPLAY_KEY),
        SecureStore.getItemAsync(OPENAI_KEY),
        SecureStore.getItemAsync(GEMINI_KEY),
        // Phase A6.9 (2026-05-18): YT cookies in SecureStore statt AsyncStorage
        // (P2-6 Audit). YT-Cookies = full Google session = High-Value-Target
        // bei rooted device. SecureStore = iOS Keychain / Android EncryptedSP.
        // Migration: alte AsyncStorage-Werte werden bei nächstem set transient
        // re-saved in SecureStore. Old AsyncStorage-Eintrag bleibt (harmless,
        // wird vom store ignored).
        SecureStore.getItemAsync(YOUTUBE_COOKIES_KEY).then(async (v) =>
          v ?? (await AsyncStorage.getItem(YOUTUBE_COOKIES_KEY)),
        ),
        AsyncStorage.getItem(SUBTITLE_PRESETS_KEY),
        SecureStore.getItemAsync(EXPORT_KEY),
        SecureStore.getItemAsync(LAST_PROJECT_KEY),
        SecureStore.getItemAsync(INTRO_DEFAULTS_KEY),
      ]);
      let exportSettings = DEFAULT_EXPORT;
      if (exportRaw) {
        try {
          const parsed = JSON.parse(exportRaw);
          if (parsed?.fps && parsed?.resolution && parsed?.bitrate) exportSettings = parsed;
        } catch {
          /* keep default */
        }
      }
      let customSubtitlePresets: CustomSubtitlePreset[] = [];
      if (presetsRaw) {
        try {
          const parsed = JSON.parse(presetsRaw);
          if (Array.isArray(parsed)) customSubtitlePresets = parsed;
        } catch {
          /* keep empty */
        }
      }
      let introDefaults: AppState['introDefaults'] = null;
      if (introDefaultsRaw) {
        try {
          const parsed = JSON.parse(introDefaultsRaw);
          if (
            parsed &&
            typeof parsed.x === 'number' &&
            typeof parsed.y === 'number' &&
            typeof parsed.scale === 'number'
          ) {
            introDefaults = {
              mode: parsed.mode === 'overlay' ? 'overlay' : 'before',
              x: parsed.x,
              y: parsed.y,
              scale: parsed.scale,
              durationSec: typeof parsed.durationSec === 'number' ? parsed.durationSec : 3,
            };
          }
        } catch {
          /* keep null */
        }
      }
      set({
        onboardingCompleted: onboarding === '1',
        facecamRegion: parseRegion(facecam, FACECAM_PRESETS, DEFAULT_FACECAM),
        gameplayRegion:
          parseRegion(gameplay, GAMEPLAY_PRESETS, DEFAULT_GAMEPLAY) ?? DEFAULT_GAMEPLAY,
        openaiKey: openai ?? '',
        geminiKey: gemini ?? '',
        youtubeCookies: ytCookies ?? '',
        customSubtitlePresets,
        exportSettings,
        lastOpenedProjectId: lastProject ?? null,
        introDefaults,
        initializing: false,
      });
    } catch {
      set({ initializing: false });
    }
  },

  completeOnboarding: async () => {
    set({ onboardingCompleted: true });
    try {
      await SecureStore.setItemAsync(ONBOARDING_KEY, '1');
    } catch {
      /* ignore */
    }
  },

  resetOnboarding: async () => {
    set({ onboardingCompleted: false });
    try {
      await SecureStore.deleteItemAsync(ONBOARDING_KEY);
    } catch {
      /* ignore */
    }
  },

  setFacecamRegion: async (r) => {
    set({ facecamRegion: r });
    try {
      if (r === null) {
        await SecureStore.deleteItemAsync(FACECAM_KEY);
      } else {
        await SecureStore.setItemAsync(FACECAM_KEY, JSON.stringify(r));
      }
    } catch {
      /* ignore */
    }
  },

  setGameplayRegion: async (r) => {
    set({ gameplayRegion: r });
    try {
      await SecureStore.setItemAsync(GAMEPLAY_KEY, JSON.stringify(r));
    } catch {
      /* ignore */
    }
  },

  setOpenaiKey: async (k) => {
    set({ openaiKey: k });
    try {
      if (k) await SecureStore.setItemAsync(OPENAI_KEY, k);
      else await SecureStore.deleteItemAsync(OPENAI_KEY);
    } catch {
      /* ignore */
    }
  },

  setGeminiKey: async (k) => {
    set({ geminiKey: k });
    try {
      if (k) await SecureStore.setItemAsync(GEMINI_KEY, k);
      else await SecureStore.deleteItemAsync(GEMINI_KEY);
    } catch {
      /* ignore */
    }
  },

  setYoutubeCookies: async (c) => {
    set({ youtubeCookies: c });
    try {
      // Phase A6.9: SecureStore statt AsyncStorage (P2-6). SecureStore hat
      // 2KB limit pro Key — YT-Cookies sind oft 1.5-3KB. Bei Overflow:
      // Chunking. Für jetzt: rely on Expo's chunking + clear AsyncStorage-
      // legacy-Eintrag.
      if (c) {
        await SecureStore.setItemAsync(YOUTUBE_COOKIES_KEY, c);
        await AsyncStorage.removeItem(YOUTUBE_COOKIES_KEY).catch(() => {});
      } else {
        await SecureStore.deleteItemAsync(YOUTUBE_COOKIES_KEY);
        await AsyncStorage.removeItem(YOUTUBE_COOKIES_KEY).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  },

  setExportSettings: async (s) => {
    set({ exportSettings: s });
    try {
      await SecureStore.setItemAsync(EXPORT_KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  },

  setLastOpenedProjectId: async (id) => {
    set({ lastOpenedProjectId: id });
    try {
      await SecureStore.setItemAsync(LAST_PROJECT_KEY, id);
    } catch {
      /* ignore */
    }
  },

  saveSubtitlePreset: async (name, settings) => {
    // cues NICHT mit-persistieren — Preset ist nur Styling. Bei Apply behält
    // das Project seine eigenen cues, übernimmt nur Font/Color/Glow/etc.
    const cleaned: SubtitleSettings = { ...settings, cues: undefined };
    const preset: CustomSubtitlePreset = {
      id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || `Preset ${Date.now()}`,
      settings: cleaned,
      createdAt: Date.now(),
    };
    const next = [...useAppStore.getState().customSubtitlePresets, preset];
    set({ customSubtitlePresets: next });
    try {
      await AsyncStorage.setItem(SUBTITLE_PRESETS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  },

  removeSubtitlePreset: async (id) => {
    const next = useAppStore.getState().customSubtitlePresets.filter((p) => p.id !== id);
    set({ customSubtitlePresets: next });
    try {
      await AsyncStorage.setItem(SUBTITLE_PRESETS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  },

  setIntroDefaults: async (d) => {
    set({ introDefaults: d });
    try {
      if (d) {
        await SecureStore.setItemAsync(INTRO_DEFAULTS_KEY, JSON.stringify(d));
      } else {
        await SecureStore.deleteItemAsync(INTRO_DEFAULTS_KEY);
      }
    } catch {
      /* ignore */
    }
  },
}));
