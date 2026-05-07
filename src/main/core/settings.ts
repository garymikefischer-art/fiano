import { app, safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { ClipEffects, FacecamRegion, GameplayRegion } from '@shared/types';
import { DEFAULT_EFFECTS, DEFAULT_FACECAM, DEFAULT_GAMEPLAY, DEFAULT_SPLIT_RATIO } from '@shared/types';

const KEY_FILE      = () => path.join(app.getPath('userData'), 'api-key.enc');
const DEFAULTS_FILE = () => path.join(app.getPath('userData'), 'app-defaults.json');

export interface EditorExportDefaults {
  width: number;
  height: number;
  fps: number;
  bitrate: string;
}

export interface AppDefaults {
  facecam: FacecamRegion;
  splitRatio: number;
  testClipPath?: string;
  gameplay: GameplayRegion;
  effects: ClipEffects;
  geminiImageModel?: string;       // override Modell für Thumbnail-Gen, sonst Auto-Fallback
  ffmpegPath?: string;             // override Pfad zum ffmpeg-Binary (z.B. /opt/homebrew/.../ffmpeg-full)
  // ─── General ─────────────────────────────────────────────
  /** Confirm-Dialog vor Delete-Aktionen (Project/Highlight). Default true. */
  confirmDelete?: boolean;
  /** Sound-Effekte global aktiviert. Default true. */
  soundsEnabled?: boolean;
  /** UI-Sprache (i18n). z.B. 'de'|'en'|'it'|'ru'|'es'|'fr'|'pt'|'nl'|'pl'. Default 'en'. */
  language?: string;
  // ─── Editor-Export-Defaults ──────────────────────────────
  /** Default-Werte für Editor-Timeline-Export (überschreibbar pro Export). */
  editorExport?: EditorExportDefaults;
  /** Encoder-Quality-Mode: 'fast' = Hardware (videotoolbox auf macOS, schnell aber pro-Bit
   *  qualitätsmäßig schlechter), 'quality' = libx264 -preset slow (langsamer, schärfer). */
  qualityMode?: 'fast' | 'quality';
  /** User-saved Subtitle-Presets — komplettes Settings-Snapshot mit name. */
  subtitlePresets?: Array<{ id: string; name: string; settings: import('@shared/types').SubtitleSettings }>;
}

const DEFAULT_EDITOR_EXPORT: EditorExportDefaults = {
  width: 1920, height: 1080, fps: 30, bitrate: '30M',
};

const FALLBACK_DEFAULTS: AppDefaults = {
  facecam: { ...DEFAULT_FACECAM },
  splitRatio: DEFAULT_SPLIT_RATIO,
  gameplay: { ...DEFAULT_GAMEPLAY },
  effects: { ...DEFAULT_EFFECTS },
  confirmDelete: true,
  soundsEnabled: true,
  editorExport: { ...DEFAULT_EDITOR_EXPORT },
  qualityMode: 'fast',
};

export async function getAppDefaults(): Promise<AppDefaults> {
  try {
    const raw = await fs.readFile(DEFAULTS_FILE(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      facecam: { ...FALLBACK_DEFAULTS.facecam, ...(parsed.facecam ?? {}) },
      splitRatio: typeof parsed.splitRatio === 'number'
        ? Math.min(0.8, Math.max(0.2, parsed.splitRatio))
        : FALLBACK_DEFAULTS.splitRatio,
      testClipPath: typeof parsed.testClipPath === 'string' ? parsed.testClipPath : undefined,
      gameplay: { ...FALLBACK_DEFAULTS.gameplay, ...(parsed.gameplay ?? {}) },
      effects: { ...FALLBACK_DEFAULTS.effects, ...(parsed.effects ?? {}) },
      geminiImageModel: typeof parsed.geminiImageModel === 'string' ? parsed.geminiImageModel : undefined,
      ffmpegPath: typeof parsed.ffmpegPath === 'string' ? parsed.ffmpegPath : undefined,
      confirmDelete: typeof parsed.confirmDelete === 'boolean' ? parsed.confirmDelete : true,
      soundsEnabled: typeof parsed.soundsEnabled === 'boolean' ? parsed.soundsEnabled : true,
      language: typeof parsed.language === 'string' ? parsed.language : undefined,
      editorExport: { ...DEFAULT_EDITOR_EXPORT, ...(parsed.editorExport ?? {}) },
      qualityMode: parsed.qualityMode === 'quality' ? 'quality' : 'fast',
      subtitlePresets: Array.isArray(parsed.subtitlePresets) ? parsed.subtitlePresets : [],
    };
  } catch {
    return {
      facecam: { ...FALLBACK_DEFAULTS.facecam },
      splitRatio: FALLBACK_DEFAULTS.splitRatio,
      gameplay: { ...FALLBACK_DEFAULTS.gameplay },
      effects: { ...FALLBACK_DEFAULTS.effects },
      confirmDelete: true,
      soundsEnabled: true,
      editorExport: { ...DEFAULT_EDITOR_EXPORT },
      qualityMode: 'fast',
      subtitlePresets: [],
    };
  }
}

export async function setAppDefaults(patch: Partial<AppDefaults>): Promise<AppDefaults> {
  const cur = await getAppDefaults();
  const next: AppDefaults = {
    facecam: { ...cur.facecam, ...(patch.facecam ?? {}) },
    splitRatio: patch.splitRatio !== undefined
      ? Math.min(0.8, Math.max(0.2, patch.splitRatio))
      : cur.splitRatio,
    testClipPath: 'testClipPath' in patch ? (patch.testClipPath || undefined) : cur.testClipPath,
    gameplay: { ...cur.gameplay, ...(patch.gameplay ?? {}) },
    effects: { ...cur.effects, ...(patch.effects ?? {}) },
    geminiImageModel: 'geminiImageModel' in patch ? (patch.geminiImageModel || undefined) : cur.geminiImageModel,
    ffmpegPath: 'ffmpegPath' in patch ? (patch.ffmpegPath || undefined) : cur.ffmpegPath,
    confirmDelete: typeof patch.confirmDelete === 'boolean' ? patch.confirmDelete : cur.confirmDelete,
    soundsEnabled: typeof patch.soundsEnabled === 'boolean' ? patch.soundsEnabled : cur.soundsEnabled,
    language: 'language' in patch ? (patch.language || undefined) : cur.language,
    editorExport: { ...DEFAULT_EDITOR_EXPORT, ...cur.editorExport, ...(patch.editorExport ?? {}) },
    qualityMode: patch.qualityMode ?? cur.qualityMode ?? 'fast',
    subtitlePresets: patch.subtitlePresets ?? cur.subtitlePresets ?? [],
  };
  await fs.writeFile(DEFAULTS_FILE(), JSON.stringify(next, null, 2));
  return next;
}

// ─── Gemini API Key (für Thumbnail Generator) ──────────────────────────────
const GEMINI_KEY_FILE = () => path.join(app.getPath('userData'), 'gemini-key.enc');

export async function setGeminiApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await fs.rm(GEMINI_KEY_FILE(), { force: true });
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available — cannot store Gemini key.');
  }
  await fs.writeFile(GEMINI_KEY_FILE(), safeStorage.encryptString(trimmed));
}

export async function getGeminiApiKey(): Promise<string | null> {
  try {
    const buf = await fs.readFile(GEMINI_KEY_FILE());
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(buf);
  } catch { return null; }
}

export async function hasGeminiApiKey(): Promise<boolean> {
  return (await getGeminiApiKey()) != null;
}

export async function deleteGeminiApiKey(): Promise<void> {
  await fs.rm(GEMINI_KEY_FILE(), { force: true });
}

export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await deleteApiKey();
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system. Cannot store API key securely.');
  }
  const encrypted = safeStorage.encryptString(trimmed);
  await fs.writeFile(KEY_FILE(), encrypted);
}

export async function getApiKey(): Promise<string | null> {
  try {
    const buf = await fs.readFile(KEY_FILE());
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

export async function hasApiKey(): Promise<boolean> {
  return (await getApiKey()) != null;
}

export async function deleteApiKey(): Promise<void> {
  await fs.rm(KEY_FILE(), { force: true });
}
