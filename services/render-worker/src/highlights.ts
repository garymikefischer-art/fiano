/**
 * Highlight-Detection (Phase 9.6.7b + 9.6.7d — SHORT/LONG-Profile-Splitting).
 *
 * Erkennt "interessante" Stellen im Video aus Whisper-Transcript + Audio-Energy.
 * Voller Port von src/main/core/pipeline/highlights.ts (Desktop) mit zwei
 * parallelen Profilen je nach videoType:
 *
 * - SHORT (Gaming, 6-20s): Spike-driven Kill-Phrasen + Audio-Peaks treiben
 *   den Score. Kurze, intensive Clips für TikTok/Reels.
 * - LONG (Podcast, 20-60s): Sustained Speech-Density über glättere Windows.
 *   Längere Clips für YouTube. Weniger Spike-aggressiv.
 * - AUTO: beide Profile parallel + dedupe-overlapping.
 *
 * mode wird vom Mobile-Client als project.videoType ('gaming'|'podcast'|'auto')
 * durchgereicht.
 */

interface InputCue {
  startSec: number;
  endSec: number;
  text: string;
}

export type HighlightMode = 'gaming' | 'podcast' | 'auto';

export interface Highlight {
  startSec: number;
  endSec: number;
  score: number;
  label: string;
  reason: string;
}

// Phrase-Listen direkt portiert aus src/main/core/pipeline/highlights.ts:13-95.
const KILL_PHRASES: string[] = [
  // Deutsch
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
  'got him', 'got it', 'got them', 'gottem', "got 'em", 'got the kill',
  "he's dead", "he's down", "he's done", "he's one shot", "he's one",
  "she's dead", "she's down", "they're dead", "they're down",
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
  "let's go", 'lets go', 'leggo', 'leggoo',
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
  "he's so bad", 'so bad', 'trash player',
  'no hands', 'sweaty', 'sweat',
  'broo', 'brooo', 'brooooo', 'bruh', 'bruhh',
  'no shot', 'are you serious', 'are you for real',
  'what was that', 'what is happening', 'what the heck', 'what the hell',
  'come on', 'lass mal', 'oh no', 'oh nein',
  'na endlich', 'na komm', 'jaaa',
];

interface ProfileParams {
  minDur: number;
  maxDur: number;
  targetDur: number;
  gapThreshold: number;
  /** Score-Gewicht für Kill-Phrasen (exponent). */
  wKill: number;
  wReaction: number;
  wAudioPeak: number;
  /** Max-Anzahl Highlights aus diesem Profil. */
  maxCount: number;
}

// SHORT-Profile: Gaming-Style — Spike-driven, kurze Clips.
const SHORT_PROFILE: ProfileParams = {
  minDur: 6,
  maxDur: 20,
  targetDur: 12,
  gapThreshold: 2.5,
  wKill: 1.3,
  wReaction: 1.2,
  wAudioPeak: 1.6,
  maxCount: 15,
};

// LONG-Profile: Podcast-Style — sustained, längere Clips, weniger Spike-Bonus.
const LONG_PROFILE: ProfileParams = {
  minDur: 20,
  maxDur: 60,
  targetDur: 30,
  gapThreshold: 4.0,
  wKill: 0.7, // Phrasen weniger gewichtet — Podcast hat selten Gaming-Vokab
  wReaction: 1.1, // aber Reaktionen ("krass", "wow") sind relevant
  wAudioPeak: 0.8, // Audio-Spikes weniger relevant für Speech
  maxCount: 10,
};

export function detectHighlights(
  cues: InputCue[],
  audioPeaks: number[] = [],
  mode: HighlightMode = 'auto',
): Highlight[] {
  if (cues.length === 0) return [];

  // Mode-Mapping zu Profilen.
  const shortResults =
    mode === 'gaming' || mode === 'auto' ? computeProfile(cues, audioPeaks, SHORT_PROFILE) : [];
  const longResults =
    mode === 'podcast' || mode === 'auto' ? computeProfile(cues, audioPeaks, LONG_PROFILE) : [];

  // Bei single-mode: direkt zurückgeben (top-N by score, sortiert by time).
  if (mode === 'gaming') {
    shortResults.sort((a, b) => a.startSec - b.startSec);
    return shortResults;
  }
  if (mode === 'podcast') {
    longResults.sort((a, b) => a.startSec - b.startSec);
    return longResults;
  }

  // AUTO: merge + dedupe (overlap > 4s = duplicate, keep higher-score).
  const merged = [...shortResults, ...longResults];
  merged.sort((a, b) => b.score - a.score);
  const accepted: Highlight[] = [];
  for (const h of merged) {
    const overlaps = accepted.some((a) => {
      const overlap = Math.min(h.endSec, a.endSec) - Math.max(h.startSec, a.startSec);
      return overlap > 4;
    });
    if (!overlaps) accepted.push(h);
    if (accepted.length >= 15) break;
  }
  accepted.sort((a, b) => a.startSec - b.startSec);
  return accepted;
}

function computeProfile(
  cues: InputCue[],
  audioPeaks: number[],
  params: ProfileParams,
): Highlight[] {
  interface Window {
    start: number;
    end: number;
    segments: InputCue[];
    textLen: number;
    killHits: number;
    reactionHits: number;
    audioPeakCount: number;
  }
  const windows: Window[] = [];

  for (const cue of cues) {
    const text = cue.text.toLowerCase();
    const killHit = countMatches(text, KILL_PHRASES) > 0 ? 1 : 0;
    const reactionHit = countMatches(text, REACTION_PHRASES) > 0 ? 1 : 0;

    const last = windows[windows.length - 1];
    const fitsInLast =
      last &&
      cue.startSec - last.end < params.gapThreshold &&
      cue.endSec - last.start <= params.maxDur;

    if (fitsInLast) {
      last.end = Math.max(last.end, cue.endSec);
      last.segments.push(cue);
      last.textLen += cue.text.length;
      last.killHits += killHit;
      last.reactionHits += reactionHit;
    } else {
      windows.push({
        start: cue.startSec,
        end: cue.endSec,
        segments: [cue],
        textLen: cue.text.length,
        killHits: killHit,
        reactionHits: reactionHit,
        audioPeakCount: 0,
      });
    }
  }

  // Audio-Peak-Count pro Window.
  if (audioPeaks.length > 0) {
    for (const w of windows) {
      let count = 0;
      const fromSec = Math.floor(w.start);
      const toSec = Math.min(audioPeaks.length - 1, Math.ceil(w.end));
      for (let s = fromSec; s <= toSec; s++) {
        if (audioPeaks[s] === 1) count++;
      }
      w.audioPeakCount = count;
    }
  }

  // Profile-spezifische Duration-Filter.
  const candidates = windows.filter((w) => {
    const dur = w.end - w.start;
    return dur >= params.minDur && dur <= params.maxDur && w.segments.length >= 1;
  });
  if (candidates.length === 0) return [];

  // Score.
  const maxTextLen = candidates.reduce((m, w) => Math.max(m, w.textLen), 1);
  const scored = candidates.map((w) => {
    const segCount = w.segments.length;
    const dur = w.end - w.start;
    const durationFit = 1 - Math.abs(dur - params.targetDur) / params.targetDur;
    const lengthScore = w.textLen / maxTextLen;
    const segCountScore = Math.min(1, Math.log(segCount + 1) / Math.log(8));

    let score = lengthScore * 0.4 + segCountScore * 0.15 + Math.max(0, durationFit) * 0.15;
    if (w.killHits > 0) score *= params.wKill ** Math.min(w.killHits, 3);
    if (w.reactionHits > 0) score *= params.wReaction ** Math.min(w.reactionHits, 3);
    if (w.audioPeakCount > 0) score *= params.wAudioPeak ** Math.min(w.audioPeakCount / 3, 1.5);
    score = Math.min(1, score);

    const firstText = w.segments[0]?.text ?? '';
    const label = firstText
      .trim()
      .replace(/^[^a-zA-Z0-9äöüÄÖÜß]+/, '')
      .slice(0, 50);
    const reasons: string[] = [];
    if (w.killHits > 0) reasons.push(`${w.killHits} kill-phrase`);
    if (w.reactionHits > 0) reasons.push(`${w.reactionHits} reaction`);
    if (w.audioPeakCount > 0) reasons.push(`${w.audioPeakCount} audio-peak`);
    if (reasons.length === 0 && lengthScore > 0.6) reasons.push('high-density');
    const profileTag = params === SHORT_PROFILE ? 'short' : 'long';

    return {
      startSec: w.start,
      endSec: Math.min(w.end, w.start + params.maxDur),
      score,
      label: label || `Clip @ ${Math.floor(w.start)}s`,
      reason: `${profileTag}: ${reasons.join(', ') || 'speech-density'}`,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, params.maxCount);
}

function countMatches(text: string, phrases: string[]): number {
  let n = 0;
  for (const p of phrases) {
    if (text.includes(p)) n++;
  }
  return n;
}
