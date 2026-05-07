import type { JobContext } from './types';
import type { ProjectSource, Highlight, VideoType } from '@shared/types';
import { downloadStep } from './download';
import { transcribeStep } from './transcribe';
import { highlightsStep } from './highlights';
import { detectPodcastHighlights } from './highlightsPodcast';
import { renderClipsStep } from './renderClips';

/** Orchestriert die komplette Analyse-Pipeline für ein Projekt.
 *  videoType bestimmt die Highlight-Erkennungsstrategie:
 *  - 'gaming' (default): Audio-Spike + Phrase-Detection (current).
 *  - 'podcast': LLM-Analyse vom Whisper-Transcript (interessante Aussagen).
 *  - 'auto': Heuristik basierend auf Phrase-Density im Transcript — viele kurze
 *    Game-Phrases → gaming, viele lange Sätze + wenig Phrases → podcast. */
export async function runAnalysisPipeline(
  source: ProjectSource,
  ctx: JobContext,
  videoType: VideoType = 'gaming',
): Promise<{ highlights: Highlight[] }> {
  const { sourcePath } = await downloadStep.run({ source }, ctx);
  const transcript     = await transcribeStep.run({ sourcePath }, ctx);

  // Auto-Mode: einfache Heuristik — wenn der Transcript viele Game-Phrasen enthält
  // (kill/down/headshot etc.), nehmen wir Gaming. Sonst Podcast.
  let resolvedType: 'gaming' | 'podcast' = videoType === 'auto'
    ? autoDetectMode(transcript)
    : videoType;
  ctx.emit({ type: 'log', step: 'highlights', message: `Mode: ${videoType}${videoType === 'auto' ? ` → ${resolvedType}` : ''}` });

  const detected = resolvedType === 'podcast'
    ? await detectPodcastHighlights({ transcript, sourcePath }, ctx)
    : await highlightsStep.run({ transcript, sourcePath }, ctx);

  const rendered       = await renderClipsStep.run({ sourcePath, highlights: detected }, ctx);
  return { highlights: rendered };
}

/** Auto-Detection: schaut wie viele Game-Phrasen im Transcript sind.
 *  Wenn > 1 phrase pro 30s Audio → Gaming, sonst Podcast. */
function autoDetectMode(transcript: { segments: Array<{ text: string; start: number; end: number }> }): 'gaming' | 'podcast' {
  const text = transcript.segments.map((s) => s.text.toLowerCase()).join(' ');
  // Kurze Heuristik mit einer Subset von KILL_PHRASES (gaming-typisch)
  const gamingTokens = ['kill', 'down', 'headshot', 'one shot', 'hab ihn', 'tot', 'dead', 'cracked', 'frag', 'eliminated', 'sniped'];
  const hits = gamingTokens.reduce((sum, p) => sum + (text.match(new RegExp(`\\b${p}\\b`, 'g'))?.length ?? 0), 0);
  const totalSec = transcript.segments.reduce((m, s) => Math.max(m, s.end), 0);
  const hitsPerMin = totalSec > 0 ? (hits / totalSec) * 60 : 0;
  console.log(`[auto-detect] ${hits} gaming-phrases in ${totalSec.toFixed(0)}s → ${hitsPerMin.toFixed(1)}/min → ${hitsPerMin > 2 ? 'gaming' : 'podcast'}`);
  return hitsPerMin > 2 ? 'gaming' : 'podcast';
}
