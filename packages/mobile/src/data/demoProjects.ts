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
  /** Multi-Clip Source-Liste (Phase 9.5.8). Wenn gesetzt + length >= 2 → das
   *  Projekt ist ein Multi-Clip-Concat (Builder-Mode). sourceUri bleibt für
   *  Legacy-Single-Source-Reads (z.B. Preview-Player) gefüllt mit srcs[0]. */
  sourceUris?: string[];
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
  /** 9:16 Stacked-Layout: Höhenanteil der Top-Pane (Facecam). 0.2..0.8, default 0.4. */
  splitRatio?: number;
  /** 9:16 Layout-Mode beim Export — analog zum Layout-Picker im TikTok-Tab. */
  tiktokLayout?: 'stacked' | 'full' | 'split';
  /** AI-Voice-Overs (Phase 9.5.5). Mehrere TTS-Spuren mit Position im Output. */
  voiceOvers?: ProjectVoiceOver[];
  /** Subtitle-Styling (Phase 9.5.6). Alle Properties analog Desktop. */
  subtitles?: SubtitleSettings;
  /** Music-Tracks (Phase 9.6.4) — werden beim Export gemixt. */
  musicTracks?: ProjectMusicTrack[];
  /** Wenn true: musicTracks werden zufällig pro Build gewählt. Default false (alle gemixt). */
  musicShuffle?: boolean;
  /** Intro-Video (Phase 9.6.6) — wird vor dem Main-Clip eingeblendet. */
  intro?: ProjectIntro;
  /** Letzte Fehlermeldung wenn status === 'failed'. */
  errorMessage?: string;
}

/** Subtitle-Stil (default/bold/gaming/fiano/layered). Layered = Big-Word + Small-Word überlappend. */
export type SubtitleStyle = 'default' | 'bold' | 'gaming' | 'fiano' | 'layered';
export type SubtitlePosition = 'top' | 'center' | 'bottom' | 'custom';
/** Font-Family — entweder einer der "Curated" Logical-Identifiers ('helvetica',
 *  'arial-black', 'impact', 'geist', 'georgia', 'mono', 'system') ODER ein
 *  direkter System-Font-Name ('sans-serif-black', 'serif', 'monospace', 'Roboto',
 *  jeder beliebige custom Font-Name den der User auswählt/eintippt). */
export type SubtitleFontFamily = string;

export interface SubtitleHighlightWord {
  text: string;
  big: boolean;
}

/**
 * Subtitle-Settings — 1:1 analog Desktop's SubtitleSettings in @fiano/shared/types.
 * Persistiert auf project.subtitles, gerendert beim Export von FFmpeg-Native
 * (Phase 9.6). In der UI gibt's eine statische Mini-Preview via RN <Text> + Style-
 * Tokens — Approximation der Desktop-Canvas-Renderings (Gradient/Metallic im
 * Export, nicht in der Preview).
 */
export interface SubtitleSettings {
  enabled: boolean;
  style: SubtitleStyle;
  position?: SubtitlePosition;
  customY?: number;
  // ── Typography ─────────────────────────────────────────────────
  fontFamily?: SubtitleFontFamily;
  fontSize?: number;
  letterSpacing?: number;
  uppercase?: boolean;
  // ── Colors ─────────────────────────────────────────────────────
  textColor?: string;
  highlightColor?: string;
  useGradient?: boolean;
  gradientFrom?: string;
  gradientTo?: string;
  // ── Stroke ─────────────────────────────────────────────────────
  strokeEnabled?: boolean;
  strokeWidth?: number;
  strokeColor?: string;
  // ── Glow ───────────────────────────────────────────────────────
  glowEnabled?: boolean;
  glowBlur?: number;
  glowStrength?: number;
  glowColor?: string;
  // ── Shadow ─────────────────────────────────────────────────────
  shadowEnabled?: boolean;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowColor?: string;
  shadowBlur?: number;
  // ── Misc ───────────────────────────────────────────────────────
  metallic?: boolean;
  maxWordsPerChunk?: number;
  highlightWords?: SubtitleHighlightWord[];
  // ── Layered-Style (nur wenn style==='layered') ─────────────────
  highlightUseGradient?: boolean;
  highlightGradientFrom?: string;
  highlightGradientTo?: string;
  highlightFontScale?: number;
  highlightDropShadow?: number;
  highlightMetallic?: boolean;
  highlightGlow?: boolean;
  highlightGlowColor?: string;
  highlightGlowStrength?: number;
}

export const DEFAULT_SUBTITLES: SubtitleSettings = {
  enabled: false,
  style: 'fiano',
  position: 'bottom',
  fontFamily: 'helvetica',
  fontSize: 26,
  uppercase: true,
  textColor: '#ffffff',
  highlightColor: '#ff1039',
  // Default-Render hat KEINEN Stroke — User aktiviert explizit über Toggle.
  // Vorher 'true' default sorgte fuer User-Verwirrung 'Stroke aktiviert sich
  // bei Drop-Shadow-Aenderung von selbst' (Default-Merge bei Re-Save).
  strokeEnabled: false,
  strokeWidth: 3,
  strokeColor: '#000000',
  glowEnabled: false,
  glowBlur: 8,
  glowStrength: 0.7,
  glowColor: '#ff1039',
  shadowEnabled: false,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  shadowColor: '#000000',
  shadowBlur: 0,
  metallic: false,
  maxWordsPerChunk: 2,
  highlightFontScale: 1.4,
};

/** AI-Voice-Over (Text-to-Speech) mit Position im Output-Video. Analog Desktop ProjectVoiceOver. */
export interface ProjectVoiceOver {
  /** file:// URI in documentDirectory/voice-overs/. */
  path: string;
  /** Sekunde im Output-Video, ab der das Voice-Over startet. */
  startSec: number;
  /** 0..1.5, default 1.0. */
  volume: number;
  /** Original-Text für Re-Edit. */
  text?: string;
  /** OpenAI-Voice-ID (alloy/echo/fable/nova/onyx/shimmer). */
  voice?: string;
}

/** Music-Track (Phase 9.6.4). */
export interface ProjectMusicTrack {
  /** file:// URI im documentDirectory/music/. */
  path: string;
  /** Original-Dateiname (Display). */
  filename?: string;
  /** Lautstärke 0..1.5. Default 0.6 (Music soll Source-Audio nicht überdecken). */
  volume: number;
}

/** Intro-Video (Phase 9.6.6). 'before' = prepend, 'overlay' = transparent
 *  über die ersten 3 Sek. Aktuell unterstützt nur 'before'. */
export interface ProjectIntro {
  /** file:// URI. */
  path: string;
  /** Original-Dateiname. */
  filename?: string;
  /** Default 'before'. 'overlay' kommt später. */
  mode?: 'before' | 'overlay';
}

export const DEFAULT_SPLIT_RATIO = 0.4;

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
