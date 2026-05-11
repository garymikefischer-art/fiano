/**
 * Cloudflare R2 Client (S3-kompatibel) — Storage für fiano Render Worker.
 *
 * Multi-Input-Support (Phase 9.6.4+): Mobile uploaded mehrere Files (source,
 * intro, music-tracks, voice-overs) jeweils mit eigenem Key. Worker holt
 * alle ab + ersetzt Platzhalter in den FFmpeg-Args.
 */

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';

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

/** Pre-Signed PUT-URL für einen Server-bestimmten Key (verhindert Mobile-side
 *  arbitrary uploads außerhalb der user-eigenen Folder). 1h Gültigkeit. */
export async function createUploadUrlForKey(key: string): Promise<{ uploadUrl: string; key: string }> {
  const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key });
  const uploadUrl = await getSignedUrl(requireR2(), cmd, { expiresIn: 60 * 60 });
  return { uploadUrl, key };
}

/** Download object aus R2 → local /tmp/file. */
export async function downloadToFile(key: string, destPath: string): Promise<number> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const res = await requireR2().send(cmd);
  if (!res.Body) throw new Error(`R2 object empty: ${key}`);
  const stream = res.Body as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }
  const buf = Buffer.concat(chunks);
  await writeFile(destPath, buf);
  return buf.byteLength;
}

/** Upload local file to R2 under specified key. */
export async function uploadFile(localPath: string, key: string, contentType = 'video/mp4'): Promise<string> {
  const stats = await stat(localPath);
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: createReadStream(localPath),
    ContentType: contentType,
    ContentLength: stats.size,
  });
  await requireR2().send(cmd);
  return key;
}

/** Pre-Signed-Download-URL fürs Output (24h). */
export async function createOutputDownloadUrl(key: string): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(requireR2(), cmd, { expiresIn: 60 * 60 * 24 });
}
