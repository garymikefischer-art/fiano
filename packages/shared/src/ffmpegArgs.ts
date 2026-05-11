/**
 * FFmpeg-Argument-Builder (plattform-neutral).
 *
 * Pure-Functions die `string[]` zurückgeben. KEIN spawn/execute — die
 * Plattform-Layer (Desktop = `child_process.spawn`, Mobile = `FFmpegKit.executeWithArguments`)
 * rufen ihre eigene API.
 *
 * Phase 9.4.1: Mobile-MVP nutzt vorerst nur `buildMobileExportArgs`. Desktop
 * hat noch seinen eigenen Code in `src/main/core/ffmpeg.ts`. Konsolidierung
 * (Desktop migriert auch hier rein) ist Phase 9.4.x post-MVP.
 */

export type Encoder = 'hardware' | 'software';

export interface MobileExportOpts {
  /** Quell-Video-Pfad. */
  src: string;
  /** Ziel-Pfad (.mp4). */
  dst: string;
  /** Trim-Start in Sekunden (default 0). */
  trimStart?: number;
  /** Trim-Ende in Sekunden (default = volle Länge). */
  trimEnd?: number;
  /** Output-Auflösung. Default 1080×1920 (9:16). */
  width?: number;
  height?: number;
  /** FPS. Default 30. */
  fps?: number;
  /** Bitrate in Bits/sec als String (z.B. "10M"). Default "10M". */
  bitrate?: string;
  /** 'hardware' = videotoolbox (iOS) / mediacodec (Android, falls verfügbar);
   *  'software' = libx264. Mobile-LGPL hat in der Regel beide Encoder. */
  encoder?: Encoder;
  /**
   * Optional: drawtext-basierte Subtitle-Spuren. Multi-Cue-Support via
   *  multiple `drawtext`-Filter im Filtergraph. Mobile-LGPL hat KEIN libass —
   *  daher keine layered/animated Styles, nur einzeilige drawtext-Captions.
   */
  drawTextCues?: DrawTextCue[];
  /** Optional: Lautstärke des Source-Audio (0..1, default 1). */
  volume?: number;
}

export interface DrawTextCue {
  text: string;
  /** Sekunden seit Trim-Start. */
  startSec: number;
  endSec: number;
  /** RGB hex ohne `#` (default 'FFFFFF'). */
  color?: string;
  /** Font-size in px im Output-Frame (default 64). */
  fontSize?: number;
  /** Outline-Farbe (default '000000'). */
  outlineColor?: string;
  /** Outline-Stärke (default 4). */
  outlineWidth?: number;
  /** Vertikale Position 0..1 (0=top, 1=bottom). Default 0.85. */
  yPercent?: number;
}

const ENCODER_FOR_PLATFORM: Record<'darwin' | 'android' | 'other', Record<Encoder, string>> = {
  darwin: { hardware: 'h264_videotoolbox', software: 'libx264' },
  android: { hardware: 'h264_mediacodec', software: 'libx264' },
  other: { hardware: 'libx264', software: 'libx264' },
};

/** Plattform-Hinweis für Encoder-Wahl. Mobile-Caller liefert das (Plattform-spezifisch). */
export type Platform = 'darwin' | 'android' | 'other';

/**
 * Escapt einen String für drawtext-Filter:
 *   - Single-Quotes verdoppeln
 *   - Backslash + : escapen
 */
export function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\n/g, ' ');
}

/**
 * Baut den FFmpeg-Argumentvektor für einen Mobile-Export (9:16, optional Trim,
 * optional Subtitle-Burn-In via drawtext).
 *
 * Pipeline:
 *   1. -ss / -to für Trim
 *   2. crop+scale auf 9:16
 *   3. drawtext-Filter für Subtitles (optional)
 *   4. encoder + bitrate
 *   5. AAC audio
 */
export function buildMobileExportArgs(opts: MobileExportOpts, platform: Platform = 'other'): string[] {
  const width = opts.width ?? 1080;
  const height = opts.height ?? 1920;
  const fps = opts.fps ?? 30;
  const bitrate = opts.bitrate ?? '10M';
  const encoder = opts.encoder ?? 'hardware';
  const codec = ENCODER_FOR_PLATFORM[platform][encoder];
  const volume = opts.volume ?? 1;

  const args: string[] = ['-y'];

  // Trim BEFORE input für schnelles Seek (keyframe-accurate via -ss vor -i).
  if (opts.trimStart && opts.trimStart > 0) {
    args.push('-ss', String(opts.trimStart));
  }
  if (opts.trimEnd && opts.trimEnd > 0) {
    const dur = opts.trimEnd - (opts.trimStart ?? 0);
    if (dur > 0) args.push('-t', String(dur));
  }

  args.push('-i', opts.src);

  // Filtergraph: crop center → scale 9:16 → drawtext-Cues
  const cropExpr = `crop='min(iw,ih*${width}/${height})':'min(ih,iw*${height}/${width})'`;
  const scaleExpr = `scale=${width}:${height}:flags=lanczos`;
  let vf = `${cropExpr},${scaleExpr},fps=${fps}`;

  if (opts.drawTextCues && opts.drawTextCues.length > 0) {
    for (const cue of opts.drawTextCues) {
      const text = escapeDrawText(cue.text);
      const fontsize = cue.fontSize ?? 64;
      const color = (cue.color ?? 'FFFFFF').replace(/^#/, '');
      const outline = (cue.outlineColor ?? '000000').replace(/^#/, '');
      const outlineW = cue.outlineWidth ?? 4;
      const yPct = cue.yPercent ?? 0.85;
      const enable = `between(t,${cue.startSec},${cue.endSec})`;
      vf += `,drawtext=text='${text}':fontsize=${fontsize}:fontcolor=0x${color}` +
            `:bordercolor=0x${outline}:borderw=${outlineW}` +
            `:x=(w-text_w)/2:y=h*${yPct}-text_h/2:enable='${enable}'`;
    }
  }

  args.push('-vf', vf);
  args.push('-c:v', codec);
  args.push('-b:v', bitrate);

  // Hardware-Encoder-spezifische Quality-Hints
  if (codec === 'h264_videotoolbox') {
    args.push('-allow_sw', '1', '-realtime', '0');
  } else if (codec === 'libx264') {
    args.push('-preset', 'medium', '-pix_fmt', 'yuv420p');
  }

  // Audio
  if (volume !== 1) {
    args.push('-filter:a', `volume=${volume}`);
  }
  args.push('-c:a', 'aac', '-b:a', '128k');

  // movflags +faststart → Streaming-Compatible MP4 (Camera-Roll-Save kompatibel)
  args.push('-movflags', '+faststart');

  args.push(opts.dst);

  return args;
}

/* ─── TikTok 9:16 Stacked / Split / Full (Phase 9.6.3) ───────────────── */

// TikTokLayout ist bereits in types.ts deklariert — re-export wir's nicht hier.
// Konsumenten importieren es aus '@fiano/shared' (index.ts re-exportiert types).
import type { TikTokLayout } from './types';

export interface RegionRect {
  /** Alle 0..1 als Anteil der Source-Frame-Dimensionen. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TikTokExportOpts {
  src: string;
  dst: string;
  trimStart?: number;
  trimEnd?: number;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: string;
  encoder?: Encoder;
  layout: TikTokLayout;
  /** Facecam-Region (für stacked + split). Default = top-left 28×32% wenn fehlt. */
  facecamRegion: RegionRect;
  /** Gameplay-Region (für stacked + split). Default = full frame. */
  gameplayRegion: RegionRect;
  /** Stacked: Höhenanteil der Facecam-Pane (0.2..0.8). Default 0.4. Split: Width-Anteil. */
  splitRatio?: number;
}

/**
 * Baut den FFmpeg-Argumentvektor für einen 9:16-Export mit Layout-Composition.
 *
 * Layouts:
 *   - 'full':    Source wird auf 9:16 cover-gecropped (gleiche Logic wie
 *                buildMobileExportArgs).
 *   - 'stacked': Top-Pane = Facecam-Region (cropped + scaled), Bottom-Pane =
 *                Gameplay-Region. vstack zu 9:16.
 *   - 'split':   Left = Facecam, Right = Gameplay. hstack zu 9:16.
 *
 * Region-Coords sind 0..1 relativ zur Source-Frame-Größe. FFmpeg's `iw`/`ih`
 * resolved sie zur Laufzeit — keine Pre-Probe der Source nötig.
 */
export function buildTikTokExportArgs(
  opts: TikTokExportOpts,
  platform: Platform = 'other',
): string[] {
  const W = opts.width ?? 1080;
  const H = opts.height ?? 1920;
  const fps = opts.fps ?? 30;
  const bitrate = opts.bitrate ?? '10M';
  const encoder = opts.encoder ?? 'software';
  const codec = ENCODER_FOR_PLATFORM[platform][encoder];
  const splitRatio = clamp(opts.splitRatio ?? 0.4, 0.1, 0.9);

  const fc = opts.facecamRegion;
  const gp = opts.gameplayRegion;

  const args: string[] = ['-y'];

  if (opts.trimStart && opts.trimStart > 0) {
    args.push('-ss', String(opts.trimStart));
  }
  if (opts.trimEnd && opts.trimEnd > 0) {
    const dur = opts.trimEnd - (opts.trimStart ?? 0);
    if (dur > 0) args.push('-t', String(dur));
  }

  args.push('-i', opts.src);

  // Filter-Complex je Layout. Region-Crops mit `iw*X` / `ih*Y` resolved
  // FFmpeg zur Laufzeit (no need to probe Source dimensions).
  let filterComplex: string;

  if (opts.layout === 'full') {
    // Center-cover-crop auf 9:16. Identisch zu buildMobileExportArgs aber als
    // filter_complex damit's konsistent zur Stacked/Split-Pipeline ist.
    const cropExpr = `crop='min(iw,ih*${W}/${H})':'min(ih,iw*${H}/${W})'`;
    filterComplex = `[0:v]${cropExpr},scale=${W}:${H}:flags=lanczos,fps=${fps}[out]`;
  } else if (opts.layout === 'stacked') {
    const topH = Math.round(H * splitRatio);
    const botH = H - topH;
    // Step 1: split video in 2 streams
    // Step 2a: top = crop facecam region + scale to (W x topH)
    // Step 2b: bot = crop gameplay region + scale to (W x botH)
    // Step 3: vstack top+bot → 9:16
    filterComplex =
      `[0:v]split=2[base1][base2];` +
      `[base1]crop=iw*${fc.w}:ih*${fc.h}:iw*${fc.x}:ih*${fc.y},` +
        `scale=${W}:${topH}:flags=lanczos,setsar=1[top];` +
      `[base2]crop=iw*${gp.w}:ih*${gp.h}:iw*${gp.x}:ih*${gp.y},` +
        `scale=${W}:${botH}:flags=lanczos,setsar=1[bot];` +
      `[top][bot]vstack=inputs=2,fps=${fps}[out]`;
  } else {
    // split (side-by-side)
    const leftW = Math.round(W * splitRatio);
    const rightW = W - leftW;
    filterComplex =
      `[0:v]split=2[base1][base2];` +
      `[base1]crop=iw*${fc.w}:ih*${fc.h}:iw*${fc.x}:ih*${fc.y},` +
        `scale=${leftW}:${H}:flags=lanczos,setsar=1[left];` +
      `[base2]crop=iw*${gp.w}:ih*${gp.h}:iw*${gp.x}:ih*${gp.y},` +
        `scale=${rightW}:${H}:flags=lanczos,setsar=1[right];` +
      `[left][right]hstack=inputs=2,fps=${fps}[out]`;
  }

  args.push('-filter_complex', filterComplex);
  args.push('-map', '[out]');
  // Audio aus dem Source übernehmen (optional — '?' = wenn kein Audio: skip).
  args.push('-map', '0:a?');

  args.push('-c:v', codec);
  args.push('-b:v', bitrate);
  if (codec === 'h264_videotoolbox') {
    args.push('-allow_sw', '1', '-realtime', '0');
  } else if (codec === 'libx264') {
    args.push('-preset', 'medium', '-pix_fmt', 'yuv420p');
  }

  args.push('-c:a', 'aac', '-b:a', '128k');
  args.push('-movflags', '+faststart');
  args.push(opts.dst);
  return args;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Hilfsfunktion: parst FFmpeg's `time=HH:MM:SS.cc` aus stderr-Chunk
 * → Sekunden als float. Gibt `null` wenn kein Match.
 */
export function parseFfmpegProgressTime(stderrChunk: string): number | null {
  const m = stderrChunk.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
  if (!m) return null;
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 100;
}

/**
 * Hilfsfunktion: parst FFmpeg's `Duration: HH:MM:SS.cc` aus stderr-Chunk
 * → Sekunden als float. Gibt `null` wenn kein Match.
 */
export function parseFfmpegDuration(stderrChunk: string): number | null {
  const m = stderrChunk.match(/Duration: (\d+):(\d+):(\d+)\.(\d+)/);
  if (!m) return null;
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 100;
}
