/**
 * Audio-Energy-Extraction via ffmpeg ebur128 (Phase 9.6.7b).
 *
 * Output: 1Hz Array von momentary LUFS (Loudness Units relative to Full Scale).
 * Typische Werte: -70 (silent) bis -10 (very loud). Normalize zu 0..1 für
 * Peak-Detection in highlights.ts.
 *
 * ebur128 emittiert stderr-Lines wie:
 *   [Parsed_ebur128_0 @ 0x...] t: 0.100   M: -70.0 S: -70.0 I: -70.0 LUFS LRA: 0.0 LU
 *
 * Wir parsen `t:` (Zeit in sec) + `M:` (Momentary LUFS) und groupen pro Sekunde.
 */

import { spawn } from 'node:child_process';

export interface AudioEnergyBucket {
  /** Sekunde im Audio (start of bucket). */
  sec: number;
  /** Momentary LUFS-Durchschnitt im Bucket. -70 = silence, -10 = very loud. */
  lufs: number;
}

const SILENCE_LUFS = -70;

export async function extractAudioEnergy(
  audioPath: string,
  jobId: string,
  maxDurationSec: number = 120,
): Promise<AudioEnergyBucket[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'ffmpeg',
      ['-nostats', '-i', audioPath, '-af', 'ebur128=metadata=1', '-f', 'null', '-'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const samplesPerSec = new Map<number, number[]>();
    let stderrBuf = '';
    let killed = false;
    const timeout = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, maxDurationSec * 1000);

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() ?? '';
      for (const line of lines) {
        // Parse "t:    X.XXX" und "M:    -YY.Y" auf gleicher Zeile.
        const tMatch = /t:\s*([\d.]+)/.exec(line);
        const mMatch = /M:\s*(-?[\d.]+)/.exec(line);
        if (tMatch && mMatch) {
          const sec = Math.floor(parseFloat(tMatch[1]));
          const lufs = parseFloat(mMatch[1]);
          if (!Number.isFinite(lufs)) continue;
          // -inf, -120 etc → clamp auf SILENCE_LUFS.
          const clamped = lufs < SILENCE_LUFS ? SILENCE_LUFS : lufs;
          const arr = samplesPerSec.get(sec) ?? [];
          arr.push(clamped);
          samplesPerSec.set(sec, arr);
        }
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (killed) {
        reject(new Error(`audio-energy extract timeout after ${maxDurationSec}s`));
        return;
      }
      // ebur128 exit-code ist meistens 0 selbst bei warnings — wir tolerieren <0.
      if (code !== 0 && code !== null) {
        console.warn(`[${jobId}] ebur128 exit=${code} (continuing with parsed data)`);
      }
      const buckets: AudioEnergyBucket[] = [];
      const seconds = Array.from(samplesPerSec.keys()).sort((a, b) => a - b);
      for (const sec of seconds) {
        const samples = samplesPerSec.get(sec)!;
        const avg = samples.reduce((s, v) => s + v, 0) / samples.length;
        buckets.push({ sec, lufs: avg });
      }
      console.log(`[${jobId}] audio-energy buckets=${buckets.length}`);
      resolve(buckets);
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`ffmpeg ebur128 spawn failed: ${err.message}`));
    });
  });
}

/**
 * Normalisiert LUFS-Buckets auf 0..1 Energy-Werte (1Hz Array).
 * Mapping: SILENCE_LUFS (-70) → 0, -10 LUFS → 1.
 */
export function normalizeEnergy(buckets: AudioEnergyBucket[]): number[] {
  const energy: number[] = [];
  for (const b of buckets) {
    const norm = Math.max(0, Math.min(1, (b.lufs - SILENCE_LUFS) / (SILENCE_LUFS - -10) * -1));
    energy.push(norm);
  }
  return energy;
}

/**
 * Findet Audio-Peaks: Sekunden wo Energy > mean + threshold*stddev.
 * Returns Array von 0/1 (peak flag) gleicher Länge wie energy[].
 */
export function detectPeaks(energy: number[], threshold = 1.0): number[] {
  if (energy.length === 0) return [];
  const mean = energy.reduce((s, v) => s + v, 0) / energy.length;
  const variance = energy.reduce((s, v) => s + (v - mean) ** 2, 0) / energy.length;
  const stddev = Math.sqrt(variance);
  const cutoff = mean + threshold * stddev;
  return energy.map((v) => (v >= cutoff ? 1 : 0));
}

/**
 * Phase A3.8 (2026-05-17): Transient-Detection — findet plötzliche Energy-
 * Jumps (>jumpThreshold absolute Energy-Differenz innerhalb 1 Sekunde).
 *
 * Warum: bei Gaming-Audio (Fortnite/Warzone) dominieren laute Background-
 * Game-Sounds (constant). Kills sind oft kurze Spikes ÜBER das constant-loud
 * Level — `detectPeaks` mit globalem mean+stddev übersieht die. Transient-
 * Detection vergleicht stattdessen Wert mit den letzten 2 Sekunden (lokaler
 * Mean) und findet Anstiege.
 *
 * Returns Array von 0/1 gleicher Länge wie energy[].
 */
export function detectTransients(energy: number[], jumpThreshold = 0.15): number[] {
  if (energy.length < 3) return new Array(energy.length).fill(0);
  const flags = new Array(energy.length).fill(0);
  // Window-Größe: 3 Sekunden vorher für lokalen Mean.
  const W = 3;
  for (let i = W; i < energy.length; i++) {
    let localSum = 0;
    for (let j = i - W; j < i; j++) localSum += energy[j];
    const localMean = localSum / W;
    const delta = energy[i] - localMean;
    if (delta >= jumpThreshold) flags[i] = 1;
  }
  return flags;
}

/**
 * Phase A3.8: Kombiniert detectPeaks + detectTransients. Returns Array
 * gleicher Länge wo 1 = peak ODER transient. Für gaming-mode wird das
 * direkt an highlights.ts als audioPeaks[] weitergegeben.
 */
export function detectPeaksOrTransients(
  energy: number[],
  peakThreshold = 1.0,
  jumpThreshold = 0.15,
): number[] {
  const peaks = detectPeaks(energy, peakThreshold);
  const trans = detectTransients(energy, jumpThreshold);
  return peaks.map((p, i) => (p || trans[i] ? 1 : 0));
}
