/**
 * Render-Spec Validator (Phase A6.4 — 2026-05-18).
 *
 * Adressiert SECURITY_AUDIT P0-3: Mobile schickte vorher FFmpeg `args[]`
 * direkt an Worker → Attacker mit gültigem JWT konnte via `-i /proc/self/
 * environ` den service_role-Key aus dem Worker-Container exfiltrieren.
 *
 * Neue Pipeline:
 *   1. Mobile sendet typed `RenderSpec` (kein args[] mehr)
 *   2. Worker validiert + clampt spec-fields (allow-list approach)
 *   3. Worker baut args[] selber via `buildTikTokExportArgs(spec)`
 *   4. spawn(ffmpeg, args) — keine User-Strings mehr in args
 *
 * Damit ist FFmpeg-Argument-Injection ausgeschlossen — der Worker hat
 * vollständige Kontrolle über alle FFmpeg-Flags.
 */

import type { TikTokExportOpts, TikTokLayout, Encoder, RegionRect } from './ffmpegArgs.js';

/**
 * ClientRenderSpec — was Mobile an /v1/render sendet.
 * Subset von TikTokExportOpts: keine Datei-Pfade (Worker resolved sie aus
 * R2-Keys), keine src/dst (Worker bestimmt).
 */
export interface ClientRenderSpec {
  /** Output-Format. */
  width: number;
  height: number;
  fps: number;
  bitrate: string;
  encoder: Encoder;
  layout: TikTokLayout;

  /** Layout-Regions (0..1 fractions). */
  facecamRegion: RegionRect;
  gameplayRegion: RegionRect;
  /** Stacked-pane height ratio (0.1..0.9). */
  splitRatio?: number;
  /** Full-Layout horizontal offset (0..1). */
  fullOffsetX?: number;

  /** Single-Source Trim (sec). Bei Multi-Clip wird trim ignoriert (clips[] hat Vorrang). */
  trimStart?: number;
  trimEnd?: number;

  /** Source-Audio-Lautstärke (0..1.5). */
  sourceAudioVolume?: number;
  /** Music-Tracks. Order entspricht den hochgeladenen music-keys. */
  music?: { volume: number }[];
  /** Voice-Over-Tracks. */
  voiceOvers?: { startSec: number; volume: number }[];

  /** Subtitle. assPath wird vom Worker gesetzt wenn subtitle-key vorhanden. */
  subtitle?: {
    /** Modus: 'ass' nutzt libass via uploaded .ass-File. 'drawtext' nutzt cues. */
    useAss: boolean;
    /** Drawtext-Fallback. */
    text?: string;
    cues?: { startSec: number; endSec: number; text: string }[];
    fontSize?: number;
    color?: string;
    strokeColor?: string;
    strokeWidth?: number;
    position?: 'top' | 'center' | 'bottom' | number;
    uppercase?: boolean;
  };

  /** Intro — path wird vom Worker gesetzt wenn intro-key vorhanden. */
  intro?: {
    mode?: 'before' | 'overlay';
    scale?: number;
    x?: number;
    y?: number;
    durationSec?: number;
  };

  /** Multi-Clip Per-Source Trim. src-Index referenziert sources[]. */
  clips?: { src?: number; startSec: number; endSec: number }[];
}

export type ValidationResult =
  | { ok: true; spec: ClientRenderSpec }
  | { ok: false; error: string };

const VALID_LAYOUTS: TikTokLayout[] = ['stacked', 'split', 'full'];
const VALID_ENCODERS: Encoder[] = ['software', 'hardware'];
const VALID_POSITIONS: ReadonlyArray<string | number> = ['top', 'center', 'bottom'];

/**
 * Validiert + clampt eine eingehende RenderSpec. Lehnt invalide / suspekte
 * Inputs ab. Numeric-Felder werden geclampt (Math.min/max), Enum-Felder
 * müssen exakt matchen.
 */
export function validateRenderSpec(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'spec not an object' };
  }
  const s = input as Record<string, unknown>;

  // Output-Dimensions: nur erlaubte Werte (verhindert exotic-resolution
  // attacks). 720/1080/1280/1920/2160/3840 sind die Standard-Resolutionen.
  const validDim = (n: unknown): n is number =>
    typeof n === 'number' && [720, 1080, 1280, 1920, 2160, 3840].includes(n);
  if (!validDim(s.width) || !validDim(s.height)) {
    return { ok: false, error: 'invalid width/height' };
  }

  // FPS 1..120.
  if (typeof s.fps !== 'number' || s.fps < 1 || s.fps > 120) {
    return { ok: false, error: 'invalid fps' };
  }

  // Bitrate-String: nur "${num}M" oder "${num}k". Verhindert Injection
  // via spezielle Zeichen in der Bitrate.
  if (typeof s.bitrate !== 'string' || !/^\d{1,5}[Mk]$/.test(s.bitrate)) {
    return { ok: false, error: 'invalid bitrate format' };
  }

  if (typeof s.encoder !== 'string' || !VALID_ENCODERS.includes(s.encoder as Encoder)) {
    return { ok: false, error: 'invalid encoder' };
  }

  if (typeof s.layout !== 'string' || !VALID_LAYOUTS.includes(s.layout as TikTokLayout)) {
    return { ok: false, error: 'invalid layout' };
  }

  // Regions: alle Felder 0..1.
  const validRegion = (r: unknown): r is RegionRect => {
    if (typeof r !== 'object' || r === null) return false;
    const rr = r as Record<string, unknown>;
    return (
      typeof rr.x === 'number' && rr.x >= 0 && rr.x <= 1 &&
      typeof rr.y === 'number' && rr.y >= 0 && rr.y <= 1 &&
      typeof rr.w === 'number' && rr.w > 0 && rr.w <= 1 &&
      typeof rr.h === 'number' && rr.h > 0 && rr.h <= 1
    );
  };
  if (!validRegion(s.facecamRegion) || !validRegion(s.gameplayRegion)) {
    return { ok: false, error: 'invalid facecam/gameplay region' };
  }

  // Optional numerics: clamp + type-check.
  const clamp01 = (v: unknown, def: number, min = 0, max = 1): number => {
    if (typeof v !== 'number' || !isFinite(v)) return def;
    return Math.max(min, Math.min(max, v));
  };
  const clampPositive = (v: unknown, def: number, max: number): number => {
    if (typeof v !== 'number' || !isFinite(v) || v < 0) return def;
    return Math.min(max, v);
  };

  const spec: ClientRenderSpec = {
    width: s.width as number,
    height: s.height as number,
    fps: s.fps as number,
    bitrate: s.bitrate as string,
    encoder: s.encoder as Encoder,
    layout: s.layout as TikTokLayout,
    facecamRegion: s.facecamRegion as RegionRect,
    gameplayRegion: s.gameplayRegion as RegionRect,
    splitRatio: s.splitRatio !== undefined ? clamp01(s.splitRatio, 0.4, 0.1, 0.9) : undefined,
    fullOffsetX: s.fullOffsetX !== undefined ? clamp01(s.fullOffsetX, 0.5, 0, 1) : undefined,
    trimStart: s.trimStart !== undefined ? clampPositive(s.trimStart, 0, 86400) : undefined,
    trimEnd: s.trimEnd !== undefined ? clampPositive(s.trimEnd, 0, 86400) : undefined,
    sourceAudioVolume: s.sourceAudioVolume !== undefined
      ? clamp01(s.sourceAudioVolume, 1, 0, 1.5)
      : undefined,
  };

  // Music + VoiceOvers: arrays mit objekten.
  if (Array.isArray(s.music)) {
    if (s.music.length > 10) return { ok: false, error: 'too many music tracks (max 10)' };
    spec.music = s.music.map((m: any) => ({
      volume: clamp01(m?.volume, 0.6, 0, 1.5),
    }));
  }
  if (Array.isArray(s.voiceOvers)) {
    if (s.voiceOvers.length > 20) return { ok: false, error: 'too many voiceovers (max 20)' };
    spec.voiceOvers = s.voiceOvers.map((vo: any) => ({
      startSec: clampPositive(vo?.startSec, 0, 86400),
      volume: clamp01(vo?.volume, 1, 0, 1.5),
    }));
  }

  // Subtitle: useAss + drawtext-fallback.
  if (s.subtitle && typeof s.subtitle === 'object') {
    const sub = s.subtitle as Record<string, unknown>;
    spec.subtitle = {
      useAss: sub.useAss === true,
      text: typeof sub.text === 'string' ? sub.text.slice(0, 5000) : undefined,
      fontSize: typeof sub.fontSize === 'number' ? clampPositive(sub.fontSize, 64, 200) : undefined,
      color: typeof sub.color === 'string' && /^#?[0-9a-fA-F]{6}$/.test(sub.color)
        ? sub.color : undefined,
      strokeColor: typeof sub.strokeColor === 'string' && /^#?[0-9a-fA-F]{6}$/.test(sub.strokeColor)
        ? sub.strokeColor : undefined,
      strokeWidth: typeof sub.strokeWidth === 'number'
        ? clampPositive(sub.strokeWidth, 4, 20) : undefined,
      position: typeof sub.position === 'number'
        ? clamp01(sub.position, 0.85)
        : typeof sub.position === 'string' && VALID_POSITIONS.includes(sub.position)
          ? (sub.position as 'top' | 'center' | 'bottom') : undefined,
      uppercase: sub.uppercase === true,
    };
    if (Array.isArray(sub.cues)) {
      if (sub.cues.length > 2000) return { ok: false, error: 'too many cues (max 2000)' };
      spec.subtitle.cues = sub.cues.map((c: any) => ({
        startSec: clampPositive(c?.startSec, 0, 86400),
        endSec: clampPositive(c?.endSec, 0, 86400),
        text: typeof c?.text === 'string' ? c.text.slice(0, 500) : '',
      }));
    }
  }

  // Intro: mode + scale + x/y + duration.
  if (s.intro && typeof s.intro === 'object') {
    const intro = s.intro as Record<string, unknown>;
    spec.intro = {
      mode: intro.mode === 'overlay' ? 'overlay' : 'before',
      scale: intro.scale !== undefined ? clamp01(intro.scale, 1, 0.2, 4) : undefined,
      x: intro.x !== undefined ? clamp01(intro.x, 0) : undefined,
      y: intro.y !== undefined ? clamp01(intro.y, 0) : undefined,
      durationSec: intro.durationSec !== undefined
        ? clampPositive(intro.durationSec, 3, 60) : undefined,
    };
  }

  // Clips: multi-source trim ranges.
  if (Array.isArray(s.clips)) {
    if (s.clips.length > 100) return { ok: false, error: 'too many clips (max 100)' };
    spec.clips = s.clips.map((c: any) => ({
      src: typeof c?.src === 'number' && c.src >= 0 && c.src < 100 ? Math.floor(c.src) : 0,
      startSec: clampPositive(c?.startSec, 0, 86400),
      endSec: clampPositive(c?.endSec, 0, 86400),
    }));
  }

  return { ok: true, spec };
}

/**
 * Konvertiert eine validierte ClientRenderSpec + die vom Worker resolved-en
 * temp-Pfade in volle TikTokExportOpts für buildTikTokExportArgs.
 */
export function specToTikTokOpts(
  spec: ClientRenderSpec,
  paths: {
    sources: string[];           // /tmp/jobId-src-N.mp4
    dst: string;                 // /tmp/jobId-out.mp4
    intro?: string;
    music: string[];
    voiceOvers: string[];
    assPath?: string;
  },
): TikTokExportOpts {
  const isMulti = paths.sources.length > 1;
  return {
    src: paths.sources[0],
    srcs: isMulti ? paths.sources : undefined,
    dst: paths.dst,
    trimStart: spec.trimStart,
    trimEnd: spec.trimEnd,
    width: spec.width,
    height: spec.height,
    fps: spec.fps,
    bitrate: spec.bitrate,
    encoder: spec.encoder,
    layout: spec.layout,
    facecamRegion: spec.facecamRegion,
    gameplayRegion: spec.gameplayRegion,
    splitRatio: spec.splitRatio,
    fullOffsetX: spec.fullOffsetX,
    sourceAudioVolume: spec.sourceAudioVolume,
    music: spec.music?.map((m, i) => ({
      path: paths.music[i] ?? '',
      volume: m.volume,
    })).filter((m) => m.path),
    voiceOvers: spec.voiceOvers?.map((vo, i) => ({
      path: paths.voiceOvers[i] ?? '',
      startSec: vo.startSec,
      volume: vo.volume,
    })).filter((vo) => vo.path),
    intro: spec.intro && paths.intro ? {
      path: paths.intro,
      mode: spec.intro.mode,
      scale: spec.intro.scale,
      x: spec.intro.x,
      y: spec.intro.y,
      durationSec: spec.intro.durationSec,
    } : undefined,
    subtitle: spec.subtitle ? {
      text: spec.subtitle.text ?? '',
      cues: spec.subtitle.cues,
      assPath: spec.subtitle.useAss && paths.assPath ? paths.assPath : undefined,
      fontSize: spec.subtitle.fontSize,
      color: spec.subtitle.color,
      strokeColor: spec.subtitle.strokeColor,
      strokeWidth: spec.subtitle.strokeWidth,
      position: spec.subtitle.position,
      uppercase: spec.subtitle.uppercase,
    } : undefined,
    clips: spec.clips,
  };
}
