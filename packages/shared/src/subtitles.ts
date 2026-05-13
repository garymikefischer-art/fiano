/**
 * Subtitle-Generator (plattform-neutral).
 *
 * Erzeugt SRT- oder ASS-Strings aus Whisper-Transcripts. Wird von
 * Desktop (libass) und Mobile (drawtext-Cue-Liste) gleichermaßen genutzt.
 *
 * Phase 9.4.1 MVP: nur `transcriptToSrt` + `chunkSegmentsToCues`.
 * ASS-Style-Generation (für libass) bleibt vorerst im Desktop-Code.
 */

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  segments: TranscriptSegment[];
}

/**
 * Konvertiert Sekunden in SRT-Timecode `HH:MM:SS,mmm`.
 */
export function secondsToSrtTime(sec: number): string {
  const total = Math.max(0, sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

function pad(n: number, w: number): string {
  return n.toString().padStart(w, '0');
}

/**
 * Erzeugt einen SRT-String aus einem Transcript. Optional auf Zeit-Fenster
 * geclippt (für Highlight-Clips: nur die Segmente die innerhalb des
 * Highlights liegen, mit Zeiten relativ zum Highlight-Start).
 */
export function transcriptToSrt(
  transcript: Transcript,
  clipStart = 0,
  clipEnd = Infinity,
): string {
  const out: string[] = [];
  let idx = 1;
  for (const seg of transcript.segments) {
    if (seg.end < clipStart || seg.start > clipEnd) continue;
    const s = Math.max(0, seg.start - clipStart);
    const e = Math.max(s, Math.min(clipEnd, seg.end) - clipStart);
    if (e <= s) continue;
    out.push(String(idx));
    out.push(`${secondsToSrtTime(s)} --> ${secondsToSrtTime(e)}`);
    out.push(seg.text.trim());
    out.push('');
    idx++;
  }
  return out.join('\n');
}

/**
 * Cue-Format für Mobile drawtext-Subtitles. Eine "Cue" ist ein Stück Text mit
 * Start/End-Zeit und Style-Hints. Mobile-Layer wandelt diese in den
 * `drawTextCues`-Argument von `buildMobileExportArgs` um.
 */
export interface SubtitleCue {
  text: string;
  startSec: number;
  endSec: number;
  /** Phase Builder-4: word-level timestamps von Whisper (timestamp_granularities=word).
   *  Wenn vorhanden, kann Mobile per-word chunking mit echtem Timing machen statt
   *  proportional. Mobile-only — Server (transcribe.ts) füllt das wenn API liefert. */
  words?: { text: string; startSec: number; endSec: number }[];
}

/**
 * Bricht ein Transcript-Segment in einzeilige Cues. Wenn ein Segment > maxChars
 * Zeichen hat, wird es an Wortgrenzen gesplittet (proportional zur Wort-Länge
 * eine Zeit-Aufteilung).
 *
 * Default `maxChars = 32` — Daumenregel für 9:16-Layout bei 64px Schrift.
 */
export function transcriptToCues(
  transcript: Transcript,
  clipStart = 0,
  clipEnd = Infinity,
  maxChars = 32,
): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const seg of transcript.segments) {
    if (seg.end < clipStart || seg.start > clipEnd) continue;
    const s = Math.max(0, seg.start - clipStart);
    const e = Math.max(s, Math.min(clipEnd, seg.end) - clipStart);
    if (e <= s) continue;

    const text = seg.text.trim();
    if (text.length <= maxChars) {
      cues.push({ text, startSec: s, endSec: e });
      continue;
    }

    // Split an Wortgrenzen, halte einzelne Lines unter maxChars
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > maxChars && cur) {
        lines.push(cur.trim());
        cur = w;
      } else {
        cur = (cur + ' ' + w).trim();
      }
    }
    if (cur) lines.push(cur);

    const totalChars = lines.reduce((sum, l) => sum + l.length, 0) || 1;
    let cursor = s;
    const dur = e - s;
    for (const line of lines) {
      const lineDur = (line.length / totalChars) * dur;
      cues.push({ text: line, startSec: cursor, endSec: cursor + lineDur });
      cursor += lineDur;
    }
  }
  return cues;
}
