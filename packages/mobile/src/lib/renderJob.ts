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

export interface RenderJobInputs {
  sourceUri: string;
  introUri?: string;
  musicUris?: string[];
  voiceOverUris?: string[];
}

export interface RenderJobOpts {
  inputs: RenderJobInputs;
  args: string[];
  projectId: string;
  outputName?: string;
  onUploadProgress?: (frac: number) => void;
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

  // ─── Anzahl Files für Progress-Tracking ────────────────────────────
  const totalFiles =
    1 +
    (opts.inputs.introUri ? 1 : 0) +
    (opts.inputs.musicUris?.length ?? 0) +
    (opts.inputs.voiceOverUris?.length ?? 0);
  let filesUploaded = 0;
  const reportProgress = (fileProgress: number) => {
    const overall = (filesUploaded + fileProgress) / totalFiles;
    opts.onUploadProgress?.(overall);
  };

  const uploadOne = async (
    localUri: string,
    kind: 'source' | 'intro' | 'music' | 'voice-over',
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
  const sourceKey = await uploadOne(opts.inputs.sourceUri, 'source');
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

  opts.onUploadProgress?.(1);

  // ─── Render-Request ──────────────────────────────────────────────────
  const renderRes = await fetch(`${base}/v1/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      inputs: {
        source: sourceKey,
        intro: introKey,
        music: musicKeys.length > 0 ? musicKeys : undefined,
        voiceOvers: voKeys.length > 0 ? voKeys : undefined,
      },
      args: opts.args,
      projectId: opts.projectId,
      outputName: opts.outputName ?? `${Date.now()}.mp4`,
    }),
  });
  if (!renderRes.ok) {
    const body = await renderRes.json().catch(() => ({}));
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
