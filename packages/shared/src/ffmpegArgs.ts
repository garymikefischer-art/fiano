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
