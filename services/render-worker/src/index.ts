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
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { authMiddleware, type AuthedRequest } from './auth.js';
import { runFFmpeg } from './render.js';
import { validateAssContent } from './assValidator.js';
import { checkAndIncrementRenderQuota } from './planCheck.js';
import { buildTikTokExportArgs } from './ffmpegArgs.js';
import { validateRenderSpec, specToTikTokOpts } from './renderSpec.js';
import {
  createOutputDownloadUrl,
  createUploadUrlForKey,
  downloadToFile,
  uploadFile,
} from './r2.js';
import { downloadVideo, isAllowedUrl } from './youtube.js';
import { transcribeAudio } from './transcribe.js';

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

// Cloud Run sitzt hinter einem Google Load Balancer — `req.ip` muss
// X-Forwarded-For lesen, sonst sehen alle requests die gleiche LB-IP.
// `trust proxy: 1` = vertraue dem ersten Proxy-Hop.
app.set('trust proxy', 1);

// ─────────────────────────────────────────────────────────────────────────
// A6.1 — Rate Limiting (Phase A6 Security-Audit Fix für P0-1)
// ─────────────────────────────────────────────────────────────────────────
// Per-User-Limit nach `authMiddleware`. Verhindert finanziellen DoS via
// Cloud Run + R2 + OpenAI-Key-Burn. Limits sind defensiv konservativ —
// echte Power-User mit gültigem Pro/Lifetime-Plan brauchen sie nicht
// strecken (5 renders/min = 300/hour = mehr als jeder Mensch verbraucht).
//
// Falls Limit-Hit: 429 mit `retryAfterSec`. Logs `[ratelimit:NAME] blocked
// user=...` zu Cloud Logging — Operations-Team kann anomalous user_ids
// griefen aufspüren.
//
// keyGenerator: req.userId nach authMiddleware. Fallback req.ip nur falls
// das aus irgendeinem Grund nicht gesetzt ist (sollte nicht passieren weil
// Limiter NACH authMiddleware in der chain steht).
//
// Limits abgestimmt auf Mobile-UX-Patterns:
//  /upload-url    30/min  — 1 render kann bis zu 10 files uploaden (intro,
//                           music[3], voice-over[3], subtitle, source[3])
//  /render         5/min  — render ist 5-300s, mehr als 5/min schluckt
//                           Cloud-Run-instances auf, financial-DoS-Vektor
//  /transcribe     5/min  — Whisper ist teuer (User-OpenAI-Key, aber Worker
//                           muss audio extracten = CPU)
//  /download       3/min  — yt-dlp = bis 480s, max-filesize 500M = R2-cost
// ─────────────────────────────────────────────────────────────────────────
function makeLimiter(windowMs: number, max: number, name: string) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,  // sendet `RateLimit-*` Response-Headers
    legacyHeaders: false,    // kein X-RateLimit-* (legacy)
    keyGenerator: (req) => {
      const authReq = req as AuthedRequest;
      return authReq.userId ?? req.ip ?? 'anon';
    },
    handler: (req, res) => {
      const authReq = req as AuthedRequest;
      console.warn(
        `[ratelimit:${name}] blocked user=${authReq.userId ?? req.ip ?? 'anon'} max=${max}/${Math.round(windowMs / 1000)}s`,
      );
      res.status(429).json({
        ok: false,
        error: 'rate-limit-exceeded',
        endpoint: name,
        retryAfterSec: Math.ceil(windowMs / 1000),
      });
    },
  });
}

const limitUploadUrl  = makeLimiter(60_000, 30, 'upload-url');
const limitRender     = makeLimiter(60_000, 5, 'render');
const limitTranscribe = makeLimiter(60_000, 5, 'transcribe');
const limitDownload   = makeLimiter(60_000, 3, 'download');

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

type UploadKind = 'source' | 'intro' | 'music' | 'voice-over' | 'subtitle';

const KIND_EXT: Record<UploadKind, string> = {
  source: 'mp4',
  intro: 'mp4',
  music: 'mp3',
  'voice-over': 'mp3',
  // Phase 9.6.7h: Advanced-Substation-Alpha-Untertitel-Datei. libass-Renderer.
  subtitle: 'ass',
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
app.post('/v1/upload-url', authMiddleware(supabase), limitUploadUrl, async (req: AuthedRequest, res: Response) => {
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
app.post('/v1/render', authMiddleware(supabase), limitRender, async (req: AuthedRequest, res: Response) => {
  const start = Date.now();
  const jobId = randomUUID();
  const userId = req.userId!;

  try {
    const { inputs, args, spec, projectId, outputName } = req.body as {
      inputs?: {
        source?: string;
        /** Phase 9.5.8: Multi-Clip-Sources (alternative zu `source`). */
        sources?: string[];
        intro?: string;
        music?: string[];
        voiceOvers?: string[];
        /** Phase 9.6.7h: ASS-Subtitle-File (libass burn-in). */
        subtitle?: string;
      };
      /** Legacy (deprecated): pre-built FFmpeg args. */
      args?: string[];
      /** Phase A6.4 (2026-05-18): typed RenderSpec. Worker baut args[]
       *  selber → keine Command-Injection via args[] möglich. */
      spec?: unknown;
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

    if (sources.length === 0 || !projectId) {
      return res.status(400).json({
        ok: false,
        error: 'inputs.source or inputs.sources + projectId required',
      });
    }
    // Phase A6.4: entweder spec ODER args muss vorhanden sein. Beide
    // optional, aber genau einer. Neue Clients nutzen spec (typed +
    // sicher), legacy clients dürfen weiterhin args[] schicken
    // (deprecated, wird in einer späteren Phase entfernt).
    if (!spec && !args) {
      return res.status(400).json({
        ok: false,
        error: 'spec (typed) or args[] required',
      });
    }
    if (args && (!Array.isArray(args) || args.length > 400)) {
      return res.status(400).json({ ok: false, error: 'args invalid' });
    }
    // Ownership-Check: alle keys müssen mit `sources/${userId}/` starten.
    const allKeys: string[] = [
      ...sources,
      ...(inputs?.intro ? [inputs.intro] : []),
      ...(inputs?.music ?? []),
      ...(inputs?.voiceOvers ?? []),
      ...(inputs?.subtitle ? [inputs.subtitle] : []),
    ];
    for (const k of allKeys) {
      if (!k.startsWith(`sources/${userId}/`)) {
        return res.status(403).json({ ok: false, error: `input key not owned: ${k}` });
      }
    }

    console.log(
      `[${jobId}] render user=${userId} project=${projectId} sources=${sources.length} otherInputs=${allKeys.length - sources.length}`,
    );

    // ── A6.3: Plan-Check + Quota-Increment (Server-side Enforcement) ──
    // Resolution-Detection: höchste scale=W:H im Filter-Graph bestimmt
    // ob '4k' (Pro/Lifetime only), '1080p' oder '720p'.
    const argsJoined = args.join(' ');
    const scaleMatches = [...argsJoined.matchAll(/scale=(\d+):(\d+)/g)];
    let maxDim = 0;
    for (const m of scaleMatches) {
      maxDim = Math.max(maxDim, parseInt(m[1], 10), parseInt(m[2], 10));
    }
    const requestedResolution: '720p' | '1080p' | '4k' =
      maxDim >= 3840 ? '4k' : maxDim >= 1920 ? '1080p' : '720p';

    const quotaResult = await checkAndIncrementRenderQuota(
      supabase,
      userId,
      requestedResolution,
    );
    if (!quotaResult.allowed) {
      console.log(
        `[${jobId}] render rejected: plan=${quotaResult.plan} reason=${quotaResult.reason}`,
      );
      return res.status(402).json({
        ok: false,
        jobId,
        error: 'plan_limit_reached',
        reason: quotaResult.reason,
        plan: quotaResult.plan,
        renderCount: 'render_count' in quotaResult ? quotaResult.render_count : undefined,
        monthlyLimit: 'monthly_limit' in quotaResult ? quotaResult.monthly_limit : undefined,
        requestedResolution: 'requested_resolution' in quotaResult ? quotaResult.requested_resolution : requestedResolution,
      });
    }
    console.log(
      `[${jobId}] quota ok: plan=${quotaResult.plan} count=${quotaResult.render_count}/${quotaResult.monthly_limit} res=${requestedResolution}`,
    );

    // ── 1. Alle Inputs nach /tmp/ ziehen + Replace-Map bauen ──────────
    const replaceMap: Record<string, string> = {};
    const tmpFiles: string[] = [];

    if (sources.length === 1) {
      // Single-source: legacy {SRC}-Platzhalter + zusätzlich {SRC_0} für
      // Builder-Phase-3 (per-source-trim, einheitliche indizierte Platzhalter
      // auch bei 1 source).
      const sourceTmp = path.join(tmpdir(), `${jobId}-src.mp4`);
      await downloadToFile(sources[0], sourceTmp);
      replaceMap['{SRC}'] = sourceTmp;
      replaceMap['{SRC_0}'] = sourceTmp;
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

    if (inputs?.subtitle) {
      // Phase 9.6.7h: libass burn-in. .ass-Datei nach /tmp/, Platzhalter {ASS}
      // wird im filter-arg ass=${path}:original_size=WxH ersetzt.
      const assTmp = path.join(tmpdir(), `${jobId}-subs.ass`);
      await downloadToFile(inputs.subtitle, assTmp);
      // Phase A6.2 (2026-05-18): Server-side .ass content-validation gegen
      // libass DoS / fontconfig path-traversal. Defense-in-depth: Mobile
      // validiert auch vor Upload, aber Worker re-validates da R2-content
      // by-client-controlled ist und JWT-Replay-Risk besteht.
      const assContent = await readFile(assTmp, 'utf-8');
      const validation = validateAssContent(assContent);
      if (!validation.ok) {
        console.warn(`[${jobId}] .ass validation rejected: ${validation.reason}`);
        return res.status(400).json({
          ok: false,
          jobId,
          error: `Subtitle (.ass) rejected: ${validation.reason}`,
        });
      }
      // Sanitized-Version zurückschreiben — Override-values sind capped.
      await writeFile(assTmp, validation.sanitized, 'utf-8');
      replaceMap['{ASS}'] = assTmp;
      tmpFiles.push(assTmp);
    }

    const outputTmp = path.join(tmpdir(), `${jobId}-out.mp4`);
    replaceMap['{DST}'] = outputTmp;

    // ── 2. Args bauen — Phase A6.4: spec-Pfad oder legacy args-Pfad ──
    // Spec-Pfad: validiere RenderSpec, baue args[] selber → keine FFmpeg-
    // Argument-Injection möglich (Worker hat volle Kontrolle).
    // Args-Pfad (deprecated): legacy clients schicken pre-built args mit
    // Platzhaltern, Worker substituiert sie.
    let finalArgs: string[];
    if (spec) {
      const v = validateRenderSpec(spec);
      if (!v.ok) {
        console.warn(`[${jobId}] spec validation failed: ${v.error}`);
        return res.status(400).json({
          ok: false,
          jobId,
          error: `spec invalid: ${v.error}`,
        });
      }
      // Sammle resolved-Pfade in derselben Reihenfolge wie das spec sie
      // erwartet (sources[]-Index → /tmp/jobId-src-N.mp4).
      const sourcePaths: string[] = [];
      if (sources.length === 1) {
        sourcePaths.push(replaceMap['{SRC_0}']!);
      } else {
        for (let i = 0; i < sources.length; i++) {
          sourcePaths.push(replaceMap[`{SRC_${i}}`]!);
        }
      }
      const musicPaths: string[] = [];
      for (let i = 0; i < (inputs?.music?.length ?? 0); i++) {
        musicPaths.push(replaceMap[`{MUSIC_${i}}`]!);
      }
      const voPaths: string[] = [];
      for (let i = 0; i < (inputs?.voiceOvers?.length ?? 0); i++) {
        voPaths.push(replaceMap[`{VO_${i}}`]!);
      }
      const opts = specToTikTokOpts(v.spec, {
        sources: sourcePaths,
        dst: outputTmp,
        intro: replaceMap['{INTRO}'],
        music: musicPaths,
        voiceOvers: voPaths,
        assPath: replaceMap['{ASS}'],
      });
      finalArgs = buildTikTokExportArgs(opts, 'other');
    } else {
      // Legacy args[]-Pfad (deprecated): substitute placeholders.
      finalArgs = args!.map((a) => {
        const s = String(a);
        if (replaceMap[s]) return replaceMap[s];
        let out = s;
        for (const [token, real] of Object.entries(replaceMap)) {
          if (out.includes(token)) {
            out = out.split(token).join(real);
          }
        }
        return out;
      });
    }

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
app.post('/v1/download', authMiddleware(supabase), limitDownload, async (req: AuthedRequest, res: Response) => {
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

/**
 * POST /v1/transcribe  (Phase 9.6.7a)
 *
 * Body: { sourceKey: string, openaiApiKey: string }
 *   sourceKey = R2-Key der Source (vorher via /v1/upload-url hochgeladen)
 *   openaiApiKey = User's Key — wird nicht persistiert
 *
 * Server: download source → ffmpeg audio-extract (mp3 mono 16kHz 64kbps)
 *         → POST OpenAI Whisper → parse segments → return cues[].
 */
app.post('/v1/transcribe', authMiddleware(supabase), limitTranscribe, async (req: AuthedRequest, res: Response) => {
  const userId = req.userId!;
  const jobId = randomUUID();
  const { sourceKey, openaiApiKey, videoType } = req.body as {
    sourceKey?: string;
    openaiApiKey?: string;
    videoType?: 'gaming' | 'podcast' | 'auto';
  };

  if (!sourceKey || typeof sourceKey !== 'string') {
    return res.status(400).json({ ok: false, error: 'sourceKey required' });
  }
  if (!openaiApiKey || typeof openaiApiKey !== 'string') {
    return res.status(400).json({ ok: false, error: 'openaiApiKey required (set in Settings → API Keys)' });
  }
  if (!sourceKey.startsWith(`sources/${userId}/`)) {
    return res.status(403).json({ ok: false, error: 'source key not owned' });
  }
  const mode = videoType === 'gaming' || videoType === 'podcast' ? videoType : 'auto';

  const sourceTmp = path.join(tmpdir(), `${jobId}-transcribe-src.mp4`);

  try {
    console.log(`[${jobId}] transcribe user=${userId} mode=${mode} sourceKey=${sourceKey}`);
    await downloadToFile(sourceKey, sourceTmp);
    const result = await transcribeAudio({
      sourcePath: sourceTmp,
      openaiApiKey,
      jobId,
      highlightMode: mode,
    });
    await unlink(sourceTmp).catch(() => {});
    console.log(
      `[${jobId}] transcribe done cues=${result.cues.length} highlights=${result.highlights.length} audioBytes=${result.audioBytes}`,
    );
    return res.json({
      ok: true,
      jobId,
      cues: result.cues,
      highlights: result.highlights,
      durationSec: result.durationSec,
    });
  } catch (e) {
    await unlink(sourceTmp).catch(() => {});
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${jobId}] transcribe failed:`, msg);
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
