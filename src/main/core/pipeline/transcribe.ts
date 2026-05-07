import path from 'node:path';
import fs from 'node:fs/promises';
import { extractAudio, getDuration, splitAudio } from '../ffmpeg';
import type { PipelineStep } from './types';

export interface TranscriptSegment { start: number; end: number; text: string }
export interface Transcript { segments: TranscriptSegment[] }

const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const SAFE_BYTES = 24 * 1024 * 1024;     // unter 25MB-Limit der API
const CHUNK_SECONDS = 30 * 60;           // 30 min @ 32kbps mono = ~7MB

/** Echte Whisper-Transkription mit automatischem Chunking für lange Videos. */
export const transcribeStep: PipelineStep<{ sourcePath: string }, Transcript> = {
  name: 'transcribe',
  async run({ sourcePath }, ctx) {
    if (!ctx.apiKey) throw new Error('OpenAI API key missing. Add it in Settings.');

    // 1) Audio extrahieren
    ctx.emit({ type: 'log', step: 'transcribe', message: 'Extracting audio…' });
    const audioPath = path.join(ctx.workDir, 'audio.mp3');
    await extractAudio(sourcePath, audioPath, ctx);
    ctx.emit({ type: 'progress', step: 'transcribe', percent: 20 });

    // 2) Größe prüfen → ggf. chunken
    const stat = await fs.stat(audioPath);

    let segments: TranscriptSegment[];
    if (stat.size <= SAFE_BYTES) {
      ctx.emit({ type: 'log', step: 'transcribe', message: 'Sending to Whisper…' });
      segments = await transcribeFile(audioPath, ctx.apiKey, 0, ctx.signal);
      ctx.emit({ type: 'progress', step: 'transcribe', percent: 90 });
    } else {
      const duration = await getDuration(audioPath);
      ctx.emit({ type: 'log', step: 'transcribe', message: `Long file (${Math.round(duration / 60)} min) — chunking…` });
      const chunks = await splitAudio(audioPath, ctx.workDir, CHUNK_SECONDS, duration);
      segments = [];
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const part = await transcribeFile(c.path, ctx.apiKey, c.offset, ctx.signal);
        segments.push(...part);
        ctx.emit({
          type: 'progress',
          step: 'transcribe',
          percent: 20 + Math.round(((i + 1) / chunks.length) * 70),
        });
        await fs.rm(c.path, { force: true }).catch(() => {});
      }
    }

    // 3) Speichern
    const transcript: Transcript = { segments };
    await fs.writeFile(
      path.join(ctx.workDir, 'transcript.json'),
      JSON.stringify(transcript, null, 2),
    );
    ctx.emit({ type: 'progress', step: 'transcribe', percent: 100 });
    return transcript;
  },
};

async function transcribeFile(
  audioPath: string,
  apiKey: string,
  offset: number,
  signal?: AbortSignal,
): Promise<TranscriptSegment[]> {
  const buf = await fs.readFile(audioPath);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'audio.mp3');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');

  const res = await fetch(WHISPER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Whisper API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json: any = await res.json();
  const segs = json.segments ?? [];
  return segs.map((s: any) => ({
    start: (s.start ?? 0) + offset,
    end: (s.end ?? 0) + offset,
    text: (s.text ?? '').trim(),
  }));
}
