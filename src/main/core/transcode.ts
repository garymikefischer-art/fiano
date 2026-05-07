import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import { app } from 'electron';
import { resolveBin } from './bin';

/**
 * MOV/HEVC/ProRes-Transcoding für Browser-Preview im Editor.
 *
 * Strategie:
 *   - ffprobe checkt Codec/Container
 *   - kompatibel (H.264 in mp4/m4v/webm) → Original-Pfad zurück, kein Transcode
 *   - sonst → cache-MP4 unter userData/cache/transcoded/<sha1(absPath+mtime+size)>.mp4
 *   - Cache wird über Hash gemerkt → wiederholte Imports = instant
 *   - In-Flight-Lock verhindert doppeltes Transcoden bei concurrent calls
 */

const BROWSER_VIDEO_CODECS = new Set(['h264', 'avc1', 'vp8', 'vp9']);
const BROWSER_CONTAINERS   = new Set(['.mp4', '.m4v', '.webm']);

interface TranscodeResult {
  previewPath: string;
  fromCache: boolean;
  transcoded: boolean;     // true wenn neu transcoded (false wenn skipped oder cache-hit)
}

const inFlight = new Map<string, Promise<TranscodeResult>>();

function cacheDir(): string {
  return path.join(app.getPath('userData'), 'cache', 'transcoded');
}

async function ensureCacheDir(): Promise<void> {
  await fsp.mkdir(cacheDir(), { recursive: true });
}

async function probeCodec(absPath: string): Promise<{ codec: string; container: string }> {
  const ffprobe = resolveBin('ffprobe');
  if (!ffprobe) throw new Error('ffprobe not available — install via `brew install ffmpeg`');

  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'json',
      absPath,
    ];
    const proc = spawn(ffprobe, args);
    let out = ''; let err = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exit ${code}: ${err.slice(-300)}`));
      try {
        const json = JSON.parse(out);
        const codec = json?.streams?.[0]?.codec_name ?? 'unknown';
        const container = path.extname(absPath).toLowerCase();
        resolve({ codec, container });
      } catch (e) {
        reject(new Error(`ffprobe parse failed: ${(e as Error).message}`));
      }
    });
    proc.on('error', reject);
  });
}

async function hashKey(absPath: string): Promise<string> {
  const stat = await fsp.stat(absPath);
  const raw = `${absPath}|${stat.mtimeMs}|${stat.size}`;
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

async function runTranscode(input: string, output: string): Promise<void> {
  const ffmpeg = resolveBin('ffmpeg');
  if (!ffmpeg) throw new Error('ffmpeg not available');

  // Temp-File während Encode → atomic rename am Ende, damit halbe Dateien
  // nie als gültiger Cache erkannt werden.
  const tmp = output + '.tmp';

  return new Promise<void>((resolve, reject) => {
    const args = [
      '-y',
      '-i', input,
      '-c:v', 'libx264',
      '-preset', 'veryfast',  // veryfast statt ultrafast → bessere Quality bei kaum mehr CPU
      '-crf', '18',           // visually-near-lossless für Preview-Cache (war 23)
      '-pix_fmt', 'yuv420p',  // safari/chromium-Kompatibilität
      '-c:a', 'aac',
      '-b:a', '160k',
      '-movflags', '+faststart',
      // ffmpeg meckert bei .tmp-Endung ("use a standard extension or specify format manually") → explizit setzen
      '-f', 'mp4',
      tmp,
    ];

    let stderrTail = '';
    const proc = spawn(ffmpeg, args);
    proc.stderr.on('data', (d) => {
      stderrTail = (stderrTail + d.toString()).slice(-2000);
    });
    proc.on('close', async (code) => {
      if (code !== 0) {
        try { await fsp.unlink(tmp); } catch { /* ignore */ }
        return reject(new Error(`ffmpeg transcode failed (exit ${code}): ${stderrTail.slice(-500)}`));
      }
      try {
        // Größe prüfen — leerer Output ≈ Failure
        const st = await fsp.stat(tmp);
        if (st.size < 1024) {
          await fsp.unlink(tmp).catch(() => {});
          return reject(new Error(`ffmpeg output suspiciously small (${st.size} bytes)`));
        }
        await fsp.rename(tmp, output);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
    proc.on('error', reject);
  });
}

export async function transcodeForPreview(absPath: string): Promise<TranscodeResult> {
  if (!absPath || !fs.existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  // Quick path: probe codec+container, skip wenn schon Browser-kompatibel
  let codec = 'unknown';
  let container = path.extname(absPath).toLowerCase();
  try {
    const probed = await probeCodec(absPath);
    codec = probed.codec;
    container = probed.container;
  } catch (e) {
    console.warn(`[transcode] probe failed, will attempt transcode: ${(e as Error).message}`);
  }

  if (BROWSER_VIDEO_CODECS.has(codec) && BROWSER_CONTAINERS.has(container)) {
    return { previewPath: absPath, fromCache: false, transcoded: false };
  }

  await ensureCacheDir();
  const key = await hashKey(absPath);
  const out = path.join(cacheDir(), `${key}.mp4`);

  // Cache-Hit
  if (fs.existsSync(out)) {
    return { previewPath: out, fromCache: true, transcoded: false };
  }

  // In-Flight-Dedup: identische concurrent Calls teilen sich denselben Promise
  if (inFlight.has(out)) {
    return inFlight.get(out)!;
  }

  const promise = (async (): Promise<TranscodeResult> => {
    console.log(`[transcode] ${path.basename(absPath)} (${codec}${container}) → ${path.basename(out)}`);
    const t0 = Date.now();
    await runTranscode(absPath, out);
    console.log(`[transcode] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return { previewPath: out, fromCache: false, transcoded: true };
  })();

  inFlight.set(out, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(out);
  }
}
