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

  /** Phase 9.5.8.4: Horizontaler Offset für layout='full' (0..1, default 0.5 = Mitte).
   *  Bei landscape-Source der zu 9:16 gecroppt wird, verschiebt der Slider den
   *  sichtbaren Ausschnitt. 0 = ganz links, 1 = ganz rechts. */
  fullOffsetX?: number;

  /* ─── Phase 9.6.4: Audio ─────────────────────────────────────── */
  /** Lautstärke des Source-Audio 0..1.5. Default 1. */
  sourceAudioVolume?: number;
  /** Music-Tracks die parallel zum Source-Audio laufen. Mit volume je Track. */
  music?: { path: string; volume: number }[];
  /** Voice-Over-Tracks mit position (startSec im Output) + volume. */
  voiceOvers?: { path: string; startSec: number; volume: number }[];

  /* ─── Phase 9.6.5 / 9.6.7h: Subtitle Burn-In ─────────────────────
   * Drei Modi:
   *  1) `assPath` gesetzt → libass via `ass`-Filter (volle Style-Parität:
   *     Gradient, Glow, Drop-Shadow, Layered). Phase 9.6.7h.
   *  2) `cues[]` gesetzt → drawtext multi-cue (legacy). Style-limitiert.
   *  3) `text` gesetzt → drawtext single-line (Manual). */
  subtitle?: {
    text: string;
    cues?: { startSec: number; endSec: number; text: string }[];
    /** Phase 9.6.7h: Pfad zur .ass-Datei. Wenn gesetzt, übernimmt libass — alle
     *  weiteren Style-Felder hier werden ignoriert (Style steckt in der .ass). */
    assPath?: string;
    fontSize?: number;
    color?: string;
    strokeColor?: string;
    strokeWidth?: number;
    /** 'top' = y=120, 'center' = h/2, 'bottom' = 85%, number = yPercent 0..1. */
    position?: 'top' | 'center' | 'bottom' | number;
    /** Uppercase erzwingen. */
    uppercase?: boolean;
  };

  /* ─── Phase 9.6.6 + 9.6.6.1: Intro ────────────────────────────────
   * Zwei Modi:
   *  - 'before' (default): Intro spielt komplett, dann Main-Clip via concat.
   *  - 'overlay': Intro liegt skaliert über den Main-Clip für die ersten
   *               `durationSec` Sekunden, mit x/y Anker-Position (0..1). */
  intro?: {
    path: string;
    mode?: 'before' | 'overlay';
    /** overlay-only. 0.2..1.0, Default 1.0. */
    scale?: number;
    /** overlay-only. 0..1 horizontale TOP-LEFT-Position auf Output-Frame. */
    x?: number;
    /** overlay-only. 0..1 vertikale TOP-LEFT-Position auf Output-Frame. */
    y?: number;
    /** overlay-only. Sichtbarkeitsdauer in Sekunden, Default 3. */
    durationSec?: number;
  };

  /* ─── Builder-Mode (Phase Builder-1 + Builder-3): Per-Clip Trim + Concat ─
   * Wenn gesetzt UND >=1 entries: jeder Eintrag wird als Trim-Range aus der
   * referenzierten Source extrahiert und via concat-Filter zusammengefügt.
   *
   *  - `src` (optional) verweist auf einen Index in `srcs[]` (oder 0 für single
   *    `src`). Default 0. Mehrere Clips dürfen denselben src-Index nutzen —
   *    `split` wird automatisch eingefügt.
   *  - `startSec` / `endSec` sind absolute Source-Zeiten der jeweiligen Source.
   *
   * Überschreibt `trimStart/trimEnd`. Hat Vorrang vor dem Pure-Multi-Concat-
   * Pfad (`srcs[]` ohne `clips`).
   * Gedacht für Builder-Tab 16:9 YouTube-Cut mit Highlights + Extra-Videos. */
  clips?: { src?: number; startSec: number; endSec: number }[];
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
  // Builder-Mode (Phase Builder-1 + Builder-3): clips[] → per-clip trim+setpts
  // im filter_complex statt globalem -ss/-t. Funktioniert auch bei multi-source
  // (clip.src referenziert sources[]). clips[] hat Vorrang ggü. trimStart/End
  // UND ggü. pure-multi-concat ohne trim.
  const useClipsConcat = !!opts.clips && opts.clips.length >= 1 && sources.length >= 1;
  const usePureMultiConcat = !useClipsConcat && isMulti;

  const args: string[] = ['-y'];

  if (!isMulti && !useClipsConcat) {
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
  const srcVLabel = usePureMultiConcat || useClipsConcat ? '[srcV]' : '[0:v]';
  const srcALabel = usePureMultiConcat || useClipsConcat ? '[srcA]' : '[0:a]';
  if (usePureMultiConcat) {
    const INTERMEDIATE_W = 1920;
    const INTERMEDIATE_H = 1080;
    for (let i = 0; i < sources.length; i++) {
      // scale + pad → uniform 1920x1080 (sonst crasht concat-Filter bei aspect-mismatch).
      filters.push(
        `[${i}:v]scale=${INTERMEDIATE_W}:${INTERMEDIATE_H}:force_original_aspect_ratio=decrease,` +
          `pad=${INTERMEDIATE_W}:${INTERMEDIATE_H}:(ow-iw)/2:(oh-ih)/2:color=black,` +
          `setsar=1,fps=${fps}[v${i}m]`,
      );
      filters.push(`[${i}:a]aresample=async=1:first_pts=0[a${i}m]`);
    }
    const concatPairs = sources.map((_, i) => `[v${i}m][a${i}m]`).join('');
    filters.push(`${concatPairs}concat=n=${sources.length}:v=1:a=1[srcV][srcA]`);
  } else if (useClipsConcat) {
    // Phase Builder-3: Per-Clip-Trim mit src-Index. Multi-Source-fähig.
    // Pro source: split nach Anzahl der clips die ihn nutzen. Pro clip: trim
    // aus split-output (oder direkt aus source wenn nur 1× genutzt).
    // Bei multi-source: zusätzlich scale+pad zu 1920x1080 für aspect-Match im
    // concat-Filter (FFmpeg concat=v=1 crasht bei dim-mismatch).
    const clipsArr = opts.clips!;
    const n = clipsArr.length;
    const usageBySrc = new Map<number, number>();
    for (const c of clipsArr) {
      const srcIdx = c.src ?? 0;
      usageBySrc.set(srcIdx, (usageBySrc.get(srcIdx) ?? 0) + 1);
    }
    const isMixedSources = usageBySrc.size > 1;
    const INTERMEDIATE_W = 1920;
    const INTERMEDIATE_H = 1080;
    // Splits pro source einfügen (nur wenn count > 1).
    for (const [srcIdx, count] of usageBySrc) {
      if (count > 1) {
        filters.push(
          `[${srcIdx}:v]split=${count}${Array.from({ length: count }, (_, k) => `[vs${srcIdx}_${k}]`).join('')}`,
        );
        filters.push(
          `[${srcIdx}:a]asplit=${count}${Array.from({ length: count }, (_, k) => `[as${srcIdx}_${k}]`).join('')}`,
        );
      }
    }
    // Pro Clip: trim + setpts + (optional) scale-to-intermediate für mixed sources.
    const counterBySrc = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const c = clipsArr[i];
      const srcIdx = c.src ?? 0;
      const used = counterBySrc.get(srcIdx) ?? 0;
      counterBySrc.set(srcIdx, used + 1);
      const total = usageBySrc.get(srcIdx) ?? 1;
      const vIn = total > 1 ? `[vs${srcIdx}_${used}]` : `[${srcIdx}:v]`;
      const aIn = total > 1 ? `[as${srcIdx}_${used}]` : `[${srcIdx}:a]`;
      const start = Math.max(0, c.startSec);
      const end = Math.max(start + 0.04, c.endSec);
      const scalePart = isMixedSources
        ? `,scale=${INTERMEDIATE_W}:${INTERMEDIATE_H}:force_original_aspect_ratio=decrease,` +
          `pad=${INTERMEDIATE_W}:${INTERMEDIATE_H}:(ow-iw)/2:(oh-ih)/2:color=black`
        : '';
      filters.push(
        `${vIn}trim=start=${start.toFixed(3)}:end=${end.toFixed(3)},` +
          `setpts=PTS-STARTPTS${scalePart},fps=${fps},setsar=1[v${i}m]`,
      );
      filters.push(
        `${aIn}atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},` +
          `asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0[a${i}m]`,
      );
    }
    const concatPairs = clipsArr.map((_, i) => `[v${i}m][a${i}m]`).join('');
    filters.push(`${concatPairs}concat=n=${n}:v=1:a=1[srcV][srcA]`);
  }

  // Video-Composition: layout-spezifisch. Endet auf [vmain].
  if (opts.layout === 'full') {
    // Cover-crop auf 9:16/16:9 mit horizontalem Offset (Phase 9.5.8.4).
    // x = (iw - cropW) * offsetX → Slider verschiebt sichtbaren Ausschnitt.
    // y bleibt zentriert.
    //
    // WICHTIG: `min(iw,ih*W/H)` enthält ein `,` das FFmpeg's filter_complex-
    // Parser als Filter-Chain-Separator interpretiert. Wir nutzen named-args
    // (w=/h=/x=/y=) + single-quotes um die Expressions zu schützen.
    const offX = clamp(opts.fullOffsetX ?? 0.5, 0, 1);
    const cropW = `min(iw,ih*${W}/${H})`;
    const cropH = `min(ih,iw*${H}/${W})`;
    filters.push(
      `${srcVLabel}crop=w='${cropW}':h='${cropH}':` +
        `x='(iw-${cropW})*${offX}':y='(ih-${cropH})/2',` +
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

  // ─── Subtitle Burn-In (libass ODER drawtext) ───────────────────────
  // Phase 9.6.7h: wenn `assPath` gesetzt → ass-Filter (full style-parity via
  // libass). Sonst Legacy-Pfad mit drawtext (color + stroke + position only).
  let videoComposed = '[vmain]';
  const sub = opts.subtitle;
  const hasAss = !!sub?.assPath && sub.assPath.length > 0;
  const hasCues = !hasAss && !!sub?.cues && sub.cues.length > 0;
  const hasText = !hasAss && !!sub?.text && sub.text.trim().length > 0;
  if (sub && hasAss) {
    // libass-Pfad — ass-Filter konsumiert das Video, output [vsub].
    // original_size hilft libass beim Resolution-Scaling (.ass deklariert
    // PlayResX/Y, ass-Filter mappt das auf den tatsächlichen Video-Stream).
    filters.push(`[vmain]ass=${sub.assPath}:original_size=${W}x${H}[vsub]`);
    videoComposed = '[vsub]';
  } else if (sub && (hasCues || hasText)) {
    const fontSize = sub.fontSize ?? 64;
    const fontColor = (sub.color ?? '#ffffff').replace('#', '');
    const strokeColor = (sub.strokeColor ?? '#000000').replace('#', '');
    const strokeWidth = sub.strokeWidth ?? 4;
    let yExpr: string;
    if (sub.position === 'top') yExpr = '120';
    else if (sub.position === 'center') yExpr = '(h-text_h)/2';
    else if (typeof sub.position === 'number') yExpr = `h*${sub.position}-text_h/2`;
    else yExpr = `h*0.85-text_h/2`; // bottom default

    if (hasCues) {
      // Multi-Cue: chain N drawtext-Filter mit enable=between(t,start,end).
      // Jeder Filter nimmt das vorige als Input, der letzte gibt [vsub].
      let prevLabel = '[vmain]';
      const cues = sub.cues!;
      for (let i = 0; i < cues.length; i++) {
        const c = cues[i];
        const text = (sub.uppercase ? c.text.toUpperCase() : c.text).replace(/'/g, "\\'");
        const outLabel = i === cues.length - 1 ? '[vsub]' : `[vsub${i}]`;
        filters.push(
          `${prevLabel}drawtext=text='${text}':fontsize=${fontSize}:` +
            `fontcolor=0x${fontColor}:` +
            `bordercolor=0x${strokeColor}:borderw=${strokeWidth}:` +
            `x=(w-text_w)/2:y=${yExpr}:` +
            `enable='between(t,${c.startSec.toFixed(3)},${c.endSec.toFixed(3)})'${outLabel}`,
        );
        prevLabel = outLabel;
      }
      videoComposed = '[vsub]';
    } else {
      // Legacy single-line text (manual Subtitle).
      const text = (sub.uppercase ? sub.text.toUpperCase() : sub.text).replace(/'/g, "\\'");
      filters.push(
        `[vmain]drawtext=text='${text}':fontsize=${fontSize}:` +
          `fontcolor=0x${fontColor}:` +
          `bordercolor=0x${strokeColor}:borderw=${strokeWidth}:` +
          `x=(w-text_w)/2:y=${yExpr}[vsub]`,
      );
      videoComposed = '[vsub]';
    }
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

  // ─── Intro: 'before' (concat) ODER 'overlay' (transparent über Anfang) ──
  let finalVideo: string;
  let finalAudio: string;
  const introMode = opts.intro?.mode ?? 'before';
  if (opts.intro && introInputIdx >= 0 && introMode === 'overlay') {
    // Phase 9.6.6.1 + Builder-9: Intro skaliert + per x/y positioniert + zeitlich
    // begrenzt. Aspect: CONTAIN-mode (decrease+pad) — Intro wird vollständig
    // sichtbar, mit black bars falls aspect mismatch zur Box. RN-Preview nutzt
    // `resizeMode="contain"` zur Parität.
    const scale = clamp(opts.intro.scale ?? 1.0, 0.2, 1.0);
    const introW = Math.round(W * scale);
    const introH = Math.round(H * scale);
    const xFrac = clamp(opts.intro.x ?? 0, 0, 1);
    const yFrac = clamp(opts.intro.y ?? 0, 0, 1);
    const overlayX = Math.round((W - introW) * xFrac);
    const overlayY = Math.round((H - introH) * yFrac);
    const overlayDur = Math.max(0.5, opts.intro.durationSec ?? 3);
    filters.push(
      `[${introInputIdx}:v]scale=${introW}:${introH}:force_original_aspect_ratio=decrease,` +
        `pad=${introW}:${introH}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps},setsar=1[introV]`,
    );
    filters.push(
      `${videoComposed}[introV]overlay=${overlayX}:${overlayY}:` +
        `enable='between(t,0,${overlayDur.toFixed(2)})'[vfinal]`,
    );
    finalVideo = '[vfinal]';
    finalAudio = '[aMain]'; // overlay-Mode behält source-audio (kein intro-audio).
  } else if (opts.intro && introInputIdx >= 0) {
    // 'before' = Intro spielt komplett, dann Main-Composition. Beide auf 9:16/16:9.
    filters.push(
      `[${introInputIdx}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,` +
        `crop=${W}:${H},fps=${fps},setsar=1[introV]`,
    );
    filters.push(`[${introInputIdx}:a]aresample=async=1[introA]`);
    // concat n=2 erwartet alternating video+audio pro segment: [v0][a0][v1][a1].
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
