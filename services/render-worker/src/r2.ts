/**
 * Cloudflare R2 Client (S3-kompatibel) — Storage für fiano Render Worker.
 *
 * R2 free tier: 10 GB Storage + unlimited Egress. Perfekt für Video-Files >100 MB
 * weil Supabase-Free-Egress (2 GB/Monat) sonst nach ~6 Renders erschöpft wäre.
 *
 * Auth: nur Server-Side. Mobile bekommt Pre-Signed-URLs für Upload + Download,
 * Worker hat den R2-Access-Key (NIEMALS im Mobile-Bundle).
 *
 * R2-Endpoint-Format: https://<accountid>.r2.cloudflarestorage.com
 *
 * Bucket-Struktur:
 *   sources/${userId}/${projectId}/${jobId}-src.mp4
 *   outputs/${userId}/${projectId}/${jobId}.mp4
 *
 * Lifecycle-Policy (in Cloudflare-Dashboard manuell setzen): 24h TTL für beide
 * Präfixe → automatisches Cleanup, keine Storage-Akkumulation.
 */

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

// .trim() um trailing/leading whitespace aus env-vars zu strippen — User-
// Bug: 'gcloud run deploy --set-env-vars "R2_ACCOUNT_ID= 7a26875..."'
// hatte ein leading space, was die R2-endpoint-URL auf 'https:// 7a26...'
// kaputt machte → AWS SDK warf 'Invalid URL'.
const ACCOUNT_ID = (process.env.R2_ACCOUNT_ID ?? '').trim();
const ACCESS_KEY_ID = (process.env.R2_ACCESS_KEY_ID ?? '').trim();
const SECRET_ACCESS_KEY = (process.env.R2_SECRET_ACCESS_KEY ?? '').trim();
const BUCKET = (process.env.R2_BUCKET ?? 'fiano-renders').trim();
const R2_OK = !!(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY);

if (!R2_OK) {
  console.error(
    '[r2] WARNING: R2 credentials missing — Upload/Download endpoints will fail.',
  );
}

const r2 = R2_OK
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
      },
    })
  : null;

function requireR2(): S3Client {
  if (!r2) throw new Error('R2 not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
  return r2;
}

/**
 * Erstellt eine Pre-Signed PUT-URL die Mobile direkt nutzt um das Source-File
 * zu uploaden (ohne durch den Worker zu gehen). 1h Gültigkeit reicht da Mobile
 * direkt nach Upload den Render-Request schickt.
 */
export async function createSourceUploadUrl(
  userId: string,
  projectId: string,
  jobId: string,
): Promise<{ uploadUrl: string; sourceKey: string }> {
  const sourceKey = `sources/${userId}/${projectId}/${jobId}-src.mp4`;
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: sourceKey,
    ContentType: 'video/mp4',
  });
  const uploadUrl = await getSignedUrl(requireR2(), cmd, { expiresIn: 60 * 60 });
  return { uploadUrl, sourceKey };
}

/** Worker-side download — schreibt das R2-Object direkt auf lokales tmp-File. */
export async function downloadSourceTo(sourceKey: string, destPath: string): Promise<number> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: sourceKey });
  const res = await requireR2().send(cmd);
  if (!res.Body) throw new Error('R2 source has no body');

  const { writeFile } = await import('node:fs/promises');
  const stream = res.Body as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }
  const buf = Buffer.concat(chunks);
  await writeFile(destPath, buf);
  return buf.byteLength;
}

/** Worker-side upload — sendet das fertige Render-Output File zu R2. */
export async function uploadOutput(
  localPath: string,
  userId: string,
  projectId: string,
  jobId: string,
  outputName?: string,
): Promise<string> {
  const stats = await stat(localPath);
  const outputKey = `outputs/${userId}/${projectId}/${outputName ?? `${jobId}.mp4`}`;
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: outputKey,
    Body: createReadStream(localPath),
    ContentType: 'video/mp4',
    ContentLength: stats.size,
  });
  await requireR2().send(cmd);
  return outputKey;
}

/** Pre-Signed-Download-URL fürs Output (24h gültig). */
export async function createOutputDownloadUrl(outputKey: string): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: outputKey });
  return getSignedUrl(requireR2(), cmd, { expiresIn: 60 * 60 * 24 });
}
