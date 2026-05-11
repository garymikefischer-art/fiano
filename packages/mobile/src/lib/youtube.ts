/**
 * YouTube / Twitch URL-Import (Phase 9.5.7).
 *
 * Flow:
 *   1. POST /v1/download an Cloud-Worker mit URL
 *   2. Worker spawnt yt-dlp + uploaded zu R2 + returnt signed-DL-URL + metadata
 *   3. Mobile downloaded vom signed-URL nach documentDirectory/imports/yt-${jobId}.mp4
 *   4. Project verhält sich danach wie ein normaler File-Picker-Import.
 *
 * Auth via Supabase-JWT (gleich wie renderJob.ts).
 */

import * as FileSystem from 'expo-file-system';

import { ENV } from './env';
import { supabase } from './supabase';

const IMPORTS_DIR = `${FileSystem.documentDirectory}imports/`;

export interface DownloadFromUrlOpts {
  url: string;
  /** Phasen-Callback für UI-Progress. */
  onPhase?: (phase: 'requesting' | 'downloading') => void;
  /** Progress 0..1 während der lokale Download (server-side gibt's keinen Stream). */
  onProgress?: (frac: number) => void;
}

export interface DownloadFromUrlResult {
  /** file://-URI in documentDirectory/imports/. */
  uri: string;
  durationSec: number;
  title: string;
  sizeBytes: number;
}

const ALLOWED_URL_RX = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be|twitch\.tv)\//i;

export function isYoutubeOrTwitchUrl(url: string): boolean {
  return ALLOWED_URL_RX.test(url.trim());
}

export async function downloadFromUrl(opts: DownloadFromUrlOpts): Promise<DownloadFromUrlResult> {
  if (!ENV.RENDER_WORKER_URL) {
    throw new Error('Cloud-Render worker URL not configured (EXPO_PUBLIC_RENDER_WORKER_URL)');
  }
  const trimmed = opts.url.trim();
  if (!isYoutubeOrTwitchUrl(trimmed)) {
    throw new Error('Only YouTube and Twitch URLs are supported');
  }

  const sessionRes = await supabase.auth.getSession();
  const token = sessionRes.data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  opts.onPhase?.('requesting');
  const res = await fetch(`${ENV.RENDER_WORKER_URL}/v1/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ url: trimmed }),
  });

  const data: {
    ok?: boolean;
    jobId?: string;
    signedUrl?: string;
    durationSec?: number;
    title?: string;
    sizeBytes?: number;
    error?: string;
  } = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok || !data.signedUrl || !data.jobId) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }

  // Ensure local imports-dir.
  const dirInfo = await FileSystem.getInfoAsync(IMPORTS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(IMPORTS_DIR, { intermediates: true });
  }

  opts.onPhase?.('downloading');
  const localPath = `${IMPORTS_DIR}yt-${data.jobId}.mp4`;
  const download = FileSystem.createDownloadResumable(
    data.signedUrl,
    localPath,
    {},
    (p) => {
      if (p.totalBytesExpectedToWrite > 0) {
        opts.onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
      }
    },
  );
  const result = await download.downloadAsync();
  if (!result?.uri) throw new Error('Local download failed');

  return {
    uri: result.uri,
    durationSec: data.durationSec ?? 0,
    title: data.title ?? '',
    sizeBytes: data.sizeBytes ?? 0,
  };
}
