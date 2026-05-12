// Shared types between main process and renderer.

export type ProjectStatus =
  | 'created'
  | 'analyzing'
  | 'ready'
  | 'error';

/**
 * - auto:   Long-form Source-Video → AI findet Highlights, rendert Clips.
 * - manual: User importiert mehrere fertige Clips, KEINE Analyse, nur kombinieren.
 */
export type ProjectMode = 'auto' | 'manual';

export interface ProjectSource {
  kind: 'file' | 'url';
  value: string; // file path or url
}

/**
 * Region innerhalb des 16:9 Master-Clips wo die Facecam liegt.
 * Alle Werte normalisiert 0..1.
 */
export interface FacecamRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Layout-Mode für 9:16-TikTok-Export. 'split' ist Mobile-spezifisch — Desktop
 *  rendert 'full' und 'stacked'. Beide Plattformen nutzen den gleichen Type damit
 *  shared/ffmpegArgs.ts unified bleibt. */
export type TikTokLayout = 'full' | 'stacked' | 'split';

/** Ein wiedergegebener Bereich des Master-Clips (in Sekunden ab Clip-Anfang). */
export interface ClipSegment {
  start: number;
  end: number;
}

export type SubtitleStyle = 'default' | 'bold' | 'gaming' | 'fiano' | 'layered';

/** Vertikale Position. customY = Anteil von OBEN (0=top, 1=bottom). */
export type SubtitlePosition = 'top' | 'center' | 'bottom' | 'custom';

/** Ein Wort in der Subtitle-Liste — markiert ob "Big Highlight" oder "Small Leading". */
export interface SubtitleHighlightWord {
  text: string;
  /** Big = größer + Highlight-Color; false = kleiner + neutral */
  big: boolean;
}

// SubtitleCue ist in `subtitles.ts` deklariert + via index re-exported.
// `types.ts` referenziert ihn via Forward-Import (kein Re-Define hier).

/**
 * Font-Family — entweder einer der "Curated" Logical-Identifiers (werden im Backend
 * auf konkrete Font-Files gemappt) oder ein direkter System-Font-Name.
 */
export type SubtitleFontFamily = string;
export const CURATED_FONT_FAMILIES = [
  'helvetica', 'arial-black', 'impact', 'geist', 'georgia', 'mono', 'system',
] as const;

export interface SubtitleSettings {
  enabled: boolean;
  style: SubtitleStyle;
  position?: SubtitlePosition;
  customY?: number;
  // ─── Typography ────────────────────────────────────────────────
  fontFamily?: SubtitleFontFamily;
  fontSize?: number;              // 14..48
  letterSpacing?: number;         // -0.05..0.3em
  uppercase?: boolean;
  // ─── Colors ────────────────────────────────────────────────────
  textColor?: string;             // primary text color (hex)
  highlightColor?: string;        // big word color (hex)
  useGradient?: boolean;
  gradientFrom?: string;          // hex
  gradientTo?: string;            // hex
  // ─── Stroke / Outline ──────────────────────────────────────────
  /** Master-Toggle für Stroke. Wenn false → Outline-Width = 0 im Export. */
  strokeEnabled?: boolean;
  strokeWidth?: number;           // 0..8
  strokeColor?: string;           // hex (default black)
  // ─── Glow / Shadow ─────────────────────────────────────────────
  /** Master-Toggle für Glow. Wenn false → Glow-Pass komplett aus. Default: true wenn glowBlur>0. */
  glowEnabled?: boolean;
  glowBlur?: number;              // 0..40 (px-Äquivalent)
  glowStrength?: number;          // 0..1 (alpha multiplier)
  glowColor?: string;             // hex
  /** Master-Toggle für Drop-Shadow. */
  shadowEnabled?: boolean;
  shadowOffsetX?: number;         // -20..20
  shadowOffsetY?: number;         // -20..20
  shadowColor?: string;           // hex (default schwarz)
  shadowBlur?: number;            // 0..40 (px-Blur des Drop-Shadows)
  /** Metallic-Effekt für ALLEN Subtitle-Text (nicht nur Layered-Big-Word).
   *  Wenn true → 7-Stop Sheen-Gradient mit gradientFrom/To als Basis. */
  metallic?: boolean;
  /** Maximale Wörter pro Cue-Anzeige. Default 2 (TikTok-Style: 1-2 Wörter gleichzeitig).
   *  1 = single-word-mode, 2-3 = phrase-mode, 999 = ganzer Satz. */
  maxWordsPerChunk?: number;
  // ─── Word Highlight ────────────────────────────────────────────
  highlightWords?: SubtitleHighlightWord[];
  /** Zeitgesteuerte Cues aus Whisper-Transcription (Phase 9.6.7a).
   *  Wenn gesetzt + enabled: Export rendert Subtitle-Filter pro Cue.
   *  Type lebt in `subtitles.ts` — hier via import-type. */
  cues?: import('./subtitles').SubtitleCue[];
  // ─── Layered-Style ──────────────────────────────────────────────
  // Wirken NUR wenn style === 'layered'. Big-Word kriegt eigenen Gradient/Color
  // + größere Schrift, andere Wörter nutzen die "normalen" Color-Settings.
  /** Eigener Gradient für das Highlight-Wort beim layered-Style. */
  highlightUseGradient?: boolean;
  highlightGradientFrom?: string;     // hex
  highlightGradientTo?: string;       // hex
  /** Skalierung der Highlight-Wort-Größe relativ zur normalen fontSize. 1.0..3.0 */
  highlightFontScale?: number;
  /** Drop-Shadow-Stärke für das Highlight-Wort beim layered-Style (0..40 px). */
  highlightDropShadow?: number;
  /**
   * Metallic-/Glanz-Effekt fürs Highlight-Wort. Erzeugt einen 3-Stop-Sheen-Gradient
   * mit hellem Streak — wirkt wie poliertes Metall. Nutzt highlightGradientFrom/To
   * als Basis-Farben, fügt einen hellen Highlight-Streak ein.
   */
  highlightMetallic?: boolean;
  /** Glow um das Highlight-Wort (radialer Halo, separat zum normalen glowBlur). */
  highlightGlow?: boolean;
  highlightGlowColor?: string;
  /** Strength 0..1 (mappt auf shadowBlur ~0..50px). */
  highlightGlowStrength?: number;
}

// ─── Effects (Motion Blur + Color Filter Presets) ───────────────────────────
export type MotionBlur = 'off' | 'low' | 'medium' | 'high';
export type FilterPreset = 'none' | 'vivid' | 'dark' | 'warm' | 'cold' | 'gaming';

export interface ClipEffects {
  motionBlur?: MotionBlur;
  filter?: FilterPreset;
}

// ─── Gameplay-Region (analog zu FacecamRegion, frei positionierbarer Crop) ──
export interface GameplayRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_GAMEPLAY: GameplayRegion = { x: 0, y: 0, width: 1, height: 1 };
export const DEFAULT_EFFECTS: ClipEffects = { motionBlur: 'off', filter: 'none' };

export interface Highlight {
  start: number;
  end: number;
  score: number;
  reason: string;
  clipPath?: string;
  // ─── Trim (legacy single-range) ────────────────────────────────
  trimStart?: number;
  trimEnd?: number;
  // ─── Multi-Segment Cuts (overrides trim wenn vorhanden) ────────
  segments?: ClipSegment[];
  // ─── TikTok Layout ─────────────────────────────────────────────
  layout?: TikTokLayout;
  facecam?: FacecamRegion;
  splitRatio?: number;          // 0.2 - 0.8 (Anteil Facecam-Höhe), default 0.3
  // ─── Subtitles (TikTok only, MVP) ──────────────────────────────
  subtitles?: SubtitleSettings;
  /** User-Override des Transcripts pro Cue. Wenn gesetzt → wird im Export
   *  und Live-Preview anstelle der Whisper-Cues verwendet. Index entspricht
   *  Cue-Index aus transcript.getCuesForHighlight. Edits ohne text werden
   *  als "skip" interpretiert (Cue ausgeblendet). */
  subtitleEdits?: Array<{ start: number; end: number; text: string } | null>;
  // ─── Quelle ─────────────────────────────────────────────────────
  origin?: 'auto' | 'manual';   // 'manual' = vom User selbst gesetzt
  // ─── Effects + Gameplay-Crop (TikTok-Layout) ───────────────────
  effects?: ClipEffects;
  gameplay?: GameplayRegion;
}

export type ExportFormat = 'youtube' | 'tiktok';

export const DEFAULT_FACECAM: FacecamRegion = { x: 0, y: 0.75, width: 0.25, height: 0.25 };
export const DEFAULT_SPLIT_RATIO = 0.3;

/** Liefert die effektiven Wiedergabe-Bereiche eines Highlights, normalisiert. */
export function effectiveSegments(h: Highlight): ClipSegment[] {
  if (h.segments && h.segments.length > 0) return h.segments;
  const dur = Math.max(0, h.end - h.start);
  return [{ start: h.trimStart ?? 0, end: h.trimEnd ?? dur }];
}

export interface ProjectMusic {
  path: string;
  volume: number;       // 0..1
}

/** AI-generated Voice-Over (Text-to-Speech) mit Position im Output-Video. */
export interface ProjectVoiceOver {
  path: string;
  /** Sekunde im Output-Video, ab der das Voice-Over startet. */
  startSec: number;
  /** 0..1, default 1.0 */
  volume: number;
  /** Original-Text für Re-Edit. */
  text?: string;
  /** OpenAI-Voice-ID (alloy/echo/fable/nova/onyx/shimmer). */
  voice?: string;
}

export type IntroMode = 'before' | 'overlay';

export interface ProjectIntro {
  path: string;
  mode?: IntroMode;       // default 'before'
  // Overlay-Mode-Optionen (alle 0..1 normalisiert auf Output-Frame)
  scale?: number;         // Width-Anteil, default 0.3
  x?: number;             // Top-Left X, default 0.7 (rechts oben)
  y?: number;             // Top-Left Y, default 0.0
}

export const DEFAULT_INTRO_OVERLAY = {
  scale: 0.3,
  x: 0.7,
  y: 0.0,
};

/** Video-Typ für Highlight-Erkennung. Bestimmt welcher Modus die Pipeline verwendet:
 *  - 'gaming':  Audio-Spike-Detection (laute Momente, Schüsse, Lacher) — current default
 *  - 'podcast': LLM-Analyse vom Whisper-Transcript (interessante Aussagen, Punchlines)
 *  - 'auto':    Pipeline schaut Audio-Statistik an und entscheidet selbst */
export type VideoType = 'gaming' | 'podcast' | 'auto';

export interface Project {
  id: string;
  name: string;
  mode: ProjectMode;
  source?: ProjectSource;
  status: ProjectStatus;
  highlights: Highlight[];
  errorMessage?: string;
  createdAt: number;
  /** Letzte Änderung (auto-set in writeMeta). Für Library-Sort „last modified". */
  updatedAt?: number;
  /** Video-Typ für Highlight-Erkennung. Default 'gaming' (legacy). */
  videoType?: VideoType;
  // ─── Music ───────────────────────────────────────────────────
  music?: ProjectMusic;            // legacy single-track (auto-migriert)
  musicTracks?: ProjectMusic[];    // mehrere Tracks pro Projekt
  activeMusicIndex?: number;       // welcher Track aktiv ist; -1 = random pro Build; undefined = none
  /** AI-Voice-Overs mit Positionen — separate Audio-Spur. */
  voiceOvers?: ProjectVoiceOver[];
  // ─── Intro ───────────────────────────────────────────────────
  intro?: ProjectIntro;
}

export interface IpcResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export type AppEvent =
  | { type: 'job.progress'; projectId: string; step: string; percent: number }
  | { type: 'job.log'; projectId: string; message: string }
  | { type: 'project.updated'; projectId: string }
  | { type: 'update.checking' }
  | { type: 'update.available'; version: string }
  | { type: 'update.not-available'; currentVersion: string }
  | { type: 'update.progress'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { type: 'update.downloaded'; version: string }
  | { type: 'update.error'; message: string };

export const PIPELINE_STEPS = ['download', 'transcribe', 'highlights', 'render'] as const;
export type PipelineStepName = (typeof PIPELINE_STEPS)[number];
