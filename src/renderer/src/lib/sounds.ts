/**
 * Apple-Style minimalistische Sound-Effekte via Web Audio API.
 * Procedural — keine Asset-Files.
 *
 * Design:
 *   - Sine-Waves only (saubere Töne ohne Harmonics)
 *   - Soft attack (40-80ms) für eleganten Einstieg
 *   - Low peak gain (~0.04 = -28dB) → Premium / dezent
 *   - Low-pass-Filter @ 4kHz für warmen Klang
 *   - Exponential decay → smoothes Ausklingen
 *   - Major/Octave-Intervalle (warm, einladend) statt Minor
 *
 * Mute:   localStorage.setItem('fiano.sounds.muted', '1')
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let masterFilter: BiquadFilterNode | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (localStorage.getItem('fiano.sounds.muted') === '1') return null;
  if (!ctx) {
    try {
      // @ts-expect-error webkitAudioContext fallback
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Master-Chain: gain → low-pass → destination → einheitliche Klangfarbe für alle Sounds
      masterGain = ctx.createGain();
      masterGain.gain.value = 1.0;
      masterFilter = ctx.createBiquadFilter();
      masterFilter.type = 'lowpass';
      masterFilter.frequency.value = 4500;  // sanfter cut der schrillen Anteile
      masterFilter.Q.value = 0.7;
      masterGain.connect(masterFilter).connect(ctx.destination);
    } catch (e) {
      console.warn('[sounds] AudioContext not available:', e);
      return null;
    }
  }
  // AudioContext kann 'suspended' sein bis User-Gesture (Browser-Policy).
  // Bei jedem Aufruf versuchen zu resumieren (kostet nix wenn schon running).
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

interface ToneOpts {
  freq: number;
  startAt?: number;   // sec relative to now
  duration?: number;  // sec
  gain?: number;      // peak gain 0..1
  attack?: number;    // sec — fade-in
}

function tone(opts: ToneOpts) {
  const c = getContext();
  if (!c || !masterGain) return;
  const now = c.currentTime + (opts.startAt ?? 0);
  const dur = opts.duration ?? 0.4;
  const peak = opts.gain ?? 0.04;
  const att = opts.attack ?? 0.05;

  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = opts.freq;

  // Envelope: 0 → peak (linear, smooth) → 0.0001 (exponential, natural decay)
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(peak, now + att);
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(env).connect(masterGain);
  osc.start(now);
  osc.stop(now + dur + 0.05);
}

/** App Start: warme E-Major-Triade (E5 + G#5 + B5), gestaffelt. */
export function appStart() {
  tone({ freq: 659.25, gain: 0.05, duration: 1.2, attack: 0.08 });                 // E5
  tone({ freq: 830.61, gain: 0.04, duration: 1.2, attack: 0.10, startAt: 0.06 });  // G#5
  tone({ freq: 987.77, gain: 0.04, duration: 1.2, attack: 0.12, startAt: 0.12 });  // B5
}

/** Project Open: C6 + subtile G6-Quinte. Hell, kurz. */
export function projectOpen() {
  tone({ freq: 1046.50, gain: 0.04, duration: 0.5, attack: 0.04 });                // C6
  tone({ freq: 1568,    gain: 0.02, duration: 0.5, attack: 0.06, startAt: 0.05 }); // G6 (sehr leise Quinte)
}

/** Export Done: G5 → B5 → E6 aufsteigend, smooth, lang ausklingend. */
export function exportDone() {
  tone({ freq: 783.99, gain: 0.04, duration: 0.4,  attack: 0.04 });                // G5
  tone({ freq: 987.77, gain: 0.04, duration: 0.4,  attack: 0.05, startAt: 0.12 }); // B5
  tone({ freq: 1318.51, gain: 0.05, duration: 0.8, attack: 0.06, startAt: 0.24 }); // E6
}

/** Notify: einzelner softer ding (E6, hoch & dezent). */
export function notify() {
  tone({ freq: 1318.51, gain: 0.03, duration: 0.35, attack: 0.03 });
}

/** Error: descending Minor-Sekunde (sanftes "uh-oh", nicht harsh). */
export function error() {
  tone({ freq: 698.46, gain: 0.04, duration: 0.5, attack: 0.04 });                 // F5
  tone({ freq: 622.25, gain: 0.04, duration: 0.6, attack: 0.05, startAt: 0.10 });  // D#5 (Tritone-feel sanft)
}

export function setMuted(muted: boolean) {
  localStorage.setItem('fiano.sounds.muted', muted ? '1' : '0');
}

export function isMuted(): boolean {
  return localStorage.getItem('fiano.sounds.muted') === '1';
}
