/**
 * Whisper Transcribe-Pipeline (Phase 9.6.7a).
 *
 * Flow:
 *   1. Audio-Extract aus Source via ffmpeg → mp3 mono 16kHz 64kbps
 *      (Whisper-optimiert; ~8 KB/s → ~3000s = 50 min in 25 MB Limit).
 *   2. POST audio.mp3 zur OpenAI Whisper API mit response_format=verbose_json.
 *   3. Parse segments[].start/end/text → SubtitleCue[].
 *
 * Audio-Größe > 25 MB → Error mit hint auf shorter clip. Chunking (Phase 9.6.8)
 * kommt später wenn echte long-form-Videos kommen.
 *
 * Hard cap auf maxDurationSec für Audio-Extract — Whisper-API hat eigenen
 * Server-Timeout (typisch 60-120s), wir setzen 300s gesamt.
 */

import { spawn } from 'node:child_process';
import { readFile, stat, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { detectHighlights, type Highlight } from './highlights.js';

const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB Whisper-API-Limit

export interface SubtitleCue {
  startSec: number;
  endSec: number;
  text: string;
}

export interface TranscribeOpts {
  sourcePath: string;
  openaiApiKey: string;
  jobId: string;
  /** Default 300s — Audio-Extract + Whisper-Call zusammen. */
  maxDurationSec?: number;
}

export interface TranscribeResult {
  cues: SubtitleCue[];
  /** Phase 9.6.7b: erkannte Highlight-Clips aus den Cues (text-density-Heuristik). */
  highlights: Highlight[];
  /** Vollständige Whisper-Response für debug/persist (optional Cache). */
  raw: unknown;
  audioBytes: number;
  durationSec: number;
}

export async function transcribeAudio(opts: TranscribeOpts): Promise<TranscribeResult> {
  const maxSec = opts.maxDurationSec ?? 300;
  const jobId = opts.jobId;

  if (!opts.openaiApiKey || opts.openaiApiKey.length < 10) {
    throw new Error('OpenAI API key required');
  }

  const audioPath = path.join(tmpdir(), `${jobId}-audio.mp3`);

  try {
    // ─── 1. Audio-Extract via ffmpeg ──────────────────────────────────
    console.log(`[${jobId}] extracting audio: ${opts.sourcePath} → ${audioPath}`);
    await extractAudio(opts.sourcePath, audioPath, jobId, maxSec);

    const audioStats = await stat(audioPath);
    if (audioStats.size > MAX_AUDIO_BYTES) {
      throw new Error(
        `Audio too large for Whisper API (${(audioStats.size / 1024 / 1024).toFixed(1)} MB > 25 MB limit). ` +
          'Use a shorter clip (max ~50 minutes at 64kbps mono).',
      );
    }

    // ─── 2. Whisper API Call ──────────────────────────────────────────
    console.log(`[${jobId}] whisper API call (audio=${audioStats.size}b)`);
    const raw = await callWhisper(audioPath, opts.openaiApiKey, jobId);

    // ─── 3. Cues parsen aus segments ──────────────────────────────────
    const segments =
      Array.isArray((raw as { segments?: unknown }).segments)
        ? ((raw as { segments: Array<{ start?: number; end?: number; text?: string }> }).segments)
        : [];
    const cues: SubtitleCue[] = [];
    for (const s of segments) {
      const text = (s.text ?? '').trim();
      if (!text) continue;
      const start = typeof s.start === 'number' ? s.start : 0;
      const end = typeof s.end === 'number' ? s.end : start + 2;
      cues.push({ startSec: start, endSec: end, text });
    }

    const duration =
      typeof (raw as { duration?: unknown }).duration === 'number'
        ? (raw as { duration: number }).duration
        : 0;

    // Phase 9.6.7b — Highlight-Detection als Heuristik auf den Cues.
    const highlights = detectHighlights(cues);
    console.log(`[${jobId}] highlights detected: ${highlights.length}`);

    return { cues, highlights, raw, audioBytes: audioStats.size, durationSec: duration };
  } finally {
    await unlink(audioPath).catch(() => {});
  }
}

function extractAudio(srcPath: string, dstPath: string, jobId: string, maxSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // ffmpeg: vn (no video), ac 1 (mono), ar 16000 (16 kHz, Whisper-optimal),
    // b:a 64k (~8 KB/s), libmp3lame codec.
    const args = [
      '-y',
      '-i', srcPath,
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-b:a', '64k',
      '-c:a', 'libmp3lame',
      dstPath,
    ];
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderrTail = '';
    let killed = false;
    const timeout = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, maxSec * 1000);
    proc.stderr.on('data', (c: Buffer) => {
      stderrTail = (stderrTail + c.toString()).slice(-2048);
    });
    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (killed) reject(new Error(`audio-extract killed after ${maxSec}s`));
      else if (code === 0) resolve();
      else {
        const lines = stderrTail.split('\n').slice(-8).join('\n');
        reject(new Error(`ffmpeg audio-extract exited ${code}:\n${lines}`));
      }
    });
    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });
  });
}

async function callWhisper(audioPath: string, apiKey: string, jobId: string): Promise<unknown> {
  // Node 22 hat FormData + Blob nativ. Wir lesen das File komplett in Memory
  // (≤ 25 MB ist OK auf einer 2 GiB Cloud Run instance).
  const buf = await readFile(audioPath);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'audio.mp3');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');

  const res = await fetch(WHISPER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      const errAny = err as { error?: { message?: string } };
      if (errAny?.error?.message) detail = errAny.error.message;
    } catch {
      /* ignore */
    }
    console.error(`[${jobId}] whisper failed:`, detail);
    if (res.status === 401) throw new Error('Invalid OpenAI API key');
    if (res.status === 429) throw new Error('OpenAI rate limit exceeded — try again in a moment');
    throw new Error(`OpenAI Whisper API: ${detail}`);
  }
  return await res.json();
}

// Kein 'unused' für createReadStream — wird derzeit nicht genutzt, aber
// reserviert für streaming-upload bei großen audios (Phase 9.6.8).
void createReadStream;
