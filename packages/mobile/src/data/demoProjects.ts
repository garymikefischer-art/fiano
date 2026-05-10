/**
 * Demo-Daten — Platzhalter bis ein echter projectStore gegen Supabase existiert.
 * Library + ProjectDetail teilen sich diese Quelle, damit Navigation konsistent ist.
 *
 * TODO Phase 9.4.x: ersetzen durch `useProjectStore()` (Zustand + Supabase).
 */

export interface DemoClip {
  id: string;
  startSec: number;
  endSec: number;
  label: string;
  score: number; // 0..1 — KI-Highlight-Score
}

export type ProjectMode = 'highlights' | 'manual' | 'tiktok' | 'builder';
export type VideoType = 'gaming' | 'podcast' | 'auto';
export type SourceType = 'file' | 'url' | 'multi-clip';

export interface DemoProject {
  id: string;
  title: string;
  subtitle: string;
  durationSec: number;
  status: 'ready' | 'processing' | 'failed';
  thumbHue: number; // 0..360 — bis echte Thumbnails kommen
  clips: DemoClip[];
  /* ─── Optional, gesetzt bei echten Imports (siehe AddVideoProjectScreen) ─── */
  /** file:// URI im App-Cache. */
  sourceUri?: string;
  /** YouTube / Twitch / Direct-URL — nur bei sourceType 'url' gesetzt. */
  sourceUrl?: string;
  /** Persistenter Thumbnail-Frame — vom Source-Video extrahiert beim Import. */
  thumbUri?: string;
  mode?: ProjectMode;
  /** Hint für Auto-Highlight-Detection: Audio-Spike (gaming) vs LLM (podcast). */
  videoType?: VideoType;
  /** Wie das Projekt importiert wurde — file (gallery/files), url, multi-clip. */
  sourceType?: SourceType;
  trimStart?: number;
  trimEnd?: number;
  createdAt?: number;
  /** Per-Projekt Region-Override — wenn null/undefined fällt's auf Settings-Default zurück. */
  facecamRegion?: { x: number; y: number; w: number; h: number } | null;
  gameplayRegion?: { x: number; y: number; w: number; h: number };
  /** Manuelle Reihenfolge der Clips für Builder. Wenn unset → original-Reihenfolge. */
  clipOrder?: string[];
  /** Letzte Fehlermeldung wenn status === 'failed'. */
  errorMessage?: string;
}

const makeClips = (count: number, baseDuration: number): DemoClip[] =>
  Array.from({ length: count }, (_, i) => {
    const start = Math.floor((baseDuration / count) * i + 4);
    const len = 8 + Math.floor((i * 7) % 12);
    return {
      id: `c${i + 1}`,
      startSec: start,
      endSec: start + len,
      label: ['Clutch moment', 'Triple kill', 'Insane snipe', 'Rotation play', 'Last storm', 'Build battle'][i % 6],
      score: 0.7 + ((i * 13) % 30) / 100,
    };
  });

export const DEMO_PROJECTS: DemoProject[] = [
  {
    id: '1',
    title: 'Insane Fortnite Session',
    subtitle: 'Today · 14:32',
    durationSec: 2 * 3600 + 14 * 60,
    status: 'ready',
    thumbHue: 220,
    clips: makeClips(12, 2 * 3600 + 14 * 60),
  },
  {
    id: '2',
    title: 'Warzone Highlights #12',
    subtitle: 'Yesterday · 18:41',
    durationSec: 1 * 3600 + 47 * 60,
    status: 'ready',
    thumbHue: 28,
    clips: makeClips(8, 1 * 3600 + 47 * 60),
  },
  {
    id: '3',
    title: 'Valorant Ranked Climbs',
    subtitle: 'May 01 · 19:05',
    durationSec: 3 * 3600 + 12 * 60,
    status: 'ready',
    thumbHue: 0,
    clips: makeClips(15, 3 * 3600 + 12 * 60),
  },
  {
    id: '4',
    title: 'Unreal Moments',
    subtitle: 'Apr 30 · 21:23',
    durationSec: 1 * 3600 + 22 * 60,
    status: 'ready',
    thumbHue: 280,
    clips: makeClips(10, 1 * 3600 + 22 * 60),
  },
  {
    id: '5',
    title: 'Solo Cash Cup',
    subtitle: 'Apr 29 · 16:12',
    durationSec: 0 * 3600 + 56 * 60,
    status: 'ready',
    thumbHue: 140,
    clips: makeClips(6, 0 * 3600 + 56 * 60),
  },
];

export function getDemoProject(id: string): DemoProject | undefined {
  return DEMO_PROJECTS.find((p) => p.id === id);
}

export function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatTimecode(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
