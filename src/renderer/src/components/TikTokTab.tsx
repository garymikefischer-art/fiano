import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import type {
  ClipEffects, FacecamRegion, FilterPreset, GameplayRegion,
  Highlight, MotionBlur, Project, SubtitleFontFamily, SubtitleHighlightWord,
  SubtitlePosition, SubtitleStyle, TikTokLayout,
} from '@shared/types';
import { DEFAULT_FACECAM, DEFAULT_GAMEPLAY, effectiveSegments } from '@shared/types';
import { useApp } from '../stores/appStore';
import { renderSubtitleCueToPng } from '../lib/subtitleCanvas';
import { ExportSettingsDialog, defaultExportSettings, type ExportSettings } from './ExportSettingsDialog';
import { TikTokPreview } from './TikTokPreview';
import { FacecamEditor } from './FacecamEditor';
import { GameplayEditor } from './GameplayEditor';
import { SegmentEditor } from './SegmentEditor';
import { MusicSection, resolveActiveMusic } from './sections/MusicSection';
import { IntroSection } from './sections/IntroSection';
import { VoiceOversSection } from './sections/VoiceOversSection';
import { mediaUrl } from '../lib/mediaUrl';
import { useRightRail } from './RightRailContext';
import type { ClipSegment } from '@shared/types';
import { useT } from '../lib/i18n';
import { useFeature } from '../lib/features';
import { useUpgradeModal } from '../stores/upgradeModalStore';
import { LockBadge } from './FeatureLock';

function defaultFontSize(style: SubtitleStyle): number {
  switch (style) {
    case 'bold':   return 22;
    case 'gaming': return 26;
    case 'fiano':  return 28;
    default:       return 18;
  }
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatRelativeDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (isToday) return `Today · ${time}`;
  const dayDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (dayDiff === 1) return `Yesterday · ${time}`;
  if (dayDiff < 7) return `${dayDiff}d ago · ${time}`;
  return date.toLocaleDateString();
}

interface Props {
  project: Project;
}

/**
 * TikTok Tab — Mockup-Layout:
 * - Liste links (vertikal mit Mini-Preview)
 * - Große Preview mitte
 * - Settings-Sidebar rechts (Tabs: Edit | Subtitles | Effects)
 * - Project-weite Intro/Music als Glass-Card oben
 */
export function TikTokTab({ project }: Props) {
  if (project.status !== 'ready' || project.highlights.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-500">
        <div className="text-2xl mb-3">📱</div>
        <div className="text-sm">Run analysis first — TikTok clips appear here when ready.</div>
      </div>
    );
  }
  return <TikTokWorkspace project={project} />;
}

type SettingsTab = 'edit' | 'subtitles' | 'effects';

function TikTokWorkspace({ project }: { project: Project }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [tab, setTab] = useState<SettingsTab>('edit');
  const active = project.highlights[activeIdx];
  const railEl = useRightRail();
  const activeDuration = active ? Math.max(0, active.end - active.start) : 60;

  return (
    <>
      {/* ═══ LEFT COLUMN — Cards / Player / Edit / Project-Settings ══ */}
      <div className="flex flex-col gap-6 min-w-0">
        <ClipCardStrip project={project} activeIdx={activeIdx} onSelect={setActiveIdx} />

        {active ? (
          <>
            <ClipPreviewArea project={project} highlight={active} index={activeIdx} />
            <EditClipSection
              key={activeIdx}
              project={project}
              highlight={active}
              index={activeIdx}
            />
          </>
        ) : (
          <div className="glass p-12 text-center text-[12px] text-zinc-500">
            Select a clip from the list to edit.
          </div>
        )}

        <div className="glass p-5">
          <IntroSection project={project} />
        </div>
        <div className="glass p-5">
          <MusicSection project={project} />
        </div>
        <div className="glass p-5">
          <VoiceOversSection project={project} totalDurationHint={activeDuration} />
        </div>
      </div>

      {/* ═══ RIGHT RAIL — via Portal in ProjectDetailPage's right-rail-Slot ═══ */}
      {railEl && active && createPortal(
        <SettingsSidebar
          project={project}
          highlight={active}
          index={activeIdx}
          tab={tab}
          onTabChange={setTab}
        />,
        railEl,
      )}
    </>
  );
}

/* ─── ClipCardStrip (Mockup-Style: horizontal-scrollable Cards) ─ */

function ClipCardStrip({
  project, activeIdx, onSelect,
}: {
  project: Project;
  activeIdx: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div>
      <div className="pb-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        Clips · {project.highlights.length}
      </div>
      {/* Strip: overflow-x-auto + overflow-y-visible. Aber: Browser-Quirk macht Strip
          effektiv overflow-x-clip+overflow-y-clip wenn scroll active wird (>1 Card).
          Padding wird in einigen Browsern unzuverlässig respektiert beim ersten Card-Glow
          (Card 1 wirkt links abgeschnitten). Robuster: explizite flex-Spacer-Elemente
          als shrink-0 children — die zählen IMMER zum scroll-content und können nicht
          weg-clippt werden. Plus py-5 (20px) für vertikalen Glow-Puffer.
          scroll-pl-5: snap-target-Inset damit beim "snap to card" Card-1 nicht direkt
          am scroll-edge klebt sondern mit 20px Inset gerendert wird. */}
      <div className="flex gap-4 overflow-x-auto overflow-y-visible py-5 snap-x scroll-pl-2">
        <div className="shrink-0 w-4" aria-hidden />
        {/* Chronologisch sortiert für UI, Original-Index als index-prop für Backend-Updates. */}
        {project.highlights
          .map((h, i) => ({ h, i }))
          .sort((a, b) => a.h.start - b.h.start)
          .map(({ h, i }) => (
          <ClipCard
            key={i}
            project={project}
            highlight={h}
            index={i}
            isActive={i === activeIdx}
            onClick={() => onSelect(i)}
          />
        ))}
        <div className="shrink-0 w-4" aria-hidden />
      </div>
    </div>
  );
}

function ClipCard({
  project, highlight, index, isActive, onClick,
}: {
  project: Project;
  highlight: Highlight;
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  // useMemo: segments-Referenz nur ändern wenn highlight.segments oder highlight.trim*
  // wirklich ändern. Sonst triggert TikTokPreview's [playing, segments] useEffect bei jedem
  // re-render einen play/pause/seek → pseudo-infinite-loop und keine Wiedergabe.
  const segments = useMemo(() => effectiveSegments(highlight),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [highlight.segments, highlight.trimStart, highlight.trimEnd, highlight.start, highlight.end]);
  const totalSec = segments.reduce((s, seg) => s + (seg.end - seg.start), 0);
  const reasonShort = (highlight.reason ?? '').replace(/^[A-Z]+:\s*/, '').slice(0, 36);
  const dateLabel = formatRelativeDate(project.createdAt);
  const tagLabel = project.name.length > 22 ? project.name.slice(0, 22) + '…' : project.name;

  // Hover → von Segment-Start abspielen
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (hover) {
      v.currentTime = segments[0]?.start ?? 0;
      v.play().catch(() => {});
    } else {
      v.pause();
      v.currentTime = segments[0]?.start ?? 0;
    }
  }, [hover, segments]);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={clsx(
        'shrink-0 w-[230px] rounded-xl overflow-hidden text-left transition-all duration-200 snap-start',
        // Outer-Shadow: 10px Blur (~15 visible). Strip nutzt overflow-y-visible damit der
        // Glow nach OBEN/UNTEN aus dem Strip rauslaufen darf (sonst clippt der CSS-Spec-Quirk
        // sobald horizontaler Scroll aktiv wird = bei 5+ Cards).
        isActive
          ? 'ring-2 ring-fiano-red shadow-[0_0_10px_rgba(255,16,57,0.65)]'
          : 'ring-1 ring-white/[0.06] hover:ring-white/[0.16] hover:-translate-y-0.5',
      )}
    >
      {/* 16:9 Thumbnail */}
      <div className="relative aspect-video bg-black/60 overflow-hidden">
        {highlight.clipPath ? (
          <video
            ref={videoRef}
            src={mediaUrl(highlight.clipPath)}
            muted
            playsInline
            loop
            preload="metadata"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700">
            <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M10 9l5 3-5 3z" fill="currentColor" />
            </svg>
          </div>
        )}

        {/* Duration Badge top-left */}
        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/70 text-white backdrop-blur-sm">
          {formatDuration(totalSec)}
        </div>

        {/* Active Checkmark (überlagert Duration) */}
        {isActive && (
          <div className="absolute top-2 left-2 w-6 h-6 rounded bg-fiano-red flex items-center justify-center shadow-[0_0_12px_rgba(255,16,57,0.6)]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8l3.5 3.5L13 5" />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 bg-white/[0.04] border-t border-white/[0.06]">
        <div className={clsx(
          'text-[13px] font-semibold truncate transition-colors',
          isActive ? 'text-white' : 'text-zinc-200',
        )}>
          {reasonShort || `Clip ${index + 1}`}
        </div>
        <div className="text-[11px] text-zinc-500 mt-1 truncate">
          {tagLabel}
        </div>
        <div className="text-[10px] text-zinc-600 mt-0.5 font-mono">
          {dateLabel}
        </div>
      </div>
    </button>
  );
}

/* ─── ClipPreviewArea (center) ───────────────────────────────── */

function ClipPreviewArea({
  project, highlight, index,
}: {
  project: Project;
  highlight: Highlight;
  index: number;
}) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDur, setVideoDur] = useState(0);

  // User-Defaults aus Settings — sonst greift Preview ohne Highlight-Override auf hartcodiert zurück
  const defaultFacecam   = useApp((s) => s.appDefaults.facecam);
  const defaultGameplay  = useApp((s) => s.appDefaults.gameplay);
  const defaultSplitRatio = useApp((s) => s.appDefaults.splitRatio);

  // useMemo: segments-Referenz nur ändern wenn highlight.segments oder highlight.trim*
  // wirklich ändern. Sonst triggert TikTokPreview's [playing, segments] useEffect bei jedem
  // re-render einen play/pause/seek → pseudo-infinite-loop und keine Wiedergabe.
  const segments = useMemo(() => effectiveSegments(highlight),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [highlight.segments, highlight.trimStart, highlight.trimEnd, highlight.start, highlight.end]);
  const totalSec = segments.reduce((s, seg) => s + (seg.end - seg.start), 0);

  // Listen auf video-events für Time/Duration-Tracking + Play/Pause-State-Sync
  useEffect(() => {
    if (!videoEl) return;
    const onTime = () => setCurrentTime(videoEl.currentTime);
    const onMeta = () => setVideoDur(videoEl.duration || 0);
    const onPlay  = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    videoEl.addEventListener('timeupdate', onTime);
    videoEl.addEventListener('loadedmetadata', onMeta);
    videoEl.addEventListener('play',  onPlay);
    videoEl.addEventListener('pause', onPause);
    if (videoEl.duration) setVideoDur(videoEl.duration);
    return () => {
      videoEl.removeEventListener('timeupdate', onTime);
      videoEl.removeEventListener('loadedmetadata', onMeta);
      videoEl.removeEventListener('play',  onPlay);
      videoEl.removeEventListener('pause', onPause);
    };
  }, [videoEl]);

  // Auto-Play beim Mount UND wenn der active Clip wechselt
  useEffect(() => {
    if (!videoEl) return;
    const tryPlay = () => {
      // Vom Segment-Start beginnen
      const seg0 = segments[0];
      if (seg0) videoEl.currentTime = seg0.start;
      videoEl.play().catch(() => {/* user-gesture-policy — ignore */});
    };
    if (videoEl.readyState >= 2) tryPlay();
    else videoEl.addEventListener('loadeddata', tryPlay, { once: true });
    return () => videoEl.removeEventListener('loadeddata', tryPlay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoEl, highlight.clipPath]);

  const togglePlay = () => {
    if (!videoEl) return;
    if (videoEl.paused) videoEl.play().catch(() => {});
    else videoEl.pause();
  };
  const toggleMute = () => {
    if (!videoEl) return;
    videoEl.muted = !videoEl.muted;
    setMuted(videoEl.muted);
  };
  const skipBy = (delta: number) => {
    if (!videoEl) return;
    const seg = segments[0] ?? { start: 0, end: videoDur };
    videoEl.currentTime = Math.max(seg.start, Math.min(seg.end, videoEl.currentTime + delta));
  };

  const subEnabled = !!highlight.subtitles?.enabled;
  const subStyle: SubtitleStyle = highlight.subtitles?.style ?? 'fiano';
  const subPosition: SubtitlePosition = highlight.subtitles?.position ?? 'bottom';
  const subCustomY = highlight.subtitles?.customY ?? 0.85;
  const subFontFamily: SubtitleFontFamily = highlight.subtitles?.fontFamily ?? 'helvetica';
  const subFontSize = highlight.subtitles?.fontSize ?? defaultFontSize(subStyle);
  const subLetterSpacing = highlight.subtitles?.letterSpacing ?? 0;
  const subUppercase = highlight.subtitles?.uppercase ?? (subStyle === 'fiano');
  const subTextColor = highlight.subtitles?.textColor ?? '#ffffff';
  const subHighlightColor = highlight.subtitles?.highlightColor ?? '#ff1039';
  const subUseGradient = highlight.subtitles?.useGradient ?? false;
  const subGradientFrom = highlight.subtitles?.gradientFrom ?? '#ff1039';
  const subGradientTo = highlight.subtitles?.gradientTo ?? '#ff8c00';
  const subStrokeWidth = highlight.subtitles?.strokeWidth ?? 3;
  const subStrokeColor = highlight.subtitles?.strokeColor ?? '#000000';
  const subGlowBlur = highlight.subtitles?.glowBlur ?? 8;
  const subGlowStrength = highlight.subtitles?.glowStrength ?? 0.7;
  const subGlowColor = highlight.subtitles?.glowColor ?? '#ff1039';
  const subShadowOffsetX = highlight.subtitles?.shadowOffsetX ?? 0;
  const subShadowOffsetY = highlight.subtitles?.shadowOffsetY ?? 0;
  const subShadowColor   = highlight.subtitles?.shadowColor   ?? '#000000';
  const subShadowBlur    = highlight.subtitles?.shadowBlur    ?? 0;
  // glowEnabled/shadowEnabled: Legacy-Fallback wenn nicht explizit gesetzt.
  const subGlowEnabled   = highlight.subtitles?.glowEnabled
    ?? ((highlight.subtitles?.glowBlur ?? 0) > 0);
  const subShadowEnabled = highlight.subtitles?.shadowEnabled
    ?? ((highlight.subtitles?.shadowBlur ?? 0) > 0
       || (highlight.subtitles?.shadowOffsetX ?? 0) !== 0
       || (highlight.subtitles?.shadowOffsetY ?? 0) !== 0);
  const subMetallic      = highlight.subtitles?.metallic      ?? false;
  const subHighlightWords = highlight.subtitles?.highlightWords;
  // Layered-Style defaults
  const subHighlightUseGradient   = highlight.subtitles?.highlightUseGradient   ?? true;
  const subHighlightGradientFrom  = highlight.subtitles?.highlightGradientFrom  ?? '#ff5570';
  const subHighlightGradientTo    = highlight.subtitles?.highlightGradientTo    ?? '#ff1039';
  const subHighlightFontScale     = highlight.subtitles?.highlightFontScale     ?? 2.0;
  const subHighlightDropShadow    = highlight.subtitles?.highlightDropShadow    ?? 8;
  const subHighlightMetallic      = highlight.subtitles?.highlightMetallic      ?? false;
  const subHighlightGlow          = highlight.subtitles?.highlightGlow          ?? false;
  const subHighlightGlowColor     = highlight.subtitles?.highlightGlowColor     ?? '#ffffff';
  const subHighlightGlowStrength  = highlight.subtitles?.highlightGlowStrength  ?? 0.6;

  return (
    <div className="glass p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] font-medium truncate flex-1" title={highlight.reason}>
          <span className="text-zinc-500 font-mono mr-2">#{String(index + 1).padStart(2, '0')}</span>
          <span className="text-zinc-200">{highlight.reason}</span>
        </div>
        <div className="text-[10px] text-zinc-500 font-mono shrink-0">
          {totalSec.toFixed(1)}s · {segments.length} seg
        </div>
      </div>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <TikTokPreview
          src={highlight.clipPath}
          layout={highlight.layout ?? 'full'}
          facecam={highlight.facecam ?? defaultFacecam}
          gameplay={highlight.gameplay ?? defaultGameplay}
          splitRatio={highlight.splitRatio ?? defaultSplitRatio}
          segments={segments}
          playing={playing}
          intro={project.intro}
          effects={highlight.effects}
          voiceOvers={project.voiceOvers}
          subtitlePreview={subEnabled
            ? {
                style: subStyle, position: subPosition, customY: subCustomY,
                fontFamily: subFontFamily, fontSize: subFontSize, letterSpacing: subLetterSpacing,
                uppercase: subUppercase,
                textColor: subTextColor, highlightColor: subHighlightColor,
                useGradient: subUseGradient, gradientFrom: subGradientFrom, gradientTo: subGradientTo,
                strokeWidth: subStrokeWidth, strokeColor: subStrokeColor,
                glowBlur: subGlowBlur, glowStrength: subGlowStrength, glowColor: subGlowColor,
                shadowOffsetX: subShadowOffsetX, shadowOffsetY: subShadowOffsetY,
                shadowColor: subShadowColor, shadowBlur: subShadowBlur,
                glowEnabled: subGlowEnabled, shadowEnabled: subShadowEnabled, metallic: subMetallic,
                highlightWords: subHighlightWords,
                highlightUseGradient: subHighlightUseGradient,
                highlightGradientFrom: subHighlightGradientFrom,
                highlightGradientTo: subHighlightGradientTo,
                highlightFontScale: subHighlightFontScale,
                highlightDropShadow: subHighlightDropShadow,
                highlightMetallic: subHighlightMetallic,
                highlightGlow: subHighlightGlow,
                highlightGlowColor: subHighlightGlowColor,
                highlightGlowStrength: subHighlightGlowStrength,
              }
            : undefined}
          onVideoReady={setVideoEl}
        />
      </div>

      {/* Custom Controls Bar — gleicher Stil wie ClipEditorModal */}
      <div className="mx-auto flex items-center gap-3 px-3 py-2 rounded-xl bg-black/40 border border-white/[0.06]"
           style={{ maxWidth: 420 }}>
        <button
          onClick={() => skipBy(-5)}
          className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-300 hover:bg-white/[0.06] transition"
          aria-label="Back 5s"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
            <path d="M7 3v10l-7-5zM15 3v10l-7-5z" />
          </svg>
        </button>
        <button
          onClick={togglePlay}
          className="w-9 h-9 rounded-lg flex items-center justify-center bg-fiano-red text-white shadow-[0_0_16px_rgba(255,16,57,0.4)] hover:brightness-110 transition"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
              <rect x="4" y="3" width="2.5" height="10" rx="0.5" />
              <rect x="9.5" y="3" width="2.5" height="10" rx="0.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 ml-0.5" fill="currentColor">
              <path d="M3.5 3v10l10-5z" />
            </svg>
          )}
        </button>
        <button
          onClick={() => skipBy(5)}
          className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-300 hover:bg-white/[0.06] transition"
          aria-label="Forward 5s"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
            <path d="M9 3v10l7-5zM1 3v10l7-5z" />
          </svg>
        </button>

        <button
          onClick={toggleMute}
          className={clsx(
            'w-7 h-7 rounded-md flex items-center justify-center transition',
            muted ? 'text-fiano-red bg-fiano-red/10' : 'text-zinc-300 hover:bg-white/[0.06]',
          )}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? (
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
              <path d="M7 3.5v9L3.5 10H1.5V6h2L7 3.5z" />
              <path d="M11.5 6L14 8.5M14 6l-2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
              <path d="M7 3.5v9L3.5 10H1.5V6h2L7 3.5z" />
              <path d="M10 5.5c1 0.7 1 4.3 0 5M12 4c2 1.5 2 6.5 0 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
            </svg>
          )}
        </button>

        <span className="text-[10px] font-mono text-zinc-400 tabular-nums shrink-0 ml-1">
          {fmtTime(currentTime)}
        </span>

        {/* Progress (visualisiert currentTime relativ zum Highlight-Bereich) */}
        <div
          className="flex-1 h-1 rounded-full bg-white/[0.08] cursor-pointer relative"
          onClick={(e) => {
            if (!videoEl) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            const seg0 = segments[0] ?? { start: 0, end: videoDur };
            videoEl.currentTime = seg0.start + Math.max(0, Math.min(1, pct)) * (seg0.end - seg0.start);
          }}
        >
          <div
            className="absolute inset-y-0 left-0 bg-fiano-red rounded-full shadow-[0_0_6px_rgba(255,16,57,0.5)]"
            style={{
              width: (() => {
                const seg0 = segments[0] ?? { start: 0, end: videoDur || 1 };
                const segLen = Math.max(0.001, seg0.end - seg0.start);
                const local = Math.max(0, Math.min(segLen, currentTime - seg0.start));
                return `${(local / segLen) * 100}%`;
              })(),
            }}
          />
        </div>

        <span className="text-[10px] font-mono text-zinc-500 tabular-nums shrink-0">
          {fmtTime(totalSec)}
        </span>
      </div>
    </div>
  );
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ─── SettingsSidebar (right column with Tabs) ───────────────── */

function SettingsSidebar({
  project, highlight, index, tab, onTabChange,
}: {
  project: Project;
  highlight: Highlight;
  index: number;
  tab: SettingsTab;
  onTabChange: (t: SettingsTab) => void;
}) {
  const updateHighlight = useApp((s) => s.updateHighlight);
  const buildVideo = useApp((s) => s.buildVideo);
  const defaultFacecam = useApp((s) => s.appDefaults.facecam);
  const defaultSplitRatio = useApp((s) => s.appDefaults.splitRatio);
  const defaultGameplay = useApp((s) => s.appDefaults.gameplay);
  const defaultEffects = useApp((s) => s.appDefaults.effects);

  const segments = effectiveSegments(highlight);
  const layout: TikTokLayout = highlight.layout ?? 'full';
  /** Local export-state: zeigt Loading-Banner + disabled Export-Button während TikTok rendert. */
  const [exporting, setExporting] = useState(false);
  /** Cue-Editor State: Original-Cues aus Transcript (lazy-loaded), edits aus highlight.subtitleEdits. */
  const [originalCues, setOriginalCues] = useState<Array<{ start: number; end: number; text: string }>>([]);
  const [cuesLoaded, setCuesLoaded] = useState(false);
  const subtitleEdits = highlight.subtitleEdits ?? [];
  const effects: ClipEffects = highlight.effects ?? defaultEffects;
  const subEnabled = !!highlight.subtitles?.enabled;
  const subStyle: SubtitleStyle = highlight.subtitles?.style ?? 'fiano';
  const subPosition: SubtitlePosition = highlight.subtitles?.position ?? 'bottom';
  const subCustomY = highlight.subtitles?.customY ?? 0.85;
  const subFontFamily: SubtitleFontFamily = highlight.subtitles?.fontFamily ?? 'helvetica';
  const subFontSize = highlight.subtitles?.fontSize ?? defaultFontSize(subStyle);
  const subLetterSpacing = highlight.subtitles?.letterSpacing ?? 0;
  const subUppercase = highlight.subtitles?.uppercase ?? (subStyle === 'fiano');
  const subTextColor = highlight.subtitles?.textColor ?? '#ffffff';
  const subHighlightColor = highlight.subtitles?.highlightColor ?? '#ff1039';
  const subUseGradient = highlight.subtitles?.useGradient ?? false;
  const subGradientFrom = highlight.subtitles?.gradientFrom ?? '#ff1039';
  const subGradientTo = highlight.subtitles?.gradientTo ?? '#ff8c00';
  const subStrokeWidth = highlight.subtitles?.strokeWidth ?? 3;
  const subStrokeColor = highlight.subtitles?.strokeColor ?? '#000000';
  const subGlowBlur = highlight.subtitles?.glowBlur ?? 8;
  const subGlowStrength = highlight.subtitles?.glowStrength ?? 0.7;
  const subGlowColor = highlight.subtitles?.glowColor ?? '#ff1039';
  const subShadowOffsetX = highlight.subtitles?.shadowOffsetX ?? 0;
  const subShadowOffsetY = highlight.subtitles?.shadowOffsetY ?? 0;
  const subShadowColor   = highlight.subtitles?.shadowColor   ?? '#000000';
  const subShadowBlur    = highlight.subtitles?.shadowBlur    ?? 0;
  // glowEnabled/shadowEnabled: Legacy-Fallback basierend auf existing values für alte Projekte
  // (vor Toggle-Schema). User-Toggle (true ODER false) hat Vorrang.
  const subGlowEnabled = highlight.subtitles?.glowEnabled
    ?? ((highlight.subtitles?.glowBlur ?? 0) > 0);
  const subShadowEnabled = highlight.subtitles?.shadowEnabled
    ?? ((highlight.subtitles?.shadowBlur ?? 0) > 0
       || (highlight.subtitles?.shadowOffsetX ?? 0) !== 0
       || (highlight.subtitles?.shadowOffsetY ?? 0) !== 0);
  const subMetallic      = highlight.subtitles?.metallic      ?? false;
  const subMaxWordsPerChunk = highlight.subtitles?.maxWordsPerChunk ?? 2;
  const subHighlightWords: SubtitleHighlightWord[] = highlight.subtitles?.highlightWords ?? [];
  // Layered-Style: Defaults für Highlight-Wort (fiano-rot Gradient + scale 2.0 + drop-shadow 8px)
  const subHighlightUseGradient   = highlight.subtitles?.highlightUseGradient   ?? true;
  const subHighlightGradientFrom  = highlight.subtitles?.highlightGradientFrom  ?? '#ff5570';
  const subHighlightGradientTo    = highlight.subtitles?.highlightGradientTo    ?? '#ff1039';
  const subHighlightFontScale     = highlight.subtitles?.highlightFontScale     ?? 2.0;
  const subHighlightDropShadow    = highlight.subtitles?.highlightDropShadow    ?? 8;
  const subHighlightMetallic      = highlight.subtitles?.highlightMetallic      ?? false;
  const subHighlightGlow          = highlight.subtitles?.highlightGlow          ?? false;
  const subHighlightGlowColor     = highlight.subtitles?.highlightGlowColor     ?? '#ffffff';
  const subHighlightGlowStrength  = highlight.subtitles?.highlightGlowStrength  ?? 0.6;

  // Local state pattern für drag-Sliders (commit on pointer-up)
  const [splitRatio, setSplitRatio] = useState(highlight.splitRatio ?? defaultSplitRatio);
  const [facecam, setFacecam] = useState<FacecamRegion>(highlight.facecam ?? defaultFacecam);
  const [gameplay, setGameplay] = useState<GameplayRegion>(highlight.gameplay ?? defaultGameplay);

  // Cue-Editor: Lazy-Load Cues wenn Subtitle-Tab geöffnet wird.
  // Reset cuesLoaded wenn highlight wechselt → frischer Load für neuen Highlight.
  useEffect(() => {
    setCuesLoaded(false);
    setOriginalCues([]);
  }, [highlight.start, highlight.end, project.id]);
  useEffect(() => {
    if (cuesLoaded) return;
    if (tab !== 'subtitles') return;
    let cancelled = false;
    (async () => {
      const res = await window.api.invoke<{ cues: Array<{ start: number; end: number; text: string }> }>(
        'transcript.getCuesForHighlight',
        { projectId: project.id, highlightIndex: index },
      );
      if (cancelled) return;
      if (res.ok && res.data) {
        setOriginalCues(res.data.cues);
      }
      setCuesLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [tab, cuesLoaded, project.id, index]);

  // Effective cues: original gemerged mit edits (per Index). Edit kann text überschreiben oder
  // Cue auf null setzen (skip). Wird im onExport + Live-Preview verwendet.
  const effectiveCues = originalCues.map((c, i) => {
    const edit = subtitleEdits[i];
    if (edit === null) return null;
    if (edit) return edit;
    return c;
  }).filter((c): c is { start: number; end: number; text: string } => !!c);

  // Sync local state when active highlight changes
  useEffect(() => {
    setSplitRatio(highlight.splitRatio ?? defaultSplitRatio);
    setFacecam(highlight.facecam ?? defaultFacecam);
    setGameplay(highlight.gameplay ?? defaultGameplay);
  }, [highlight.splitRatio, highlight.facecam, highlight.gameplay,
      defaultSplitRatio, defaultFacecam, defaultGameplay]);

  const setLayout = (next: TikTokLayout) =>
    updateHighlight(project.id, index, { layout: next });

  const writeSubs = (patch: Partial<{
    enabled: boolean;
    style: SubtitleStyle;
    position: SubtitlePosition;
    customY: number;
    fontFamily: SubtitleFontFamily;
    fontSize: number;
    letterSpacing: number;
    uppercase: boolean;
    textColor: string;
    highlightColor: string;
    useGradient: boolean;
    gradientFrom: string;
    gradientTo: string;
    strokeWidth: number;
    strokeColor: string;
    glowBlur: number;
    glowStrength: number;
    glowColor: string;
    shadowOffsetX: number;
    shadowOffsetY: number;
    shadowColor: string;
    shadowBlur: number;
    glowEnabled: boolean;
    shadowEnabled: boolean;
    metallic: boolean;
    maxWordsPerChunk: number;
    highlightWords: SubtitleHighlightWord[];
    highlightUseGradient: boolean;
    highlightGradientFrom: string;
    highlightGradientTo: string;
    highlightFontScale: number;
    highlightDropShadow: number;
    highlightMetallic: boolean;
    highlightGlow: boolean;
    highlightGlowColor: string;
    highlightGlowStrength: number;
  }>) =>
    updateHighlight(project.id, index, {
      subtitles: {
        enabled:        patch.enabled        ?? subEnabled,
        style:          patch.style          ?? subStyle,
        position:       patch.position       ?? subPosition,
        customY:        patch.customY        ?? subCustomY,
        fontFamily:     patch.fontFamily     ?? subFontFamily,
        fontSize:       patch.fontSize       ?? subFontSize,
        letterSpacing:  patch.letterSpacing  ?? subLetterSpacing,
        uppercase:      patch.uppercase      ?? subUppercase,
        textColor:      patch.textColor      ?? subTextColor,
        highlightColor: patch.highlightColor ?? subHighlightColor,
        useGradient:    patch.useGradient    ?? subUseGradient,
        gradientFrom:   patch.gradientFrom   ?? subGradientFrom,
        gradientTo:     patch.gradientTo     ?? subGradientTo,
        strokeWidth:    patch.strokeWidth    ?? subStrokeWidth,
        strokeColor:    patch.strokeColor    ?? subStrokeColor,
        glowBlur:       patch.glowBlur       ?? subGlowBlur,
        glowStrength:   patch.glowStrength   ?? subGlowStrength,
        glowColor:      patch.glowColor      ?? subGlowColor,
        shadowOffsetX:  patch.shadowOffsetX  ?? subShadowOffsetX,
        shadowOffsetY:  patch.shadowOffsetY  ?? subShadowOffsetY,
        shadowColor:    patch.shadowColor    ?? subShadowColor,
        shadowBlur:     patch.shadowBlur     ?? subShadowBlur,
        glowEnabled:    patch.glowEnabled    ?? subGlowEnabled,
        shadowEnabled:  patch.shadowEnabled  ?? subShadowEnabled,
        metallic:       patch.metallic       ?? subMetallic,
        maxWordsPerChunk: patch.maxWordsPerChunk ?? subMaxWordsPerChunk,
        highlightWords: patch.highlightWords ?? subHighlightWords,
        highlightUseGradient:  patch.highlightUseGradient  ?? subHighlightUseGradient,
        highlightGradientFrom: patch.highlightGradientFrom ?? subHighlightGradientFrom,
        highlightGradientTo:   patch.highlightGradientTo   ?? subHighlightGradientTo,
        highlightFontScale:    patch.highlightFontScale    ?? subHighlightFontScale,
        highlightDropShadow:   patch.highlightDropShadow   ?? subHighlightDropShadow,
        highlightMetallic:     patch.highlightMetallic     ?? subHighlightMetallic,
        highlightGlow:         patch.highlightGlow         ?? subHighlightGlow,
        highlightGlowColor:    patch.highlightGlowColor    ?? subHighlightGlowColor,
        highlightGlowStrength: patch.highlightGlowStrength ?? subHighlightGlowStrength,
      },
    });

  const setEffects = (patch: Partial<ClipEffects>) =>
    updateHighlight(project.id, index, { effects: { ...effects, ...patch } });

  // Phase 9.2: Export-Settings-Dialog für 9:16 — Resolution/FPS/Bitrate/Encoder.
  const [showQualityDialog, setShowQualityDialog] = useState(false);
  const tiktokDefaults = useApp((s) => s.appDefaults.tiktokExport);
  const defaultQualityMode = useApp((s) => s.appDefaults.qualityMode ?? 'fast');
  const [exportSettings, setExportSettings] = useState<ExportSettings>(() => ({
    ...defaultExportSettings('tiktok'),
    ...(tiktokDefaults ?? {}),
    qualityMode: defaultQualityMode,
  }));
  useEffect(() => {
    setExportSettings({
      ...defaultExportSettings('tiktok'),
      ...(tiktokDefaults ?? {}),
      qualityMode: defaultQualityMode,
    });
  }, [tiktokDefaults, defaultQualityMode]);

  const onExportClick = () => {
    if (!highlight.clipPath || exporting) return;
    setShowQualityDialog(true);
  };

  const onExport = async () => {
    if (!highlight.clipPath) return;
    if (exporting) return;
    setShowQualityDialog(false);
    const idx = String(index + 1).padStart(3, '0');
    const suffix = layout === 'stacked' ? 'stacked' : 'full';
    const subSuffix = subEnabled ? `-subs-${subStyle}` : '';
    const name = `clip-${idx}-tiktok-${suffix}${subSuffix}.mp4`;

    setExporting(true);
    try {
      // Layered-Subtitles: PNG-Pre-Render via Canvas. libass kann kein vertikales Gradient,
      // kein Multi-Stop-Metallic, kein Multi-Layer-Glow → für 1:1 Live-Preview-Look rendern wir
      // pro Cue ein PNG-Overlay. Andere Styles (default/bold/gaming/fiano) bleiben bei libass.
      let pngOverlays: Array<{ start: number; end: number; pngBase64: string }> | undefined;
      if (subEnabled) {
        // Cues holen — edits werden bereits in effectiveCues angewandt (state-derived).
        // Wenn cues noch nicht geladen: jetzt fetchen.
        let cues = effectiveCues;
        if (!cuesLoaded) {
          const res = await window.api.invoke<{ cues: Array<{ start: number; end: number; text: string }> }>(
            'transcript.getCuesForHighlight',
            { projectId: project.id, highlightIndex: index },
          );
          if (res.ok && res.data) {
            cues = res.data.cues.map((c, i) => {
              const edit = subtitleEdits[i];
              if (edit === null) return null;
              if (edit) return edit;
              return c;
            }).filter((c): c is { start: number; end: number; text: string } => !!c);
          }
        }
        if (cues.length > 0) {
          // TikTok-Output ist 1080x1920 (9:16) — entspricht der TIKTOK_HEIGHT-Konstante im Backend.
          const W = 1080;
          const H = 1920;
          // Cues in Chunks splitten — Default 2 Wörter (TikTok-Subtitle-Look). User kann via
          // settings.maxWordsPerChunk anpassen (1, 2, 3 oder mehr). Zeit wird gleich verteilt.
          const MAX_WORDS_PER_CHUNK = highlight.subtitles?.maxWordsPerChunk ?? 2;
          const chunkedCues: Array<{ start: number; end: number; text: string }> = [];
          for (const cue of cues) {
            const words = cue.text.split(/\s+/).filter(Boolean);
            if (words.length === 0) continue;
            const numChunks = Math.ceil(words.length / MAX_WORDS_PER_CHUNK);
            const chunkDur = (cue.end - cue.start) / numChunks;
            for (let ci = 0; ci < numChunks; ci++) {
              const chunkWords = words.slice(ci * MAX_WORDS_PER_CHUNK, (ci + 1) * MAX_WORDS_PER_CHUNK);
              chunkedCues.push({
                start: cue.start + ci * chunkDur,
                end: cue.start + (ci + 1) * chunkDur,
                text: chunkWords.join(' '),
              });
            }
          }
          pngOverlays = chunkedCues.map((c) => ({
            start: c.start,
            end: c.end,
            pngBase64: renderSubtitleCueToPng(
              c.text,
              highlight.subtitles?.highlightWords,
              {
                style: subStyle,
                position: subPosition,
                customY: subCustomY,
                fontFamily: subFontFamily,
                fontSize: subFontSize,
                letterSpacing: subLetterSpacing,
                uppercase: subUppercase,
                textColor: subTextColor,
                highlightColor: subHighlightColor,
                useGradient: subUseGradient,
                gradientFrom: subGradientFrom,
                gradientTo: subGradientTo,
                strokeWidth: subStrokeWidth,
                strokeColor: subStrokeColor,
                glowBlur: subGlowBlur,
                glowStrength: subGlowStrength,
                glowColor: subGlowColor,
                shadowOffsetX: subShadowOffsetX,
                shadowOffsetY: subShadowOffsetY,
                shadowColor: subShadowColor,
                shadowBlur: subShadowBlur,
                glowEnabled: subGlowEnabled,
                shadowEnabled: subShadowEnabled,
                metallic: subMetallic,
                highlightFontScale: subHighlightFontScale,
                highlightUseGradient: subHighlightUseGradient,
                highlightGradientFrom: subHighlightGradientFrom,
                highlightGradientTo: subHighlightGradientTo,
                highlightDropShadow: subHighlightDropShadow,
                highlightMetallic: subHighlightMetallic,
                highlightGlow: subHighlightGlow,
                highlightGlowColor: subHighlightGlowColor,
                highlightGlowStrength: subHighlightGlowStrength,
              },
              W, H,
            ),
          })).filter((p) => !!p.pngBase64);
          console.log(`[tiktok-export] pre-rendered ${pngOverlays.length} layered-subtitle PNGs`);
        }
      }

      await buildVideo(
        project.id,
        name,
        [{ master: highlight.clipPath, segments }],
        {
          format: 'tiktok',
          layout,
          facecam,
          gameplay,
          splitRatio,
          effects,
          intro: project.intro,
          music: resolveActiveMusic(project),
          qualityMode: exportSettings.qualityMode,
          exportQuality: {
            width: exportSettings.width,
            height: exportSettings.height,
            fps: exportSettings.fps,
            bitrate: exportSettings.bitrate,
          },
          subtitlesPerClip: subEnabled
            ? [{
                highlightIndex: index,
                style: subStyle,
                position: subPosition,
                customY: subCustomY,
                settings: highlight.subtitles, // alle erweiterten Style-Properties durchgeben
                pngOverlays,
              }]
            : undefined,
        },
      );
    } finally {
      setExporting(false);
    }
  };

  const hasClip = !!highlight.clipPath;
  const t = useT();
  const tabLabels: Record<SettingsTab, string> = {
    edit: t('tiktok.tabEdit'),
    subtitles: t('tiktok.tabSubtitles'),
    effects: t('tiktok.tabEffects'),
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar — mit Top-Padding fürs Atmen */}
      <div className="flex border-b border-white/[0.06] pt-5">
        {(['edit', 'subtitles', 'effects'] as SettingsTab[]).map((tk) => (
          <button
            key={tk}
            onClick={() => onTabChange(tk)}
            className={clsx(
              'flex-1 relative px-3 py-2.5 text-[12px] font-medium transition-colors',
              tab === tk ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            {tabLabels[tk]}
            {tab === tk && (
              <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-fiano-red shadow-[0_0_8px_rgba(255,16,57,0.7)]" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content (scrollbar) — mit großzügigem vertikalem Padding */}
      <div className="flex-1 px-3 py-5 space-y-3 overflow-y-auto min-h-0">
        {tab === 'edit' && (
          <>
            <Section title={t('tiktok.layout')}>
              <ModeToggle layout={layout} onChange={setLayout} />
            </Section>
            {layout === 'stacked' ? (
              <>
                <Section title={t('tiktok.facecamSize')}>
                  <SplitRatioSlider
                    value={splitRatio}
                    onChange={setSplitRatio}
                    onCommit={(v) => updateHighlight(project.id, index, { splitRatio: v })}
                  />
                </Section>
                <Section title={t('tiktok.facecamRegion')}>
                  <FacecamEditor
                    src={highlight.clipPath}
                    facecam={facecam}
                    onChange={setFacecam}
                    onCommit={(next) => updateHighlight(project.id, index, { facecam: next })}
                  />
                </Section>
                <Section title={t('tiktok.gameplayRegion')}>
                  <GameplayEditor
                    src={highlight.clipPath}
                    gameplay={gameplay}
                    onChange={setGameplay}
                    onCommit={(next) => updateHighlight(project.id, index, { gameplay: next })}
                  />
                </Section>
              </>
            ) : (
              <Section title={t('tiktok.vollLayout')}>
                <div className="text-[11px] text-zinc-400 leading-relaxed">
                  {t('tiktok.vollLayoutHint')}
                </div>
              </Section>
            )}
          </>
        )}
        {tab === 'subtitles' && (
          <>
            <SubtitleControls
              values={{
                enabled: subEnabled, style: subStyle, position: subPosition, customY: subCustomY,
                fontFamily: subFontFamily, fontSize: subFontSize, letterSpacing: subLetterSpacing, uppercase: subUppercase,
                textColor: subTextColor, highlightColor: subHighlightColor,
                highlightUseGradient: subHighlightUseGradient, highlightGradientFrom: subHighlightGradientFrom,
                highlightGradientTo: subHighlightGradientTo, highlightFontScale: subHighlightFontScale,
                highlightDropShadow: subHighlightDropShadow, highlightMetallic: subHighlightMetallic,
                highlightGlow: subHighlightGlow, highlightGlowColor: subHighlightGlowColor,
                highlightGlowStrength: subHighlightGlowStrength,
                useGradient: subUseGradient, gradientFrom: subGradientFrom, gradientTo: subGradientTo,
                strokeWidth: subStrokeWidth, strokeColor: subStrokeColor,
                glowBlur: subGlowBlur, glowStrength: subGlowStrength, glowColor: subGlowColor,
                shadowOffsetX: subShadowOffsetX, shadowOffsetY: subShadowOffsetY,
                shadowColor: subShadowColor, shadowBlur: subShadowBlur,
                glowEnabled: subGlowEnabled, shadowEnabled: subShadowEnabled, metallic: subMetallic,
                maxWordsPerChunk: subMaxWordsPerChunk,
                highlightWords: subHighlightWords,
              }}
              write={writeSubs}
            />
            {subEnabled && (
              <CueEditor
                originalCues={originalCues}
                edits={subtitleEdits}
                cuesLoaded={cuesLoaded}
                onCueEdit={(idx, text) => {
                  const next = [...subtitleEdits];
                  while (next.length <= idx) next.push(null);
                  const orig = originalCues[idx];
                  next[idx] = orig ? { start: orig.start, end: orig.end, text } : null;
                  updateHighlight(project.id, index, { subtitleEdits: next });
                }}
                onCueReset={(idx) => {
                  const next = [...subtitleEdits];
                  if (idx < next.length) next[idx] = null;
                  // Trim trailing nulls für sauberes State
                  while (next.length > 0 && next[next.length - 1] === null) next.pop();
                  updateHighlight(project.id, index, {
                    subtitleEdits: next.length > 0 ? next : undefined,
                  });
                }}
              />
            )}
          </>
        )}
        {tab === 'effects' && (
          <EffectsControls
            effects={effects}
            onMotionBlur={(mb) => setEffects({ motionBlur: mb })}
            onFilter={(f) => setEffects({ filter: f })}
          />
        )}
      </div>

      {/* Export Button — gleiche fixe Höhe wie Main-BottomBar damit border-t auf gleicher Y-Linie liegt */}
      <div className="h-[68px] px-3 border-t border-white/[0.06] flex items-center shrink-0">
        <button
          onClick={onExportClick}
          disabled={!hasClip || exporting}
          className={clsx(
            'w-full text-white text-[12px] font-semibold py-2.5 rounded-lg transition-all',
            'flex items-center justify-center gap-2',
            exporting
              ? 'bg-fiano-red/70 cursor-wait'
              : 'bg-fiano-red hover:brightness-110 hover:shadow-[0_0_24px_rgba(255,16,57,0.45)] active:scale-[0.98]',
            'disabled:opacity-40 disabled:hover:shadow-none',
          )}
        >
          {exporting && (
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M8 1.5a6.5 6.5 0 1 1-6.5 6.5" />
            </svg>
          )}
          {exporting ? t('tiktok.exportingBtn') : t('tiktok.exportBtn')}
        </button>
      </div>

      {/* Phase 9.2: Export-Settings-Dialog vor 9:16-Export */}
      {showQualityDialog && (
        <ExportSettingsDialog
          format="tiktok"
          settings={exportSettings}
          onChange={setExportSettings}
          onCancel={() => setShowQualityDialog(false)}
          onConfirm={onExport}
        />
      )}
    </div>
  );
}

/** Section-Wrapper für die Sidebar — heller Glass-Hintergrund + Header. */
function Section({
  title, children,
}: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 space-y-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {title}
      </div>
      {children}
    </div>
  );
}

/* ─── Reusable Field-Group Label ─────────────────────────────── */

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500 mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}

/* ─── EditClipSection (inline Trim + Save) ──────────────────── */

const MIN_SEG = 0.5;

function EditClipSection({
  project, highlight, index,
}: {
  project: Project;
  highlight: Highlight;
  index: number;
}) {
  const updateHighlight = useApp((s) => s.updateHighlight);
  const clipDuration = Math.max(0.1, highlight.end - highlight.start);
  const [segments, setSegments] = useState<ClipSegment[]>(() => effectiveSegments(highlight));
  const [playhead, setPlayhead] = useState(0);
  const [markA, setMarkA] = useState<number | null>(null);
  const [markB, setMarkB] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Resync wenn das Highlight von außen geändert wird
  useEffect(() => {
    setSegments(effectiveSegments(highlight));
  }, [highlight.segments, highlight.trimStart, highlight.trimEnd]);

  const commit = (next: ClipSegment[]) => {
    setSegments(next);
    updateHighlight(project.id, index, { segments: next });
    setSavedAt(Date.now());
  };

  const cutAtPlayhead = () => {
    const t = playhead;
    const idx = segments.findIndex((s) => t > s.start + MIN_SEG && t < s.end - MIN_SEG);
    if (idx < 0) return;
    const seg = segments[idx];
    commit([
      ...segments.slice(0, idx),
      { start: seg.start, end: t - 0.1 },
      { start: t + 0.1, end: seg.end },
      ...segments.slice(idx + 1),
    ]);
  };

  const setMark = (which: 'A' | 'B') => {
    if (which === 'A') setMarkA(playhead);
    else setMarkB(playhead);
  };

  const applyMarkedCut = () => {
    if (markA === null || markB === null) return;
    const a = Math.min(markA, markB);
    const b = Math.max(markA, markB);
    if (b - a < MIN_SEG) return;
    const next: ClipSegment[] = [];
    for (const seg of segments) {
      if (seg.end <= a || seg.start >= b) next.push(seg);
      else if (seg.start < a && seg.end > b) {
        next.push({ start: seg.start, end: a });
        next.push({ start: b, end: seg.end });
      } else if (seg.start < a) next.push({ start: seg.start, end: Math.min(seg.end, a) });
      else if (seg.end > b) next.push({ start: Math.max(seg.start, b), end: seg.end });
    }
    const cleaned = next.filter((s) => s.end - s.start >= MIN_SEG);
    if (cleaned.length === 0) return;
    commit(cleaned);
    setMarkA(null);
    setMarkB(null);
  };

  // "Add Segment" = restore full clip = reset cuts
  const resetSegments = () => {
    commit([{ start: 0, end: clipDuration }]);
    setMarkA(null);
    setMarkB(null);
  };

  const totalKept = segments.reduce((s, seg) => s + (seg.end - seg.start), 0);
  const startTime = segments[0]?.start ?? 0;
  const endTime = segments[segments.length - 1]?.end ?? clipDuration;

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.round((sec - Math.floor(sec)) * 10);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
  };

  return (
    <div className="glass p-4 space-y-3.5">
      {/* Header: Title links + Stats rechts */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-fiano-red" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM5 9a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM7 8l8-3 M7 8l8 3" />
          </svg>
          <span className="text-[12px] font-semibold text-zinc-200">Edit Clip</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <Stat label="Start" value={fmt(startTime)} />
          <Stat label="End"   value={fmt(endTime)} />
          <Stat label="Duration" value={fmt(totalKept)} highlight />
        </div>
      </div>

      {/* Range-Anzeige (links="0.0s", center="14.0s · 1 segment", rechts="14.0s") */}
      <div className="grid grid-cols-3 items-center text-[10px] font-mono px-1">
        <span className="text-zinc-500 justify-self-start">{clipDuration.toFixed(1)}s</span>
        <span className="justify-self-center text-fiano-red">
          {totalKept.toFixed(1)}s · {segments.length} {segments.length === 1 ? 'segment' : 'segments'}
        </span>
        <span className="text-zinc-500 justify-self-end">{clipDuration.toFixed(1)}s</span>
      </div>

      {/* Trim-Bar (existing SegmentEditor) */}
      <SegmentEditor
        duration={clipDuration}
        segments={segments}
        onChange={setSegments}
        onCommit={commit}
        onScrub={setPlayhead}
      />

      {/* Time-ticks unter der Trim-Bar */}
      <TimeTicks duration={clipDuration} />

      {/* Mark-Hint */}
      {markA !== null && markB === null && (
        <div className="text-[10px] text-amber-400/90 font-mono">
          Mark A set at {markA.toFixed(2)}s — set B and click "Remove Middle".
        </div>
      )}

      {/* Action Row */}
      <div className="flex items-center gap-2 flex-wrap">
        <EditButton onClick={cutAtPlayhead} icon={<SplitIcon />}>Split</EditButton>
        <EditButton onClick={() => setMark('A')} icon={<MarkAIcon />} marked={markA !== null}>Set A</EditButton>
        <EditButton onClick={() => setMark('B')} icon={<MarkBIcon />} marked={markB !== null}>Set B</EditButton>
        <EditButton
          onClick={applyMarkedCut}
          icon={<RemoveIcon />}
          disabled={markA === null || markB === null}
          primary
        >
          Remove Middle
        </EditButton>
        <EditButton onClick={resetSegments} icon={<AddIcon />}>Add Segment</EditButton>
      </div>

      {/* Save Changes — eigene Zeile, full-width prominent */}
      <button
        onClick={() => setSavedAt(Date.now())}
        className="w-full bg-fiano-red text-white text-[13px] font-semibold py-2.5 rounded-xl
                   hover:brightness-110 hover:shadow-[0_0_24px_rgba(255,16,57,0.5)]
                   active:scale-[0.99] transition-all"
      >
        {savedAt && Date.now() - savedAt < 1500 ? '✓ Saved' : 'Save Changes'}
      </button>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-zinc-600 uppercase tracking-wider text-[9px]">{label}</span>
      <span className={clsx('font-mono', highlight ? 'text-fiano-red' : 'text-zinc-300')}>{value}</span>
    </div>
  );
}

function TimeTicks({ duration }: { duration: number }) {
  // 6 ticks gleichmäßig verteilt
  const ticks = Array.from({ length: 6 }, (_, i) => (duration * i) / 5);
  return (
    <div className="flex justify-between text-[9px] font-mono text-zinc-600 px-1">
      {ticks.map((t, i) => (
        <span key={i}>{Math.floor(t / 60).toString().padStart(2, '0')}:{Math.floor(t % 60).toString().padStart(2, '0')}</span>
      ))}
    </div>
  );
}

function EditButton({
  onClick, icon, children, marked, primary, disabled,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  marked?: boolean;
  primary?: boolean;
  disabled?: boolean;
}) {
  const variant = disabled
    ? 'bg-white/[0.02] border-white/[0.04] text-zinc-700 cursor-not-allowed'
    : primary
      ? 'bg-fiano-red/15 border-fiano-red/40 text-white hover:bg-fiano-red/20'
      : marked
        ? 'bg-amber-500/10 border-amber-500/40 text-white hover:bg-amber-500/15'
        : 'bg-white/[0.04] border-white/[0.06] text-zinc-200 hover:bg-white/[0.08] hover:border-white/[0.14]';
  const iconColor = disabled ? 'text-zinc-700' : primary ? 'text-fiano-red' : marked ? 'text-amber-400' : 'text-zinc-400';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition border', variant)}
    >
      <span className={clsx('shrink-0', iconColor)}>{icon}</span>
      {children}
    </button>
  );
}

/* ─── Edit-Section Icons ──────────────────────────────────── */
function SplitIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v12 M3 6L8 1l5 5 M3 10l5 5 5-5" />
    </svg>
  );
}
function RemoveIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 8h12 M5 5l-3 3 3 3 M11 5l3 3-3 3" />
    </svg>
  );
}
function AddIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M8 3v10 M3 8h10" />
    </svg>
  );
}
function MarkAIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13L8 3l5 10 M5 9h6" />
    </svg>
  );
}
function MarkBIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 13V3h4a2.5 2.5 0 0 1 0 5H4 M4 8h5a2.5 2.5 0 0 1 0 5H4" />
    </svg>
  );
}

/* ─── ModeToggle ─────────────────────────────────────────────── */

function ModeToggle({
  layout, onChange,
}: { layout: TikTokLayout; onChange: (l: TikTokLayout) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 p-1 bg-white/[0.04] border border-white/[0.06] rounded-lg">
      {(['full', 'stacked'] as TikTokLayout[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={clsx(
            'text-[12px] py-2 rounded-md font-medium transition-all',
            layout === m
              ? 'bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] border border-white/[0.1]'
              : 'text-zinc-500 hover:text-zinc-300 border border-transparent',
          )}
        >
          {m === 'full' ? 'Voll' : 'Gestapelt'}
        </button>
      ))}
    </div>
  );
}

/* ─── SplitRatioSlider ───────────────────────────────────────── */

function SplitRatioSlider({
  value, onChange, onCommit,
}: { value: number; onChange: (v: number) => void; onCommit: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-1.5">
        <span className="text-zinc-500">Facecam · Gameplay</span>
        <span className="font-mono text-fiano-red">
          {Math.round(value * 100)}% · {Math.round((1 - value) * 100)}%
        </span>
      </div>
      <input
        type="range"
        min={0.2}
        max={0.8}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerUp={() => onCommit(value)}
        className="w-full accent-fiano-red"
      />
    </div>
  );
}

/* ─── EffectsControls (Motion Blur + Color Filter) ───────────── */

function EffectsControls({
  effects, onMotionBlur, onFilter,
}: {
  effects: ClipEffects;
  onMotionBlur: (mb: MotionBlur) => void;
  onFilter: (f: FilterPreset) => void;
}) {
  const mb = effects.motionBlur ?? 'off';
  const fl = effects.filter ?? 'none';
  const t = useT();
  return (
    <>
      <Section title={t('tiktok.motionBlur')}>
        <div className="grid grid-cols-4 gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-lg">
          {(['off', 'low', 'medium', 'high'] as MotionBlur[]).map((v) => (
            <button
              key={v}
              onClick={() => onMotionBlur(v)}
              className={clsx(
                'text-[10px] py-1.5 rounded-md capitalize font-medium transition-all',
                mb === v
                  ? 'bg-fiano-red/15 border border-fiano-red/40 text-white'
                  : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </Section>
      <Section title={t('tiktok.colorFilter')}>
        <div className="grid grid-cols-3 gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-lg">
          {(['none', 'vivid', 'dark', 'warm', 'cold', 'gaming'] as FilterPreset[]).map((v) => (
            <button
              key={v}
              onClick={() => onFilter(v)}
              className={clsx(
                'text-[10px] py-1.5 rounded-md capitalize font-medium transition-all',
                fl === v
                  ? 'bg-fiano-red/15 border border-fiano-red/40 text-white'
                  : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}

/* ─── SubtitleControls (Style + Position + CustomY) ──────────── */

interface SubtitleValues {
  enabled: boolean;
  style: SubtitleStyle;
  position: SubtitlePosition;
  customY: number;
  fontFamily: SubtitleFontFamily;
  fontSize: number;
  letterSpacing: number;
  uppercase: boolean;
  textColor: string;
  highlightColor: string;
  useGradient: boolean;
  gradientFrom: string;
  gradientTo: string;
  strokeWidth: number;
  strokeColor: string;
  glowBlur: number;
  glowStrength: number;
  glowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowColor: string;
  shadowBlur: number;
  glowEnabled: boolean;
  shadowEnabled: boolean;
  metallic: boolean;
  maxWordsPerChunk: number;
  highlightWords: SubtitleHighlightWord[];
  // Layered-Style — eigene Felder fürs Highlight-Wort
  highlightUseGradient: boolean;
  highlightGradientFrom: string;
  highlightGradientTo: string;
  highlightFontScale: number;
  highlightDropShadow: number;
  highlightMetallic: boolean;
  highlightGlow: boolean;
  highlightGlowColor: string;
  highlightGlowStrength: number;
}

interface SubtitleControlsProps {
  values: SubtitleValues;
  write: (patch: Partial<SubtitleValues>) => void;
}

/** Preset-Defaults pro Subtitle-Style. Wird beim Klick auf Preset-Button angewandt
 *  → überschreibt User-Customizations zurück auf den "Standard-Look" des Presets. */
function getPresetDefaults(style: SubtitleStyle): Partial<SubtitleValues> {
  const common = {
    fontSize: 30,
    letterSpacing: 0,
    uppercase: false,
    useGradient: false,
    gradientFrom: '#ff5570',
    gradientTo: '#ff1039',
    metallic: false,
    glowEnabled: false,
    glowBlur: 0,
    glowStrength: 0.7,
    glowColor: '#ff1039',
    shadowEnabled: false,
    shadowOffsetX: 0,
    shadowOffsetY: 4,
    shadowColor: '#000000',
    shadowBlur: 8,
    maxWordsPerChunk: 2,
  };
  switch (style) {
    case 'default':
      return { ...common, fontFamily: 'inter', fontSize: 26, textColor: '#ffffff', strokeWidth: 2, strokeColor: '#000000' };
    case 'bold':
      return { ...common, fontFamily: 'arial-black', fontSize: 32, textColor: '#ffffff', strokeWidth: 4, strokeColor: '#000000', shadowEnabled: true };
    case 'gaming':
      return { ...common, fontFamily: 'impact', fontSize: 36, textColor: '#ffeb3b', strokeWidth: 5, strokeColor: '#000000', uppercase: true, shadowEnabled: true };
    case 'fiano':
      return { ...common, fontFamily: 'geist', fontSize: 32, textColor: '#ffffff', strokeWidth: 3, strokeColor: '#000000', glowEnabled: true, glowBlur: 12, glowColor: '#ff1039' };
    case 'layered':
      return {
        ...common,
        fontFamily: 'arial-black',
        fontSize: 28,
        textColor: '#ffffff',
        strokeWidth: 4,
        strokeColor: '#000000',
        uppercase: true,
        highlightUseGradient: true,
        highlightGradientFrom: '#ff5570',
        highlightGradientTo: '#ff1039',
        highlightFontScale: 2.0,
        highlightDropShadow: 8,
        highlightMetallic: false,
        highlightGlow: false,
        highlightGlowColor: '#ffffff',
        highlightGlowStrength: 0.6,
      };
  }
}

function SubtitleControls({ values: v, write }: SubtitleControlsProps) {
  const t = useT();
  const layeredFeature = useFeature('subtitle_layered_style');
  const presetsFeature = useFeature('custom_subtitle_presets');
  const advFxFeature = useFeature('subtitle_advanced_effects');
  const openUpgrade = useUpgradeModal((s) => s.open);
  const p = {
    ...v,
    onToggle:         (val: boolean) => write({ enabled: val }),
    onStyle:          (s: SubtitleStyle) => write({ style: s, ...getPresetDefaults(s) }),
    onPosition:       (pos: SubtitlePosition) => write({ position: pos }),
    onCustomY:        (val: number) => write({ customY: val }),
    onFontFamily:     (val: SubtitleFontFamily) => write({ fontFamily: val }),
    onFontSize:       (val: number) => write({ fontSize: val }),
    onLetterSpacing:  (val: number) => write({ letterSpacing: val }),
    onUppercase:      (val: boolean) => write({ uppercase: val }),
    onTextColor:      (c: string) => write({ textColor: c }),
    onHighlightColor: (c: string) => write({ highlightColor: c }),
    onUseGradient:    (val: boolean) => write({ useGradient: val }),
    onGradientFrom:   (c: string) => write({ gradientFrom: c }),
    onGradientTo:     (c: string) => write({ gradientTo: c }),
    onStrokeWidth:    (val: number) => write({ strokeWidth: val }),
    onStrokeColor:    (c: string) => write({ strokeColor: c }),
    onGlowBlur:       (val: number) => write({ glowBlur: val }),
    onGlowStrength:   (val: number) => write({ glowStrength: val }),
    onGlowColor:      (c: string) => write({ glowColor: c }),
    onShadowOffsetX:  (val: number) => write({ shadowOffsetX: val }),
    onShadowOffsetY:  (val: number) => write({ shadowOffsetY: val }),
    onShadowColor:    (c: string)   => write({ shadowColor: c }),
    onShadowBlur:     (val: number) => write({ shadowBlur: val }),
    onGlowEnabled:    (val: boolean) => write({ glowEnabled: val }),
    onShadowEnabled:  (val: boolean) => write({ shadowEnabled: val }),
    onMetallic:       (val: boolean) => write({ metallic: val }),
    onMaxWordsPerChunk: (val: number) => write({ maxWordsPerChunk: val }),
    onHighlightWords: (w: SubtitleHighlightWord[]) => write({ highlightWords: w }),
    onHighlightUseGradient:  (val: boolean) => write({ highlightUseGradient: val }),
    onHighlightGradientFrom: (c: string)    => write({ highlightGradientFrom: c }),
    onHighlightGradientTo:   (c: string)    => write({ highlightGradientTo: c }),
    onHighlightFontScale:    (val: number)  => write({ highlightFontScale: val }),
    onHighlightDropShadow:   (val: number)  => write({ highlightDropShadow: val }),
    onHighlightMetallic:     (val: boolean) => write({ highlightMetallic: val }),
    onHighlightGlow:         (val: boolean) => write({ highlightGlow: val }),
    onHighlightGlowColor:    (c: string)    => write({ highlightGlowColor: c }),
    onHighlightGlowStrength: (val: number)  => write({ highlightGlowStrength: val }),
  };
  return (
    <>
      {/* Toggle als eigene Section */}
      <Section title={t('tiktok.burnIn')}>
        <label className="flex items-center justify-between gap-2 cursor-pointer">
          <span className="text-[11px] text-zinc-300 font-medium">{t('tiktok.subtitlesEnabled')}</span>
          <span
            onClick={() => p.onToggle(!p.enabled)}
            className={clsx(
              'relative w-9 h-5 rounded-full transition-colors',
              p.enabled ? 'bg-fiano-red' : 'bg-white/[0.08]',
            )}
          >
            <span className={clsx(
              'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
              p.enabled ? 'translate-x-4' : 'translate-x-0.5',
            )} />
          </span>
        </label>
      </Section>

      {p.enabled && (
        <>
          <Section title={t('tiktok.subtitleStyle')}>
            <select
              value={p.style}
              onChange={(e) => {
                const next = e.target.value as SubtitleStyle;
                if (next === 'layered' && !layeredFeature.unlocked) {
                  openUpgrade('subtitle_layered_style');
                  return;
                }
                p.onStyle(next);
              }}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2
                         text-[12px] font-medium text-zinc-200 focus:outline-none focus:border-fiano-red/40 transition"
            >
              <option value="fiano">fiano Bold</option>
              <option value="layered">{layeredFeature.unlocked ? 'Layered' : 'Layered 🔒'}</option>
              <option value="bold">Bold</option>
              <option value="gaming">Gaming</option>
              <option value="default">Default</option>
            </select>
          </Section>

          <Section title={t('tiktok.position')}>
            <div className="grid grid-cols-3 gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-lg">
              {(['top', 'center', 'bottom'] as SubtitlePosition[]).map((pos) => (
                <button
                  key={pos}
                  onClick={() => p.onPosition(pos)}
                  className={clsx(
                    'text-[10px] py-1.5 rounded-md capitalize font-medium transition-all',
                    p.position === pos ? 'bg-fiano-red/15 border border-fiano-red/40 text-white' : 'text-zinc-500 hover:text-zinc-300',
                  )}
                >
                  {pos}
                </button>
              ))}
            </div>
            {/* Vertikaler Fine-Tune-Slider — wechselt automatisch auf 'custom' beim Drag,
                damit User feiner positionieren kann ohne erst auf Custom zu klicken. */}
            <FieldGroup label="Fine-Tune">
              <SliderRow value={p.customY} min={0} max={1} step={0.01}
                onChange={(v) => {
                  if (p.position !== 'custom') p.onPosition('custom');
                  p.onCustomY(v);
                }}
                display={`${Math.round(p.customY * 100)}%`} />
            </FieldGroup>
            {/* Max-Words-Per-Cue: 1=single-word, 2-3=phrases, 999=ganzer Satz */}
            <FieldGroup label="Words per Cue">
              <SliderRow value={p.maxWordsPerChunk} min={1} max={6} step={1}
                onChange={p.onMaxWordsPerChunk}
                display={p.maxWordsPerChunk === 1 ? '1 word' : `${p.maxWordsPerChunk} words`} />
            </FieldGroup>
          </Section>

          <Section title={t('tiktok.preset')}>
            <div className="grid grid-cols-5 gap-1.5">
              {(['default', 'bold', 'gaming', 'fiano', 'layered'] as SubtitleStyle[]).map((s) => {
                const isLocked = s === 'layered' && !layeredFeature.unlocked;
                return (
                  <PresetButton
                    key={s}
                    active={p.style === s}
                    preset={s}
                    locked={isLocked}
                    onClick={() => {
                      if (isLocked) { openUpgrade('subtitle_layered_style'); return; }
                      p.onStyle(s);
                    }}
                  />
                );
              })}
            </div>
          </Section>

          {/* Custom-Presets — User kann eigene Settings speichern + laden + löschen */}
          {presetsFeature.unlocked ? (
            <CustomPresetsSection currentValues={v} write={write} />
          ) : (
            <LockedCustomPresets onUpgrade={() => openUpgrade('custom_subtitle_presets')} />
          )}

          <Section title={t('tiktok.wordHighlight')}>
            <WordHighlightEditor words={p.highlightWords} onChange={p.onHighlightWords} />
          </Section>

          <Section title={t('tiktok.typography')}>
            <FieldGroup label="Font Family">
              <FontFamilyPicker value={p.fontFamily} onChange={p.onFontFamily} />
            </FieldGroup>
            <FieldGroup label="Font Size">
              <SliderRow value={p.fontSize} min={14} max={48} step={1}
                onChange={p.onFontSize} display={`${p.fontSize}px`} />
            </FieldGroup>
            <FieldGroup label="Letter Spacing">
              <SliderRow value={p.letterSpacing} min={-0.05} max={0.3} step={0.01}
                onChange={p.onLetterSpacing} display={`${p.letterSpacing.toFixed(2)}em`} />
            </FieldGroup>
            <label className="flex items-center justify-between gap-2 cursor-pointer pt-1">
              <span className="text-[11px] text-zinc-300 font-medium">Uppercase</span>
              <span
                onClick={() => p.onUppercase(!p.uppercase)}
                className={clsx(
                  'relative w-9 h-5 rounded-full transition-colors',
                  p.uppercase ? 'bg-fiano-red' : 'bg-white/[0.08]',
                )}
              >
                <span className={clsx(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  p.uppercase ? 'translate-x-4' : 'translate-x-0.5',
                )} />
              </span>
            </label>
          </Section>

          <Section title={p.style === 'layered' ? t('tiktok.colorOtherWords') : t('tiktok.color')}>
            <FieldGroup label="Text">
              <ColorRow value={p.textColor} onChange={p.onTextColor} />
            </FieldGroup>
            {p.style !== 'layered' && (
              <FieldGroup label="Highlight (Big Words)">
                <ColorRow value={p.highlightColor} onChange={p.onHighlightColor} />
              </FieldGroup>
            )}
            <label className="flex items-center justify-between gap-2 cursor-pointer pt-1">
              <span className="text-[11px] text-zinc-300 font-medium">Use Gradient</span>
              <span
                onClick={() => p.onUseGradient(!p.useGradient)}
                className={clsx(
                  'relative w-9 h-5 rounded-full transition-colors',
                  p.useGradient ? 'bg-fiano-red' : 'bg-white/[0.08]',
                )}
              >
                <span className={clsx(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  p.useGradient ? 'translate-x-4' : 'translate-x-0.5',
                )} />
              </span>
            </label>
            {p.useGradient && (
              <>
                <FieldGroup label="From">
                  <ColorRow value={p.gradientFrom} onChange={p.onGradientFrom} />
                </FieldGroup>
                <FieldGroup label="To">
                  <ColorRow value={p.gradientTo} onChange={p.onGradientTo} />
                </FieldGroup>
              </>
            )}
            {/* Metallic-Toggle — wirkt für ALLEN Subtitle-Text (nicht nur layered).
                Funktioniert auch ohne useGradient (nutzt textColor als Sheen-Basis). */}
            <label className="flex items-center justify-between gap-2 cursor-pointer pt-1">
              <span className="text-[11px] text-zinc-300 font-medium">Metallic Sheen</span>
              <span
                onClick={() => p.onMetallic(!p.metallic)}
                className={clsx(
                  'relative w-9 h-5 rounded-full transition-colors',
                  p.metallic ? 'bg-fiano-red' : 'bg-white/[0.08]',
                )}
              >
                <span className={clsx(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  p.metallic ? 'translate-x-4' : 'translate-x-0.5',
                )} />
              </span>
            </label>
          </Section>

          {p.style === 'layered' && (
            <Section title={t('tiktok.layeredHighlight')}>
              <FieldGroup label={t('tiktok.layeredFontScale')}>
                <SliderRow value={p.highlightFontScale} min={1} max={3} step={0.1}
                  onChange={p.onHighlightFontScale} display={`${p.highlightFontScale.toFixed(1)}×`} />
              </FieldGroup>
              <FieldGroup label={t('tiktok.layeredDropShadow')}>
                <SliderRow value={p.highlightDropShadow} min={0} max={40} step={1}
                  onChange={p.onHighlightDropShadow} display={`${p.highlightDropShadow}px`} />
              </FieldGroup>
              <FieldGroup label={t('tiktok.layeredHighlightColor')}>
                <ColorRow value={p.highlightColor} onChange={p.onHighlightColor} />
              </FieldGroup>
              <label className="flex items-center justify-between gap-2 cursor-pointer pt-1">
                <span className="text-[11px] text-zinc-300 font-medium">{t('tiktok.layeredMetallic')}</span>
                <span
                  onClick={() => p.onHighlightMetallic(!p.highlightMetallic)}
                  className={clsx(
                    'relative w-9 h-5 rounded-full transition-colors',
                    p.highlightMetallic ? 'bg-fiano-red' : 'bg-white/[0.08]',
                  )}
                >
                  <span className={clsx(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                    p.highlightMetallic ? 'translate-x-4' : 'translate-x-0.5',
                  )} />
                </span>
              </label>

              <label className="flex items-center justify-between gap-2 cursor-pointer pt-1">
                <span className="text-[11px] text-zinc-300 font-medium">{t('tiktok.layeredGlow')}</span>
                <span
                  onClick={() => p.onHighlightGlow(!p.highlightGlow)}
                  className={clsx(
                    'relative w-9 h-5 rounded-full transition-colors',
                    p.highlightGlow ? 'bg-fiano-red' : 'bg-white/[0.08]',
                  )}
                >
                  <span className={clsx(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                    p.highlightGlow ? 'translate-x-4' : 'translate-x-0.5',
                  )} />
                </span>
              </label>
              {p.highlightGlow && (
                <>
                  <FieldGroup label={t('tiktok.layeredGlowColor')}>
                    <ColorRow value={p.highlightGlowColor} onChange={p.onHighlightGlowColor} />
                  </FieldGroup>
                  <FieldGroup label={t('tiktok.layeredGlowStrength')}>
                    <SliderRow value={p.highlightGlowStrength} min={0} max={1} step={0.05}
                      onChange={p.onHighlightGlowStrength} display={`${Math.round(p.highlightGlowStrength * 100)}%`} />
                  </FieldGroup>
                </>
              )}
              <label className="flex items-center justify-between gap-2 cursor-pointer pt-1">
                <span className="text-[11px] text-zinc-300 font-medium">{t('tiktok.layeredUseGradient')}</span>
                <span
                  onClick={() => p.onHighlightUseGradient(!p.highlightUseGradient)}
                  className={clsx(
                    'relative w-9 h-5 rounded-full transition-colors',
                    p.highlightUseGradient ? 'bg-fiano-red' : 'bg-white/[0.08]',
                  )}
                >
                  <span className={clsx(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                    p.highlightUseGradient ? 'translate-x-4' : 'translate-x-0.5',
                  )} />
                </span>
              </label>
              {(p.highlightUseGradient || p.highlightMetallic) && (
                <>
                  <FieldGroup label={t('tiktok.layeredGradientFrom')}>
                    <ColorRow value={p.highlightGradientFrom} onChange={p.onHighlightGradientFrom} />
                  </FieldGroup>
                  <FieldGroup label={t('tiktok.layeredGradientTo')}>
                    <ColorRow value={p.highlightGradientTo} onChange={p.onHighlightGradientTo} />
                  </FieldGroup>
                </>
              )}
            </Section>
          )}

          <Section title={t('tiktok.stroke')}>
            <FieldGroup label="Width">
              <SliderRow value={p.strokeWidth} min={0} max={8} step={0.5}
                onChange={p.onStrokeWidth} display={`${p.strokeWidth}px`} />
            </FieldGroup>
            <FieldGroup label="Color">
              <ColorRow value={p.strokeColor} onChange={p.onStrokeColor} />
            </FieldGroup>
          </Section>

          <Section title={t('tiktok.glow')}>
            <label className="flex items-center justify-between gap-2 cursor-pointer mb-2">
              <span className="text-[11px] text-zinc-300 font-medium flex items-center gap-1.5">
                Enable Glow
                {!advFxFeature.unlocked && <LockBadge />}
              </span>
              <span
                onClick={() => {
                  if (!advFxFeature.unlocked && !p.glowEnabled) {
                    openUpgrade('subtitle_advanced_effects');
                    return;
                  }
                  p.onGlowEnabled(!p.glowEnabled);
                }}
                className={clsx(
                  'relative w-9 h-5 rounded-full transition-colors',
                  p.glowEnabled ? 'bg-fiano-red' : 'bg-white/[0.08]',
                  !advFxFeature.unlocked && !p.glowEnabled && 'opacity-60',
                )}
              >
                <span className={clsx(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  p.glowEnabled ? 'translate-x-4' : 'translate-x-0.5',
                )} />
              </span>
            </label>
            {p.glowEnabled && (
              <>
                <FieldGroup label="Blur">
                  <SliderRow value={p.glowBlur} min={0} max={40} step={1}
                    onChange={p.onGlowBlur} display={`${p.glowBlur}px`} />
                </FieldGroup>
                <FieldGroup label="Strength">
                  <SliderRow value={p.glowStrength} min={0} max={1} step={0.05}
                    onChange={p.onGlowStrength} display={`${Math.round(p.glowStrength * 100)}%`} />
                </FieldGroup>
                <FieldGroup label="Color">
                  <ColorRow value={p.glowColor} onChange={p.onGlowColor} />
                </FieldGroup>
              </>
            )}
          </Section>

          <Section title="Drop Shadow">
            <label className="flex items-center justify-between gap-2 cursor-pointer mb-2">
              <span className="text-[11px] text-zinc-300 font-medium flex items-center gap-1.5">
                Enable Drop Shadow
                {!advFxFeature.unlocked && <LockBadge />}
              </span>
              <span
                onClick={() => {
                  if (!advFxFeature.unlocked && !p.shadowEnabled) {
                    openUpgrade('subtitle_advanced_effects');
                    return;
                  }
                  p.onShadowEnabled(!p.shadowEnabled);
                }}
                className={clsx(
                  'relative w-9 h-5 rounded-full transition-colors',
                  p.shadowEnabled ? 'bg-fiano-red' : 'bg-white/[0.08]',
                  !advFxFeature.unlocked && !p.shadowEnabled && 'opacity-60',
                )}
              >
                <span className={clsx(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  p.shadowEnabled ? 'translate-x-4' : 'translate-x-0.5',
                )} />
              </span>
            </label>
            {p.shadowEnabled && (
              <>
            <FieldGroup label="Color">
              <ColorRow value={p.shadowColor} onChange={p.onShadowColor} />
            </FieldGroup>
            <FieldGroup label="Blur">
              <SliderRow value={p.shadowBlur} min={0} max={40} step={1}
                onChange={p.onShadowBlur} display={`${p.shadowBlur}px`} />
            </FieldGroup>
            <FieldGroup label="Offset X">
              <SliderRow value={p.shadowOffsetX} min={-20} max={20} step={1}
                onChange={p.onShadowOffsetX} display={`${p.shadowOffsetX}px`} />
            </FieldGroup>
            <FieldGroup label="Offset Y">
              <SliderRow value={p.shadowOffsetY} min={-20} max={20} step={1}
                onChange={p.onShadowOffsetY} display={`${p.shadowOffsetY}px`} />
            </FieldGroup>
              </>
            )}
          </Section>
        </>
      )}
    </>
  );
}

/**
 * Font-Family-Picker: zeigt Curated-Fonts + alle System-Fonts via Local Font Access API.
 * Funktioniert in Electron/Chromium ohne extra Permission.
 */

/* ─── CustomPresetsSection: Save aktuelle Settings + Load/Delete saved presets ─── */

function CustomPresetsSection({
  currentValues, write,
}: {
  currentValues: SubtitleValues;
  write: (patch: Partial<SubtitleValues>) => void;
}) {
  const presets = useApp((s) => s.appDefaults.subtitlePresets ?? []);
  const savePreset = useApp((s) => s.saveSubtitlePreset);
  const deletePreset = useApp((s) => s.deleteSubtitlePreset);
  const [showInput, setShowInput] = useState(false);
  const [name, setName] = useState('');

  const onSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Pack alle aktuellen Settings (kompletter Snapshot) als SubtitleSettings
    const settings: import('@shared/types').SubtitleSettings = {
      enabled: currentValues.enabled,
      style: currentValues.style,
      position: currentValues.position,
      customY: currentValues.customY,
      fontFamily: currentValues.fontFamily,
      fontSize: currentValues.fontSize,
      letterSpacing: currentValues.letterSpacing,
      uppercase: currentValues.uppercase,
      textColor: currentValues.textColor,
      highlightColor: currentValues.highlightColor,
      useGradient: currentValues.useGradient,
      gradientFrom: currentValues.gradientFrom,
      gradientTo: currentValues.gradientTo,
      strokeWidth: currentValues.strokeWidth,
      strokeColor: currentValues.strokeColor,
      glowEnabled: currentValues.glowEnabled,
      glowBlur: currentValues.glowBlur,
      glowStrength: currentValues.glowStrength,
      glowColor: currentValues.glowColor,
      shadowEnabled: currentValues.shadowEnabled,
      shadowOffsetX: currentValues.shadowOffsetX,
      shadowOffsetY: currentValues.shadowOffsetY,
      shadowColor: currentValues.shadowColor,
      shadowBlur: currentValues.shadowBlur,
      metallic: currentValues.metallic,
      maxWordsPerChunk: currentValues.maxWordsPerChunk,
      highlightFontScale: currentValues.highlightFontScale,
      highlightUseGradient: currentValues.highlightUseGradient,
      highlightGradientFrom: currentValues.highlightGradientFrom,
      highlightGradientTo: currentValues.highlightGradientTo,
      highlightDropShadow: currentValues.highlightDropShadow,
      highlightMetallic: currentValues.highlightMetallic,
      highlightGlow: currentValues.highlightGlow,
      highlightGlowColor: currentValues.highlightGlowColor,
      highlightGlowStrength: currentValues.highlightGlowStrength,
    };
    await savePreset(trimmed, settings);
    setName('');
    setShowInput(false);
  };

  const onLoad = (preset: typeof presets[number]) => {
    // Komplettes Settings-Snapshot durchwriten — wenn felder im preset undefined sind,
    // bleiben aktuelle Werte. Pragmatic: explizit alle felder auf preset.settings overriden.
    write(preset.settings as Partial<SubtitleValues>);
  };

  return (
    <Section title="My Presets">
      {presets.length === 0 && !showInput && (
        <div className="text-[10px] text-zinc-500 italic mb-2">No saved presets yet.</div>
      )}
      <div className="space-y-1.5">
        {presets.map((preset) => (
          <div key={preset.id} className="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.06] rounded-lg p-1.5">
            <button
              onClick={() => onLoad(preset)}
              className="flex-1 text-[11px] text-zinc-200 text-left px-2 py-1 rounded hover:bg-white/[0.06] truncate"
              title={`Load preset "${preset.name}"`}
            >
              {preset.name}
            </button>
            <button
              onClick={() => deletePreset(preset.id)}
              className="text-[10px] text-zinc-500 hover:text-fiano-red px-2 py-1 rounded transition"
              title="Delete preset"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      {showInput ? (
        <div className="flex items-center gap-1.5 mt-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') setShowInput(false); }}
            placeholder="Preset name…"
            autoFocus
            className="flex-1 bg-black/40 border border-white/[0.10] rounded-lg px-2 py-1.5 text-[11px] text-zinc-100 focus:outline-none focus:border-fiano-red/60"
          />
          <button
            onClick={onSave}
            disabled={!name.trim()}
            className="text-[10px] font-semibold text-white bg-fiano-red px-3 py-1.5 rounded-lg disabled:opacity-40 hover:brightness-110 transition"
          >
            Save
          </button>
          <button
            onClick={() => { setShowInput(false); setName(''); }}
            className="text-[10px] text-zinc-400 px-2 py-1.5 rounded hover:bg-white/[0.06] transition"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="w-full mt-2 text-[10px] font-medium text-zinc-300 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 hover:bg-white/[0.08] transition"
        >
          + Save Current as Preset
        </button>
      )}
    </Section>
  );
}

/* ─── CueEditor: pro-Cue Text-Edit + Reset ──────────────────────────────────── */

function CueEditor({
  originalCues, edits, cuesLoaded, onCueEdit, onCueReset,
}: {
  originalCues: Array<{ start: number; end: number; text: string }>;
  edits: Array<{ start: number; end: number; text: string } | null>;
  cuesLoaded: boolean;
  onCueEdit: (idx: number, text: string) => void;
  onCueReset: (idx: number) => void;
}) {
  if (!cuesLoaded) {
    return (
      <Section title="Cue Editor">
        <div className="text-[11px] text-zinc-500 italic">Lade Cues…</div>
      </Section>
    );
  }
  if (originalCues.length === 0) {
    return (
      <Section title="Cue Editor">
        <div className="text-[11px] text-zinc-500 italic">Keine Cues im Highlight-Bereich.</div>
      </Section>
    );
  }
  const fmtTs = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = (sec - m * 60).toFixed(1);
    return `${m}:${s.padStart(4, '0')}`;
  };
  return (
    <Section title={`Cue Editor (${originalCues.length})`}>
      <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
        {originalCues.map((cue, i) => {
          const edit = edits[i];
          const currentText = edit?.text ?? cue.text;
          const isEdited = !!edit && edit.text !== cue.text;
          return (
            <div
              key={`${i}-${cue.start.toFixed(2)}`}
              className={clsx(
                'rounded-lg border p-2 space-y-1.5 transition-colors',
                isEdited ? 'border-fiano-red/50 bg-fiano-red/[0.06]' : 'border-white/[0.08] bg-black/30',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-mono text-zinc-500 tabular-nums">
                  {fmtTs(cue.start)} → {fmtTs(cue.end)}
                </span>
                {isEdited && (
                  <button
                    onClick={() => onCueReset(i)}
                    className="text-[9px] uppercase tracking-wider text-fiano-red hover:text-white transition-colors"
                    title="Auf Original zurücksetzen"
                  >
                    Reset
                  </button>
                )}
              </div>
              <textarea
                value={currentText}
                onChange={(e) => onCueEdit(i, e.target.value)}
                rows={2}
                className="w-full px-2 py-1.5 rounded bg-black/40 border border-white/[0.08]
                           text-[11px] text-zinc-100 leading-tight resize-none
                           focus:outline-none focus:border-fiano-red/60"
              />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function FontFamilyPicker({
  value, onChange,
}: { value: SubtitleFontFamily; onChange: (v: SubtitleFontFamily) => void }) {
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Chromium 103+: window.queryLocalFonts()
    const w = window as unknown as { queryLocalFonts?: () => Promise<Array<{ family: string }>> };
    if (typeof w.queryLocalFonts === 'function') {
      w.queryLocalFonts()
        .then((fonts) => {
          const families = Array.from(new Set(fonts.map((f) => f.family))).sort();
          setSystemFonts(families);
        })
        .catch((e: unknown) => setError(String(e)));
    } else {
      setError('Local Font API not available');
    }
  }, []);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2
                 text-[12px] font-medium text-zinc-200 focus:outline-none focus:border-fiano-red/40 transition"
    >
      <optgroup label="Curated">
        <option value="helvetica">Helvetica Neue</option>
        <option value="arial-black">Arial Black</option>
        <option value="impact">Impact</option>
        <option value="geist">Geist</option>
        <option value="georgia">Georgia</option>
        <option value="mono">Menlo (Mono)</option>
        <option value="system">System Sans</option>
      </optgroup>
      {systemFonts.length > 0 && (
        <optgroup label={`System Fonts (${systemFonts.length})`}>
          {systemFonts.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </optgroup>
      )}
      {error && <option disabled>{error}</option>}
    </select>
  );
}

/** Color Picker + Hex-Input zusammen. */
function ColorRow({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-9 h-9 rounded-md border border-white/[0.08] bg-transparent cursor-pointer shrink-0"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2
                   text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-fiano-red/40"
      />
    </div>
  );
}

/** Generic Slider Row für numerische Werte. */
function SliderRow({
  value, min, max, step, onChange, display,
}: {
  value: number;
  min: number; max: number; step: number;
  onChange: (v: number) => void;
  display: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-fiano-red"
      />
      <span className="text-[10px] text-fiano-red font-mono w-12 text-right">
        {display}
      </span>
    </div>
  );
}

/**
 * Aa-Preset-Picker-Button: zeigt visuelle Vorschau jedes Style-Presets.
 */
/** Locked-Variante der Custom-Presets-Sektion — Click triggert UpgradeModal. */
function LockedCustomPresets({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <Section title="My Presets">
      <button
        onClick={onUpgrade}
        className="w-full text-left bg-white/[0.02] border border-white/[0.06] hover:border-fiano-red/40 hover:bg-fiano-red/[0.04]
                   rounded-lg p-3 flex items-center gap-3 transition group"
      >
        <span className="shrink-0 w-9 h-9 rounded-lg bg-fiano-red/15 border border-fiano-red/30 flex items-center justify-center
                         shadow-[0_0_12px_rgba(255,16,57,0.18)] group-hover:scale-105 transition-transform">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-fiano-red" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-zinc-200">Save your own presets</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Pro feature — click to upgrade</div>
        </div>
      </button>
    </Section>
  );
}

function PresetButton({
  preset, active, onClick, locked,
}: {
  preset: SubtitleStyle;
  active: boolean;
  onClick: () => void;
  locked?: boolean;
}) {
  const presetStyle: Record<SubtitleStyle, React.CSSProperties> = {
    default: { fontFamily: 'sans-serif',          fontWeight: 400, color: '#fff', textShadow: '0 0 2px #000, 1px 1px 1px #000' },
    bold:    { fontFamily: '"Arial Black", sans', fontWeight: 900, color: '#fff', textShadow: '0 0 4px #000, 2px 2px 2px #000' },
    gaming:  { fontFamily: 'Impact, sans',        fontWeight: 900, color: '#ffeb3b', textShadow: '0 0 5px #000, 2px 2px 0 #000' },
    fiano:   { fontFamily: 'Geist, sans',         fontWeight: 800, color: '#fff', textShadow: '0 0 6px rgba(255,16,57,0.8), 0 0 2px #000' },
    // Layered: nicht direkt als "Aa"-Glyph darstellbar — wir zeigen ein Mini-Stack-Layout
    layered: { fontFamily: '"Arial Black", sans', fontWeight: 900, color: '#fff' },
  };
  return (
    <button
      onClick={onClick}
      className={clsx(
        'relative aspect-square flex flex-col items-center justify-center rounded-lg transition-all px-1',
        active
          ? 'bg-fiano-red/15 border border-fiano-red/40 shadow-[0_0_12px_rgba(255,16,57,0.2)]'
          : locked
            ? 'bg-white/[0.02] border border-white/[0.04] opacity-55 hover:opacity-75'
            : 'bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12]',
      )}
      title={locked ? `${preset} (Pro)` : preset}
    >
      {locked && (
        <span
          className="absolute top-1 right-1 z-10 flex items-center justify-center w-4 h-4 rounded-full bg-fiano-red/85 shadow-[0_0_8px_rgba(255,16,57,0.5)]"
          aria-label="Locked"
        >
          <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </span>
      )}
      {preset === 'layered' ? (
        // Mini-Layered-Preview: Big-Wort hinten (rot, gradient, größer), Small-Wort vorne (weiß, kleiner, überlappend)
        <span className="relative flex items-center justify-center w-full h-full" style={{ fontFamily: '"Arial Black", sans' }}>
          <span style={{
            position: 'absolute',
            fontSize: '24px',
            fontWeight: 900,
            background: 'linear-gradient(180deg,#ff5570 0%,#ff1039 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            WebkitTextStroke: '1px #000',
            lineHeight: 1,
            transform: 'translateY(-3px)',
          }}>BIG</span>
          <span style={{
            position: 'absolute',
            fontSize: '10px',
            fontWeight: 700,
            color: '#fff',
            WebkitTextStroke: '0.5px #000',
            textShadow: '0 1px 2px rgba(0,0,0,0.7)',
            lineHeight: 1,
            transform: 'translateY(8px)',
          }}>small</span>
        </span>
      ) : (
        <span className="text-[20px] leading-none" style={presetStyle[preset]}>Aa</span>
      )}
    </button>
  );
}

/**
 * Word Highlight Editor: pro-Wort Big/Small Toggle.
 * Lebt unabhängig von Auto-Subtitles — fungiert als Manual Override.
 */
function WordHighlightEditor({
  words, onChange,
}: {
  words: SubtitleHighlightWord[];
  onChange: (next: SubtitleHighlightWord[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const addWord = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...words, { text, big: false }]);
    setDraft('');
  };

  const toggleBig = (idx: number) => {
    onChange(words.map((w, i) => (i === idx ? { ...w, big: !w.big } : w)));
  };

  const removeWord = (idx: number) => {
    onChange(words.filter((_, i) => i !== idx));
  };

  return (
    <FieldGroup label="Word Highlight">
      <div className="space-y-2">
        {words.length === 0 && (
          <div className="text-[10px] text-zinc-600 leading-relaxed px-2">
            Add words to override auto-subtitles. Toggle <span className="text-fiano-red">Big</span> for the highlight word, leave others as Small.
          </div>
        )}

        {words.map((w, i) => (
          <div
            key={i}
            className={clsx(
              'flex items-center gap-2 px-2 py-1.5 rounded-lg border',
              w.big
                ? 'bg-fiano-red/[0.08] border-fiano-red/40'
                : 'bg-white/[0.03] border-white/[0.06]',
            )}
          >
            <input
              type="text"
              value={w.text}
              onChange={(e) => onChange(words.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
              className="flex-1 bg-transparent text-[12px] font-medium text-zinc-200 focus:outline-none placeholder:text-zinc-600"
            />
            <button
              onClick={() => toggleBig(i)}
              className={clsx(
                'text-[9px] uppercase tracking-wider px-2 py-0.5 rounded font-bold transition',
                w.big ? 'bg-fiano-red text-white' : 'bg-white/[0.06] text-zinc-400 hover:text-white',
              )}
            >
              {w.big ? 'Big' : 'Small'}
            </button>
            <button
              onClick={() => removeWord(i)}
              className="text-zinc-600 hover:text-red-400 transition w-5 h-5 flex items-center justify-center"
              aria-label="Remove"
            >
              <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 2l8 8 M10 2L2 10" />
              </svg>
            </button>
          </div>
        ))}

        {/* Add input */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addWord(); }}
            placeholder="add word…"
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-fiano-red/40 transition"
          />
          <button
            onClick={addWord}
            className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-fiano-red text-white hover:brightness-110 transition shrink-0"
          >
            +
          </button>
        </div>

        {/* Add Manual Subtitle (advanced — placeholder for future) */}
        <button
          className="w-full flex items-center justify-center gap-1.5 text-[10px] font-medium px-3 py-2 rounded-lg
                     bg-white/[0.03] border border-dashed border-white/[0.1] text-zinc-500
                     hover:bg-white/[0.05] hover:border-white/[0.18] hover:text-zinc-300 transition"
          onClick={() => {
            // Advanced: kompletter Manual-Subtitle-Editor folgt — für jetzt bringt der User Wörter via Word-Highlight rein.
            const text = window.prompt('Add manual subtitle line (words separated by space):')?.trim();
            if (text) {
              const newWords: SubtitleHighlightWord[] = text.split(/\s+/).map((t) => ({ text: t, big: false }));
              onChange([...words, ...newWords]);
            }
          }}
        >
          <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 2v8 M2 6h8" />
          </svg>
          Add Manual Subtitle
        </button>
      </div>
    </FieldGroup>
  );
}
