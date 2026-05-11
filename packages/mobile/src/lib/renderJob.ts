/**
 * Cloud-Render-Client (Phase 9.6.1) — Mobile → Render-Worker via HTTPS.
 *
 * Flow:
 *   1. Source-Video lokal → Supabase Storage Bucket hochladen (chunked upload
 *      via Storage-API).
 *   2. POST /v1/render an Cloud Run mit { sourceKey, args, projectId }.
 *      Auth via Supabase-Session-Token.
 *   3. Worker rendert → returnt signed-URL.
 *   4. signed-URL via FileSystem.downloadAsync nach documentDirectory ziehen.
 *   5. Optional: in Camera-Roll speichern via expo-media-library.
 *
 * Args müssen `{SRC}` und `{DST}` als Platzhalter enthalten — Server-Side
 * werden die durch tmp-Pfade ersetzt (verhindert dass Mobile beliebige
 * Server-Paths setzen kann).
 *
 * Progress-Reporting: aktuell Sync-Request (Express blockt bis FFmpeg fertig).
 * Bei langen Renders (>30s) ggf. später auf Queue-System wechseln (z.B.
 * Supabase Queues + Polling-Endpoint).
 */

import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { ENV } from './env';

const SOURCE_BUCKET = 'source-uploads';

export interface RenderJobOpts {
  /** Lokales Source-Video (file:// URI). Wird zur Cloud hochgeladen. */
  sourceUri: string;
  /** FFmpeg-Args mit {SRC} und {DST} als Platzhalter. */
  args: string[];
  /** Project-ID — wird Teil des Storage-Keys: ${userId}/${projectId}/${file}. */
  projectId: string;
  /** Optional: Dateiname für Result. Default: timestamp.mp4. */
  outputName?: string;
  /** Progress-Hook 0..1 für Upload-Phase (Server-Render-Progress kommt später). */
  onUploadProgress?: (frac: number) => void;
}

export interface RenderJobResult {
  /** Lokales Result-Video (file:// URI in documentDirectory/exports/). */
  localUri: string;
  /** Server-side Job-ID für Logs. */
  jobId: string;
  /** Server-Render-Dauer in ms. */
  durationMs: number;
  /** Resultat-Dateigröße in Bytes. */
  sizeBytes: number;
}

export async function runRenderJob(opts: RenderJobOpts): Promise<RenderJobResult> {
  if (!ENV.RENDER_WORKER_URL) {
    throw new Error(
      'Cloud-Render nicht konfiguriert (EXPO_PUBLIC_RENDER_WORKER_URL fehlt). ' +
      'Siehe services/render-worker/README.md für Setup.',
    );
  }

  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error('Nicht eingeloggt — Login zuerst.');
  }
  const userId = session.session.user.id;
  const token = session.session.access_token;

  // 1. Source hochladen.
  opts.onUploadProgress?.(0);
  const sourceKey = `${userId}/${opts.projectId}/source-${Date.now()}.mp4`;
  await uploadToSupabase(opts.sourceUri, sourceKey, opts.onUploadProgress);
  opts.onUploadProgress?.(1);

  // 2. Render-Request senden.
  const endpoint = `${ENV.RENDER_WORKER_URL.replace(/\/$/, '')}/v1/render`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      sourceKey,
      args: opts.args,
      projectId: opts.projectId,
      outputName: opts.outputName ?? `${Date.now()}.mp4`,
    }),
  });

  if (!res.ok) {
    let msg = `render request failed (${res.status})`;
    try {
      const body = await res.json();
      msg = body.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const body = (await res.json()) as {
    ok: boolean;
    jobId: string;
    outputKey: string;
    signedUrl: string;
    durationMs: number;
    sizeBytes: number;
    error?: string;
  };
  if (!body.ok) throw new Error(body.error ?? 'render failed');

  // 3. Result herunterladen.
  const exportsDir = `${FileSystem.documentDirectory}exports/`;
  const dirInfo = await FileSystem.getInfoAsync(exportsDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(exportsDir, { intermediates: true });
  }
  const localUri = `${exportsDir}${body.jobId}.mp4`;

  const dl = await FileSystem.downloadAsync(body.signedUrl, localUri);
  if (dl.status !== 200) {
    throw new Error(`download failed: HTTP ${dl.status}`);
  }

  return {
    localUri,
    jobId: body.jobId,
    durationMs: body.durationMs,
    sizeBytes: body.sizeBytes,
  };
}

/**
 * Upload eines lokalen file:// URI zu Supabase Storage.
 *
 * Wir nutzen FileSystem.uploadAsync mit POST + multipart (Supabase's REST-Upload-
 * Endpoint). supabase-js' storage.upload() liest das File in Memory, das ist bei
 * großen Videos (>100MB) RAM-grenzwertig — daher direkter HTTP-Upload.
 */
async function uploadToSupabase(
  localUri: string,
  storageKey: string,
  onProgress?: (frac: number) => void,
): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error('Nicht eingeloggt.');

  const uploadUrl = `${ENV.SUPABASE_URL}/storage/v1/object/${SOURCE_BUCKET}/${storageKey}`;

  const task = FileSystem.createUploadTask(
    uploadUrl,
    localUri,
    {
      httpMethod: 'POST',
      headers: {
        Authorization: `Bearer ${session.session.access_token}`,
        'x-upsert': 'true',
        'Content-Type': 'video/mp4',
      },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    },
    (p) => {
      if (p.totalBytesExpectedToSend > 0) {
        onProgress?.(p.totalBytesSent / p.totalBytesExpectedToSend);
      }
    },
  );

  const result = await task.uploadAsync();
  if (!result || result.status >= 300) {
    throw new Error(`source upload failed: HTTP ${result?.status ?? '?'}`);
  }
}
