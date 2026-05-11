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
  /** Single-Source-Pfad. Wird ignoriert wenn `srcs` mit length >= 2 gegeben. */
  src: string;
  /** Phase 9.5.8: Multi-Clip Concat — alle Pfade werden vorab auf ein gemeinsames
   *  Format (1920x1080) gescaled und via concat-Filter zusammengefügt. Resultat
   *  wird wie eine einzige Source durch die Layout-Pipeline geschickt. */
  srcs?: string[];
  dst: string;
  trimStart?: number;
  trimEnd?: number;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: string;
  encoder?: Encoder;
  layout: TikTokLayout;
  /** Facecam-Region (für stacked + split). */
  facecamRegion: RegionRect;
  /** Gameplay-Region (für stacked + split). */
  gameplayRegion: RegionRect;
  /** Stacked: Höhenanteil der Facecam-Pane (0.2..0.8). Default 0.4. Split: Width-Anteil. */
  splitRatio?: number;

  /* ─── Phase 9.6.4: Audio ─────────────────────────────────────── */
  /** Lautstärke des Source-Audio 0..1.5. Default 1. */
  sourceAudioVolume?: number;
  /** Music-Tracks die parallel zum Source-Audio laufen. Mit volume je Track. */
  music?: { path: string; volume: number }[];
  /** Voice-Over-Tracks mit position (startSec im Output) + volume. */
  voiceOvers?: { path: string; startSec: number; volume: number }[];

  /* ─── Phase 9.6.5: Subtitle Burn-In ──────────────────────────── */
  /** Wenn gesetzt: Subtitle wird via drawtext aufgebrannt. */
  subtitle?: {
    text: string;
    fontSize?: number;
    color?: string;
    strokeColor?: string;
    strokeWidth?: number;
    /** 'top' = y=120, 'center' = h/2, 'bottom' = 85%, number = yPercent 0..1. */
    position?: 'top' | 'center' | 'bottom' | number;
    /** Uppercase erzwingen. */
    uppercase?: boolean;
  };

  /* ─── Phase 9.6.6: Intro ─────────────────────────────────────── */
  /** Intro-Video das VOR dem Main-Clip eingeblendet wird ('before'-mode). */
  intro?: { path: string };
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
  const sourceVol = opts.sourceAudioVolume ?? 1;

  const fc = opts.facecamRegion;
  const gp = opts.gameplayRegion;
  const music = opts.music ?? [];
  const voiceOvers = opts.voiceOvers ?? [];

  // Multi-Clip-Concat (Phase 9.5.8): wenn srcs[] gesetzt + length >= 2, alle clips
  // zum gemeinsamen 1920x1080-Intermediate gescaled + via concat-Filter konkateniert.
  // Trim wird bei Multi-Clip ignoriert (User hat clips bereits vor-getrimmt).
  const sources = opts.srcs && opts.srcs.length >= 1 ? opts.srcs : [opts.src];
  const isMulti = sources.length >= 2;

  const args: string[] = ['-y'];

  if (!isMulti) {
    if (opts.trimStart && opts.trimStart > 0) {
      args.push('-ss', String(opts.trimStart));
    }
    if (opts.trimEnd && opts.trimEnd > 0) {
      const dur = opts.trimEnd - (opts.trimStart ?? 0);
      if (dur > 0) args.push('-t', String(dur));
    }
  }

  for (const s of sources) {
    args.push('-i', s);
  }

  // ─── Zusätzliche Inputs: Intro + Music + VoiceOvers ─────────────────
  // Input-Indizes verschieben sich bei Multi-Clip: 0..N-1=Sources, dann Intro, Music, VOs.
  let inputIdx = sources.length;
  let introInputIdx = -1;
  if (opts.intro) {
    args.push('-i', opts.intro.path);
    introInputIdx = inputIdx++;
  }
  const musicInputIndices: number[] = [];
  for (const m of music) {
    args.push('-i', m.path);
    musicInputIndices.push(inputIdx++);
  }
  const voInputIndices: number[] = [];
  for (const vo of voiceOvers) {
    args.push('-i', vo.path);
    voInputIndices.push(inputIdx++);
  }

  // ─── Filter-Complex aufbauen ────────────────────────────────────────
  const filters: string[] = [];

  // Bei Multi-Clip: pre-scale alle inputs auf 1920x1080 (Source-Intermediate)
  // + concat. Output-Labels [srcV][srcA] werden statt [0:v][0:a] in der Layout-
  // Pipeline genutzt.
  const srcVLabel = isMulti ? '[srcV]' : '[0:v]';
  const srcALabel = isMulti ? '[srcA]' : '[0:a]';
  if (isMulti) {
    const INTERMEDIATE_W = 1920;
    const INTERMEDIATE_H = 1080;
    for (let i = 0; i < sources.length; i++) {
      // scale + pad → uniform 1920x1080 (sonst crasht concat-Filter bei aspect-mismatch).
      filters.push(
        `[${i}:v]scale=${INTERMEDIATE_W}:${INTERMEDIATE_H}:force_original_aspect_ratio=decrease,` +
          `pad=${INTERMEDIATE_W}:${INTERMEDIATE_H}:(ow-iw)/2:(oh-ih)/2:color=black,` +
          `setsar=1,fps=${fps}[v${i}m]`,
      );
      // Audio: aresample für gleiche sample-rate + async-Korrektur.
      filters.push(`[${i}:a]aresample=async=1:first_pts=0[a${i}m]`);
    }
    const concatPairs = sources.map((_, i) => `[v${i}m][a${i}m]`).join('');
    filters.push(`${concatPairs}concat=n=${sources.length}:v=1:a=1[srcV][srcA]`);
  }

  // Video-Composition: layout-spezifisch. Endet auf [vmain].
  if (opts.layout === 'full') {
    // Center-cover-crop auf 9:16.
    filters.push(
      `${srcVLabel}crop='min(iw,ih*${W}/${H})':'min(ih,iw*${H}/${W})',` +
        `scale=${W}:${H}:flags=lanczos,fps=${fps},setsar=1[vmain]`,
    );
  } else if (opts.layout === 'stacked') {
    const topH = Math.round(H * splitRatio);
    const botH = H - topH;
    // Aspect-Fix: scale mit force_original_aspect_ratio=increase + crop —
    // erhält die Region-Aspect-Ratio (kein Stretch). Center-crop trimmt zur
    // Pane-Größe. Fix für User-Report 'export ist gestreckt'.
    filters.push(
      `${srcVLabel}split=2[base1][base2];` +
      `[base1]crop=iw*${fc.w}:ih*${fc.h}:iw*${fc.x}:ih*${fc.y},` +
        `scale=${W}:${topH}:force_original_aspect_ratio=increase,` +
        `crop=${W}:${topH},setsar=1[top];` +
      `[base2]crop=iw*${gp.w}:ih*${gp.h}:iw*${gp.x}:ih*${gp.y},` +
        `scale=${W}:${botH}:force_original_aspect_ratio=increase,` +
        `crop=${W}:${botH},setsar=1[bot];` +
      `[top][bot]vstack=inputs=2,fps=${fps}[vmain]`,
    );
  } else {
    // split (side-by-side)
    const leftW = Math.round(W * splitRatio);
    const rightW = W - leftW;
    filters.push(
      `${srcVLabel}split=2[base1][base2];` +
      `[base1]crop=iw*${fc.w}:ih*${fc.h}:iw*${fc.x}:ih*${fc.y},` +
        `scale=${leftW}:${H}:force_original_aspect_ratio=increase,` +
        `crop=${leftW}:${H},setsar=1[left];` +
      `[base2]crop=iw*${gp.w}:ih*${gp.h}:iw*${gp.x}:ih*${gp.y},` +
        `scale=${rightW}:${H}:force_original_aspect_ratio=increase,` +
        `crop=${rightW}:${H},setsar=1[right];` +
      `[left][right]hstack=inputs=2,fps=${fps}[vmain]`,
    );
  }

  // ─── Subtitle Burn-In (drawtext) ────────────────────────────────────
  let videoComposed = '[vmain]';
  if (opts.subtitle && opts.subtitle.text.trim().length > 0) {
    const sub = opts.subtitle;
    const text = (sub.uppercase ? sub.text.toUpperCase() : sub.text).replace(/'/g, "\\'");
    const fontSize = sub.fontSize ?? 64;
    const fontColor = (sub.color ?? '#ffffff').replace('#', '');
    const strokeColor = (sub.strokeColor ?? '#000000').replace('#', '');
    const strokeWidth = sub.strokeWidth ?? 4;
    let yExpr: string;
    if (sub.position === 'top') yExpr = '120';
    else if (sub.position === 'center') yExpr = '(h-text_h)/2';
    else if (typeof sub.position === 'number') yExpr = `h*${sub.position}-text_h/2`;
    else yExpr = `h*0.85-text_h/2`; // bottom default
    filters.push(
      `[vmain]drawtext=text='${text}':fontsize=${fontSize}:` +
        `fontcolor=0x${fontColor}:` +
        `bordercolor=0x${strokeColor}:borderw=${strokeWidth}:` +
        `x=(w-text_w)/2:y=${yExpr}[vsub]`,
    );
    videoComposed = '[vsub]';
  }

  // ─── Audio-Mix (Source + Music + VoiceOvers) ──────────────────────
  // Erzeugt [aMain] das Source-Audio + Music + VoiceOvers gemischt enthält.
  // Bei Multi-Clip: srcALabel = [srcA] (concat-Output), sonst [0:a].
  filters.push(`${srcALabel}volume=${sourceVol}[srcAv]`);
  const audioMixInputs: string[] = ['[srcAv]'];
  music.forEach((m, i) => {
    const idx = musicInputIndices[i];
    filters.push(`[${idx}:a]volume=${m.volume}[m${i}]`);
    audioMixInputs.push(`[m${i}]`);
  });
  voiceOvers.forEach((vo, i) => {
    const idx = voInputIndices[i];
    const delayMs = Math.max(0, Math.round(vo.startSec * 1000));
    filters.push(
      `[${idx}:a]volume=${vo.volume},adelay=${delayMs}|${delayMs}[vo${i}]`,
    );
    audioMixInputs.push(`[vo${i}]`);
  });
  if (audioMixInputs.length > 1) {
    // duration=first → amix-Output endet wenn Source-Audio endet. Sonst würde
    // eine 2-Min-Musik auf einem 20-Sek-Clip den Audio-Stream auf 2 Min strecken
    // — der gemappte Video-Stream ist aber nur 20 Sek → AV-Mismatch, FFmpeg
    // exportiert Audio-only-Tail mit freeze-frame Video. User-Report 2026-05-11.
    filters.push(
      `${audioMixInputs.join('')}amix=inputs=${audioMixInputs.length}:` +
        `duration=first:normalize=0[aMain]`,
    );
  } else {
    filters.push(`[srcAv]anull[aMain]`);
  }

  // ─── Intro-before-Mode: concat Intro + Main ────────────────────────
  // 'before' = Intro spielt komplett, dann Main-Composition. Beide auf 9:16.
  let finalVideo: string;
  let finalAudio: string;
  if (opts.intro && introInputIdx >= 0) {
    // Intro auf 9:16 cover-cropped
    filters.push(
      `[${introInputIdx}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,` +
        `crop=${W}:${H},fps=${fps},setsar=1[introV]`,
    );
    filters.push(`[${introInputIdx}:a]aresample=async=1[introA]`);
    // concat n=2 — Syntax: [v0][a0][v1][a1]concat=n=2:v=1:a=1
    // FFmpeg erwartet ALTERNATING video+audio pro segment, NICHT [v0][v1][a0][a1].
    // Vorher: [introV][vsub][introA][aMain] → Media-type-Mismatch-Crash.
    filters.push(
      `[introV][introA]${videoComposed}[aMain]concat=n=2:v=1:a=1[vfinal][afinal]`,
    );
    finalVideo = '[vfinal]';
    finalAudio = '[afinal]';
  } else {
    finalVideo = videoComposed;
    finalAudio = '[aMain]';
  }

  args.push('-filter_complex', filters.join(';'));
  args.push('-map', finalVideo);
  args.push('-map', finalAudio);

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
