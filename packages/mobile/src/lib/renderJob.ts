/**
 * Cloud-Render-Client (Phase 9.6.4+) — Multi-Input Pipeline.
 *
 * Flow:
 *   1. Pro File: POST /v1/upload-url mit { kind, index? } → bekommt pre-signed
 *      R2-PUT-URL + Key.
 *   2. PUT File direkt zu R2.
 *   3. POST /v1/render mit { inputs: {source, intro?, music?, voiceOvers?}, args }
 *      Args enthalten Platzhalter {SRC}, {INTRO}, {MUSIC_N}, {VO_N}.
 *   4. Worker rendert → returnt signed Download-URL.
 *   5. Mobile downloaded Result von R2.
 */

import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { ENV } from './env';
import { validateAssContent } from '@fiano/shared';

export interface RenderJobInputs {
  /** Single-Source (legacy / Single-File-Import / URL-Import). */
  sourceUri?: string;
  /** Multi-Clip (Phase 9.5.8). Wenn >= 2 → concat-Pipeline auf Server. */
  sourceUris?: string[];
  introUri?: string;
  musicUris?: string[];
  voiceOverUris?: string[];
  /** Phase 9.6.7h: roher .ass-Text für libass-Burn-In. Wird in eine temp-Datei
   *  geschrieben und als 'subtitle'-kind hochgeladen. Worker ersetzt {ASS}-
   *  Platzhalter im filter_complex mit dem tmp-Pfad. */
  assContent?: string;
  /** Phase C5 (2026-05-19): Watermark-Image-URI. Wird als 'watermark'-kind
   *  hochgeladen + via filter_complex overlay angewendet. */
  watermarkUri?: string;
}

export interface RenderJobOpts {
  inputs: RenderJobInputs;
  /** Phase A6.4 (2026-05-18): typed RenderSpec — Worker baut args[] selber.
   *  Alle Felder sicher validiert + geclampt → keine FFmpeg-Argument-Injection
   *  mehr möglich (SECURITY_AUDIT P0-3 fix). */
  spec: ClientRenderSpec;
  projectId: string;
  outputName?: string;
  onUploadProgress?: (frac: number) => void;
}

/**
 * ClientRenderSpec — was Mobile an Worker schickt. Worker validiert
 * + baut args[] intern via shared/ffmpegArgs.ts.
 */
export interface ClientRenderSpec {
  width: number;
  height: number;
  fps: number;
  bitrate: string;
  encoder: 'software' | 'hardware';
  layout: 'stacked' | 'split' | 'full';
  facecamRegion: { x: number; y: number; w: number; h: number };
  gameplayRegion: { x: number; y: number; w: number; h: number };
  splitRatio?: number;
  fullOffsetX?: number;
  trimStart?: number;
  trimEnd?: number;
  sourceAudioVolume?: number;
  music?: { volume: number }[];
  voiceOvers?: { startSec: number; volume: number; autoDuck?: boolean }[];
  subtitle?: {
    useAss: boolean;
    text?: string;
    cues?: { startSec: number; endSec: number; text: string }[];
    fontSize?: number;
    color?: string;
    strokeColor?: string;
    strokeWidth?: number;
    position?: 'top' | 'center' | 'bottom' | number;
    uppercase?: boolean;
  };
  intro?: {
    mode?: 'before' | 'overlay';
    scale?: number;
    x?: number;
    y?: number;
    durationSec?: number;
    chromakey?: { color?: string; similarity?: number; blend?: number };
  };
  clips?: { src?: number; startSec: number; endSec: number }[];
  /** Phase C1.B (2026-05-19): Color-Grade Effects. Worker clampt server-side
   *  (eq + unsharp + tmix). Felder spiegeln ClipEffects aus demoProjects.ts. */
  effects?: {
    brightness?: number;
    contrast?: number;
    saturation?: number;
    sharpen?: number;
    motionBlur?: 'off' | 'low' | 'medium' | 'high';
    colorWheels?: {
      liftR?: number; liftG?: number; liftB?: number;
      gammaR?: number; gammaG?: number; gammaB?: number;
      gainR?: number; gainG?: number; gainB?: number;
    };
  };
  /** Phase C5 (2026-05-19): Watermark-Overlay (path wird vom Worker resolved). */
  watermark?: {
    position: 'tl' | 'tr' | 'bl' | 'br';
    opacity: number;
    scale: number;
  };
}

export interface RenderJobResult {
  localUri: string;
  jobId: string;
  durationMs: number;
}

export async function runRenderJob(opts: RenderJobOpts): Promise<RenderJobResult> {
  if (!ENV.RENDER_WORKER_URL) {
    throw new Error(
      'Cloud-Render nicht konfiguriert (EXPO_PUBLIC_RENDER_WORKER_URL fehlt).',
    );
  }

  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error('Nicht eingeloggt — Login zuerst.');
  const token = session.session.access_token;
  const base = ENV.RENDER_WORKER_URL.trim().replace(/\/+$/, '');

  // Resolve sources: sourceUris[] hat Vorrang, fallback auf single sourceUri.
  const sourceUris: string[] =
    opts.inputs.sourceUris && opts.inputs.sourceUris.length > 0
      ? opts.inputs.sourceUris
      : opts.inputs.sourceUri
        ? [opts.inputs.sourceUri]
        : [];
  if (sourceUris.length === 0) {
    throw new Error('No source files — sourceUri or sourceUris required');
  }

  // ─── Anzahl Files für Progress-Tracking ────────────────────────────
  const hasAss = !!opts.inputs.assContent && opts.inputs.assContent.length > 0;
  const totalFiles =
    sourceUris.length +
    (opts.inputs.introUri ? 1 : 0) +
    (opts.inputs.musicUris?.length ?? 0) +
    (opts.inputs.voiceOverUris?.length ?? 0) +
    (hasAss ? 1 : 0);
  let filesUploaded = 0;
  const reportProgress = (fileProgress: number) => {
    const overall = (filesUploaded + fileProgress) / totalFiles;
    opts.onUploadProgress?.(overall);
  };

  const uploadOne = async (
    localUri: string,
    kind: 'source' | 'intro' | 'music' | 'voice-over' | 'subtitle' | 'watermark',
    index?: number,
  ): Promise<string> => {
    // 1. Signed Upload-URL holen
    const urlRes = await fetch(`${base}/v1/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ projectId: opts.projectId, kind, index }),
    });
    if (!urlRes.ok) {
      const body = await urlRes.json().catch(() => ({}));
      throw new Error(
        `upload-url (${kind}${index !== undefined ? `[${index}]` : ''}) failed: ${body.error ?? `HTTP ${urlRes.status}`}`,
      );
    }
    const { uploadUrl, key } = (await urlRes.json()) as { uploadUrl: string; key: string };

    // 2. PUT zu R2
    const task = FileSystem.createUploadTask(
      uploadUrl,
      localUri,
      {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      },
      (p) => {
        if (p.totalBytesExpectedToSend > 0) {
          reportProgress(p.totalBytesSent / p.totalBytesExpectedToSend);
        }
      },
    );
    const upRes = await task.uploadAsync();
    if (!upRes || upRes.status >= 300) {
      throw new Error(
        `R2 upload (${kind}) failed: HTTP ${upRes?.status ?? '?'} — ${upRes?.body?.slice(0, 200) ?? ''}`,
      );
    }
    filesUploaded++;
    reportProgress(0);
    return key;
  };

  opts.onUploadProgress?.(0);

  // ─── Parallele Uploads aller Inputs ────────────────────────────────
  // explicitSources: wahr wenn caller `sourceUris[]` (Builder-Phase) explizit
  // gesetzt hat. Dann sendet client `sources[]` (auch length=1), Server nutzt
  // {SRC_0} statt {SRC}. Single-source-9:16 läuft den legacy-Pfad mit {SRC}.
  const explicitSources = !!opts.inputs.sourceUris && opts.inputs.sourceUris.length >= 1;
  const sourceKeys: string[] = [];
  for (let i = 0; i < sourceUris.length; i++) {
    const idx = explicitSources || sourceUris.length > 1 ? i : undefined;
    sourceKeys.push(await uploadOne(sourceUris[i], 'source', idx));
  }
  const introKey = opts.inputs.introUri
    ? await uploadOne(opts.inputs.introUri, 'intro')
    : undefined;
  const musicKeys: string[] = [];
  if (opts.inputs.musicUris?.length) {
    for (let i = 0; i < opts.inputs.musicUris.length; i++) {
      musicKeys.push(await uploadOne(opts.inputs.musicUris[i], 'music', i));
    }
  }
  const voKeys: string[] = [];
  if (opts.inputs.voiceOverUris?.length) {
    for (let i = 0; i < opts.inputs.voiceOverUris.length; i++) {
      voKeys.push(await uploadOne(opts.inputs.voiceOverUris[i], 'voice-over', i));
    }
  }

  // Phase 9.6.7h: .ass-Text in temp-Datei schreiben + als 'subtitle'-kind uploaden.
  // Phase A6.2 (2026-05-18): validateAssContent VOR dem Upload — verhindert
  // dass libass-DoS-Inputs (oversized, embedded fonts, drawing-mode, capped
  // override-values) je den Worker erreichen. Defense-in-depth: Worker
  // validiert auch nach Download, aber Mobile-side fail-fast spart Roundtrip.
  // Phase C5 (2026-05-19): Watermark-Image als 'watermark'-kind hochladen.
  let watermarkKey: string | undefined;
  if (opts.inputs.watermarkUri) {
    watermarkKey = await uploadOne(opts.inputs.watermarkUri, 'watermark');
  }

  let subtitleKey: string | undefined;
  if (hasAss) {
    const validation = validateAssContent(opts.inputs.assContent!);
    if (!validation.ok) {
      throw new Error(`Subtitle (.ass) validation failed: ${validation.reason}`);
    }
    const assTmp = `${FileSystem.cacheDirectory}render-${Date.now()}.ass`;
    await FileSystem.writeAsStringAsync(assTmp, validation.sanitized, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    subtitleKey = await uploadOne(assTmp, 'subtitle');
    // tmp-File kann nach Upload weg.
    await FileSystem.deleteAsync(assTmp, { idempotent: true });
  }

  opts.onUploadProgress?.(1);

  // ─── Render-Request ──────────────────────────────────────────────────
  // Phase A6.4 (2026-05-18): spec statt args. Worker validiert + baut
  // args[] selber. Kein client-controlled FFmpeg-flag mehr.
  const renderRes = await fetch(`${base}/v1/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      inputs: {
        // Wenn caller `sourceUris[]` explizit gesetzt hat → sources[] (auch
        // length=1, für Builder per-source-trim). Sonst legacy `source` single.
        source: !explicitSources && sourceKeys.length === 1 ? sourceKeys[0] : undefined,
        sources: explicitSources || sourceKeys.length > 1 ? sourceKeys : undefined,
        intro: introKey,
        music: musicKeys.length > 0 ? musicKeys : undefined,
        voiceOvers: voKeys.length > 0 ? voKeys : undefined,
        subtitle: subtitleKey,
        watermark: watermarkKey,
      },
      spec: opts.spec,
      projectId: opts.projectId,
      outputName: opts.outputName ?? `${Date.now()}.mp4`,
    }),
  });
  if (!renderRes.ok) {
    const body = await renderRes.json().catch(() => ({}));
    // Phase A6.3 (2026-05-18): 402 = Plan-Limit erreicht (Server-Enforcement).
    // ExportScreen erkennt PlanLimitError und zeigt UpgradeModal statt
    // generischer Fehlermeldung.
    if (renderRes.status === 402) {
      const err = new Error(body.error ?? 'plan_limit_reached') as Error & {
        isPlanLimit: true;
        planLimit: {
          reason: string;
          plan: string | null;
          renderCount?: number;
          monthlyLimit?: number;
          requestedResolution?: string;
        };
      };
      err.isPlanLimit = true;
      err.planLimit = {
        reason: body.reason ?? 'unknown',
        plan: body.plan ?? null,
        renderCount: body.renderCount,
        monthlyLimit: body.monthlyLimit,
        requestedResolution: body.requestedResolution,
      };
      throw err;
    }
    throw new Error(`render failed: ${body.error ?? `HTTP ${renderRes.status}`}`);
  }
  const renderBody = (await renderRes.json()) as {
    ok: boolean;
    jobId: string;
    outputKey: string;
    signedUrl: string;
    durationMs: number;
    error?: string;
  };
  if (!renderBody.ok) throw new Error(renderBody.error ?? 'render failed');

  // ─── Result von R2 herunterladen ────────────────────────────────────
  const exportsDir = `${FileSystem.documentDirectory}exports/`;
  const dirInfo = await FileSystem.getInfoAsync(exportsDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(exportsDir, { intermediates: true });
  }
  const localUri = `${exportsDir}${renderBody.jobId}.mp4`;
  const dl = await FileSystem.downloadAsync(renderBody.signedUrl, localUri);
  if (dl.status !== 200) {
    throw new Error(`download failed: HTTP ${dl.status}`);
  }

  return {
    localUri,
    jobId: renderBody.jobId,
    durationMs: renderBody.durationMs,
  };
}
