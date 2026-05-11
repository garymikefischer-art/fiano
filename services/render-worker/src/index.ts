/**
 * fiano Render Worker — Express-Server für FFmpeg-Renders auf Google Cloud Run.
 *
 * Multi-Input-Pipeline (Phase 9.6.4+):
 *   1. Mobile POST /v1/upload-url mit { projectId, kind, index? } → bekommt
 *      pre-signed PUT-URL + key. Kinds: 'source' | 'intro' | 'music' | 'voice-over'.
 *   2. Mobile PUT zum jeweiligen Key (parallel uploads für mehrere files).
 *   3. Mobile POST /v1/render mit { inputs: { source, intro?, music?, voiceOvers? }, args }.
 *      args enthalten Platzhalter {SRC}, {INTRO}, {MUSIC_N}, {VO_N}.
 *   4. Worker holt alle keys aus R2 nach /tmp/, ersetzt Platzhalter mit echten
 *      tmp-Pfaden, runt ffmpeg, upload result.
 *   5. Mobile bekommt signed Download-URL.
 *
 * Endpoints:
 *   GET  /health
 *   POST /v1/upload-url   → pre-signed PUT-URL pro file
 *   POST /v1/render       → execute pipeline
 */

import { createClient } from '@supabase/supabase-js';
import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { authMiddleware, type AuthedRequest } from './auth.js';
import { runFFmpeg } from './render.js';
import {
  createOutputDownloadUrl,
  createUploadUrlForKey,
  downloadToFile,
  uploadFile,
} from './r2.js';
import { downloadVideo, isAllowedUrl } from './youtube.js';

const PORT = parseInt(process.env.PORT ?? '8080', 10);
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const MAX_DURATION_SEC = parseInt(process.env.MAX_DURATION_SEC ?? '300', 10);

const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY || 'placeholder',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => {
  const accountId = process.env.R2_ACCOUNT_ID ?? '';
  res.json({
    ok: true,
    version: '0.3.0',
    storage: 'r2',
    env: {
      supabaseUrl: SUPABASE_URL ? `${SUPABASE_URL.slice(0, 30)}...` : 'NOT_SET',
      supabaseKey: SUPABASE_SERVICE_ROLE_KEY ? `len=${SUPABASE_SERVICE_ROLE_KEY.length}` : 'NOT_SET',
      r2AccountId: accountId ? `${accountId.slice(0, 8)}...` : 'NOT_SET',
      r2AccessKey: process.env.R2_ACCESS_KEY_ID ? `len=${(process.env.R2_ACCESS_KEY_ID ?? '').length}` : 'NOT_SET',
      r2Secret: process.env.R2_SECRET_ACCESS_KEY ? `len=${(process.env.R2_SECRET_ACCESS_KEY ?? '').length}` : 'NOT_SET',
      r2Bucket: process.env.R2_BUCKET ?? 'fiano-renders (default)',
    },
  });
});

type UploadKind = 'source' | 'intro' | 'music' | 'voice-over';

const KIND_EXT: Record<UploadKind, string> = {
  source: 'mp4',
  intro: 'mp4',
  music: 'mp3',
  'voice-over': 'mp3',
};

/**
 * POST /v1/upload-url
 *
 * Body: { projectId, kind, index? }
 *   kind = 'source' | 'intro' | 'music' | 'voice-over'
 *   index = optional bei music/voice-over zur Unterscheidung mehrerer Tracks
 *
 * Returns: { uploadUrl, key, expiresInSec }
 */
app.post('/v1/upload-url', authMiddleware(supabase), async (req: AuthedRequest, res: Response) => {
  const userId = req.userId!;
  const { projectId, kind, index } = req.body as {
    projectId?: string;
    kind?: UploadKind;
    index?: number;
  };
  if (!projectId || !kind || !KIND_EXT[kind]) {
    return res.status(400).json({
      ok: false,
      error: 'projectId + kind (source|intro|music|voice-over) required',
    });
  }
  try {
    const uuid = randomUUID();
    const suffix = index !== undefined ? `-${index}` : '';
    const ext = KIND_EXT[kind];
    const key = `sources/${userId}/${projectId}/${kind}-${uuid}${suffix}.${ext}`;
    const result = await createUploadUrlForKey(key);
    return res.json({ ok: true, ...result, expiresInSec: 3600 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('upload-url failed:', msg);
    return res.status(500).json({ ok: false, error: msg });
  }
});

/**
 * POST /v1/render
 *
 * Body: {
 *   inputs: { source: key, intro?: key, music?: [key], voiceOvers?: [key] },
 *   args: ["-y", "-i", "{SRC}", ..., "-i", "{INTRO}", ..., "{DST}"],
 *   projectId,
 *   outputName?
 * }
 */
app.post('/v1/render', authMiddleware(supabase), async (req: AuthedRequest, res: Response) => {
  const start = Date.now();
  const jobId = randomUUID();
  const userId = req.userId!;

  try {
    const { inputs, args, projectId, outputName } = req.body as {
      inputs?: {
        source?: string;
        /** Phase 9.5.8: Multi-Clip-Sources (alternative zu `source`). */
        sources?: string[];
        intro?: string;
        music?: string[];
        voiceOvers?: string[];
      };
      args?: string[];
      projectId?: string;
      outputName?: string;
    };

    // Multi-Clip-Resolve: `sources[]` hat Vorrang. Fallback auf legacy `source`.
    const sources: string[] =
      inputs?.sources && inputs.sources.length > 0
        ? inputs.sources
        : inputs?.source
          ? [inputs.source]
          : [];

    if (sources.length === 0 || !args || !projectId) {
      return res.status(400).json({
        ok: false,
        error: 'inputs.source or inputs.sources + args + projectId required',
      });
    }
    if (!Array.isArray(args) || args.length > 400) {
      return res.status(400).json({ ok: false, error: 'args invalid' });
    }
    // Ownership-Check: alle keys müssen mit `sources/${userId}/` starten.
    const allKeys: string[] = [
      ...sources,
      ...(inputs?.intro ? [inputs.intro] : []),
      ...(inputs?.music ?? []),
      ...(inputs?.voiceOvers ?? []),
    ];
    for (const k of allKeys) {
      if (!k.startsWith(`sources/${userId}/`)) {
        return res.status(403).json({ ok: false, error: `input key not owned: ${k}` });
      }
    }

    console.log(
      `[${jobId}] render user=${userId} project=${projectId} sources=${sources.length} otherInputs=${allKeys.length - sources.length}`,
    );

    // ── 1. Alle Inputs nach /tmp/ ziehen + Replace-Map bauen ──────────
    const replaceMap: Record<string, string> = {};
    const tmpFiles: string[] = [];

    if (sources.length === 1) {
      // Legacy single-source: {SRC} Platzhalter.
      const sourceTmp = path.join(tmpdir(), `${jobId}-src.mp4`);
      await downloadToFile(sources[0], sourceTmp);
      replaceMap['{SRC}'] = sourceTmp;
      tmpFiles.push(sourceTmp);
    } else {
      // Multi-Clip: {SRC_0}, {SRC_1}, ... Platzhalter.
      for (let i = 0; i < sources.length; i++) {
        const tmp = path.join(tmpdir(), `${jobId}-src-${i}.mp4`);
        await downloadToFile(sources[i], tmp);
        replaceMap[`{SRC_${i}}`] = tmp;
        tmpFiles.push(tmp);
      }
    }

    if (inputs?.intro) {
      const introTmp = path.join(tmpdir(), `${jobId}-intro.mp4`);
      await downloadToFile(inputs.intro, introTmp);
      replaceMap['{INTRO}'] = introTmp;
      tmpFiles.push(introTmp);
    }

    if (inputs?.music?.length) {
      for (let i = 0; i < inputs.music.length; i++) {
        const tmp = path.join(tmpdir(), `${jobId}-music-${i}.mp3`);
        await downloadToFile(inputs.music[i], tmp);
        replaceMap[`{MUSIC_${i}}`] = tmp;
        tmpFiles.push(tmp);
      }
    }

    if (inputs?.voiceOvers?.length) {
      for (let i = 0; i < inputs.voiceOvers.length; i++) {
        const tmp = path.join(tmpdir(), `${jobId}-vo-${i}.mp3`);
        await downloadToFile(inputs.voiceOvers[i], tmp);
        replaceMap[`{VO_${i}}`] = tmp;
        tmpFiles.push(tmp);
      }
    }

    const outputTmp = path.join(tmpdir(), `${jobId}-out.mp4`);
    replaceMap['{DST}'] = outputTmp;

    // ── 2. Args mit Platzhaltern ersetzen ─────────────────────────────
    const finalArgs = args.map((a) => {
      const s = String(a);
      return replaceMap[s] ?? s;
    });

    console.log(`[${jobId}] ffmpeg args: ${finalArgs.join(' ')}`);

    // ── 3. FFmpeg ausführen ───────────────────────────────────────────
    await runFFmpeg(finalArgs, { maxDurationSec: MAX_DURATION_SEC, jobId });

    // ── 4. Output → R2 ────────────────────────────────────────────────
    const outputKey = `outputs/${userId}/${projectId}/${outputName ?? `${jobId}.mp4`}`;
    await uploadFile(outputTmp, outputKey, 'video/mp4');
    const signedUrl = await createOutputDownloadUrl(outputKey);

    // ── 5. Cleanup ────────────────────────────────────────────────────
    await Promise.allSettled([...tmpFiles, outputTmp].map((p) => unlink(p)));

    const durationMs = Date.now() - start;
    console.log(`[${jobId}] done in ${durationMs}ms output=${outputKey}`);

    return res.json({
      ok: true,
      jobId,
      outputKey,
      signedUrl,
      durationMs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : '';
    console.error(`[${jobId}] render failed:`, msg, '\n', stack);
    return res.status(500).json({ ok: false, jobId, error: msg });
  }
});

/**
 * POST /v1/download  (Phase 9.5.7)
 *
 * Body: { url: string }  — YouTube oder Twitch URL
 *
 * yt-dlp lädt das Video nach /tmp/, ffprobe gibt Duration, Worker pusht zu R2
 * unter `sources/{userId}/yt-{jobId}.mp4` und gibt eine signed-DL-URL zurück.
 * Mobile zieht die Datei dann lokal nach documentDirectory/imports/ — Project
 * verhält sich danach wie ein normaler File-Picker-Import.
 */
app.post('/v1/download', authMiddleware(supabase), async (req: AuthedRequest, res: Response) => {
  const userId = req.userId!;
  const jobId = randomUUID();
  const { url, cookies } = req.body as { url?: string; cookies?: string };

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ ok: false, error: 'url required' });
  }
  if (!isAllowedUrl(url)) {
    return res
      .status(400)
      .json({ ok: false, error: 'Only YouTube and Twitch URLs are supported' });
  }

  const tmpPath = path.join(tmpdir(), `${jobId}-yt.mp4`);

  try {
    console.log(`[${jobId}] download user=${userId} url=${url}${cookies ? ' (with user cookies)' : ''}`);
    const meta = await downloadVideo({
      url,
      outputPath: tmpPath,
      jobId,
      cookies: typeof cookies === 'string' && cookies.length > 0 ? cookies : undefined,
    });

    const key = `sources/${userId}/yt-${jobId}.mp4`;
    await uploadFile(tmpPath, key, 'video/mp4');
    const signedUrl = await createOutputDownloadUrl(key);

    await unlink(tmpPath).catch(() => {});

    return res.json({
      ok: true,
      jobId,
      signedUrl,
      key,
      durationSec: meta.durationSec,
      title: meta.title,
      sizeBytes: meta.sizeBytes,
    });
  } catch (e) {
    await unlink(tmpPath).catch(() => {});
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${jobId}] download failed:`, msg);
    return res.status(500).json({ ok: false, jobId, error: msg });
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('unhandled:', err);
  res.status(500).json({ ok: false, error: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`fiano-render-worker v0.3.0 (multi-input) listening on :${PORT}`);
});
