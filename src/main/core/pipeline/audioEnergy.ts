import { spawn } from 'node:child_process';
import { resolveBin } from '../bin';
import type { JobContext } from './types';

/**
 * Extrahiert per-Sekunde Loudness aus einer Audio-Datei.
 * Gibt ein Array zurück (eine Zahl pro Sekunde, normalisiert auf 0..1).
 *
 * Strategie: FFmpeg `astats` mit `asetnsamples=n=16000` chunked das 16kHz-Audio
 * in 1-Sekunden-Blöcke und liefert pro Block den RMS-Pegel in dB.
 * Mapping: -60 dB → 0, -10 dB → 1.
 */
export async function extractAudioEnergy(
  audioPath: string,
  ctx: JobContext,
): Promise<number[]> {
  const bin = resolveBin('ffmpeg');
  if (!bin) throw new Error('ffmpeg not found');

  const args = [
    '-hide_banner',
    '-i', audioPath,
    '-af', 'asetnsamples=n=16000,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level',
    '-f', 'null', '-',
  ];

  return new Promise<number[]>((resolve, reject) => {
    const p = spawn(bin, args, { signal: ctx.signal });
    const values: number[] = [];
    let leftover = '';
    let stderrTail = '';

    p.stderr.on('data', (b: Buffer) => {
      const text = leftover + b.toString();
      const lines = text.split('\n');
      leftover = lines.pop() || '';

      for (const line of lines) {
        const m = line.match(/RMS_level=(-?\d+\.?\d*|inf|-inf)/);
        if (m) {
          const raw = m[1];
          const db = raw === '-inf' ? -100 : raw === 'inf' ? 0 : parseFloat(raw);
          // -60 dB → 0, -10 dB → 1
          const normalized = Math.max(0, Math.min(1, (db + 60) / 50));
          values.push(normalized);
        }
      }

      // letzte Zeilen für Fehler-Diagnose vorhalten
      stderrTail += b.toString();
      if (stderrTail.length > 2000) stderrTail = stderrTail.slice(-2000);
    });

    p.on('error', reject);
    p.on('exit', (code) => {
      if (code === 0) resolve(values);
      else reject(new Error(`audio energy extraction exit ${code}: ${stderrTail.slice(-300)}`));
    });
  });
}
