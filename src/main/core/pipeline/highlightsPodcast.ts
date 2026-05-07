import path from 'node:path';
import fs from 'node:fs/promises';
import type { Highlight } from '@shared/types';
import type { JobContext } from './types';
import type { Transcript } from './transcribe';
import { getApiKey } from '../settings';
import { snapHighlightToSentence } from './highlights';

/**
 * Podcast-Mode Highlight-Detection via LLM.
 *
 * Strategie:
 *  1. Transcript-Segmente in Chunks gruppieren (~2 min Audio pro Chunk).
 *  2. Pro Chunk an GPT-4o-mini schicken: "welche Aussagen sind besonders interessant
 *     für TikTok-Clip? Liefere Top 3 mit Start/End/Reason."
 *  3. Response zu Highlights mappen.
 *
 * Nutzt den User-OpenAI-Key (BYO). Falls kein Key → fallback auf simple Audio-basierte
 * Detection mit längeren Clips (Podcast-typisch 20-40s).
 */
export async function detectPodcastHighlights(
  input: { transcript: Transcript; sourcePath: string },
  ctx: JobContext,
): Promise<Highlight[]> {
  const { transcript } = input;
  ctx.emit({ type: 'log', step: 'highlights', message: 'Podcast-Mode: LLM-Highlight-Detection…' });
  ctx.emit({ type: 'progress', step: 'highlights', percent: 10 });

  const apiKey = await getApiKey();
  if (!apiKey) {
    ctx.emit({ type: 'log', step: 'highlights', message: 'No OpenAI key — fallback to longest-segments heuristic' });
    return fallbackLongestSegments(transcript);
  }

  // Chunks bauen mit OVERLAP damit Highlights nicht an chunk-grenzen verloren gehen.
  // 180s pro chunk + 30s overlap zum nächsten chunk.
  const CHUNK_DUR = 180;     // sec
  const CHUNK_OVERLAP = 30;  // sec — Übergangs-Buffer
  const chunks: Array<{ startSec: number; endSec: number; text: string }> = [];
  const totalDur = transcript.segments[transcript.segments.length - 1]?.end ?? 0;
  for (let chunkStart = 0; chunkStart < totalDur; chunkStart += CHUNK_DUR - CHUNK_OVERLAP) {
    const chunkEnd = Math.min(chunkStart + CHUNK_DUR, totalDur);
    const chunkSegs = transcript.segments.filter((s) => s.start < chunkEnd && s.end > chunkStart);
    if (chunkSegs.length === 0) continue;
    chunks.push({
      startSec: chunkSegs[0].start,
      endSec: chunkSegs[chunkSegs.length - 1].end,
      text: chunkSegs.map((s) => `[${s.start.toFixed(1)}s] ${s.text.trim()}`).join('\n'),
    });
    if (chunkEnd >= totalDur) break;
  }

  ctx.emit({ type: 'log', step: 'highlights', message: `Analyzing ${chunks.length} chunks via GPT-4o-mini…` });

  const allHighlights: Highlight[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    ctx.emit({ type: 'progress', step: 'highlights', percent: 10 + Math.round((i / chunks.length) * 70) });
    try {
      const picks = await askGptForHighlights(chunk.text, apiKey, ctx.signal);
      for (const p of picks) {
        // Validate timestamps innerhalb chunk-range, sonst skippen
        if (p.start < chunk.startSec - 1 || p.end > chunk.endSec + 1) continue;
        // Length-Range: 15-50s (TikTok/Reel-Sweet-Spot für Podcast-Statements)
        let dur = p.end - p.start;
        if (dur < 8 || dur > 60) continue;
        // Wenn zu kurz (< 20s): extending end um Kontext zu geben (max bis chunk-end)
        let finalEnd = p.end;
        if (dur < 20) {
          finalEnd = Math.min(p.start + 25, chunk.endSec);
        }
        allHighlights.push({
          start: p.start,
          end: finalEnd,
          score: p.score ?? 0.7,
          reason: `PODCAST: ${p.reason}`,
        });
      }
    } catch (err: any) {
      console.warn(`[podcast-llm] chunk ${i} failed: ${err?.message ?? err}`);
    }
  }

  ctx.emit({ type: 'progress', step: 'highlights', percent: 85 });

  // Snap auf Whisper-Satz-Grenzen + Dedupe overlapping (durch chunk-overlap kann's Duplikate geben)
  const snapped = allHighlights.map((h) => snapHighlightToSentence(h, transcript));
  const deduped = dedupePodcast(snapped);

  // Top-N nach Score auswählen, dann CHRONOLOGISCH sortieren (ohne Zeitsprünge im Output).
  const topByScore = deduped.sort((a, b) => b.score - a.score).slice(0, 20);
  const sorted = topByScore.sort((a, b) => a.start - b.start);
  console.log(`[podcast-llm] ${allHighlights.length} candidates → ${snapped.length} snapped → ${deduped.length} dedup → ${sorted.length} kept (chronological)`);

  await fs.writeFile(
    path.join(ctx.workDir, 'highlights.json'),
    JSON.stringify(sorted, null, 2),
  );

  ctx.emit({ type: 'progress', step: 'highlights', percent: 100 });
  return sorted;
}

interface GptHighlightPick {
  start: number;
  end: number;
  reason: string;
  score?: number;
}

async function askGptForHighlights(
  chunkText: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<GptHighlightPick[]> {
  const systemPrompt = `Du bist ein erfahrener TikTok/Reel-Editor mit Fokus auf Podcasts.
Finde MEHRERE (5-8 pro Chunk wenn vorhanden) wirklich starke Highlight-Stellen.

Was zählt als Highlight:
- Prägnante / kontroverse / lustige / überraschende Aussagen
- Storytelling-Momente mit klarer Pointe
- "Aha"-Momente, Insights, scharf formulierte Meinungen
- Emotionale Peaks (Wut, Lachen, Mitgefühl)
- Kurze Anekdoten die alleine funktionieren

WICHTIG bei Timing:
- Länge 20-40 Sekunden (Sweet-Spot für Podcast-Reels)
- Start: vom ANFANG des Setups/Gedankens (nicht erst bei der Pointe)
- Ende: am vollständigen SATZ-ENDE — nicht mitten im Wort/Satz!
- Schau auf Punkte/Pausen im Transkript für natürliche Schnitt-Punkte
- Lieber einen Satz mehr inkludieren wenn der Gedanke noch nicht abgeschlossen ist

Reason: kurzer Hook (max 60 Zeichen) der den Zuschauer triggert.
Score: 0.5–1.0 wie viral-tauglich.

Antworte NUR als JSON: {"highlights":[{"start":1.2,"end":35.5,"reason":"...","score":0.85}]}`;

  const body = {
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Transkript-Chunk (timestamps in []):\n\n${chunkText}\n\nLiefere 5-8 Highlights, je 20-40 Sekunden, jeweils auf Satz-Grenzen.` },
    ],
    temperature: 0.5,
  };

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!r.ok) {
    throw new Error(`GPT API ${r.status}: ${await r.text().catch(() => '')}`);
  }
  const json = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? '';
  try {
    const parsed = JSON.parse(content) as { highlights?: GptHighlightPick[] };
    return Array.isArray(parsed.highlights) ? parsed.highlights : [];
  } catch {
    console.warn(`[podcast-llm] could not parse JSON: ${content.slice(0, 200)}`);
    return [];
  }
}

/** Dedupe für Podcast-Highlights: chunk-overlap kann gleiche Aussage 2× liefern.
 *  Wenn 2 Highlights >70% überlappen → das mit höherem Score wins. */
function dedupePodcast(highlights: Highlight[]): Highlight[] {
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const result: Highlight[] = [];
  for (const h of sorted) {
    const dup = result.find((r) => {
      const overlap = Math.max(0, Math.min(r.end, h.end) - Math.max(r.start, h.start));
      const minDur = Math.min(r.end - r.start, h.end - h.start);
      return minDur > 0 && overlap / minDur > 0.7;
    });
    if (dup) {
      if (h.score > dup.score) {
        const idx = result.indexOf(dup);
        result[idx] = h;
      }
    } else {
      result.push(h);
    }
  }
  return result;
}

/** Fallback wenn kein API-Key: gruppiert Whisper-Segmente in 25-35s Fenster, scored nach
 *  word-density (words/sec). Höhere Density = wahrscheinlich substanzielles Statement
 *  (kein Filler oder Pause). */
function fallbackLongestSegments(transcript: Transcript): Highlight[] {
  const candidates: Highlight[] = [];
  const segs = transcript.segments;
  for (let i = 0; i < segs.length; i++) {
    let endIdx = i;
    let endTime = segs[i].end;
    // Akkumulieren bis 25-35s erreicht (Sweet-Spot Podcast-Reel)
    while (endIdx + 1 < segs.length && endTime - segs[i].start < 28) {
      endIdx++;
      endTime = segs[endIdx].end;
    }
    const dur = endTime - segs[i].start;
    if (dur < 18 || dur > 42) continue;
    const text = segs.slice(i, endIdx + 1).map((s) => s.text).join(' ');
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    candidates.push({
      start: segs[i].start,
      end: endTime,
      score: wordCount / dur,  // words-per-second als engagement-proxy
      reason: 'PODCAST (fallback): word-dense segment',
    });
  }
  // Top 12 nach Score, dann chronologisch sortieren (ohne Zeitsprünge im Output)
  const topByScore = candidates.sort((a, b) => b.score - a.score).slice(0, 24);
  const deduped = dedupePodcast(topByScore).slice(0, 12);
  return deduped.sort((a, b) => a.start - b.start);
}
