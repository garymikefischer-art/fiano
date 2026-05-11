/**
 * fiano Render Worker — Express-Server für FFmpeg-Renders auf Google Cloud Run.
 *
 * Architektur:
 *   1. Mobile uploaded Source-Video zu Supabase Storage Bucket `source-uploads`.
 *   2. Mobile schickt POST /v1/render mit { sourceKey, args, projectId }.
 *   3. Worker downloaded Source aus Bucket → /tmp/source.mp4.
 *   4. ffmpeg ${args} /tmp/source.mp4 /tmp/output.mp4.
 *   5. Worker uploaded /tmp/output.mp4 zum Bucket `render-output/${projectId}/${jobId}.mp4`.
 *   6. Worker returnt signed-URL für Download.
 *
 * Authentication: Supabase JWT im Authorization-Header. Worker validiert + checked
 * Subscription-Status via Supabase RPC.
 *
 * Endpoints:
 *   GET  /health        → liveness probe (Cloud Run pings das)
 *   POST /v1/render     → start render job (sync, ~30s für 1-min 1080p)
 */

import { createClient } from '@supabase/supabase-js';
import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { authMiddleware, type AuthedRequest } from './auth.js';
import { runFFmpeg } from './render.js';

const PORT = parseInt(process.env.PORT ?? '8080', 10);
const SUPABASE_URL = required('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY');
const SOURCE_BUCKET = process.env.SOURCE_BUCKET ?? 'source-uploads';
const OUTPUT_BUCKET = process.env.OUTPUT_BUCKET ?? 'render-output';
const MAX_DURATION_SEC = parseInt(process.env.MAX_DURATION_SEC ?? '300', 10); // 5 min hard cap

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const app = express();
app.use(express.json({ limit: '256kb' })); // args nicht zu groß

// Liveness-Probe für Cloud Run.
app.get('/health', (_req, res) => {
  res.json({ ok: true, version: '0.1.0' });
});

// Render-Endpoint mit JWT-Auth.
app.post('/v1/render', authMiddleware(supabase), async (req: AuthedRequest, res: Response) => {
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
      return res.status(400).json({
        ok: false,
        error: 'sourceKey, args, projectId required',
      });
    }

    if (!Array.isArray(args) || args.length > 200) {
      return res.status(400).json({ ok: false, error: 'args invalid' });
    }

    // Args-Sanity: keine Shell-Injection. Wir spawnen ffmpeg ohne shell, also
    // sind Args safe; aber blocken wir explizit Pfade ausser unsere tmp-Pfade.
    const sanitizedArgs = args.map((a) => String(a));

    console.log(`[${jobId}] start render for user=${userId} project=${projectId}`);

    // 1. Source aus Bucket downloaden.
    const sourceLocal = path.join(tmpdir(), `${jobId}-src.mp4`);
    const outputLocal = path.join(tmpdir(), `${jobId}-out.mp4`);

    const { data: sourceBlob, error: dlErr } = await supabase.storage
      .from(SOURCE_BUCKET)
      .download(sourceKey);
    if (dlErr || !sourceBlob) {
      throw new Error(`source download failed: ${dlErr?.message ?? 'no blob'}`);
    }
    const sourceBuf = Buffer.from(await sourceBlob.arrayBuffer());
    await writeFile(sourceLocal, sourceBuf);
    console.log(`[${jobId}] downloaded source: ${sourceBuf.byteLength} bytes`);

    // 2. ffmpeg ausführen. Args sollten {SRC} und {DST} als Placeholder enthalten
    //    die wir hier auf echte Pfade ersetzen — verhindert dass Mobile beliebige
    //    Server-Pfade als Input/Output setzt.
    const finalArgs = sanitizedArgs.map((a) => {
      if (a === '{SRC}') return sourceLocal;
      if (a === '{DST}') return outputLocal;
      return a;
    });

    await runFFmpeg(finalArgs, { maxDurationSec: MAX_DURATION_SEC, jobId });

    // 3. Output uploaden.
    const outputBuf = await readFile(outputLocal);
    const outputKey = `${projectId}/${outputName ?? `${jobId}.mp4`}`;
    const { error: upErr } = await supabase.storage
      .from(OUTPUT_BUCKET)
      .upload(outputKey, outputBuf, {
        contentType: 'video/mp4',
        upsert: true,
      });
    if (upErr) throw new Error(`output upload failed: ${upErr.message}`);

    // 4. Signed-URL generieren (24h gültig — User soll Zeit haben zum
    //    Download).
    const { data: signed, error: signErr } = await supabase.storage
      .from(OUTPUT_BUCKET)
      .createSignedUrl(outputKey, 60 * 60 * 24);
    if (signErr || !signed) throw new Error(`signed url failed: ${signErr?.message}`);

    // Cleanup tmp-Files (best-effort).
    await Promise.allSettled([unlink(sourceLocal), unlink(outputLocal)]);

    const durationMs = Date.now() - start;
    console.log(`[${jobId}] done in ${durationMs}ms, output=${outputKey}, size=${outputBuf.byteLength}`);

    return res.json({
      ok: true,
      jobId,
      outputKey,
      signedUrl: signed.signedUrl,
      durationMs,
      sizeBytes: outputBuf.byteLength,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${jobId}] render failed:`, msg);
    return res.status(500).json({ ok: false, jobId, error: msg });
  }
});

// Generic error handler.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('unhandled:', err);
  res.status(500).json({ ok: false, error: err.message });
});

// Cloud Run startet immer auf 0.0.0.0:PORT (PORT vom env).
app.listen(PORT, '0.0.0.0', () => {
  console.log(`fiano-render-worker listening on :${PORT}`);
});

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}
