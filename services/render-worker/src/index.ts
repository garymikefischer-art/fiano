/**
 * fiano Render Worker — Express-Server für FFmpeg-Renders auf Google Cloud Run.
 *
 * Architektur (R2-basiert, Phase 9.6.1.5):
 *   1. Mobile: POST /v1/upload-url        → bekommt pre-signed R2-PUT-URL
 *   2. Mobile: PUT source direkt zu R2    → kein Worker-Bandwidth
 *   3. Mobile: POST /v1/render            → Worker rendert, uploaded Result zu R2
 *   4. Mobile bekommt signed download URL → lädt direkt von R2
 *
 * Warum nicht via Worker proxieren: bei >100 MB Source-Files würde Worker viel
 * Bandwidth nutzen (Cloud Run hat 200 GB free, OK aber Latenz beim Double-Hop).
 * R2 hat unlimited free Egress → direkter Mobile↔R2-Pfad ist effizienter.
 *
 * Auth: Supabase-JWT im Authorization-Header. SUPABASE_SERVICE_ROLE_KEY nur
 * Server-side. R2-Keys nur Server-side.
 *
 * Endpoints:
 *   GET  /health             → liveness probe
 *   POST /v1/upload-url      → pre-signed R2 upload URL
 *   POST /v1/render          → render mit existing sourceKey + return signed-DL
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
  createSourceUploadUrl,
  downloadSourceTo,
  uploadOutput,
} from './r2.js';

const PORT = parseInt(process.env.PORT ?? '8080', 10);
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const MAX_DURATION_SEC = parseInt(process.env.MAX_DURATION_SEC ?? '300', 10);

// Soft-Check: log warnings statt exit(1). Damit /health antwortet auch wenn
// env-vars fehlen — Cloud Run macht so wenigstens den Listen-Probe success.
// Echte Requests an /v1/* failen dann mit klarer 500-Fehlermeldung.
const ENV_OK = !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
if (!ENV_OK) {
  console.error(
    '[boot] WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — /v1/* endpoints will fail.',
  );
}

// Wenn env fehlt: erstelle trotzdem einen client mit placeholder values.
// Beim ersten echten Request kommt dann ein klarer 401-Auth-Failure statt
// startup-Crash. /health antwortet weiterhin mit env: { supabase: false }.
const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY || 'placeholder',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const app = express();
app.use(express.json({ limit: '256kb' }));

// Liveness probe. Returns env-status mit Detail damit man von außen sieht
// welche env-vars exakt gesetzt sind (Länge + erste paar chars). Falls eine
// fehlt oder kaputt aussieht: redeploy mit korrekten --set-env-vars.
app.get('/health', (_req, res) => {
  const accountId = process.env.R2_ACCOUNT_ID ?? '';
  const r2EndpointSample = accountId
    ? `https://${accountId}.r2.cloudflarestorage.com`
    : 'NOT_SET';
  res.json({
    ok: true,
    version: '0.2.1',
    storage: 'r2',
    env: {
      supabaseUrl: SUPABASE_URL ? `${SUPABASE_URL.slice(0, 30)}...` : 'NOT_SET',
      supabaseKey: SUPABASE_SERVICE_ROLE_KEY ? `len=${SUPABASE_SERVICE_ROLE_KEY.length}` : 'NOT_SET',
      r2AccountId: accountId ? `${accountId.slice(0, 8)}...` : 'NOT_SET',
      r2AccessKey: process.env.R2_ACCESS_KEY_ID ? `len=${(process.env.R2_ACCESS_KEY_ID ?? '').length}` : 'NOT_SET',
      r2Secret: process.env.R2_SECRET_ACCESS_KEY ? `len=${(process.env.R2_SECRET_ACCESS_KEY ?? '').length}` : 'NOT_SET',
      r2Bucket: process.env.R2_BUCKET ?? 'fiano-renders (default)',
      r2EndpointWillBe: r2EndpointSample,
    },
  });
});

/**
 * POST /v1/upload-url
 *
 * Body: { projectId }
 * Returns: { uploadUrl, sourceKey, expiresInSec }
 *
 * Mobile uploaded danach das Source-File direkt zu R2 via PUT, ohne durch den
 * Worker zu gehen.
 */
app.post(
  '/v1/upload-url',
  authMiddleware(supabase),
  async (req: AuthedRequest, res: Response) => {
    const userId = req.userId!;
    const { projectId } = req.body as { projectId?: string };
    if (!projectId) {
      return res.status(400).json({ ok: false, error: 'projectId required' });
    }
    try {
      const jobId = randomUUID();
      const { uploadUrl, sourceKey } = await createSourceUploadUrl(
        userId,
        projectId,
        jobId,
      );
      return res.json({ ok: true, uploadUrl, sourceKey, jobId, expiresInSec: 3600 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : '';
      console.error('upload-url failed:', msg, '\n', stack);
      // Detail im Response damit User direkt sehen kann was los ist
      return res.status(500).json({
        ok: false,
        error: msg,
        hint: 'Check /health → r2EndpointWillBe für valid R2 endpoint URL',
      });
    }
  },
);

/**
 * POST /v1/render
 *
 * Body: { sourceKey, args, projectId, outputName? }
 * Returns: { jobId, outputKey, signedUrl, durationMs, sizeBytes }
 */
app.post(
  '/v1/render',
  authMiddleware(supabase),
  async (req: AuthedRequest, res: Response) => {
    const start = Date.now();
    const jobId = randomUUID();
    const userId = req.userId!;

    try {
      const { sourceKey, args, projectId, outputName } = req.body as {
        sourceKey?: string;
        args?: string[];
        projectId?: string;
        outputName?: string;
      };

      if (!sourceKey || !args || !projectId) {
        return res
          .status(400)
          .json({ ok: false, error: 'sourceKey, args, projectId required' });
      }
      if (!Array.isArray(args) || args.length > 200) {
        return res.status(400).json({ ok: false, error: 'args invalid' });
      }
      // Ownership-Check: sourceKey muss mit `sources/${userId}/` starten.
      if (!sourceKey.startsWith(`sources/${userId}/`)) {
        return res.status(403).json({ ok: false, error: 'sourceKey not owned by user' });
      }

      console.log(`[${jobId}] render start user=${userId} project=${projectId}`);

      const sourceLocal = path.join(tmpdir(), `${jobId}-src.mp4`);
      const outputLocal = path.join(tmpdir(), `${jobId}-out.mp4`);

      // 1. R2 → tmp.
      const sourceSize = await downloadSourceTo(sourceKey, sourceLocal);
      console.log(`[${jobId}] downloaded source ${sourceSize} bytes`);

      // 2. ffmpeg ausführen mit Platzhalter-Replacement.
      const finalArgs = args.map((a) => {
        const s = String(a);
        if (s === '{SRC}') return sourceLocal;
        if (s === '{DST}') return outputLocal;
        return s;
      });
      await runFFmpeg(finalArgs, { maxDurationSec: MAX_DURATION_SEC, jobId });

      // 3. Output → R2.
      const outputKey = await uploadOutput(
        outputLocal,
        userId,
        projectId,
        jobId,
        outputName,
      );

      // 4. Pre-Signed Download-URL für Mobile (24h).
      const signedUrl = await createOutputDownloadUrl(outputKey);

      // Cleanup tmp (best-effort).
      await Promise.allSettled([unlink(sourceLocal), unlink(outputLocal)]);

      const durationMs = Date.now() - start;
      console.log(`[${jobId}] done in ${durationMs}ms`);

      return res.json({
        ok: true,
        jobId,
        outputKey,
        signedUrl,
        durationMs,
        sizeBytes: sourceSize,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[${jobId}] render failed:`, msg);
      return res.status(500).json({ ok: false, jobId, error: msg });
    }
  },
);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('unhandled:', err);
  res.status(500).json({ ok: false, error: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`fiano-render-worker v0.2.0 (R2) listening on :${PORT}`);
});
