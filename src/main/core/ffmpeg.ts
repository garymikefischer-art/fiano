import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { resolveBin } from './bin';
import { broadcast } from './events';
import type { JobContext } from './pipeline/types';
import type {
  ClipEffects,
  ClipSegment,
  ExportFormat,
  FacecamRegion,
  GameplayRegion,
  PipelineStepName,
  ProjectIntro,
  ProjectMusic,
  SubtitlePosition,
  SubtitleSettings,
  SubtitleStyle,
  TikTokLayout,
} from '@shared/types';
import { DEFAULT_FACECAM, DEFAULT_GAMEPLAY, DEFAULT_SPLIT_RATIO } from '@shared/types';
import {
  buildDrawtextFilterChain,
  escapeSubtitlePath,
  getCuesInRange,
  getSubtitleForceStyle,
} from './pipeline/subtitles';
import type { Transcript } from './pipeline/transcribe';
import type { Highlight } from '@shared/types';

/**
 * Baut die FFmpeg-Filter-Chain für visuelle Effects.
 * Liefert ein Array von Filtern (jeweils ohne führendes/folgendes Komma).
 */
export function buildEffectsFilter(effects?: ClipEffects): string[] {
  const parts: string[] = [];
  switch (effects?.filter) {
    case 'vivid':  parts.push('eq=saturation=1.3:contrast=1.2:brightness=0.05'); break;
    case 'dark':   parts.push('eq=contrast=1.4:brightness=-0.1'); break;
    case 'warm':   parts.push('colorbalance=rs=0.10:gs=0.05:bs=-0.05'); break;
    case 'cold':   parts.push('colorbalance=rs=-0.05:gs=0.0:bs=0.10'); break;
    case 'gaming': parts.push('eq=saturation=1.4:contrast=1.3', 'unsharp=5:5:1.0'); break;
  }
  switch (effects?.motionBlur) {
    // tmix = echter temporal motion blur. Gewichtungen heavy-tail (neuere Frames stärker)
    // damit die Bewegung lebt aber Subjekt erkennbar bleibt.
    case 'low':    parts.push('tmix=frames=3:weights="1 2 4"'); break;
    case 'medium': parts.push('tmix=frames=5:weights="1 1 2 3 5"'); break;
    case 'high':   parts.push('tmix=frames=8:weights="1 1 2 2 3 4 5 6"'); break;
  }
  return parts;
}

/** Convenience: appendable-Suffix mit führendem Komma falls etwas drin ist. */
function effectsSuffix(effects?: ClipEffects): string {
  const parts = buildEffectsFilter(effects);
  return parts.length ? ',' + parts.join(',') : '';
}

interface FfmpegOpts {
  step?: PipelineStepName;
  expectedDuration?: number;
  ctx?: JobContext;
}

/**
 * Module-level flag für shell-export Progress-Broadcasting.
 * shell.exportClip / shell.buildVideo wrappen ihren Call mit setShellBroadcastStep('export'/'build')
 * → alle internen FFmpeg-Spawns broadcasten dann progress an die StatusBar via
 * `job.progress`-Event mit projectId='shell'. Job-Queue concurrency=1 → keine
 * parallel-shell-exports → kein Race.
 */
let activeShellBroadcastStep: string | null = null;
export function setShellBroadcastStep(step: string | null): void {
  activeShellBroadcastStep = step;
}

/**
 * Module-level AbortController für shell-Jobs (9:16 + Builder Export).
 * shell.exportClip / shell.buildVideo registrieren ihren Controller via setShellAbortController().
 * runFfmpeg fällt auf diesen Controller zurück wenn opts.ctx?.signal nicht gesetzt ist.
 * shell.cancelActiveJob ruft .abort() darauf auf → laufender FFmpeg wird via signal getötet.
 * Job-Queue concurrency=1 → kein Race.
 */
let activeShellAbort: AbortController | null = null;
export function setShellAbortController(ctrl: AbortController | null): void {
  activeShellAbort = ctrl;
}
export function getShellAbortController(): AbortController | null {
  return activeShellAbort;
}

/**
 * FFmpeg ausführen, optional Progress an UI emitten.
 * stderr-Ringbuffer wird bei Fehler an die Error-Message gehängt.
 */
export function runFfmpeg(args: string[], opts: FfmpegOpts = {}): Promise<void> {
  const bin = resolveBin('ffmpeg');
  if (!bin) return Promise.reject(new Error('ffmpeg not found. Install via: brew install ffmpeg'));

  // Signal-Priorität: explizites JobContext-Signal > Module-level Shell-Abort
  const signal = opts.ctx?.signal ?? activeShellAbort?.signal;

  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { signal });
    let parsedDuration = opts.expectedDuration ?? 0;
    let stderrBuf = '';

    p.stderr.on('data', (b: Buffer) => {
      const chunk = b.toString();
      stderrBuf += chunk;
      if (stderrBuf.length > 4000) stderrBuf = stderrBuf.slice(-4000);

      const dur = chunk.match(/Duration: (\d+):(\d+):(\d+)\.(\d+)/);
      if (dur && !parsedDuration) {
        parsedDuration = +dur[1] * 3600 + +dur[2] * 60 + +dur[3] + +dur[4] / 100;
      }
      const t = chunk.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
      if (t && parsedDuration) {
        const cur = +t[1] * 3600 + +t[2] * 60 + +t[3] + +t[4] / 100;
        const stagePct = Math.min(99, (cur / parsedDuration) * 100);
        if (opts.step && opts.ctx) {
          opts.ctx.emit({ type: 'progress', step: opts.step, percent: stagePct });
        }
        // Shell-Export: progress an global broadcast (StatusBar). Multi-Stage-
        // Builds (concat → music → subs) hüpfen zwischen Stages — User sieht
        // dass etwas läuft, exakte Stage steht im Step-Namen.
        if (activeShellBroadcastStep) {
          broadcast({ type: 'job.progress', projectId: 'shell', step: activeShellBroadcastStep, percent: stagePct });
        }
      }
    });

    p.on('error', (err: NodeJS.ErrnoException) => {
      // Abort durch ctx.signal → silent (kein Bug, sondern Cancel)
      if (err.name === 'AbortError' || (err as any).code === 'ABORT_ERR') {
        reject(new Error('aborted'));
        return;
      }
      reject(err);
    });
    p.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const tail = stderrBuf
        .split('\n')
        .filter((l) => l.trim() && !/^\s*frame=|^Duration:|^Stream|^\s*built/.test(l))
        .slice(-8)
        .join(' | ')
        .slice(-800);
      // User-Cancel via ctx oder shell-abort → silent abort
      if (signal?.aborted) {
        reject(new Error('aborted'));
        return;
      }
      // SIGTERM/SIGKILL ohne unsere Anfrage = externe Tötung (OOM, parent-restart).
      // Trotzdem cmd + stderr loggen damit User Diagnose hat.
      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        console.error(`[ffmpeg] killed by ${signal} (exit ${code})\n  cmd: ffmpeg ${args.join(' ')}\n  stderr: ${tail || '(empty)'}`);
        reject(new Error(`ffmpeg killed by ${signal}: ${tail || '(empty stderr — possible OOM, dev-server-restart, or process-group kill)'}`));
        return;
      }
      console.error(`[ffmpeg] failed (exit ${code})\n  cmd: ffmpeg ${args.join(' ')}\n  err: ${tail}`);
      reject(new Error(`ffmpeg exit ${code}: ${tail || 'see main process logs'}`));
    });
  });
}

/** Quality-Mode für FFmpeg-Encoder. Per setQualityMode() global gesetzt vor Render-Aufrufen.
 *  - 'fast' (default): h264_videotoolbox auf macOS (Hardware, ~5-10× schneller, aber pro-Bit
 *    qualitätsmäßig schlechter), libx264 sonst.
 *  - 'quality': IMMER libx264 mit -preset slow + -tune film. Deutlich langsamer aber sichtbar
 *    schärfer bei gleicher Bitrate. Empfohlen für Detailreiche Game-Frames (Texturen, Gras).
 *  Job-Queue ist concurrency=1 → kein Race-Risiko trotz module-state. */
export type QualityMode = 'fast' | 'quality';
let currentQualityMode: QualityMode = 'fast';
export function setQualityMode(mode: QualityMode): void {
  currentQualityMode = mode;
  console.log(`[encoder] mode=${mode} → ${videoEncoder()}`);
}
export function getQualityMode(): QualityMode {
  return currentQualityMode;
}
function videoEncoder(): string {
  if (currentQualityMode === 'quality') return 'libx264';
  return process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264';
}
function encoderExtraArgs(): string[] {
  // -preset slow + -tune film für libx264 quality-mode → bessere Detail-Erhaltung pro Bit
  if (currentQualityMode === 'quality') return ['-preset', 'slow', '-tune', 'film'];
  return [];
}

/** Probe ob FFmpeg vidstab-Filter (libvidstab) hat. Cached. */
let _vidstabSupported: boolean | null = null;
export function hasVidstabFilter(): boolean {
  if (_vidstabSupported !== null) return _vidstabSupported;
  const bin = resolveBin('ffmpeg');
  if (!bin) return _vidstabSupported = false;
  try {
    const out = execSync(`"${bin}" -hide_banner -filters`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const ok = /^\s*[A-Z\.]{2,3}\s+vidstabdetect\s+/m.test(out)
            && /^\s*[A-Z\.]{2,3}\s+vidstabtransform\s+/m.test(out);
    console.log(`[bin] vidstab filter: ${ok ? '✓' : '✗ (libvidstab nicht installiert)'}`);
    return _vidstabSupported = ok;
  } catch {
    return _vidstabSupported = false;
  }
}

/**
 * vidstabdetect Pre-Pass: analysiert Wackel-Bewegungen im Video und schreibt
 * eine .trf-Transforms-Datei. Diese wird dann von vidstabtransform im Render
 * angewandt.
 *
 * Quirk: vidstabdetect schreibt KEINEN Output-Stream — es ist ein Analyse-Filter.
 * FFmpeg braucht trotzdem ein output-File, aber das verwerfen wir.
 *
 * @param srcVideo  Original-Source (nicht das Preview-Cache, damit Detect auf voller Quality)
 * @param trimStart Optional: Detect nur ab diesem Source-Offset
 * @param duration  Optional: Detect nur für diese Dauer (ab trimStart)
 * @param outTrf    Pfad zum Schreiben der .trf-Datei
 */
export async function runVidstabDetect(
  srcVideo: string,
  trimStart: number,
  duration: number,
  outTrf: string,
): Promise<void> {
  if (!hasVidstabFilter()) {
    throw new Error('vidstab filter not available (install ffmpeg with --enable-libvidstab)');
  }
  const args = ['-y'];
  if (trimStart > 0) args.push('-ss', String(trimStart));
  if (duration > 0) args.push('-t', String(duration));
  args.push(
    '-i', srcVideo,
    // shakiness=5 (max), accuracy=15 (max) für beste Detection
    '-vf', `vidstabdetect=shakiness=5:accuracy=15:result='${outTrf.replace(/\\/g, '/').replace(/:/g, '\\:')}'`,
    '-f', 'null',
    '-',
  );
  console.log(`[vidstab/detect] ${path.basename(srcVideo)} (trim=${trimStart.toFixed(2)}s dur=${duration.toFixed(2)}s) → ${path.basename(outTrf)}`);
  await runFfmpeg(args);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Hochwertiges Resampling für scale-Filter — Lanczos + accurate_rnd + full chroma.
 *  Default bicubic ist sichtbar weicher (~5-10% Detail-Verlust bei Downscale). */
const SCALE_QUALITY_FLAGS = ':flags=lanczos+accurate_rnd+full_chroma_int';

// ════════════════════════════════════════════════════════════════════════════
//   MASTER-Render (Pipeline-Schritt: source → 16:9 1920×1080)
// ════════════════════════════════════════════════════════════════════════════

export async function renderMasterClip(
  source: string,
  output: string,
  start: number,
  duration: number,
  ctx: JobContext,
): Promise<void> {
  await runFfmpeg(
    [
      '-y',
      '-i', source,
      '-ss', String(start),
      '-t', String(duration),
      // Lanczos für scharfes Downscaling. fps NICHT mehr forciert auf 30 — Source-fps wird
      // preserved. 60fps-Quellen behalten 60fps, keine Halbierung mehr.
      '-vf', `scale=1920:1080:force_original_aspect_ratio=decrease${SCALE_QUALITY_FLAGS},pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1`,
      '-c:v', videoEncoder(), ...encoderExtraArgs(),
      '-b:v', '30M',  // master-render: hohe Quality (war 16M)
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      output,
    ],
    { ctx, expectedDuration: duration, step: 'render' },
  );
}

// ════════════════════════════════════════════════════════════════════════════
//   EXPORT
// ════════════════════════════════════════════════════════════════════════════

export interface ExportOptions {
  layout?: TikTokLayout;
  facecam?: FacecamRegion;
  gameplay?: GameplayRegion;          // optional Gameplay-Crop (Default = ganzes Frame)
  splitRatio?: number;
  music?: ProjectMusic;
  /**
   * Phase 9.2: Optional Resolution/FPS/Bitrate Overrides. Wenn nicht gesetzt:
   * - youtube: Master-Resolution + 30 Mbps
   * - tiktok:  1080×1920 (oder Stacked-Layout-Resolution) + 30 Mbps
   * width/height werden für scale benutzt; fps via -r; bitrate als -b:v.
   */
  exportQuality?: { width?: number; height?: number; fps?: number; bitrate?: string };
  /**
   * Subtitles: liefere ENTWEDER `srtPath` (libass-Pfad) ODER `transcript+highlight` (drawtext-Fallback).
   * Wenn beide gegeben: libass wird bevorzugt wenn verfügbar, sonst drawtext.
   */
  subtitles?: {
    style: SubtitleStyle;
    position?: SubtitlePosition;
    customY?: number;
    /** Komplettes SubtitleSettings-Objekt für advanced Style-Overrides (FontSize/Color/Stroke/Glow). */
    settings?: SubtitleSettings;
    srtPath?: string;
    transcript?: Transcript;
    highlight?: Highlight;
    /** Layered-Style: pre-rendered PNG-Overlays. Wenn gesetzt → libass/drawtext skippen,
     *  PNGs als FFmpeg-overlay-Streams einblenden mit enable=between(t,start,end). */
    pngOverlayPaths?: Array<{ start: number; end: number; path: string }>;
  };
  effects?: ClipEffects;
}

/**
 * Probe welche Subtitle-Filter im installierten FFmpeg verfügbar sind.
 * - libass:   high-quality ASS-Style subtitles via `subtitles=` filter
 * - drawtext: simpler text-overlay fallback via `drawtext=` filter (braucht libfreetype)
 *
 * KEINE Caching — User kann FFmpeg während der Session updaten.
 */
export interface SubtitleSupport {
  libass: boolean;
  drawtext: boolean;
}

export function getSubtitleSupport(): SubtitleSupport {
  const bin = resolveBin('ffmpeg');
  if (!bin) {
    console.warn('[bin] subtitle probe: ffmpeg not found');
    return { libass: false, drawtext: false };
  }
  try {
    const out = execSync(`"${bin}" -hide_banner -filters`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    // Flag-Spalte ist 2-3 Zeichen je nach FFmpeg-Version (z.B. "..", "T.", "..C", "TSC")
    const libass   = /^\s*[A-Z\.]{2,3}\s+subtitles\s+/m.test(out);
    const drawtext = /^\s*[A-Z\.]{2,3}\s+drawtext\s+/m.test(out);
    console.log(`[bin] ffmpeg=${bin}`);
    console.log(`[bin] subtitle filters: libass=${libass ? '✓' : '✗'} drawtext=${drawtext ? '✓' : '✗'}`);
    if (!libass || !drawtext) {
      // Show context: which lines from filter list did we see for these filters?
      const lines = out.split('\n').filter((l) =>
        /\bsubtitles\b/i.test(l) || /\bdrawtext\b/i.test(l) || /\bass\b/.test(l),
      ).slice(0, 6);
      if (lines.length) console.log(`[bin] relevant filter lines:\n${lines.map((l) => '  ' + l.trim()).join('\n')}`);
      else console.log(`[bin] no subtitle/drawtext/ass filter lines found in output (total ${out.split('\n').length} lines)`);
    }
    return { libass, drawtext };
  } catch (err) {
    console.warn(`[bin] subtitle probe failed:`, err);
    return { libass: false, drawtext: false };
  }
}

/** Backward-kompatible Helper-Funktion. */
export function hasSubtitlesFilter(): boolean {
  return getSubtitleSupport().libass;
}

/**
 * drawtext-Fallback wenn libass fehlt.
 * Generiert pro Cue ein drawtext-Filter — funktioniert auf jedem FFmpeg-Build.
 */
export async function applySubtitlesViaDrawtext(
  baseVideo: string,
  transcript: Transcript,
  highlight: Highlight,
  style: SubtitleStyle,
  output: string,
  position: SubtitlePosition = 'bottom',
  customY?: number,
  settings?: SubtitleSettings,
): Promise<void> {
  const cues = getCuesInRange(transcript, highlight);
  if (cues.length === 0) {
    console.warn('[subtitles/drawtext] no cues — copying through');
    await (await import('node:fs/promises')).copyFile(baseVideo, output);
    return;
  }
  const chain = buildDrawtextFilterChain(cues, style, position, customY, settings);
  console.log(`[subtitles/drawtext] ${cues.length} cues, style=${style}, pos=${position}${position === 'custom' ? `(${customY})` : ''}${settings ? ' +settings' : ''} (libass-fallback)`);
  await runFfmpeg([
    '-y',
    '-i', baseVideo,
    '-vf', chain,
    '-c:v', videoEncoder(), ...encoderExtraArgs(),
    '-b:v', '30M',  // 2nd-pass — matched main render bitrate
    '-c:a', 'copy',
    '-pix_fmt', 'yuv420p',
    // KEIN '-r' fest — Source-fps preserved (60fps bleibt 60fps)
    '-shortest',
    '-movflags', '+faststart',
    output,
  ]);
}

/**
 * Subtitle-Pass via pre-rendered PNG-Overlays (Layered-Style).
 * Pro Cue ein PNG-Input mit `-loop 1`, im filter_complex via overlay=0:0
 * mit enable=between(t,start,end) eingeblendet. PNG ist full-canvas
 * (transparent außerhalb des Subtitle-Bereichs), daher x=0, y=0.
 *
 * Benutzt wenn libass die Layered-Style-Limits (kein Vertikal-Gradient,
 * kein 7-Stop Metallic, kein Multi-Layer Glow) nicht abbilden kann.
 */
export async function applySubtitlesViaPngOverlays(
  baseVideo: string,
  pngOverlays: Array<{ start: number; end: number; path: string }>,
  output: string,
): Promise<void> {
  if (pngOverlays.length === 0) {
    console.warn('[subtitles/png] no overlays — copying through');
    await fs.copyFile(baseVideo, output);
    return;
  }

  // Inputs: base video [0], dann pro PNG ein -loop 1 -i (=> [1], [2], ...)
  const args: string[] = ['-y', '-i', baseVideo];
  for (const o of pngOverlays) {
    args.push('-loop', '1', '-i', o.path);
  }

  // Filter-Chain: kaskadierend overlay-pyramide [0:v] → [s0] → [s1] → ... → [vout]
  const filters: string[] = [];
  let stage = '[0:v]';
  for (let i = 0; i < pngOverlays.length; i++) {
    const o = pngOverlays[i];
    const inIdx = i + 1;
    const next = i === pngOverlays.length - 1 ? '[vout]' : `[s${i}]`;
    const enable = `between(t,${fmt(o.start)},${fmt(o.end)})`;
    // PNG-Stream zur aktuellen Stage overlayen mit time-range
    filters.push(`${stage}[${inIdx}:v]overlay=x=0:y=0:enable='${enable}':eof_action=pass${next}`);
    stage = next;
  }

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[vout]',
    '-map', '0:a?',
    '-c:v', videoEncoder(), ...encoderExtraArgs(),
    // 2nd-pass-encode (input bereits gen-1 H.264) → matched main render bitrate
    '-b:v', '30M',
    '-c:a', 'copy',
    '-pix_fmt', 'yuv420p',
    // KEIN '-r' fest — Source-fps preserved (60fps bleibt 60fps)
    '-shortest',
    '-movflags', '+faststart',
    output,
  );
  console.log(`[subtitles/png] ${pngOverlays.length} cue-overlays → ${output}`);
  await runFfmpeg(args);
}

/** Subtitle-Pass: brennt SRT via subtitles-Filter mit ASS force_style ein. */
export async function applySubtitles(
  baseVideo: string,
  srtPath: string,
  style: SubtitleStyle,
  output: string,
  position: SubtitlePosition = 'bottom',
  customY?: number,
  settings?: SubtitleSettings,
): Promise<void> {
  if (!hasSubtitlesFilter()) {
    console.warn('[subtitles] filter missing — copying input through without burn-in');
    await (await import('node:fs/promises')).copyFile(baseVideo, output);
    return;
  }

  const escapedPath = escapeSubtitlePath(srtPath);
  const force = getSubtitleForceStyle(style, position, customY, settings);
  const filter = `subtitles=filename='${escapedPath}':force_style='${force}'`;
  console.log(`[subtitles] style=${style} pos=${position}${position === 'custom' ? `(${customY})` : ''}${settings ? ' +settings' : ''} src=${srtPath}`);

  await runFfmpeg([
    '-y',
    '-i', baseVideo,
    '-vf', filter,
    '-c:v', videoEncoder(), ...encoderExtraArgs(),
    // 2nd-pass-encode (input ist schon gen-1 H.264) → 30M = Master-Bitrate, kein
    // zusätzlicher Generation-Loss durch das 9:16-Re-encoding. Vorher 20M.
    '-b:v', '30M',
    '-c:a', 'copy',
    '-pix_fmt', 'yuv420p',
    // KEIN '-r' fest — Source-fps preserved (60fps bleibt 60fps)
    '-shortest',
    '-movflags', '+faststart',
    output,
  ]);
}

/**
 * Hauptfunktion: Master + Segments + Format → finale Datei.
 * Strategie:
 *   1) Single segment → direkt rendern (mit -ss/-t am Input für Geschwindigkeit)
 *   2) Multi segment  → jeden Teil einzeln rendern, dann via concat-Demuxer joinen
 *   3) Music optional → in einem Schluss-Pass mit Sidechain-Ducking dazumischen
 *
 * Alle Renders haben:
 *   -r 30 -fps_mode cfr  (kein Speed-Drift / White-Screen)
 *   -shortest            (Audio kürzt nicht über Video hinaus)
 *   -map 0:v -map 0:a?   (Audio optional, sonst stummer Video bleibt valide)
 *   -avoid_negative_ts make_zero
 */
export async function exportClipAs(
  format: ExportFormat,
  master: string,
  output: string,
  segments: ClipSegment[],
  options: ExportOptions = {},
): Promise<void> {
  if (segments.length === 0) throw new Error('exportClipAs: no segments to export');

  const masterDur = await getDuration(master).catch(() => 0);
  const totalSegSec = segments.reduce((s, seg) => s + (seg.end - seg.start), 0);

  const layoutLabel = options.layout ?? 'full';
  const musicLabel = options.music?.path ? ' +music' : '';
  console.log(`[export] format: ${format} layout: ${layoutLabel}${musicLabel} segments: ${segments.length}`);
  console.log(`[export] duration in: ${totalSegSec.toFixed(2)}s (master: ${masterDur.toFixed(2)}s)`);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'videoapp-export-'));
  try {
    const useMusic = !!options.music?.path;
    const subs = options.subtitles;
    const useSubs = !!subs && (
      !!subs.srtPath || (!!subs.transcript && !!subs.highlight)
      || (!!subs.pngOverlayPaths && subs.pngOverlayPaths.length > 0)
    );

    // Stages: concat → [music] → [subtitles] → output
    const videoTarget = useMusic || useSubs ? path.join(tmpDir, 'video_only.mp4') : output;

    if (segments.length === 1) {
      await renderOneSegment(format, master, videoTarget, segments[0], options);
    } else {
      const parts: string[] = [];
      for (let i = 0; i < segments.length; i++) {
        const part = path.join(tmpDir, `seg_${String(i + 1).padStart(3, '0')}.mp4`);
        await renderOneSegment(format, master, part, segments[i], options);
        parts.push(part);
      }
      await concatParts(parts, videoTarget, tmpDir);
    }

    let stage = videoTarget;
    if (useMusic) {
      const next = useSubs ? path.join(tmpDir, 'with_music.mp4') : output;
      await mixInMusic(stage, options.music!, next);
      stage = next;
    }
    if (useSubs) {
      const subs = options.subtitles!;
      // PNG-Overlays haben Vorrang (Layered-Style 1:1 zu Live-Preview).
      if (subs.pngOverlayPaths && subs.pngOverlayPaths.length > 0) {
        await applySubtitlesViaPngOverlays(stage, subs.pngOverlayPaths, output);
      } else {
        const sup = getSubtitleSupport();
        // libass > drawtext > skip
        if (subs.srtPath && sup.libass) {
          await applySubtitles(stage, subs.srtPath, subs.style, output, subs.position, subs.customY, subs.settings);
        } else if (sup.drawtext && subs.transcript && subs.highlight) {
          await applySubtitlesViaDrawtext(stage, subs.transcript, subs.highlight, subs.style, output, subs.position, subs.customY, subs.settings);
        } else {
          console.warn(
            `[subtitles] cannot burn in — libass=${sup.libass} drawtext=${sup.drawtext}. ` +
            `Install ffmpeg with libfreetype+libass. Skipping.`,
          );
          await (await import('node:fs/promises')).copyFile(stage, output);
        }
      }
    }

    const outDur = await getDuration(output).catch(() => -1);
    console.log(`[export] duration out: ${outDur.toFixed(2)}s → ${output}`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Rendert EINEN Bereich des Masters in das Zielformat.
 * - Single-Pass mit Input-side-Seek (-ss vor -i): schneller, accurate
 * - Stacked-Layout: filter_complex, sonst -vf
 */
async function renderOneSegment(
  format: ExportFormat,
  master: string,
  output: string,
  segment: ClipSegment,
  options: ExportOptions,
): Promise<void> {
  const dur = Math.max(0.1, segment.end - segment.start);

  // Phase 9.2: Quality-Overrides — Bitrate/FPS/Resolution.
  // Defaults: 30 Mbps Bitrate, kein -r (Source-FPS), Resolution format-abhängig.
  const eq = options.exportQuality ?? {};
  const bitrate = eq.bitrate ?? '30M';
  const fpsArg: string[] = eq.fps ? ['-r', String(eq.fps)] : [];

  const COMMON_FLAGS = [
    // -fps_mode cfr stellt Constant Frame Rate sicher anhand der Input-Rate, nötig für sauberen Concat.
    // Ohne explizites -r: Source-FPS bleibt erhalten (60fps-Sources verlieren keine Frames).
    ...fpsArg,
    '-fps_mode', 'cfr',
    '-c:v', videoEncoder(), ...encoderExtraArgs(),
    '-b:v', bitrate,
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-avoid_negative_ts', 'make_zero',
    '-shortest',
  ];

  const fxSuffix = effectsSuffix(options.effects);

  // Target-Resolution für tiktok-full + stacked. Default 1080×1920, aber wenn user
  // exportQuality.width/height gesetzt hat: nutze diese (z.B. 720×1280, 2160×3840 4K).
  const tiktokW = eq.width && eq.width > 0 ? eq.width : 1080;
  const tiktokH = eq.height && eq.height > 0 ? eq.height : 1920;

  if (format === 'youtube' || options.layout !== 'stacked') {
    // Simpler Pfad — einfaches -vf reicht (+ optional Effects am Ende)
    let vf: string;
    if (format === 'youtube') {
      // Youtube: optionaler scale wenn user explizite Resolution gewählt hat
      if (eq.width && eq.height) {
        vf = `scale=${eq.width}:${eq.height}${SCALE_QUALITY_FLAGS},setsar=1${fxSuffix}`;
      } else {
        vf = `setsar=1${fxSuffix}`;
      }
    } else {
      // 9:16 full layout: crop auf 9:16-Aspect dann scale auf Target.
      vf = `crop=ih*9/16:ih,scale=${tiktokW}:${tiktokH}${SCALE_QUALITY_FLAGS},setsar=1${fxSuffix}`;
    }

    await runFfmpeg([
      '-y',
      '-ss', String(segment.start),
      '-t',  String(dur),
      '-i',  master,
      '-vf', vf,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      ...COMMON_FLAGS,
      output,
    ]);
    return;
  }

  // Stacked: filter_complex (split + crop + vstack + optional gameplay-crop + effects)
  const fc = options.facecam ?? DEFAULT_FACECAM;
  const gp = options.gameplay ?? DEFAULT_GAMEPLAY;
  const ratio = clamp(options.splitRatio ?? DEFAULT_SPLIT_RATIO, 0.2, 0.8);
  const topH = Math.round((tiktokH * ratio) / 2) * 2;
  const botH = tiktokH - topH;
  const fx = clamp(fc.x, 0, 0.99);
  const fy = clamp(fc.y, 0, 0.99);
  const fw = clamp(fc.width, 0.05, 1 - fx);
  const fh = clamp(fc.height, 0.05, 1 - fy);
  const gx = clamp(gp.x, 0, 0.99);
  const gy = clamp(gp.y, 0, 0.99);
  const gw = clamp(gp.width, 0.05, 1 - gx);
  const gh = clamp(gp.height, 0.05, 1 - gy);

  // Gameplay nimmt entweder die definierte Region ODER (default 0/0/1/1) das ganze Frame.
  // Wir benutzen IMMER crop — bei 1.0/1.0 ist das ein no-op.
  const filter = [
    `[0:v]split=2[a][b]`,
    `[a]crop=iw*${fw}:ih*${fh}:iw*${fx}:ih*${fy},` +
      `scale=${tiktokW}:${topH}:force_original_aspect_ratio=increase${SCALE_QUALITY_FLAGS},` +
      `crop=${tiktokW}:${topH}[top]`,
    `[b]crop=iw*${gw}:ih*${gh}:iw*${gx}:ih*${gy},` +
      `scale=${tiktokW}:${botH}:force_original_aspect_ratio=increase${SCALE_QUALITY_FLAGS},` +
      `crop=${tiktokW}:${botH}[bottom]`,
    `[top][bottom]vstack=inputs=2,setsar=1${fxSuffix}[v]`,
  ].join(';');

  await runFfmpeg([
    '-y',
    '-ss', String(segment.start),
    '-t',  String(dur),
    '-i',  master,
    '-filter_complex', filter,
    '-map', '[v]',
    '-map', '0:a:0?',
    ...COMMON_FLAGS,
    output,
  ]);
}

/**
 * Concat mit Demuxer + stream-copy. Alle Parts MÜSSEN dieselben
 * Encoding-Parameter haben (machen wir oben über fixe COMMON_FLAGS).
 */
async function concatParts(parts: string[], output: string, tmpDir: string): Promise<void> {
  const listFile = path.join(tmpDir, 'concat_list.txt');
  const lines = parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  await fs.writeFile(listFile, lines);

  await runFfmpeg([
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listFile,
    '-c', 'copy',
    '-movflags', '+faststart',
    output,
  ]);
}

/**
 * Music-Pass: nimmt fertiges Video, mixt Sidechain-geduckte Background-Music dazu.
 * Video-Stream bleibt unverändert (-c:v copy).
 */
async function mixInMusic(input: string, music: ProjectMusic, output: string): Promise<void> {
  const vol = clamp(music.volume, 0, 1);
  await runFfmpeg([
    '-y',
    '-i', input,
    '-i', music.path,
    '-filter_complex', [
      `[0:a]asplit=2[a_main][a_dup]`,
      `[1:a]aloop=loop=-1:size=2e9,volume=${vol}[music]`,
      `[music][a_dup]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=400[ducked]`,
      `[a_main][ducked]amix=inputs=2:duration=first:dropout_transition=0[a]`,
    ].join(';'),
    '-map', '0:v',
    '-map', '[a]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    output,
  ]);
}

// ════════════════════════════════════════════════════════════════════════════
//   BUILDER (Multi-Clip-Concat mit Intro + Music)
// ════════════════════════════════════════════════════════════════════════════

export interface BuilderClip {
  master: string;
  segments: ClipSegment[];
}

export interface BuilderOptions {
  format: ExportFormat;
  layout?: TikTokLayout;
  facecam?: FacecamRegion;
  gameplay?: GameplayRegion;
  splitRatio?: number;
  intro?: ProjectIntro;
  music?: ProjectMusic;
  effects?: ClipEffects;
  /** Optional Quality-Override: re-encoded der finale Output mit gewünschter Auflösung/FPS/Bitrate. */
  exportQuality?: { width?: number; height?: number; fps?: number; bitrate?: string };
  /** Optional: pro Clip Subtitles. Index muss mit clips-Array korrelieren. */
  subtitlesPerClip?: Array<{
    style: SubtitleStyle;
    position?: SubtitlePosition;
    customY?: number;
    settings?: SubtitleSettings;
    srtPath?: string;
    transcript?: Transcript;
    highlight?: Highlight;
    /** Layered-Style: pre-rendered PNG-Overlays (wenn gesetzt → libass skippen). */
    pngOverlayPaths?: Array<{ start: number; end: number; path: string }>;
  } | undefined>;
}

export async function buildVideo(
  clips: BuilderClip[],
  output: string,
  options: BuilderOptions,
  tmpDir: string,
): Promise<void> {
  if (clips.length === 0) throw new Error('buildVideo: no clips');

  const introMode = options.intro?.path ? (options.intro.mode ?? 'before') : null;
  const introLabel = introMode ? ` +intro:${introMode}` : '';
  const musicLabel = options.music?.path ? ' +music' : '';
  console.log(
    `[build] format: ${options.format} layout: ${options.layout ?? 'full'}${introLabel}${musicLabel} clips: ${clips.length}`,
  );

  const partFiles: string[] = [];

  // 1) Intro vorne anfügen — nur wenn mode='before' und Datei noch existiert
  if (options.intro?.path && introMode === 'before') {
    const introOut = path.join(tmpDir, 'part_intro.mp4');
    const introDur = await getDuration(options.intro.path).catch(() => 0);
    if (introDur <= 0) {
      console.warn(`[build] intro file missing or unreadable — skipping prepend: ${options.intro.path}`);
    }
    if (introDur > 0) {
      await exportClipAs(options.format, options.intro.path, introOut, [{ start: 0, end: introDur }], {
        layout: options.layout,
        facecam: options.facecam,
        gameplay: options.gameplay,
        splitRatio: options.splitRatio,
        // KEINE Effects auf das Intro — sonst Color-Filter auf das Logo
      });
      partFiles.push(introOut);
    }
  }

  // 2) Jeden Clip einzeln rendern (ohne Music; Subtitles + Effects per Clip)
  for (let i = 0; i < clips.length; i++) {
    const partOut = path.join(tmpDir, `part_${String(i + 1).padStart(3, '0')}.mp4`);
    await exportClipAs(options.format, clips[i].master, partOut, clips[i].segments, {
      layout: options.layout,
      facecam: options.facecam,
      gameplay: options.gameplay,
      splitRatio: options.splitRatio,
      effects: options.effects,
      subtitles: options.subtitlesPerClip?.[i],
    });
    partFiles.push(partOut);
  }

  // 3) Concat-Demux (kein Re-Encoding nötig — alle Parts gleich)
  const useOverlay = introMode === 'overlay';
  const useMusic = !!options.music?.path;

  // Pipeline-Stages: concat → [overlay] → [music] → output
  let stage = useOverlay || useMusic ? path.join(tmpDir, 'concat_only.mp4') : output;
  await concatParts(partFiles, stage, tmpDir);

  // 4) Optional Intro-Overlay drüberlegen
  if (useOverlay && options.intro?.path) {
    const next = useMusic ? path.join(tmpDir, 'with_overlay.mp4') : output;
    await applyIntroOverlay(stage, options.intro, options.format, next);
    stage = next;
  }

  // 5) Optional Music in Schluss-Pass
  if (useMusic) {
    const musicTarget = options.exportQuality ? path.join(tmpDir, 'with_music.mp4') : output;
    await mixInMusic(stage, options.music!, musicTarget);
    stage = musicTarget;
  }

  // 6) Optional Quality-Re-Encode (Editor Export-Settings)
  if (options.exportQuality && stage !== output) {
    await applyExportQuality(stage, options.exportQuality, output);
  } else if (options.exportQuality && stage === output) {
    // stage IS output — kein Re-Encode möglich, Quality wurde nicht angewandt
    console.log('[build] exportQuality requested but no intermediate stage — settings not applied');
  } else if (stage !== output) {
    // Letzter Fallback: stage zu output kopieren wenn nicht gemischt
    await fs.copyFile(stage, output);
  }

  const outDur = await getDuration(output).catch(() => -1);
  console.log(`[build] duration out: ${outDur.toFixed(2)}s → ${output}`);
}

/**
 * Re-Encode mit Quality-Settings (Editor Export-Settings).
 * Wendet Auflösung, FPS und Bitrate an.
 */
async function applyExportQuality(
  baseVideo: string,
  q: { width?: number; height?: number; fps?: number; bitrate?: string },
  output: string,
): Promise<void> {
  const args: string[] = ['-y', '-i', baseVideo];

  // Video-Filter Chain
  const vf: string[] = [];
  if (q.width && q.height) {
    vf.push(`scale=${q.width}:${q.height}:force_original_aspect_ratio=decrease${SCALE_QUALITY_FLAGS},pad=${q.width}:${q.height}:(ow-iw)/2:(oh-ih)/2:black`);
  }
  if (vf.length > 0) args.push('-vf', vf.join(','));
  if (q.fps) args.push('-r', String(q.fps));

  args.push('-c:v', videoEncoder(), ...encoderExtraArgs());
  if (q.bitrate) args.push('-b:v', q.bitrate);
  args.push('-c:a', 'copy', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output);

  console.log(`[build/quality] ${q.width ?? '·'}×${q.height ?? '·'} @${q.fps ?? '·'}fps · ${q.bitrate ?? '·'}`);
  await runFfmpeg(args);
}

/**
 * Intro-Overlay-Pass: legt das Intro-Video als Overlay auf den fertigen Concat-Output.
 * Respektiert Alpha (transparente .mov), pipeline-tauglich, ohne Audio-Mix.
 * Audio des Hauptvideos wird durchgereicht, Intro-Audio wird ignoriert.
 */
async function applyIntroOverlay(
  baseVideo: string,
  intro: ProjectIntro,
  format: ExportFormat,
  output: string,
): Promise<void> {
  const c = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  // Check ob das intro-File noch existiert — User könnte es zwischenzeitlich gelöscht haben
  const introExists = await (await import('node:fs/promises')).stat(intro.path)
    .then(() => true).catch(() => false);
  if (!introExists) {
    console.warn(`[build] intro file missing — skipping overlay pass: ${intro.path}`);
    await (await import('node:fs/promises')).copyFile(baseVideo, output);
    return;
  }

  const outputWidth = format === 'youtube' ? 1920 : 1080;
  const scale = c(intro.scale ?? 0.3, 0.05, 1);
  const overlayW = Math.round((outputWidth * scale) / 2) * 2;
  const ox = c(intro.x ?? 0.7, 0, 0.98);
  const oy = c(intro.y ?? 0.0, 0, 0.98);

  console.log(`[build] overlay scale=${scale} x=${ox} y=${oy} → ${overlayW}px wide`);

  // format=rgba: ist universell (auch bei opaken Sources). Alpha bleibt erhalten falls vorhanden.
  // setsar=1: harmonisiert Pixel-Aspect, sonst Crash bei manchen Quellen.
  // overlay format=auto: FFmpeg pickt RGBA-fähigen Pfad — Alpha-Blending aktiv.
  const filter = [
    `[1:v]format=rgba,scale=${overlayW}:-2:force_original_aspect_ratio=decrease${SCALE_QUALITY_FLAGS},setsar=1[ov]`,
    `[0:v][ov]overlay=x=W*${ox}:y=H*${oy}:shortest=0:format=auto:eval=frame[v]`,
  ].join(';');

  await runFfmpeg([
    '-y',
    '-i', baseVideo,
    '-i', intro.path,
    '-filter_complex', filter,
    '-map', '[v]',
    '-map', '0:a?',
    '-c:v', videoEncoder(), ...encoderExtraArgs(),
    // Beide formats jetzt 30M (vorher 9:16 = 20M) — höhere Detail-Erhaltung
    '-b:v', '30M',
    '-c:a', 'copy',
    '-pix_fmt', 'yuv420p',
    // KEIN '-r' fest — Source-fps preserved (60fps bleibt 60fps)
    '-shortest',
    '-movflags', '+faststart',
    output,
  ]);
}

// ════════════════════════════════════════════════════════════════════════════
//   AUDIO HELPERS (Pipeline)
// ════════════════════════════════════════════════════════════════════════════

export async function extractAudio(input: string, output: string, ctx: JobContext): Promise<void> {
  await runFfmpeg(
    ['-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', output],
    { step: 'transcribe', ctx },
  );
}

export async function splitAudio(
  input: string,
  outDir: string,
  chunkSeconds: number,
  totalDuration: number,
): Promise<{ path: string; offset: number }[]> {
  const chunks: { path: string; offset: number }[] = [];
  for (let start = 0; start < totalDuration; start += chunkSeconds) {
    const out = path.join(outDir, `chunk_${start}.mp3`);
    await runFfmpeg([
      '-y',
      '-i', input,
      '-ss', String(start),
      '-t', String(chunkSeconds),
      '-c:a', 'libmp3lame', '-b:a', '32k', '-ac', '1', '-ar', '16000',
      out,
    ]);
    chunks.push({ path: out, offset: start });
  }
  return chunks;
}

/**
 * Extrahiert ein JPEG-Standbild aus einem Video. Wird für Library-Card-Cover genutzt.
 * - `-ss <atSec>` VOR `-i` = fast-seek (keyframe-based, viel schneller als demuxer-seek)
 * - `scale=640:-2` = max 640px breit, height proportional + gerade (yuv420p-konform)
 * - `-q:v 4` = JPEG-Qualität gut (1=best, 31=worst)
 */
export async function extractFrameJpeg(input: string, output: string, atSec: number): Promise<void> {
  await runFfmpeg([
    '-y',
    '-ss', String(Math.max(0, atSec)),
    '-i', input,
    '-frames:v', '1',
    '-vf', 'scale=640:-2',
    '-q:v', '4',
    output,
  ]);
}

export function getDuration(input: string): Promise<number> {
  const bin = resolveBin('ffprobe');
  if (!bin) return Promise.reject(new Error('ffprobe not found. Install via: brew install ffmpeg'));

  return new Promise((resolve, reject) => {
    const p = spawn(bin, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      input,
    ]);
    let out = '';
    p.stdout.on('data', (d: Buffer) => (out += d.toString()));
    p.on('error', reject);
    p.on('exit', (code) => {
      if (code !== 0) reject(new Error(`ffprobe exit ${code}`));
      else resolve(parseFloat(out.trim()) || 0);
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  Editor Timeline Render — Multi-Track Compositing
// ════════════════════════════════════════════════════════════════════════════

export type EditorTrackKind = 'video' | 'overlay' | 'audio' | 'text';

export interface EditorClipSpec {
  src: string;
  trackKind: EditorTrackKind;
  trackIdx: number;       // 0 = base video track
  start: number;          // Timeline-Position in Sekunden
  duration: number;       // Anzeige-Dauer auf der Timeline (= Source-Material/speed)
  trimStart?: number;     // Offset im Quell-File
  // Transform (Overlays)
  posX?: number;          // -1..+1 (Editor-Convention: 0 = center, ±1 ≈ ±40% canvas)
  posY?: number;
  scale?: number;         // 1.0 = default (Base: fill canvas; Overlay: 30% canvas-Breite)
  opacity?: number;       // 0..1 (Overlays only — Base ignoriert)
  // Audio
  volume?: number;        // 0..2 (>1 = boost via FFmpeg volume-Filter)
  // Speed (Phase 2.3) — 1.0 = normal, 0.25..4.0 sinnvoll
  speed?: number;
  // Chroma-Key (Phase 2.4) — Greenscreen für Overlay-Clips
  chromaEnabled?: boolean;
  chromaColor?: string;     // hex "#RRGGBB" oder "#RGB"
  chromaTolerance?: number; // 0..1
  // Bildstabilisator: vidstabtransform-Filter mit pre-computed transforms.trf.
  // IPC-Handler macht den 2-Pass-Detect VOR renderEditorTimeline und setzt Pfad+Smoothness.
  stabilizeTrfPath?: string;
  stabilizeSmoothness?: number;  // 5..30, default 10
  // Phase 2.5 Fades — alpha-fade per Clip (transparent, nicht fade-zu-schwarz)
  fadeInDuration?: number;  // Sekunden
  fadeOutDuration?: number; // Sekunden
  // Phase 2.5+ Transitions — Übergang INTO diesen Clip vom vorherigen adjacenten Clip
  transitionType?: 'cross' | 'non-additive' | 'additive' | 'blur' | 'dip-to-color';
  transitionDuration?: number;
  transitionEasing?: 'linear' | 'ease-in' | 'ease-out';
  transitionColor?: string;  // hex, nur für dip-to-color
  // Color Adjustments (-1..+1, 0 = no change). Werden via FFmpeg eq-Filter angewandt.
  brightness?: number;
  contrast?: number;
  saturation?: number;
  // AI Subject Mask: Pfad zu PNG-File (grayscale, white=keep, black=remove).
  // Wird vom IPC-Handler aus aiMaskData/aiMaskFrames generiert + angehängt.
  // - Single PNG (Static): aiMaskPath = "/.../mask_0.png", aiMaskFps undefined
  // - PNG-Sequenz (Per-Frame): aiMaskPath = "/.../mask_%04d.png", aiMaskFps = sampling-fps
  aiMaskPath?: string;
  aiMaskFps?: number;
  // Text-Clips
  text?: string;
  /** Pre-rendered PNG-Overlay für Text-Clips (full canvas, transparente Pixel drum).
   *  Renderer rendert via Canvas (textClipCanvas.ts) → IPC schreibt temp file → setzt diesen Pfad. */
  textPngPath?: string;
  // ─── Effects (Glitch / Glow / Shake / Combos) ───────────────
  /** @deprecated single-effect-Schema, wird auto-migriert */
  effect?: 'glitch' | 'shake' | 'glow' | 'zoom-pulse' | 'rgb-split'
         | 'combo-montage' | 'combo-hype' | 'combo-clean'
         | 'aura-purple' | 'light-burst' | 'speed-lines' | 'energy-trail'
         | 'motion-blur-low' | 'motion-blur-medium' | 'motion-blur-high';
  /** @deprecated */
  effectIntensity?: number;
  /** Multi-Effects Array. */
  effects?: Array<{
    id: NonNullable<EditorClipSpec['effect']>;
    startSec?: number;
    duration?: number;
    intensity?: number;
  }>;
  // ─── Filter-Presets / Custom LUT ────────────────────────────
  filter?: 'vivid' | 'gaming' | 'bw' | 'cinema' | 'warm' | 'cool';
  lutPath?: string;  // Pfad zu .cube — überschreibt filter wenn gesetzt
  // ─── Blend-Mode (Photoshop/CSS-Style) ───────────────────────
  // Wenn 'normal' oder unset → klassisches alpha-overlay.
  // Sonst: blend-Filter mit canvas-pre-padded layer. HSL-Modi (hue/saturation/color/luminosity)
  // haben keine native FFmpeg-Entsprechung → fallen auf overlay zurück (siehe blendModeToFfmpeg).
  blendMode?:
    | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
    | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light'
    | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';
}

export interface EditorRenderOptions {
  width: number;
  height: number;
  fps: number;
  bitrate: string;        // z.B. "10M"
}

const OVERLAY_BASE_WIDTH_FRAC = 0.3;  // editor's "scale=1 = 30% canvas width" für Overlays
const POS_RANGE_FRAC          = 0.4;  // editor's "posX=±1 ≈ ±40% canvas"

function fmt(n: number): string {
  // FFmpeg-friendly Zahl: max 3 Nachkommastellen, kein E-notation, Punkt als Dezimal
  return Number(n.toFixed(3)).toString();
}

/**
 * `atempo` Filter unterstützt nur 0.5..2.0 pro Instance — für Extreme chainen.
 * Liefert "" für speed=1, sonst ",atempo=...,atempo=...".
 */
function atempoChain(speed: number): string {
  if (speed === 1 || !Number.isFinite(speed) || speed <= 0) return '';
  let remaining = speed;
  const parts: string[] = [];
  while (remaining > 2) { parts.push('atempo=2.0'); remaining /= 2; }
  while (remaining < 0.5) { parts.push('atempo=0.5'); remaining /= 0.5; }
  parts.push(`atempo=${fmt(remaining)}`);
  return ',' + parts.join(',');
}

/** Filter-Preset → FFmpeg-Filter-Chain. Color-Grading-only (kein motion). */
function filterPresetToFfmpeg(preset: NonNullable<EditorClipSpec['filter']>): string {
  switch (preset) {
    case 'vivid':   return ',eq=saturation=1.35:contrast=1.15:brightness=0.04';
    case 'gaming':  return ',eq=saturation=1.45:contrast=1.32:brightness=-0.02';
    case 'bw':      return ',hue=s=0,eq=contrast=1.1';
    case 'cinema':  return ',eq=saturation=0.85:contrast=1.15:brightness=-0.05,colorbalance=rs=0.05:bs=-0.05';
    case 'warm':    return ',colorbalance=rm=0.15:gm=0.05:bm=-0.1,eq=saturation=1.15';
    case 'cool':    return ',colorbalance=rm=-0.1:gm=-0.05:bm=0.15,eq=saturation=1.05';
    default:        return '';
  }
}

/** Effect-Preset → FFmpeg-Filter-Chain.
 *  WICHTIG: Wir nutzen NUR simple chain-filter (kein split/blend mit labels), weil die
 *  hier in einer comma-separated chain inline aufgenommen werden. split+blend würden
 *  einen Filter-Graph mit semicolons brauchen — das wäre ein größerer architecture-change.
 *  Alle „glow"-effects werden via `gblur` (Gaussian-Blur) + `eq` simuliert. */
function effectToFfmpeg(effect: NonNullable<EditorClipSpec['effect']>, intensity: number): string {
  const i = Math.max(0, Math.min(1, intensity));
  switch (effect) {
    case 'glitch':
      // Digital-grain via noise + slight contrast/saturation bump
      return `,noise=alls=${fmt(8 * i)}:allf=t,eq=contrast=${fmt(1 + 0.15 * i)}:saturation=${fmt(1 + 0.1 * i)}`;
    case 'shake':
      // Position-Wobble via crop sin/cos
      return `,crop=in_w-${Math.round(8 * i)}:in_h-${Math.round(8 * i)}:'(in_w-out_w)/2+sin(t*40)*${fmt(3 * i)}':'(in_h-out_h)/2+cos(t*35)*${fmt(3 * i)}'`;
    case 'glow':
      // Bloom: subtle blur + deutlicher brightness/saturate boost
      return `,gblur=sigma=${fmt(1.2 * i)},eq=brightness=${fmt(0.22 * i)}:saturation=${fmt(1 + 0.3 * i)}:contrast=${fmt(1 + 0.12 * i)}`;
    case 'zoom-pulse':
      // Subtle scale-pulse via gblur (keine zoompan — kann pink-output verursachen)
      return `,eq=contrast=${fmt(1 + 0.05 * i)}`;
    case 'rgb-split':
      // Hue-shift + saturate-bump
      return `,eq=saturation=${fmt(1 + 0.2 * i)}:contrast=${fmt(1 + 0.1 * i)},hue=h=${fmt(8 * i)}`;
    case 'combo-montage':
      // Fortnite-Look: KEIN Blur — nur shake + glow (brightness/saturate boost) + zoom-feel
      return `,eq=brightness=${fmt(0.15 * i)}:saturation=${fmt(1 + 0.25 * i)}:contrast=${fmt(1 + 0.12 * i)},crop=in_w-${Math.round(4 * i)}:in_h-${Math.round(4 * i)}:'(in_w-out_w)/2+sin(t*45)*${fmt(2.5 * i)}':'(in_h-out_h)/2+cos(t*40)*${fmt(2.5 * i)}'`;
    case 'combo-hype':
      return `,crop=in_w-${Math.round(6 * i)}:in_h-${Math.round(6 * i)}:'(in_w-out_w)/2+sin(t*50)*${fmt(2.5 * i)}':'(in_h-out_h)/2+cos(t*45)*${fmt(2.5 * i)}',eq=saturation=${fmt(1 + 0.15 * i)}:contrast=${fmt(1 + 0.1 * i)}`;
    case 'combo-clean':
      return `,gblur=sigma=${fmt(1 * i)},eq=saturation=${fmt(1 + 0.08 * i)}:brightness=${fmt(0.04 * i)}`;
    // Magic / Anime-Style Effects (alle ohne split/blend)
    case 'aura-purple':
      // Kräftiger Lila-Tint + soft-glow
      return `,colorbalance=rs=${fmt(0.25 * i)}:bs=${fmt(0.4 * i)}:rm=${fmt(0.2 * i)},gblur=sigma=${fmt(1.5 * i)},eq=brightness=${fmt(0.08 * i)}:saturation=${fmt(1 + 0.2 * i)}`;
    case 'light-burst':
      // Helle Aufhellung mit warmth — sichtbar
      return `,gblur=sigma=${fmt(2 * i)},eq=brightness=${fmt(0.2 * i)}:saturation=${fmt(1 + 0.15 * i)}:contrast=${fmt(1 + 0.1 * i)},colorbalance=rs=${fmt(0.1 * i)}`;
    case 'speed-lines':
      return `,boxblur=lr=${Math.round(6 * i)}:lp=1,eq=contrast=${fmt(1 + 0.08 * i)}`;
    case 'motion-blur-low':
      // tmix=temporal mix mit gewichteter Akkumulation für echten Motion-Blur.
      return `,tmix=frames=3:weights=1 2 4`;
    case 'motion-blur-medium':
      return `,tmix=frames=5:weights=1 1 2 3 5`;
    case 'motion-blur-high':
      return `,tmix=frames=8:weights=1 1 2 2 3 4 5 6`;
    case 'energy-trail':
      // Cyan→Lila→Pink-Gradient mit screen-blend (Live-Preview).
      // FFmpeg-Approximation MINIMAL: nur dezenter color-shift via colorbalance.
      // KEIN Vignette, KEIN brightness/contrast/saturation-Boost — Bild bleibt unverändert,
      // nur ein leichter cyan/magenta-Tint kommt drauf. Subject darf NICHT verändert wirken.
      return `,colorbalance=bs=${fmt(0.18 * i)}:gs=${fmt(-0.06 * i)}:rm=${fmt(0.1 * i)}:bm=${fmt(0.15 * i)}:gm=${fmt(-0.05 * i)}`;
    default:
      return '';
  }
}

/**
 * CSS/Editor-Blend-Mode → FFmpeg `blend=all_mode=X`-Wert.
 * Liefert null wenn Mode nicht nativ supported (HSL-Modi: hue/saturation/color/luminosity)
 * oder 'normal' (→ caller nutzt klassischen overlay-Pfad).
 *
 * FFmpeg blend-Modi: addition, and, average, burn, darken, difference, divide, dodge, exclusion,
 * glow, grainextract, grainmerge, hardlight, hardmix, lighten, multiply, negation, or, overlay,
 * phoenix, pinlight, reflect, screen, softlight, subtract, vividlight, xor.
 */
function blendModeToFfmpeg(mode: NonNullable<EditorClipSpec['blendMode']>): string | null {
  switch (mode) {
    case 'normal':      return null;
    case 'multiply':    return 'multiply';
    case 'screen':      return 'screen';
    case 'overlay':     return 'overlay';
    case 'darken':      return 'darken';
    case 'lighten':     return 'lighten';
    case 'color-dodge': return 'dodge';
    case 'color-burn':  return 'burn';
    case 'hard-light':  return 'hardlight';
    case 'soft-light':  return 'softlight';
    case 'difference':  return 'difference';
    case 'exclusion':   return 'exclusion';
    // HSL-Modi: keine native Entsprechung — fallback auf overlay (caller-Verantwortung).
    case 'hue':
    case 'saturation':
    case 'color':
    case 'luminosity':
      return null;
    default: return null;
  }
}

/** Hex "#RRGGBB" / "#RGB" → FFmpeg "0xRRGGBB". Default green wenn invalid. */
function chromaColorToFfmpeg(hex?: string): string {
  if (!hex) return '0x00FF00';
  const m = hex.replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(m)) return `0x${m.toUpperCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(m)) {
    return `0x${m.split('').map((c) => c + c).join('').toUpperCase()}`;
  }
  return '0x00FF00';
}

/**
 * Rendert den Editor-Multi-Track-State zu einer einzelnen MP4-Datei.
 *
 * Approach: Single-Pass mit -filter_complex.
 *  - Black canvas als Base
 *  - Track-0 Video-Clips: scale-to-fit canvas, overlay an ihrer Timeline-Position
 *  - Andere Video/Overlay-Clips: scale auf scale*30% canvas-Breite, position via posX/posY
 *  - Audio: Track-0 Video-Clips + Audio-Track-Clips → adelay zur Timeline-Position → amix
 *
 * NICHT in dieser Phase: Rotation, Chroma-Key, Speed, Transitions/xfade.
 */
export async function renderEditorTimeline(
  clips: EditorClipSpec[],
  output: string,
  opts: EditorRenderOptions,
): Promise<void> {
  if (clips.length === 0) throw new Error('renderEditorTimeline: no clips');

  // Audio-Quellen: Track-0 video + audio-tracks (text/overlay haben kein Audio das wir mischen)
  // Z-Order: niedriger trackIdx = Bottom-Layer (zuerst rendered), höhere = on top.
  // Sekundär nach start sortieren damit deterministisch.
  // Text-Clips mit textPngPath werden als visuell behandelt (PNG-Overlay, full-canvas, pre-positioned).
  const visualClips = clips
    .filter((c) => c.trackKind === 'video' || c.trackKind === 'overlay'
      || (c.trackKind === 'text' && !!c.textPngPath))
    .sort((a, b) => (a.trackIdx - b.trackIdx) || (a.start - b.start));
  const audioClips  = clips.filter((c) => (c.trackKind === 'video' && c.trackIdx === 0) || c.trackKind === 'audio');

  if (visualClips.length === 0) throw new Error('renderEditorTimeline: no visual clips');

  // Set der Text-PNG-Sources — diese werden NICHT geprobed (PNG hat keine sinnvolle duration)
  // und nicht gecapped (PNG wird per -loop 1 unendlich geloopt).
  const textPngSrcs = new Set<string>(
    visualClips.filter((c) => c.textPngPath).map((c) => c.src),
  );

  // Pro unique src: Source-Duration probieren → konservativ cappen wenn user
  // duration deutlich > srcDur (>2x). Conservative damit ffprobe-Quirks
  // (manche Container melden falsche Duration) nicht alles zerschrumpfen.
  const uniqueSrcs = Array.from(new Set([...visualClips, ...audioClips].map((c) => c.src)))
    .filter((s) => !textPngSrcs.has(s));
  const srcDurMap = new Map<string, number>();
  await Promise.all(uniqueSrcs.map(async (s) => {
    try { srcDurMap.set(s, await getDuration(s)); }
    catch (e) { console.warn(`[editor-render] could not probe ${s}:`, (e as Error).message); }
  }));

  const cap = (c: EditorClipSpec): EditorClipSpec => {
    if (c.textPngPath) return c;  // Text-PNG: kein cap (geloopt via -loop 1)
    const srcDur = srcDurMap.get(c.src);
    // Skip wenn probe failed oder unrealistisch klein (< 0.5s = wahrscheinlich Quirk)
    if (!srcDur || srcDur < 0.5) return c;
    const speed = c.speed && c.speed > 0 ? c.speed : 1;
    const trimStart = c.trimStart ?? 0;
    const wantSourceEnd = trimStart + c.duration * speed;
    // Cap nur bei deutlicher Über-Extension (Toleranz: 1 Sekunde + 10% Headroom)
    const tolerance = Math.max(1, srcDur * 0.1);
    if (wantSourceEnd <= srcDur + tolerance) return c;
    const cappedDuration = Math.max(0.5, (srcDur - trimStart) / speed);
    console.log(`[editor-render] cap "${c.src.split('/').pop()}" duration ${c.duration.toFixed(2)}s → ${cappedDuration.toFixed(2)}s (source only ${srcDur.toFixed(2)}s, trim=${trimStart.toFixed(2)})`);
    return { ...c, duration: cappedDuration };
  };
  const cappedVisualClips = visualClips.map(cap);
  const cappedAudioClips  = audioClips.map(cap);

  // ─── Transitions: Pre-process Pairs (A→B) auf gleichem Track ─────────────
  // Pro Clip B mit transitionType: finde adjacenten A (auf gleichem Track,
  // dessen Ende B's Start trifft). Markiere beide mit Filter-Modifications.
  type ClipMod = {
    clipIdx: number;
    customVOut?: string;     // FFmpeg-Filter-Suffix für Transition-OUT (auf clip A)
    customVIn?: string;      // FFmpeg-Filter-Suffix für Transition-IN (auf clip B)
    customAOut?: string;     // Audio-Pendant
    customAIn?: string;
    enableStartShift?: number;  // B's enable-start D Sekunden früher (Overlap)
  };
  const visualMods = new Map<number, ClipMod>();
  const audioMods  = new Map<number, ClipMod>();

  const findClipIdx = (arr: EditorClipSpec[], target: EditorClipSpec): number =>
    arr.findIndex((c) => c === target);

  for (const b of cappedVisualClips) {
    if (!b.transitionType || !b.transitionDuration || b.transitionDuration <= 0) continue;
    const D = b.transitionDuration;
    // Finde adjacenten A: gleicher Track, A.end ≈ B.start (toleranz 0.5s für Drift)
    const a = cappedVisualClips.find((c) =>
      c !== b && c.trackIdx === b.trackIdx
      && Math.abs(c.start + c.duration - b.start) < 0.5,
    );
    if (!a) {
      console.warn(`[editor-render] transition ${b.transitionType} on ${b.src.split('/').pop()} skipped — no adjacent clip A on track ${b.trackIdx}`);
      continue;
    }
    console.log(`[editor-render] transition ${b.transitionType} d=${D}s: ${a.src.split('/').pop()} → ${b.src.split('/').pop()}`);

    const aIdx = findClipIdx(cappedVisualClips, a);
    const bIdx = findClipIdx(cappedVisualClips, b);
    const aMod: ClipMod = visualMods.get(aIdx) ?? { clipIdx: aIdx };
    const bMod: ClipMod = visualMods.get(bIdx) ?? { clipIdx: bIdx };

    // WICHTIG: Filter-Timings müssen ABSOLUTE PTS sein, weil setpts die Streams
    // zur Timeline-Position shiftet. fade=st=X und enable=between(t,X,Y) referenzieren
    // den absoluten PTS des Frames. Berechnung:
    //   outputStart_A = a.start (kein Shift für A)
    //   outputStart_B = b.start - D (B wird D Sekunden früher gerendert für Overlap)
    const oStartA = a.start;
    const oStartB = b.start - D;
    const aFadeOutAbs = oStartA + a.duration - D;  // A's letzte D Sekunden in PTS
    const aEndAbs     = oStartA + a.duration;
    switch (b.transitionType) {
      case 'cross':
      case 'non-additive':
        // A bleibt opaque, B fadet alpha-in über A. Clean alpha blend.
        bMod.customVIn = `,format=rgba,fade=t=in:st=${fmt(oStartB)}:d=${fmt(D)}:alpha=1`;
        bMod.enableStartShift = D;
        break;
      case 'additive':
        // Approximation via alpha-blend (echte addition bräuchte blend-filter).
        bMod.customVIn = `,format=rgba,fade=t=in:st=${fmt(oStartB)}:d=${fmt(D)}:alpha=1`;
        bMod.enableStartShift = D;
        break;
      case 'blur': {
        // EIN boxblur mit konstantem Radius während Overlap-Window — viel einfacher,
        // viel performanter, kein OOM-Risiko bei langen Clips. Stepped Ramp wäre nice,
        // aber mit mehreren chained boxblurs kann die filter-graph crashen.
        // Combined mit alpha-fade-in von B ergibt sich: blur+blend simultan.
        aMod.customVOut = `,boxblur=lr=10:lp=1:enable='between(t,${fmt(aFadeOutAbs)},${fmt(aEndAbs)})'`;
        const tBEnd = oStartB + D;
        bMod.customVIn =
          `,boxblur=lr=10:lp=1:enable='between(t,${fmt(oStartB)},${fmt(tBEnd)})'` +
          `,format=rgba,fade=t=in:st=${fmt(oStartB)}:d=${fmt(D)}:alpha=1`;
        bMod.enableStartShift = D;
        break;
      }
      case 'dip-to-color': {
        // Sequentiell: A fadet zu Farbe (D/2), B fadet von Farbe (D/2). Kein Overlap.
        const color = (b.transitionColor && /^#[0-9a-fA-F]{6}$/.test(b.transitionColor))
          ? b.transitionColor.replace('#', '0x')
          : 'black';
        const half = D / 2;
        aMod.customVOut = `,fade=t=out:st=${fmt(oStartA + a.duration - half)}:d=${fmt(half)}:color=${color}`;
        // B's outputStart is just b.start (no shift for dip-to-color)
        bMod.customVIn  = `,fade=t=in:st=${fmt(b.start)}:d=${fmt(half)}:color=${color}`;
        break;
      }
    }
    visualMods.set(aIdx, aMod);
    visualMods.set(bIdx, bMod);

    // Audio-Pendant: Crossfade via afade (für alle Typen außer dip-to-color
    // wo's hörbar wäre wenn man's sequentiell macht)
    const aAudioIdx = cappedAudioClips.findIndex((c) =>
      c.src === a.src && Math.abs(c.start - a.start) < 0.1 && c.trackIdx === a.trackIdx,
    );
    const bAudioIdx = cappedAudioClips.findIndex((c) =>
      c.src === b.src && Math.abs(c.start - b.start) < 0.1 && c.trackIdx === b.trackIdx,
    );
    if (aAudioIdx >= 0 && bAudioIdx >= 0) {
      const aAMod: ClipMod = audioMods.get(aAudioIdx) ?? { clipIdx: aAudioIdx };
      const bAMod: ClipMod = audioMods.get(bAudioIdx) ?? { clipIdx: bAudioIdx };
      const halfD = b.transitionType === 'dip-to-color' ? D / 2 : D;
      aAMod.customAOut = `,afade=t=out:st=${fmt(a.duration - halfD)}:d=${fmt(halfD)}`;
      bAMod.customAIn  = `,afade=t=in:st=0:d=${fmt(halfD)}`;
      audioMods.set(aAudioIdx, aAMod);
      audioMods.set(bAudioIdx, bAMod);
    }
  }

  const totalDur = [...cappedVisualClips, ...cappedAudioClips].reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  if (totalDur <= 0) throw new Error('renderEditorTimeline: zero duration');

  // Debug: zeige alle Clips + ihre source-Durations + chroma
  console.log(`[editor-render] DEBUG clips:`);
  for (const c of cappedVisualClips) {
    const sd = srcDurMap.get(c.src);
    const chroma = c.chromaEnabled ? ` CHROMA=${c.chromaColor ?? '?'} tol=${c.chromaTolerance ?? '?'}` : '';
    const op = c.opacity != null && c.opacity < 1 ? ` opacity=${c.opacity}` : '';
    const sp = c.speed != null && c.speed !== 1 ? ` speed=${c.speed}` : '';
    console.log(`  visual@track${c.trackIdx} start=${c.start.toFixed(2)} dur=${c.duration.toFixed(2)} trim=${(c.trimStart ?? 0).toFixed(2)} src=${c.src.split('/').pop()} (srcDur=${sd?.toFixed(2) ?? '?'})${chroma}${op}${sp}`);
  }
  for (const c of cappedAudioClips) {
    console.log(`  audio@track${c.trackIdx} start=${c.start.toFixed(2)} dur=${c.duration.toFixed(2)} src=${c.src.split('/').pop()} vol=${c.volume ?? 1}`);
  }
  console.log(`[editor-render] totalDur = ${totalDur.toFixed(2)}s`);

  // Inputs deduplizieren — gleicher src = ein -i (FFmpeg-Streams können mehrfach in filter_complex referenziert werden)
  const srcSet = Array.from(new Set([...visualClips, ...audioClips].map((c) => c.src)));
  const srcIdx = new Map<string, number>(srcSet.map((s, i) => [s, i]));

  // AI-Mask PNGs als zusätzliche Inputs anhängen. Map: visualClip-array-index → input-index
  const maskInputIdx = new Map<number, number>();
  let nextInputIdx = srcSet.length;
  for (let vi = 0; vi < cappedVisualClips.length; vi++) {
    const c = cappedVisualClips[vi];
    if (c.aiMaskPath) {
      maskInputIdx.set(vi, nextInputIdx);
      nextInputIdx++;
    }
  }

  const args: string[] = ['-y'];
  for (const s of srcSet) {
    if (textPngSrcs.has(s)) {
      // Text-PNG: als Loop-Image mit Output-fps und totalDur als Duration-Cap.
      args.push('-loop', '1', '-framerate', String(opts.fps), '-t', fmt(totalDur), '-i', s);
    } else {
      args.push('-i', s);
    }
  }
  // Mask-Inputs:
  // - Static: -loop 1 -i mask.png (constant frame)
  // - Per-Frame: -framerate <fps> -i mask_%04d.png (PNG-Sequenz mit Timing)
  for (let vi = 0; vi < cappedVisualClips.length; vi++) {
    const c = cappedVisualClips[vi];
    if (c.aiMaskPath) {
      if (c.aiMaskFps && c.aiMaskFps > 0) {
        args.push('-framerate', String(c.aiMaskFps), '-i', c.aiMaskPath);
      } else {
        args.push('-loop', '1', '-i', c.aiMaskPath);
      }
    }
  }

  // ─── Filter-Complex aufbauen ─────────────────────────────────────────────
  const W = opts.width, H = opts.height;
  const filters: string[] = [];

  // Base: black canvas in canvas-Größe und totalDur
  filters.push(`color=c=black:s=${W}x${H}:r=${opts.fps}:d=${fmt(totalDur)},format=yuv420p[bg]`);

  // Visuelle Clips → labels [v0], [v1], ...
  cappedVisualClips.forEach((c, i) => {
    const inIdx = srcIdx.get(c.src)!;
    const speed = c.speed && c.speed > 0 ? c.speed : 1;
    const trimStart = c.trimStart ?? 0;
    const trimEnd   = trimStart + c.duration * speed;
    const isBase    = c.trackKind === 'video' && c.trackIdx === 0;
    const isTextPng = !!c.textPngPath;
    // Transition-Overlap: clip's video-stream startet (clip.start - shift) im Output
    const shift = visualMods.get(i)?.enableStartShift ?? 0;
    const outputStart = Math.max(0, c.start - shift);

    // ─── Text-PNG: separater minimaler Pfad ──────────────────────────────
    // PNG ist schon in canvas-size + pre-positioned; wir trim+shift + opacity + fade.
    // Kein scale, kein color/effect/filter/chroma/ai-mask.
    if (isTextPng) {
      let tChain = `[${inIdx}:v]trim=start=0:end=${fmt(c.duration)},setpts=PTS-STARTPTS+${fmt(outputStart)}/TB,format=rgba`;
      const op = c.opacity ?? 1;
      if (op < 1) tChain += `,colorchannelmixer=aa=${fmt(op)}`;
      const fIn  = c.fadeInDuration  && c.fadeInDuration > 0  ? c.fadeInDuration  : 0;
      const fOut = c.fadeOutDuration && c.fadeOutDuration > 0 ? c.fadeOutDuration : 0;
      if (fIn > 0) {
        tChain += `,fade=t=in:st=${fmt(outputStart)}:d=${fmt(fIn)}:alpha=1`;
      }
      if (fOut > 0) {
        const fadeStart = outputStart + Math.max(0, c.duration - fOut);
        tChain += `,fade=t=out:st=${fmt(fadeStart)}:d=${fmt(fOut)}:alpha=1`;
      }
      tChain += `[v${i}]`;
      filters.push(tChain);
      return; // Done — text-PNG hat keine weiteren stages
    }

    // setpts: reset + speed + shift zur Timeline-Position. Dadurch matcht
    // overlay-filter's frame-by-PTS-Sync exakt das richtige Output-Fenster.
    let chain = `[${inIdx}:v]trim=start=${fmt(trimStart)}:end=${fmt(trimEnd)},setpts=(PTS-STARTPTS)/${fmt(speed)}+${fmt(outputStart)}/TB`;

    // Bildstabilisator (vidstab) — VOR scale, damit Pixel-Detect auf raw frames passt.
    // trf-Path wurde im IPC-Handler via Pre-Pass (vidstabdetect) erzeugt.
    if (c.stabilizeTrfPath) {
      const smoothing = Math.max(5, Math.min(30, c.stabilizeSmoothness ?? 10));
      // Escape colons im Pfad für FFmpeg-Filter-String
      const escapedTrf = c.stabilizeTrfPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      chain += `,vidstabtransform=input='${escapedTrf}':smoothing=${smoothing}:crop=keep:zoom=0:optzoom=1`;
      console.log(`[editor-render] stabilize ${c.src.split('/').pop()}: smoothing=${smoothing}`);
    }

    if (isBase) {
      // Track-0: fit canvas (object-contain), schwarze Letterbox + Lanczos für schärfste Skalierung
      chain += `,scale=${W}:${H}:force_original_aspect_ratio=decrease${SCALE_QUALITY_FLAGS},pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
    } else {
      // Overlay: scale auf scale*OVERLAY_BASE_WIDTH_FRAC der canvas-Breite, height proportional
      const overlayW = Math.max(2, Math.round(W * (c.scale ?? 1) * OVERLAY_BASE_WIDTH_FRAC));
      chain += `,scale=${overlayW}:-2${SCALE_QUALITY_FLAGS},setsar=1`;
      // Phase 2.4: Chroma-Key (Greenscreen) — VOR Opacity damit Alpha sauber bleibt
      if (c.chromaEnabled) {
        const color = chromaColorToFfmpeg(c.chromaColor);
        const tol   = Math.max(0.01, Math.min(1, c.chromaTolerance ?? 0.30));
        chain += `,format=rgba,chromakey=${color}:${fmt(tol)}:0.1`;
        console.log(`[editor-render] chroma applied to ${c.src.split('/').pop()}: color=${color} tolerance=${tol}`);
      }
      // Per-Clip Opacity (Base ignoriert, immer 100%)
      const op = c.opacity ?? 1;
      if (op < 1) {
        // Wenn schon rgba wegen chroma → nur colorchannelmixer; sonst format=rgba davor
        if (!c.chromaEnabled) chain += `,format=rgba`;
        chain += `,colorchannelmixer=aa=${fmt(op)}`;
      }
    }

    // Color-Adjustments via eq-Filter (FFmpeg). -1..+1 → eq-Format
    const br = c.brightness ?? 0;
    const co = c.contrast ?? 0;
    const sa = c.saturation ?? 0;
    if (br !== 0 || co !== 0 || sa !== 0) {
      // FFmpeg eq: brightness -1..1 direkt, contrast/saturation 0..2 mit 1=neutral
      chain += `,eq=brightness=${fmt(br)}:contrast=${fmt(1 + co)}:saturation=${fmt(1 + sa)}`;
    }

    // ─── Filter-Preset (Color-Grading) ──────────────────────
    // Werden vor Effects gestackt — Effects kommen später als „Look on top"
    if (c.filter) {
      const fStr = filterPresetToFfmpeg(c.filter);
      if (fStr) chain += fStr;
    }

    // ─── Custom LUT (3D LUT via lut3d-Filter) ───────────────
    // Wenn gesetzt überschreibt filter-preset (frontend setzt nur eines)
    if (c.lutPath) {
      // FFmpeg-LUT-Pfad muss mit forward-slashes + escape von ':' unter Windows
      const escaped = c.lutPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      chain += `,lut3d=file=${escaped}`;
    }

    // ─── Effects (Multi-Stack mit time-range) ──────────────
    // Neues Schema: effects-Array mit optional startSec/duration. Legacy single als Fallback.
    const effectList = (c.effects && c.effects.length > 0)
      ? c.effects
      : (c.effect ? [{ id: c.effect, intensity: c.effectIntensity ?? 1 }] : []);
    for (const eff of effectList) {
      const eStr = effectToFfmpeg(eff.id, eff.intensity ?? 1);
      if (!eStr) continue;
      // Time-Range zu absoluten PTS umrechnen (setpts hat Stream zu outputStart shifted)
      const effStartLocal = (eff as any).startSec ?? 0;
      const effDurLocal = (eff as any).duration ?? c.duration;
      const hasRange = (eff as any).startSec !== undefined || (eff as any).duration !== undefined;
      if (hasRange) {
        // FFmpeg `enable` Timeline-Editing für moderne Versionen — gblur/boxblur supportet's.
        // Crop/zoompan supportet's NICHT (hardware-Filter ohne timeline-aware).
        const absStart = outputStart + effStartLocal;
        const absEnd = absStart + effDurLocal;
        const SUPPORTS_ENABLE = ['eq', 'hue', 'colorbalance', 'noise', 'gblur', 'boxblur'];
        const filters = eStr.split(',').filter((f) => f.trim()).map((f) => {
          const filterName = f.split('=')[0].trim();
          if (SUPPORTS_ENABLE.includes(filterName)) {
            return `${f}:enable='between(t,${fmt(absStart)},${fmt(absEnd)})'`;
          }
          return f;  // crop/zoompan — laufen über ganzen clip (FFmpeg-Limitation)
        });
        chain += ',' + filters.join(',');
      } else {
        chain += eStr;
      }
    }

    // Phase 2.5: Fade-In/Out (alpha=1 = transparent fade, nicht zu schwarz).
    // st=X ist ABSOLUTE PTS (weil setpts die Stream-Timestamps shiftet).
    const fadeIn  = c.fadeInDuration  && c.fadeInDuration > 0  ? c.fadeInDuration  : 0;
    const fadeOut = c.fadeOutDuration && c.fadeOutDuration > 0 ? c.fadeOutDuration : 0;
    if (fadeIn > 0 || fadeOut > 0) {
      const alreadyRgba = c.chromaEnabled || (!isBase && (c.opacity ?? 1) < 1);
      if (!alreadyRgba) chain += `,format=rgba`;
      if (fadeIn > 0) {
        chain += `,fade=t=in:st=${fmt(outputStart)}:d=${fmt(fadeIn)}:alpha=1`;
      }
      if (fadeOut > 0) {
        const fadeStart = outputStart + Math.max(0, c.duration - fadeOut);
        chain += `,fade=t=out:st=${fmt(fadeStart)}:d=${fmt(fadeOut)}:alpha=1`;
      }
    }

    // Transition-Mods (in/out) — überschreiben/ergänzen pro-clip-Fades
    const mod = visualMods.get(i);
    if (mod?.customVOut) chain += mod.customVOut;
    if (mod?.customVIn)  chain += mod.customVIn;

    // AI Mask: alphamerge mit gescalter Mask-PNG. Apply AM ENDE der Chain damit
    // Mask auf das final-positionierte Visual angewandt wird.
    if (c.aiMaskPath) {
      const maskIdx = maskInputIdx.get(i)!;
      // Sorge dafür dass die clip-chain in rgba endet (für alphamerge)
      chain += `,format=rgba[pre_v${i}]`;
      filters.push(chain);
      let maskRef = `${maskIdx}:v`;
      if (c.aiMaskFps && c.aiMaskFps > 0) {
        // Per-Frame-Sequenz: Mask-Stream zur Output-Position shiften (analog visual setpts)
        // damit alphamerge frame-by-frame matcht. Plus speed-Anpassung wenn Clip-Speed != 1.
        // tpad=stop_mode=clone hält das letzte Frame, falls Mask-Sequenz kürzer als Clip
        // (z.B. User hat nur 5s von 10s getrackt) — verhindert undefined-behavior bei alphamerge.
        const holdDur = Math.max(c.duration + 2, 1);
        filters.push(
          `[${maskIdx}:v]setpts=(PTS-STARTPTS)/${fmt(speed)}+${fmt(outputStart)}/TB,`
          + `tpad=stop_mode=clone:stop_duration=${fmt(holdDur)}[mask_in_${i}]`,
        );
        maskRef = `mask_in_${i}`;
      }
      // scale2ref ohne Params: scale source (mask) zu ref (clip) dims; clip durchgereicht
      filters.push(`[${maskRef}][pre_v${i}]scale2ref[mask_${i}][clip_${i}]`);
      // mask in gray umwandeln damit alphamerge sauber luma extrahiert
      filters.push(`[mask_${i}]format=gray[mask_g_${i}]`);
      // alphamerge: clip + mask-luma → RGBA mit mask als alpha
      filters.push(`[clip_${i}][mask_g_${i}]alphamerge[v${i}]`);
    } else {
      chain += `[v${i}]`;
      filters.push(chain);
    }
  });

  // Compositing-Pyramide: pro Clip entweder klassisches alpha-overlay (Default)
  //   oder split→blend→alphamerge→overlay (wenn blendMode supported und !isBase).
  let stage = '[bg]';
  cappedVisualClips.forEach((c, i) => {
    const isBase = c.trackKind === 'video' && c.trackIdx === 0;
    const isTextPng = !!c.textPngPath;
    if (isBase && c.blendMode && c.blendMode !== 'normal') {
      console.log(`[editor-render] base clip blendMode='${c.blendMode}' ignoriert — Base wird immer normal compositied`);
    }
    let ffMode: string | null = null;
    if (!isBase && !isTextPng && c.blendMode && c.blendMode !== 'normal') {
      ffMode = blendModeToFfmpeg(c.blendMode);
      if (!ffMode) {
        console.warn(`[editor-render] blendMode='${c.blendMode}' (HSL) — keine FFmpeg-Entsprechung, fallback auf overlay`);
      }
    }

    const shift = visualMods.get(i)?.enableStartShift ?? 0;
    const enableStart = Math.max(0, c.start - shift);
    const enable = `between(t,${fmt(enableStart)},${fmt(c.start + c.duration)})`;
    const next = (i === cappedVisualClips.length - 1) ? '[vout]' : `[s${i}]`;

    // Text-PNG: full-canvas overlay (PNG ist schon transparent positioniert) → x=0,y=0
    if (isTextPng) {
      filters.push(`${stage}[v${i}]overlay=x=0:y=0:enable='${enable}':eof_action=pass${next}`);
      stage = next;
      return;
    }

    if (ffMode) {
      console.log(`[editor-render] blend clip[${i}] mode='${c.blendMode}' → blend=all_mode=${ffMode}`);
      // Blend-Pipeline (alpha-präzise via explicit alphaextract/alphamerge):
      //  1. Layer scale + format=rgba + pad zu canvas-size (transparent fill für pad-area).
      //     split→ einer für blend (RGB), einer für alphaextract (output-alpha-mask).
      //  2. Stage split→ eine Kopie zu rgba für blend-input, eine als passthrough-base.
      //  3. blend macht nur RGB-Operation (Alpha-Channels unbeachtet) → blendedRGB.
      //  4. alphamerge: blendedRGB + layer-alpha → blendedRGBA (transparent in pad-area).
      //  5. overlay back auf passthrough-stage: alpha-aware → pad-Bereich (alpha=0) bleibt
      //     stage durch. enable=time-range schaltet den Effekt zeitlich.
      const cx = W / 2 + (c.posX ?? 0) * W * POS_RANGE_FRAC;
      const cy = H / 2 + (c.posY ?? 0) * H * POS_RANGE_FRAC;

      // 1) Layer canvas-pad + split für alpha-extract
      filters.push(
        `[v${i}]format=rgba,pad=${W}:${H}:'(${fmt(cx)})-iw/2':'(${fmt(cy)})-ih/2':color=black@0,split=2[v${i}_layer][v${i}_layer_alpha_src]`,
      );
      filters.push(`[v${i}_layer_alpha_src]alphaextract[v${i}_alpha]`);

      // 2-5) Stage split + format → blend → alphamerge → overlay
      const sa = `s${i}_a`, sb = `s${i}_b`, srgba = `s${i}_rgba`;
      const bldRgb = `bld${i}_rgb`, bldRgba = `bld${i}_rgba`;
      filters.push(`${stage}split=2[${sa}][${sb}]`);
      filters.push(`[${sa}]format=rgba[${srgba}]`);
      filters.push(`[${srgba}][v${i}_layer]blend=all_mode=${ffMode}[${bldRgb}]`);
      filters.push(`[${bldRgb}][v${i}_alpha]alphamerge[${bldRgba}]`);
      filters.push(`[${sb}][${bldRgba}]overlay=enable='${enable}':eof_action=pass:format=auto${next}`);
    } else {
      // Default overlay-Branch (alpha-compositing).
      let x: string, y: string;
      if (isBase) {
        // Base: füllt canvas, top-left = 0,0 (scale-to-fit hat schon zentriert)
        x = '0';
        y = '0';
      } else {
        // Overlay: zentriert um (W/2 + posX*W*0.4, H/2 + posY*H*0.4) minus halbe Overlay-Größe
        const overlayW = Math.max(2, Math.round(W * (c.scale ?? 1) * OVERLAY_BASE_WIDTH_FRAC));
        const cx = W / 2 + (c.posX ?? 0) * W * POS_RANGE_FRAC;
        const cy = H / 2 + (c.posY ?? 0) * H * POS_RANGE_FRAC;
        x = fmt(cx - overlayW / 2);
        y = `(${fmt(cy)})-overlay_h/2`;
      }
      filters.push(`${stage}[v${i}]overlay=x=${x}:y=${y}:enable='${enable}':eof_action=pass${next}`);
    }
    stage = next;
  });

  // ─── Audio-Mix ────────────────────────────────────────────────────────────
  const audioLabels: string[] = [];
  cappedAudioClips.forEach((c, i) => {
    const inIdx = srcIdx.get(c.src)!;
    const speed = c.speed && c.speed > 0 ? c.speed : 1;
    const trimStart = c.trimStart ?? 0;
    const trimEnd   = trimStart + c.duration * speed;
    const startMs   = Math.round(c.start * 1000);
    const vol       = c.volume ?? 1;

    let chain = `[${inIdx}:a]atrim=start=${fmt(trimStart)}:end=${fmt(trimEnd)},asetpts=PTS-STARTPTS`;
    // Speed (Phase 2.3) via atempo-Chain (atempo unterstützt nur 0.5..2.0 pro Instance)
    chain += atempoChain(speed);
    // Phase 2.5: Audio fade-in/out (afade) BEVOR adelay damit Timing relative zum clip ist
    const aFadeIn  = c.fadeInDuration  && c.fadeInDuration > 0  ? c.fadeInDuration  : 0;
    const aFadeOut = c.fadeOutDuration && c.fadeOutDuration > 0 ? c.fadeOutDuration : 0;
    if (aFadeIn > 0)  chain += `,afade=t=in:st=0:d=${fmt(aFadeIn)}`;
    if (aFadeOut > 0) {
      const fadeStart = Math.max(0, c.duration - aFadeOut);
      chain += `,afade=t=out:st=${fmt(fadeStart)}:d=${fmt(aFadeOut)}`;
    }
    // Audio-Transition-Mods (überschreiben/ergänzen die per-clip Fades)
    const aMod = audioMods.get(i);
    if (aMod?.customAOut) chain += aMod.customAOut;
    if (aMod?.customAIn)  chain += aMod.customAIn;
    if (startMs > 0) {
      chain += `,adelay=${startMs}|${startMs}`;
    }
    if (vol !== 1) {
      chain += `,volume=${fmt(vol)}`;
    }
    chain += `[a${i}]`;
    filters.push(chain);
    audioLabels.push(`[a${i}]`);
  });

  // amix wenn mehrere Audio-Quellen, sonst direkter pass-through
  let audioMap = '';
  if (audioLabels.length === 1) {
    audioMap = audioLabels[0];
  } else if (audioLabels.length > 1) {
    filters.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0,aresample=async=1[aout]`);
    audioMap = '[aout]';
  }

  args.push('-filter_complex', filters.join(';'));
  args.push('-map', '[vout]');
  if (audioMap) args.push('-map', audioMap);

  args.push('-c:v', videoEncoder(), ...encoderExtraArgs());
  if (opts.bitrate) args.push('-b:v', opts.bitrate);
  args.push('-r', String(opts.fps));
  args.push('-pix_fmt', 'yuv420p');
  if (audioMap) args.push('-c:a', 'aac', '-b:a', '192k');
  args.push('-movflags', '+faststart');
  args.push('-t', fmt(totalDur));  // truncate falls overlays länger laufen
  args.push(output);

  console.log(`[editor-render] ${cappedVisualClips.length} visual + ${cappedAudioClips.length} audio clips → ${W}x${H}@${opts.fps} ${opts.bitrate} (${fmt(totalDur)}s)`);
  await runFfmpeg(args, { expectedDuration: totalDur });
  console.log(`[editor-render] done → ${output}`);
}
