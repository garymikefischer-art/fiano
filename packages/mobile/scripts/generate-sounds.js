#!/usr/bin/env node
/**
 * Generiert die 5 Mobile-Sounds als WAV-Files in assets/sounds/.
 *
 * 1:1-Replikation des prozeduralen Desktop-Designs (src/renderer/src/lib/sounds.ts):
 *   - Sine-Waves mit linearem Attack + exponential Decay
 *   - 1-pole Low-pass-Filter @ 4.5 kHz für warmen Klang
 *   - Mono, 44.1 kHz, 16-bit PCM
 *
 * Einmal-Run pro Setup, oder wenn das Sound-Design sich ändert:
 *   node scripts/generate-sounds.js
 *
 * WAV statt MP3 weil keine Encoder-Dependency nötig ist und expo-av WAV
 * nativ abspielt. Total bundle ~250 KB für alle 5 Sounds.
 */

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const LOWPASS_FC = 4500;
const LOWPASS_A = 1 - Math.exp((-2 * Math.PI * LOWPASS_FC) / SAMPLE_RATE);

/** Erzeugt Sample-Array für einen einzelnen Sine-Ton mit Hüll-Kurve. */
function tone({ freq, startAt = 0, duration = 0.4, gain = 0.04, attack = 0.05 }) {
  const totalSec = startAt + duration;
  const totalSamples = Math.ceil(totalSec * SAMPLE_RATE);
  const samples = new Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const t = i / SAMPLE_RATE;
    if (t < startAt) {
      samples[i] = 0;
      continue;
    }
    const localT = t - startAt;
    let env;
    if (localT < attack) {
      env = (localT / attack) * gain;
    } else {
      // exponential decay from gain → 0.0001 over (duration - attack)
      const decayT = localT - attack;
      const decayDur = Math.max(0.001, duration - attack);
      const decayFraction = Math.min(1, decayT / decayDur);
      env = gain * Math.exp(-Math.log(gain / 0.0001) * decayFraction);
    }
    samples[i] = Math.sin(2 * Math.PI * freq * t) * env;
  }
  return samples;
}

/** Mischt N Sample-Arrays additiv. Output-Länge = max length. */
function mix(...arrays) {
  const len = Math.max(...arrays.map((a) => a.length));
  const out = new Array(len).fill(0);
  for (const arr of arrays) {
    for (let i = 0; i < arr.length; i++) out[i] += arr[i];
  }
  return out;
}

/** 1-pole Low-pass IIR — sanfter Cut der schrillen Anteile. */
function lowpass(samples) {
  const out = new Array(samples.length);
  let y = 0;
  for (let i = 0; i < samples.length; i++) {
    y = LOWPASS_A * samples[i] + (1 - LOWPASS_A) * y;
    out[i] = y;
  }
  return out;
}

/** Float [-1,1] → 16-bit PCM Little Endian. */
function toPCM16(samples) {
  const buf = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const v = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
    buf.writeInt16LE(v, i * 2);
  }
  return buf;
}

/** WAV-Container schreiben (RIFF + fmt + data). */
function writeWav(filename, samples) {
  const pcm = toPCM16(samples);
  const headerSize = 44;
  const totalSize = headerSize + pcm.length;
  const buf = Buffer.alloc(totalSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(totalSize - 8, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(pcm.length, 40);
  pcm.copy(buf, 44);

  fs.writeFileSync(filename, buf);
  console.log(`  ✓ ${path.basename(filename)} — ${(buf.length / 1024).toFixed(1)} KB`);
}

/* ─── Sound-Definitionen — 1:1 zu Desktop sounds.ts ─────────────── */

const SOUNDS = {
  // App Start: warme E-Major-Triade (E5 + G#5 + B5), gestaffelt.
  appStart: () =>
    mix(
      tone({ freq: 659.25, gain: 0.05, duration: 1.2, attack: 0.08 }),
      tone({ freq: 830.61, gain: 0.04, duration: 1.2, attack: 0.1, startAt: 0.06 }),
      tone({ freq: 987.77, gain: 0.04, duration: 1.2, attack: 0.12, startAt: 0.12 }),
    ),

  // Project Open: C6 + subtile G6-Quinte. Hell, kurz.
  projectOpen: () =>
    mix(
      tone({ freq: 1046.5, gain: 0.04, duration: 0.5, attack: 0.04 }),
      tone({ freq: 1568, gain: 0.02, duration: 0.5, attack: 0.06, startAt: 0.05 }),
    ),

  // Export Done: G5 → B5 → E6 aufsteigend.
  exportDone: () =>
    mix(
      tone({ freq: 783.99, gain: 0.04, duration: 0.4, attack: 0.04 }),
      tone({ freq: 987.77, gain: 0.04, duration: 0.4, attack: 0.05, startAt: 0.12 }),
      tone({ freq: 1318.51, gain: 0.05, duration: 0.8, attack: 0.06, startAt: 0.24 }),
    ),

  // Notify: einzelner softer ding (E6).
  notify: () => tone({ freq: 1318.51, gain: 0.03, duration: 0.35, attack: 0.03 }),

  // Error: F5 → D#5, sanfter Tritone-Fall.
  error: () =>
    mix(
      tone({ freq: 698.46, gain: 0.04, duration: 0.5, attack: 0.04 }),
      tone({ freq: 622.25, gain: 0.04, duration: 0.6, attack: 0.05, startAt: 0.1 }),
    ),
};

/* ─── Run ──────────────────────────────────────────────────────── */

const outDir = path.join(__dirname, '..', 'assets', 'sounds');
fs.mkdirSync(outDir, { recursive: true });

console.log(`Writing 5 sounds → ${outDir}`);
for (const [name, gen] of Object.entries(SOUNDS)) {
  const samples = lowpass(gen());
  writeWav(path.join(outDir, `${name}.wav`), samples);
}
console.log('Done.');
