import path from 'node:path';
import fs from 'node:fs/promises';
import type { PipelineStep } from './types';
import type { Transcript } from './transcribe';
import type { Highlight } from '@shared/types';
import { getDuration } from '../ffmpeg';
import { extractAudioEnergy } from './audioEnergy';

// ════════════════════════════════════════════════════════════════════════════
//   PHRASES
// ════════════════════════════════════════════════════════════════════════════

const KILL_PHRASES: string[] = [
  // Deutsch — direkt
  'hab ihn', 'hab den', 'hab einen', 'hab jemand', 'hab da einen', 'hab den da',
  'habs', 'habsen', 'habn',
  'tot', 'ist tot', 'er ist tot', 'die ist tot', 'der is tot',
  'down', 'der ist down', 'ist down', 'downed', 'der ist im down', 'gedownt',
  'weg', 'der ist weg', 'ist weg', 'der ist raus', 'raus damit',
  'erledigt', 'fertig', 'umgenietet', 'umgehauen', 'umgelegt', 'platt gemacht',
  'liegt', 'liegt am boden', 'auf dem boden', 'der liegt',
  'kopfschuss', 'volltreffer', 'voll erwischt', 'voll getroffen', 'sitzt',
  'fett', 'voll fett', 'richtig getroffen', 'mitten ins',
  'finish', 'finish ihn', 'finishen', 'gefinished', 'finished',
  'push push', 'push ihn', 'push den', 'jetzt pushen', 'push',
  'shield gebrochen', 'shield down', 'armor down', 'kein shield', 'kein schild',
  'schild weg', 'schild ist weg', 'broken',
  'kill bestätigt', 'kill confirmed', 'eliminiert', 'elimination', 'elim',
  'one-shot', 'one shot', 'ein-shot',
  'wipe', 'team wipe', 'ganzes team', 'alle tot', 'alle weg',
  // English
  'got him', 'got it', 'got them', 'gottem', 'got \'em', 'got the kill',
  'he\'s dead', 'he\'s down', 'he\'s done', 'he\'s one shot', 'he\'s one',
  'she\'s dead', 'she\'s down', 'they\'re dead', 'they\'re down',
  'down he goes', 'down she goes', 'down they go',
  'knocked', 'knocked him', 'knocked them', 'knock', 'knock down',
  'cracked him', 'cracked them', 'cracked', 'crack', 'cracking him',
  'no shield', 'no shields', 'no armor', 'broken shield',
  'dead', 'dropped', 'dropped him', 'dropped them',
  'kill', 'killed', 'killing', 'free kill', 'easy kill',
  'eliminated', 'frag', 'fragged',
  'one tap', 'two tap', 'tagged', 'tagging',
  'sprayed', 'spray him', 'spray them', 'sprayed him',
  'pumped', 'pumped him', 'pump',
  'sniped', 'snipe him', 'sniped him',
  'headshot', 'head shot', 'first blood', 'ace',
  'shot', 'shot him', 'shot them',
  'gunned', 'gunned down', 'mowed down', 'mowed him',
  'finish him', 'finish them', 'finishing', 'finished', 'finishing him',
  'push him', 'push them', 'pushing', 'pushed',
  'executed', 'execute',
  'thirsty', 'thirst him', 'thirst', 'thirsting',
  'pick', 'picked', 'picking off', 'picked him',
  'full box', 'free box', 'boxing', 'box',
  'demolished', 'destroyed', 'smoked', 'smoke him', 'obliterated',
  'deleted', 'delete', 'instant', 'insta',
  'clean kill', 'clean shot',
  'wiping', 'wiped', 'wipe them', 'whole team',
  'double', 'triple', 'quad', 'double kill', 'triple kill',
  // Fortnite-spezifisch
  'boxed', 'full boxed', 'box him', 'box them',
  '200 pump', '200er', 'geboxed',
  'der ist low', 'so low', 'is low', 'low low', 'is low low', 'low af',
  'one shot him',
  'ich hab ihn', 'ich hab den', 'ich hab',
  'tot tot', 'weg der typ', 'weg ist er', 'der ist im low',
  'piece control', 'piece controlled', 'full piece',
  'edit kill', 'edit kill him',
  'prefire', 'prefired', 'prefire him',
  'broke him', 'broken him', 'break him',
  'shielded him', 'shield broke',
];

const REACTION_PHRASES: string[] = [
  'let\'s go', 'lets go', 'leggo', 'leggoo',
  'oh my god', 'oh my', 'no way', 'holy shit', 'holy',
  'what the', 'huge', 'wow', 'omg', 'lmao', 'yes!',
  'insane', 'unreal', 'sick', 'nice', 'goated',
  'are you kidding', 'jesus', 'busted',
  'clutch', 'clutched', 'popped off',
  '1v2', '1v3', '1v4', '1v5',
  'oh mein gott', 'alter', 'krass', 'geil', 'boah', 'boom',
  'endlich', 'lass gehen', 'bist du wahnsinnig', 'was zur hölle',
  'richtig', 'geht ab', 'nicer', 'hammer', 'unfassbar', 'perfekt',
  'clip that', 'clip das', 'clip it', 'gotta clip', 'das clippen',
  'controller player', 'controller', 'aimbot',
  'he\'s so bad', 'so bad', 'trash player',
  'no hands', 'sweaty', 'sweat',
  // Schreie / starke Reactions
  'broo', 'brooo', 'brooooo', 'bruh', 'bruhh',
  'no shot', 'are you serious', 'are you for real',
  'what was that', 'what is happening', 'what the heck', 'what the hell',
  'come on', 'lass mal', 'oh no', 'oh nein',
  'na endlich', 'na komm', 'jaaa',
];

// ════════════════════════════════════════════════════════════════════════════
//   SHORT-PROFILE (Fortnite-Style: 6-20s, Spike-driven)
// ════════════════════════════════════════════════════════════════════════════
const SHORT = {
  W_AUDIO:    1.0,
  W_SPIKE:    1.6,   // ↓ war 2.2 — weniger aggressiv auf Spikes
  W_KILL:     1.3,   // ↓ war 1.4
  W_REACTION: 1.2,
  W_SILENCE:  0.4,
  KILL_BEFORE:     6,
  KILL_AFTER:      8,
  REACTION_BEFORE: 5,
  REACTION_AFTER:  8,
  CLIP_LEN_AUDIO:  18,
  MIN_DUR: 6,
  MAX_DUR: 20,
};

// Loud-Reaction-Rule: Reaction-Phrase wird nur dann force-anchored,
// wenn lokales Audio in ±2s mindestens diesen Pegel erreicht.
// Verhindert dass leise "uh huh"-Reactions unnötig Cluster anlegen.
const REACTION_FORCE_AUDIO_THRESHOLD = 0.30;

// ════════════════════════════════════════════════════════════════════════════
//   LONG-PROFILE (Warzone-Style: 20-60s, sustained)
// ════════════════════════════════════════════════════════════════════════════
const LONG = {
  W_AUDIO:    1.2,
  W_SPIKE:    0.8,
  W_KILL:     0.7,
  W_REACTION: 0.7,
  W_SILENCE:  0.4,
  SMOOTH_WINDOW: 8,    // große Glättung — sucht Plateaus
  THRESHOLD:     0.45, // sustained smoothed-Score über diesem Wert
  MIN_DUR: 20,
  MAX_DUR: 60,
};

// ─── Globale Konstanten ────────────────────────────────────────────────────
const SPIKE_WINDOW       = 8;
const QUIET_THRESHOLD    = 0.22;
const SILENCE_MIN_DUR    = 6;
const MERGE_GAP_SHORT    = 8;
const TOP_SHORT_AUDIO    = 12;
const TOP_LONG           = 10;
const HARD_FLOOR         = 5;   // alles unter 5s → endgültig drop

interface PhraseHit {
  time: number;
  phrase: string;
  kind: 'kill' | 'reaction';
}

interface DetectorProfile {
  W_AUDIO: number;
  W_SPIKE: number;
  W_KILL: number;
  W_REACTION: number;
  W_SILENCE: number;
}

interface Input {
  transcript: Transcript;
  sourcePath: string;
}

// ════════════════════════════════════════════════════════════════════════════
//   STEP
// ════════════════════════════════════════════════════════════════════════════

export const highlightsStep: PipelineStep<Input, Highlight[]> = {
  name: 'highlights',
  async run({ transcript, sourcePath }, ctx) {
    ctx.emit({ type: 'log', step: 'highlights', message: 'Computing audio energy + spikiness…' });
    ctx.emit({ type: 'progress', step: 'highlights', percent: 10 });

    const audioPath = path.join(ctx.workDir, 'audio.mp3');
    const energy = await extractAudioEnergy(audioPath, ctx);
    const totalDuration = await getDuration(sourcePath).catch(() => energy.length);
    const N = Math.max(Math.ceil(totalDuration), energy.length);
    const spikiness = computeSpikiness(energy, SPIKE_WINDOW);
    const phraseHits = collectPhraseHits(transcript, N);

    ctx.emit({ type: 'progress', step: 'highlights', percent: 40 });

    // ── DUAL DETECTION (parallel, unabhängig) ──
    const shortHighlights = detectShortHighlights(energy, spikiness, phraseHits, totalDuration, N);
    const longHighlights  = detectLongHighlights(energy, spikiness, phraseHits, totalDuration, N);

    ctx.emit({ type: 'progress', step: 'highlights', percent: 80 });

    // ── COMBINE: ALLE Short-Kills + ALLE Short-Reactions + Top-N Audio + Top-N Long ──
    // Kills + Reactions sind garantierte Anchors, dürfen NICHT durch Score-Filter raus.
    const shortKills = shortHighlights.filter((h) => h.reason.startsWith('KILL'));
    const shortReactions = shortHighlights.filter((h) => h.reason.startsWith('REACTION'));
    const shortAudio = shortHighlights
      .filter((h) => !h.reason.startsWith('KILL') && !h.reason.startsWith('REACTION'))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_SHORT_AUDIO);
    const topLong = longHighlights
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_LONG);

    const combined = [...shortKills, ...shortReactions, ...shortAudio, ...topLong];
    // Snap auf Whisper-Satz-Grenzen damit Highlights nicht mitten im Wort enden/anfangen
    const snapped = combined.map((h) => snapHighlightToSentence(h, transcript));
    const final = dedupe(snapped, totalDuration);

    const killCount     = final.filter((h) => h.reason.startsWith('KILL')).length;
    const reactionCount = final.filter((h) => h.reason.startsWith('REACTION')).length;
    const longCount     = final.filter((h) => h.reason.startsWith('LONG')).length;
    const audioCount    = final.length - killCount - reactionCount - longCount;

    // Übersichtliche Multi-Line Logs
    console.log(`[highlights] Final:`);
    console.log(`  - kill:     ${killCount}`);
    console.log(`  - reaction: ${reactionCount}`);
    console.log(`  - audio:    ${audioCount}`);
    console.log(`  - long:     ${longCount}`);
    console.log(`  - total:    ${final.length} clips · avg ${avgDur(final).toFixed(1)}s`);
    console.log(`  - candidates: ${shortKills.length}K + ${shortReactions.length}R + ${shortAudio.length}A + ${topLong.length}L pre-dedupe`);

    ctx.emit({
      type: 'log',
      step: 'highlights',
      message:
        `Final: ${final.length} clips · ${killCount}K + ${reactionCount}R + ${audioCount}A + ${longCount}L · avg ${avgDur(final).toFixed(1)}s`,
    });

    await fs.writeFile(
      path.join(ctx.workDir, 'highlights.json'),
      JSON.stringify(final, null, 2),
    );
    await fs.writeFile(
      path.join(ctx.workDir, 'energy.json'),
      JSON.stringify({ energy, spikiness, totalDuration }, null, 2),
    );

    ctx.emit({ type: 'progress', step: 'highlights', percent: 100 });
    return final;
  },
};

// ════════════════════════════════════════════════════════════════════════════
//   SCORING
// ════════════════════════════════════════════════════════════════════════════

function computeScores(
  profile: DetectorProfile,
  energy: number[],
  spikiness: number[],
  phraseHits: PhraseHit[],
  N: number,
): number[] {
  const scores = new Array(N).fill(0);

  // Audio + Spike
  for (let t = 0; t < N; t++) {
    scores[t] = (energy[t] ?? 0) * profile.W_AUDIO + (spikiness[t] ?? 0) * profile.W_SPIKE;
  }
  // Phrase-Boosts (Center-anchored mit kleiner Verteilung)
  for (const h of phraseHits) {
    const center = Math.round(h.time);
    if (center < 0 || center >= N) continue;
    const w = h.kind === 'kill' ? profile.W_KILL : profile.W_REACTION;
    // ±2s rund um die Phrase
    for (let t = Math.max(0, center - 2); t <= Math.min(N - 1, center + 2); t++) {
      scores[t] += w;
    }
  }
  // Silence-Penalty an langen ruhigen Stellen
  // (vereinfacht: scanne energy-Slices statt Transcript)
  // Diese Penalty zieht Scores in stille Bereichen runter — gut für beide Profile.
  for (let t = 0; t < N; t += SILENCE_MIN_DUR) {
    const slice = energy.slice(t, Math.min(N, t + SILENCE_MIN_DUR));
    if (slice.length === 0) continue;
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    if (avg < QUIET_THRESHOLD) {
      for (let s = t; s < Math.min(N, t + SILENCE_MIN_DUR); s++) {
        scores[s] -= profile.W_SILENCE;
      }
    }
  }
  return scores;
}

function smooth(arr: number[], window: number): number[] {
  const out = new Array(arr.length).fill(0);
  const w = Math.floor(window / 2);
  for (let i = 0; i < arr.length; i++) {
    let sum = 0, cnt = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(arr.length - 1, i + w); j++) {
      sum += arr[j];
      cnt++;
    }
    out[i] = cnt > 0 ? sum / cnt : 0;
  }
  return out;
}

function computeSpikiness(energy: number[], window: number): number[] {
  const out = new Array(energy.length).fill(0);
  for (let i = 0; i < energy.length; i++) {
    let sum = 0, cnt = 0;
    for (let j = Math.max(0, i - window); j < i; j++) {
      sum += energy[j];
      cnt++;
    }
    const baseline = cnt > 0 ? sum / cnt : energy[i];
    out[i] = Math.max(0, energy[i] - baseline);
  }
  return out;
}

function collectPhraseHits(transcript: Transcript, _N: number): PhraseHit[] {
  const hits: PhraseHit[] = [];
  for (const seg of transcript.segments) {
    const text = seg.text.toLowerCase();
    const t = (seg.start + seg.end) / 2;
    for (const p of KILL_PHRASES) {
      if (text.includes(p)) { hits.push({ time: t, phrase: p, kind: 'kill' }); break; }
    }
    for (const p of REACTION_PHRASES) {
      if (text.includes(p)) { hits.push({ time: t, phrase: p, kind: 'reaction' }); break; }
    }
  }
  return hits;
}

// ════════════════════════════════════════════════════════════════════════════
//   SHORT DETECTION (Local Maxima → Cluster → 6-20s Windows)
// ════════════════════════════════════════════════════════════════════════════

function detectShortHighlights(
  energy: number[],
  spikiness: number[],
  phraseHits: PhraseHit[],
  totalDuration: number,
  N: number,
): Highlight[] {
  const scores = computeScores(SHORT, energy, spikiness, phraseHits, N);
  const smoothed = smooth(scores, 3);

  // Lokale Maxima sammeln + Phrase-Times als Anchors einbringen.
  //   • KILL-Phrases  → IMMER force-anchored
  //   • REACTION-Phrases → force-anchored nur wenn lokales Audio "laut" ist
  //                       (verhindert dass leise "uh huh" Cluster anlegen)
  const peaks = new Map<number, number>();
  for (let t = 1; t < smoothed.length - 1; t++) {
    const s = smoothed[t];
    if (s <= 0) continue;
    if (s >= smoothed[t - 1] && s >= smoothed[t + 1]) peaks.set(t, s);
  }
  for (const h of phraseHits) {
    const t = Math.round(h.time);
    if (t < 0 || t >= N) continue;

    if (h.kind === 'kill') {
      // Kill-Phrase → immer Anchor
      peaks.set(t, Math.max(peaks.get(t) ?? 0, smoothed[t]));
      continue;
    }

    // Reaction: nur force-anchor wenn nahegelegenes Audio laut genug ist
    const lo = Math.max(0, t - 2);
    const hi = Math.min(N, t + 3);
    let localPeak = 0;
    for (let i = lo; i < hi; i++) {
      const e = energy[i] ?? 0;
      const sp = spikiness[i] ?? 0;
      if (e > localPeak) localPeak = e;
      if (sp > localPeak) localPeak = sp;
    }
    if (localPeak >= REACTION_FORCE_AUDIO_THRESHOLD) {
      peaks.set(t, Math.max(peaks.get(t) ?? 0, smoothed[t]));
    }
    // sonst: Reaction trägt nur über computeScores-Boost zum Score bei,
    //         wird aber nicht als eigenständiger Cluster-Anchor erzwungen.
  }

  // Cluster (nur enge Gruppen — Short = lokal)
  const sorted = Array.from(peaks.entries())
    .map(([t, score]) => ({ t, score }))
    .sort((a, b) => a.t - b.t);

  const groups: { peaks: { t: number; score: number }[] }[] = [];
  for (const p of sorted) {
    const last = groups[groups.length - 1];
    if (last && p.t - last.peaks[last.peaks.length - 1].t < MERGE_GAP_SHORT) {
      last.peaks.push(p);
    } else {
      groups.push({ peaks: [p] });
    }
  }

  // Pro Gruppe: Highlight bauen
  const out: Highlight[] = [];
  for (const g of groups) {
    const peakScore = Math.max(...g.peaks.map((p) => p.score));
    const totalScore = g.peaks.reduce((s, p) => s + p.score, 0);
    const center = totalScore > 0
      ? g.peaks.reduce((s, p) => s + p.t * p.score, 0) / totalScore
      : g.peaks[0].t;

    const radius = (SHORT.KILL_BEFORE + SHORT.KILL_AFTER) / 2;
    const nearby = phraseHits.filter((h) => Math.abs(h.time - center) < radius);
    const kill = nearby
      .filter((h) => h.kind === 'kill')
      .sort((a, b) => Math.abs(a.time - center) - Math.abs(b.time - center))[0];
    const reaction = nearby.find((h) => h.kind === 'reaction');

    let start: number, end: number, reason: string;
    if (kill) {
      // KILL-anchored — Window asymmetrisch um den Kill-Moment
      start = Math.max(0, kill.time - SHORT.KILL_BEFORE);
      end = Math.min(totalDuration, kill.time + SHORT.KILL_AFTER);
      reason = `KILL: "${kill.phrase}"${reaction ? ` + "${reaction.phrase}"` : ''}`;
    } else if (reaction) {
      // REACTION-anchored — garantierter Highlight, auch ohne starken Audio-Peak
      start = Math.max(0, reaction.time - SHORT.REACTION_BEFORE);
      end = Math.min(totalDuration, reaction.time + SHORT.REACTION_AFTER);
      reason = `REACTION: "${reaction.phrase}"`;
    } else {
      // Audio-Peak only
      start = Math.max(0, center - SHORT.CLIP_LEN_AUDIO / 2);
      end = Math.min(totalDuration, center + SHORT.CLIP_LEN_AUDIO / 2);
      reason = `audio peak (×${g.peaks.length})`;
    }

    // Short-Constraints durchsetzen
    const dur = end - start;
    if (dur > SHORT.MAX_DUR) {
      const center2 = (start + end) / 2;
      start = center2 - SHORT.MAX_DUR / 2;
      end = center2 + SHORT.MAX_DUR / 2;
    }

    out.push({ start, end, score: Math.min(1, peakScore), reason });
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
//   LONG DETECTION (Sustained Regions, 20-60s)
// ════════════════════════════════════════════════════════════════════════════

function detectLongHighlights(
  energy: number[],
  spikiness: number[],
  phraseHits: PhraseHit[],
  totalDuration: number,
  N: number,
): Highlight[] {
  const scores = computeScores(LONG, energy, spikiness, phraseHits, N);
  const smoothed = smooth(scores, LONG.SMOOTH_WINDOW);

  // Regionen finden, wo smoothed >= THRESHOLD durchgehend hoch ist
  const regions: { start: number; end: number }[] = [];
  let inRegion = false;
  let regionStart = 0;

  for (let t = 0; t < smoothed.length; t++) {
    if (smoothed[t] >= LONG.THRESHOLD) {
      if (!inRegion) { regionStart = t; inRegion = true; }
    } else if (inRegion) {
      regions.push({ start: regionStart, end: t });
      inRegion = false;
    }
  }
  if (inRegion) regions.push({ start: regionStart, end: smoothed.length });

  // Filter + Clamp + Score berechnen
  const out: Highlight[] = [];
  for (const r of regions) {
    let { start, end } = r;
    let dur = end - start;
    if (dur < LONG.MIN_DUR) continue;

    // Wenn zu lang: zentrieren auf Peak innerhalb der Region
    if (dur > LONG.MAX_DUR) {
      let peakT = start, peakV = 0;
      for (let t = start; t < end; t++) {
        if (smoothed[t] > peakV) { peakV = smoothed[t]; peakT = t; }
      }
      const half = LONG.MAX_DUR / 2;
      start = Math.max(r.start, peakT - half);
      end = Math.min(r.end, start + LONG.MAX_DUR);
      dur = end - start;
    }
    end = Math.min(totalDuration, end);

    const sliceScores = smoothed.slice(Math.floor(start), Math.ceil(end));
    const avgScore = sliceScores.length
      ? sliceScores.reduce((s, v) => s + v, 0) / sliceScores.length
      : 0;

    // Reason: zähle Peaks innerhalb der Region
    const nearbyKills = phraseHits.filter(
      (h) => h.kind === 'kill' && h.time >= start && h.time <= end,
    ).length;
    const reason = nearbyKills > 0
      ? `LONG: ${dur.toFixed(0)}s · ${nearbyKills} kill-call${nearbyKills > 1 ? 's' : ''}`
      : `LONG: ${dur.toFixed(0)}s sustained action`;

    out.push({
      start,
      end,
      score: Math.min(1, avgScore),
      reason,
    });
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
//   DEDUPE: nur quasi-Duplikate entfernen, Short+Long überlappend OK lassen
// ════════════════════════════════════════════════════════════════════════════

/** Snap highlight-Ende auf das nächste Whisper-Segment-Ende (= Satzende),
 *  damit Highlights nicht mitten im Wort/Satz abgeschnitten werden.
 *  Max-Extension: 4s — wenn der nächste Satz-End weiter weg ist, lassen wir's.
 *  Ebenso Snap-Start auf Segment-Start innerhalb 1.5s damit Highlight nicht
 *  mitten im Vorwort beginnt. */
export function snapHighlightToSentence(
  h: Highlight,
  transcript: { segments: Array<{ start: number; end: number }> },
): Highlight {
  const MAX_EXTEND_END = 4;
  const MAX_RETRACT_START = 1.5;
  // End: nächstes segment.end das >= h.end ist, max h.end + MAX_EXTEND
  let snappedEnd = h.end;
  for (const s of transcript.segments) {
    if (s.end >= h.end && s.end <= h.end + MAX_EXTEND_END) {
      snappedEnd = s.end;
      break;
    }
    if (s.end > h.end + MAX_EXTEND_END) break;
  }
  // Start: nächstes segment.start das <= h.start ist, max h.start - MAX_RETRACT
  let snappedStart = h.start;
  for (let i = transcript.segments.length - 1; i >= 0; i--) {
    const s = transcript.segments[i];
    if (s.start <= h.start && s.start >= h.start - MAX_RETRACT_START) {
      snappedStart = s.start;
      break;
    }
    if (s.start < h.start - MAX_RETRACT_START) break;
  }
  return { ...h, start: snappedStart, end: snappedEnd };
}

function dedupe(highlights: Highlight[], totalDuration: number): Highlight[] {
  // Clamp + Sanitize
  const clean = highlights
    .map((h) => ({
      ...h,
      start: Math.max(0, Math.min(h.start, totalDuration)),
      end:   Math.max(0, Math.min(h.end,   totalDuration)),
    }))
    .filter((h) => h.end - h.start >= HARD_FLOOR)
    .sort((a, b) => a.start - b.start);

  // Quasi-Duplikate: >85% Overlap UND beide gleicher Typ (KILL vs LONG vs audio)
  const result: Highlight[] = [];
  for (const h of clean) {
    const dup = result.find((r) => sameType(r, h) && overlapRatio(r, h) >= 0.85);
    if (dup) {
      // Höher gescorten / Kill-tag bevorzugen
      if (h.score > dup.score) {
        const idx = result.indexOf(dup);
        result[idx] = h;
      }
    } else {
      result.push(h);
    }
  }
  return result.sort((a, b) => a.start - b.start);
}

function sameType(a: Highlight, b: Highlight): boolean {
  return reasonType(a) === reasonType(b);
}

function reasonType(h: Highlight): 'kill' | 'reaction' | 'long' | 'audio' {
  if (h.reason.startsWith('KILL')) return 'kill';
  if (h.reason.startsWith('REACTION')) return 'reaction';
  if (h.reason.startsWith('LONG')) return 'long';
  return 'audio';
}

function overlapRatio(a: Highlight, b: Highlight): number {
  const overlap = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  const minLen = Math.min(a.end - a.start, b.end - b.start);
  return minLen > 0 ? overlap / minLen : 0;
}

function avgDur(hs: Highlight[]): number {
  if (hs.length === 0) return 0;
  return hs.reduce((s, h) => s + (h.end - h.start), 0) / hs.length;
}
