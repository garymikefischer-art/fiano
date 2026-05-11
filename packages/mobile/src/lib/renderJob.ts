/**
 * Cloud-Render-Client (Phase 9.6.1.5) — Mobile → R2 + Worker via HTTPS.
 *
 * 2-Step Flow weil Source-Videos oft >100 MB sind:
 *   1. POST /v1/upload-url an Worker → bekommt pre-signed R2-PUT-URL
 *   2. PUT source.mp4 direkt zu R2 (kein Worker-Hop, Cloudflare Egress free)
 *   3. POST /v1/render an Worker mit sourceKey
 *   4. Worker rendert (FFmpeg auf Cloud Run) → upload Result zu R2
 *   5. Worker returnt pre-signed Download-URL
 *   6. Mobile lädt Result direct von R2
 *
 * Vorteil ggü. proxy-upload: R2 hat unlimited free Egress, Cloud Run hat
 * 32 MiB Request-Size-Limit. Direct-Upload zu R2 umgeht beides.
 */

import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { ENV } from './env';

export interface RenderJobOpts {
  sourceUri: string;
  /** FFmpeg-Args mit `{SRC}` und `{DST}` als Platzhalter. */
  args: string[];
  projectId: string;
  outputName?: string;
  onUploadProgress?: (frac: number) => void;
}

export interface RenderJobResult {
  /** Lokales Result-Video (file:// in documentDirectory/exports/). */
  localUri: string;
  jobId: string;
  durationMs: number;
  sizeBytes: number;
}

export async function runRenderJob(opts: RenderJobOpts): Promise<RenderJobResult> {
  // Debug-Log damit User in Metro-Console sieht was tatsächlich ankommt.
  console.log(
    `[renderJob] RENDER_WORKER_URL = "${ENV.RENDER_WORKER_URL}" (len=${ENV.RENDER_WORKER_URL.length})`,
  );

  if (!ENV.RENDER_WORKER_URL) {
    throw new Error(
      'Cloud-Render nicht konfiguriert (EXPO_PUBLIC_RENDER_WORKER_URL fehlt). ' +
      'Siehe services/render-worker/README.md für Setup.',
    );
  }

  // Validiere URL-Format um klare Errors zu geben statt fetch-internal "invalid URL".
  let base: string;
  try {
    const u = new URL(ENV.RENDER_WORKER_URL);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      throw new Error('protocol must be http/https');
    }
    base = `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, '')}`;
  } catch (e) {
    throw new Error(
      `RENDER_WORKER_URL ist ungültig: "${ENV.RENDER_WORKER_URL}" ` +
      `(${e instanceof Error ? e.message : 'unbekannter Fehler'}). ` +
      'Prüfe packages/mobile/.env — die Zeile muss auf eigener Zeile stehen + mit https:// anfangen.',
    );
  }

  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error('Nicht eingeloggt — Login zuerst.');
  const token = session.session.access_token;

  // ─── 1. Pre-Signed Upload-URL holen ───────────────────────────────
  opts.onUploadProgress?.(0);
  const urlRes = await fetch(`${base}/v1/upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ projectId: opts.projectId }),
  });
  if (!urlRes.ok) {
    const msg = await safeErrorMessage(urlRes);
    throw new Error(`upload-url failed: ${msg}`);
  }
  const urlBody = (await urlRes.json()) as {
    uploadUrl: string;
    sourceKey: string;
  };

  // ─── 2. Source direkt zu R2 PUTten ────────────────────────────────
  const uploadTask = FileSystem.createUploadTask(
    urlBody.uploadUrl,
    opts.sourceUri,
    {
      httpMethod: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    },
    (p) => {
      if (p.totalBytesExpectedToSend > 0) {
        opts.onUploadProgress?.(p.totalBytesSent / p.totalBytesExpectedToSend);
      }
    },
  );
  const upRes = await uploadTask.uploadAsync();
  if (!upRes || upRes.status >= 300) {
    throw new Error(`R2 upload failed: HTTP ${upRes?.status ?? '?'}`);
  }
  opts.onUploadProgress?.(1);

  // ─── 3. Render-Request ────────────────────────────────────────────
  const renderRes = await fetch(`${base}/v1/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      sourceKey: urlBody.sourceKey,
      args: opts.args,
      projectId: opts.projectId,
      outputName: opts.outputName ?? `${Date.now()}.mp4`,
    }),
  });
  if (!renderRes.ok) {
    const msg = await safeErrorMessage(renderRes);
    throw new Error(`render failed: ${msg}`);
  }
  const renderBody = (await renderRes.json()) as {
    ok: boolean;
    jobId: string;
    outputKey: string;
    signedUrl: string;
    durationMs: number;
    sizeBytes: number;
    error?: string;
  };
  if (!renderBody.ok) throw new Error(renderBody.error ?? 'render failed');

  // ─── 4. Result von R2 herunterladen ───────────────────────────────
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
    sizeBytes: renderBody.sizeBytes,
  };
}

async function safeErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
