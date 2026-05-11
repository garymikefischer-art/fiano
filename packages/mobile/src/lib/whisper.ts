/**
 * Whisper Transcribe (Phase 9.6.7a).
 *
 * Flow:
 *   1. Upload source-Video via /v1/upload-url → R2-Key (gleicher Pattern wie renderJob).
 *   2. POST /v1/transcribe mit { sourceKey, openaiApiKey } → cues[].
 *   3. Speichern in DocumentDirectory/transcripts/ (debug-cache).
 *   4. Caller (HighlightsTab) updated project.subtitles.cues + enabled=true.
 *
 * Re-use des bestehenden renderJob upload-patterns (/v1/upload-url + PUT zu R2).
 */

import * as FileSystem from 'expo-file-system';

import { ENV } from './env';
import { supabase } from './supabase';
import { useAppStore } from '../stores/appStore';
import type { SubtitleCue } from '../data/demoProjects';

const TRANSCRIPTS_DIR = `${FileSystem.documentDirectory}transcripts/`;

export interface TranscribeOpts {
  sourceUri: string;
  projectId: string;
  onPhase?: (phase: 'uploading' | 'transcribing') => void;
  onUploadProgress?: (frac: number) => void;
}

export interface TranscribeResult {
  cues: SubtitleCue[];
  durationSec: number;
  /** Pfad zur gecachten transcript.json (für debug / re-edit). */
  transcriptPath?: string;
}

export async function transcribeVideo(opts: TranscribeOpts): Promise<TranscribeResult> {
  if (!ENV.RENDER_WORKER_URL) {
    throw new Error('Cloud-Render worker URL not configured');
  }
  const openaiApiKey = useAppStore.getState().openaiKey?.trim();
  if (!openaiApiKey) {
    throw new Error('OpenAI API key required. Set it in Settings → API Keys.');
  }

  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  const base = ENV.RENDER_WORKER_URL.trim().replace(/\/+$/, '');

  // ─── 1. Source-Upload zu R2 (gleicher Pattern wie renderJob.ts) ───
  opts.onPhase?.('uploading');
  const urlRes = await fetch(`${base}/v1/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ projectId: opts.projectId, kind: 'source' }),
  });
  if (!urlRes.ok) {
    const body = await urlRes.json().catch(() => ({}));
    throw new Error(
      `upload-url failed: ${(body as { error?: string }).error ?? `HTTP ${urlRes.status}`}`,
    );
  }
  const { uploadUrl, key } = (await urlRes.json()) as { uploadUrl: string; key: string };

  const task = FileSystem.createUploadTask(
    uploadUrl,
    opts.sourceUri,
    {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    },
    (p) => {
      if (p.totalBytesExpectedToSend > 0) {
        opts.onUploadProgress?.(p.totalBytesSent / p.totalBytesExpectedToSend);
      }
    },
  );
  const upRes = await task.uploadAsync();
  if (!upRes || upRes.status >= 300) {
    throw new Error(
      `R2 upload failed: HTTP ${upRes?.status ?? '?'} — ${upRes?.body?.slice(0, 200) ?? ''}`,
    );
  }

  // ─── 2. POST /v1/transcribe ────────────────────────────────────────
  opts.onPhase?.('transcribing');
  const trRes = await fetch(`${base}/v1/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sourceKey: key, openaiApiKey }),
  });
  const trData = (await trRes.json().catch(() => ({}))) as {
    ok?: boolean;
    cues?: SubtitleCue[];
    durationSec?: number;
    error?: string;
  };
  if (!trRes.ok || !trData.ok || !trData.cues) {
    throw new Error(trData.error ?? `HTTP ${trRes.status}`);
  }

  // ─── 3. Optional: transcript.json cachen für Debug + Re-Edit ──────
  let transcriptPath: string | undefined;
  try {
    const dirInfo = await FileSystem.getInfoAsync(TRANSCRIPTS_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(TRANSCRIPTS_DIR, { intermediates: true });
    }
    transcriptPath = `${TRANSCRIPTS_DIR}tr-${opts.projectId}-${Date.now()}.json`;
    await FileSystem.writeAsStringAsync(
      transcriptPath,
      JSON.stringify({ cues: trData.cues, durationSec: trData.durationSec ?? 0 }, null, 2),
    );
  } catch {
    /* cache-fail nicht kritisch */
  }

  return {
    cues: trData.cues,
    durationSec: trData.durationSec ?? 0,
    transcriptPath,
  };
}
