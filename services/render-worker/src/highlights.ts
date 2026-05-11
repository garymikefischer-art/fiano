/**
 * Highlight-Detection (Phase 9.6.7b) — heuristische Erkennung von "interessanten"
 * Stellen im Video aus dem Whisper-Transcript.
 *
 * MVP-Algorithmus (ohne Audio-Energy-Analysis):
 *   1. Gruppiere benachbarte Whisper-Segments in 6-15s Windows (gap-Threshold 2s).
 *   2. Score pro Window: text-length × log(segment-count) × keyword-bonus.
 *   3. Filter: nur Windows mit duration 4..20s, min 1 segment.
 *   4. Sort by score desc, take top 15.
 *   5. Re-sort by start-time für natural reading.
 *
 * Keyword-Bonus: gaming/podcast-relevante Wörter geben +30% Score.
 *
 * Phase 9.6.7c könnte audio-energy-detection via ffmpeg astats addieren —
 * für jetzt: text-density-only reicht für Podcast / längere Speech-Inhalte.
 */

interface InputCue {
  startSec: number;
  endSec: number;
  text: string;
}

export interface Highlight {
  startSec: number;
  endSec: number;
  /** 0..1 — relative Score, höher = relevanter. */
  score: number;
  /** Erste paar Wörter als Label. */
  label: string;
  /** Debug: warum dieser Highlight gewählt wurde. */
  reason: string;
}

// Schlüssel-Wörter die "interessante" Momente signalisieren — Gaming, Reactions,
// Podcast-Pointe. Multi-language (de + en); case-insensitive Match.
const KEYWORDS = [
  // Gaming reactions
  'kill', 'killed', 'gewonnen', 'won', 'sieg', 'victory', 'royale',
  'wow', 'krass', 'insane', 'unbelievable', 'unglaublich', 'wahnsinn',
  'oh mein', 'oh my', 'oh no', 'fuck', 'verdammt', 'scheiße',
  'clutch', 'snipe', 'headshot', 'ace', 'triple',
  // Podcast points
  'wichtig', 'important', 'key point', 'kernpunkt', 'fazit', 'conclusion',
  'spannend', 'interesting', 'frage', 'question', 'antwort', 'answer',
];

const MIN_WINDOW_SEC = 4;
const MAX_WINDOW_SEC = 20;
const GAP_THRESHOLD_SEC = 2;
const TARGET_WINDOW_SEC = 12;
const MAX_HIGHLIGHTS = 15;

export function detectHighlights(cues: InputCue[]): Highlight[] {
  if (cues.length === 0) return [];

  interface Window {
    start: number;
    end: number;
    segments: InputCue[];
    textLen: number;
    keywordHits: number;
  }
  const windows: Window[] = [];

  for (const cue of cues) {
    const last = windows[windows.length - 1];
    const text = cue.text.toLowerCase();
    const keywordHit = KEYWORDS.some((k) => text.includes(k));

    const fitsInLast =
      last &&
      cue.startSec - last.end < GAP_THRESHOLD_SEC &&
      cue.endSec - last.start <= MAX_WINDOW_SEC;

    if (fitsInLast) {
      last.end = Math.max(last.end, cue.endSec);
      last.segments.push(cue);
      last.textLen += cue.text.length;
      if (keywordHit) last.keywordHits += 1;
    } else {
      windows.push({
        start: cue.startSec,
        end: cue.endSec,
        segments: [cue],
        textLen: cue.text.length,
        keywordHits: keywordHit ? 1 : 0,
      });
    }
  }

  // Filter: Mindest- und Max-Dauer.
  const candidates = windows.filter((w) => {
    const dur = w.end - w.start;
    return dur >= MIN_WINDOW_SEC && dur <= MAX_WINDOW_SEC && w.segments.length >= 1;
  });

  if (candidates.length === 0) return [];

  // Score-Berechnung. Normalisierung pro max textLen für stable 0..1 range.
  const maxTextLen = candidates.reduce((m, w) => Math.max(m, w.textLen), 1);
  const scored = candidates.map((w) => {
    const segCount = w.segments.length;
    const durationFit =
      1 - Math.abs(w.end - w.start - TARGET_WINDOW_SEC) / TARGET_WINDOW_SEC; // 1=perfect, decreases with delta
    const lengthScore = w.textLen / maxTextLen; // 0..1
    const keywordBonus = w.keywordHits > 0 ? 0.3 + Math.min(0.2, w.keywordHits * 0.05) : 0;
    const segCountScore = Math.min(1, Math.log(segCount + 1) / Math.log(8)); // 0..1, log saturation
    const score = Math.min(
      1,
      lengthScore * 0.5 + segCountScore * 0.2 + durationFit * 0.2 + keywordBonus,
    );
    const firstText = w.segments[0]?.text ?? '';
    const label = firstText
      .trim()
      .replace(/^[^a-zA-Z0-9äöüÄÖÜß]+/, '')
      .slice(0, 50);
    const reasons: string[] = [];
    if (w.keywordHits > 0) reasons.push(`${w.keywordHits} keyword-hit${w.keywordHits > 1 ? 's' : ''}`);
    if (lengthScore > 0.7) reasons.push('high-density');
    if (segCount >= 4) reasons.push('dense-speech');
    return {
      startSec: w.start,
      endSec: Math.min(w.end, w.start + MAX_WINDOW_SEC),
      score,
      label: label || `Clip @ ${Math.floor(w.start)}s`,
      reason: reasons.join(', ') || 'speech-density',
    };
  });

  // Top N by score, dann re-sort by start-time.
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, MAX_HIGHLIGHTS);
  top.sort((a, b) => a.startSec - b.startSec);
  return top;
}
