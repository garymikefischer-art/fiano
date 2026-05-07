import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { ClipSegment, Highlight } from '@shared/types';
import { effectiveSegments } from '@shared/types';
import { mediaUrl } from '../lib/mediaUrl';
import { SegmentEditor } from './SegmentEditor';
import { useApp } from '../stores/appStore';
import { useT } from '../lib/i18n';

interface Props {
  projectId: string;
  highlight: Highlight;
  index: number;
  onClose: () => void;
}

const MIN_SEG = 0.5;

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Großes Editor-Popup im Mockup-Stil:
 * - Glass-Modal mit Custom-Header
 * - Custom Video-Player (rote Timeline, eigene Controls)
 * - Edit-Section mit SegmentEditor + Action-Buttons
 * - Save Changes (rot, rechts)
 * Logik unverändert: cutAtPlayhead / Mark A+B / applyMarkedCut / reset.
 */
export function ClipEditorModal({ projectId, highlight, index, onClose }: Props) {
  const updateHighlight = useApp((s) => s.updateHighlight);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const t = useT();

  const clipDuration = Math.max(0.1, highlight.end - highlight.start);
  const [segments, setSegments] = useState<ClipSegment[]>(() => effectiveSegments(highlight));
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [markA, setMarkA] = useState<number | null>(null);
  const [markB, setMarkB] = useState<number | null>(null);

  useEffect(() => {
    setSegments(effectiveSegments(highlight));
  }, [highlight.segments, highlight.trimStart, highlight.trimEnd]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const commit = (next: ClipSegment[]) => {
    setSegments(next);
    updateHighlight(projectId, index, { segments: next });
  };

  /* ─── Cut-Operationen (Logik unverändert) ──────────────── */
  const cutAtPlayhead = () => {
    const t = playhead;
    const idx = segments.findIndex((s) => t > s.start + MIN_SEG && t < s.end - MIN_SEG);
    if (idx < 0) return;
    const seg = segments[idx];
    const next = [
      ...segments.slice(0, idx),
      { start: seg.start, end: t - 0.1 },
      { start: t + 0.1, end: seg.end },
      ...segments.slice(idx + 1),
    ];
    commit(next);
  };

  const setMarkAtPlayhead = (which: 'A' | 'B') => {
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
      if (seg.end <= a || seg.start >= b) {
        next.push(seg);
      } else if (seg.start < a && seg.end > b) {
        next.push({ start: seg.start, end: a });
        next.push({ start: b, end: seg.end });
      } else if (seg.start < a) {
        next.push({ start: seg.start, end: Math.min(seg.end, a) });
      } else if (seg.end > b) {
        next.push({ start: Math.max(seg.start, b), end: seg.end });
      }
    }
    const cleaned = next.filter((s) => s.end - s.start >= MIN_SEG);
    if (cleaned.length === 0) return;
    commit(cleaned);
    setMarkA(null);
    setMarkB(null);
  };

  const resetSegments = () => {
    commit([{ start: 0, end: clipDuration }]);
    setMarkA(null);
    setMarkB(null);
  };

  /* ─── Player ───────────────────────────────────────────── */
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  };

  const skipBy = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const next = Math.max(0, Math.min(clipDuration, v.currentTime + delta));
    v.currentTime = next;
    setPlayhead(next);
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setPlayhead(v.currentTime);
  };
  const seekTo = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setPlayhead(t);
  };
  const seekFromBar = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    seekTo(Math.max(0, Math.min(1, pct)) * clipDuration);
  };

  const totalKept = segments.reduce((s, seg) => s + (seg.end - seg.start), 0);
  const progressPct = clipDuration > 0 ? (playhead / clipDuration) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6
                 bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-zinc-500">
                #{String(index + 1).padStart(2, '0')}
              </span>
              <span className="text-[13px] font-semibold text-white truncate">
                {highlight.reason}
              </span>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
              {t('clipModal.keeping')} {totalKept.toFixed(1)}s {t('clipModal.of')} {clipDuration.toFixed(1)}s · {segments.length} {segments.length === 1 ? t('clipModal.segmentSingular') : t('clipModal.segmentPlural')}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center
                       text-zinc-400 hover:text-white hover:bg-white/[0.06] transition"
            aria-label={t('clipModal.close')}
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 3l10 10 M13 3L3 13" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ─── Video Player (custom) ──────────────────── */}
          <div className="px-5 pt-4">
            <div className="rounded-xl overflow-hidden bg-black ring-1 ring-white/[0.06]">
              {highlight.clipPath ? (
                <video
                  ref={videoRef}
                  src={mediaUrl(highlight.clipPath)}
                  className="w-full aspect-video object-contain bg-black"
                  onTimeUpdate={onTimeUpdate}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onClick={togglePlay}
                />
              ) : (
                <div className="w-full aspect-video flex items-center justify-center text-zinc-600 bg-black">
                  {t('clipModal.noClipRendered')}
                </div>
              )}

              {/* Custom Controls Bar */}
              <div className="bg-black/95 border-t border-white/[0.06] px-3 py-2 flex items-center gap-3">
                <button
                  onClick={() => skipBy(-5)}
                  className="w-7 h-7 rounded-md flex items-center justify-center
                             text-zinc-300 hover:bg-white/[0.06] transition"
                  aria-label={t('clipModal.skipBack')}
                >
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
                    <path d="M7 3v10l-7-5zM15 3v10l-7-5z" />
                  </svg>
                </button>

                <button
                  onClick={togglePlay}
                  className="w-9 h-9 rounded-lg flex items-center justify-center
                             bg-fiano-red text-white shadow-[0_0_16px_rgba(255,16,57,0.4)]
                             hover:brightness-110 transition"
                  aria-label={playing ? t('clipModal.pause') : t('clipModal.play')}
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
                  className="w-7 h-7 rounded-md flex items-center justify-center
                             text-zinc-300 hover:bg-white/[0.06] transition"
                  aria-label={t('clipModal.skipForward')}
                >
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
                    <path d="M9 3v10l7-5zM1 3v10l7-5z" />
                  </svg>
                </button>

                <span className="text-[11px] font-mono text-zinc-400 tabular-nums shrink-0">
                  {formatTime(playhead)}
                </span>

                {/* Custom Progress Bar */}
                <div
                  ref={progressBarRef}
                  onClick={seekFromBar}
                  className="flex-1 h-1.5 rounded-full bg-white/[0.08] cursor-pointer relative group"
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-fiano-red rounded-full
                               shadow-[0_0_8px_rgba(255,16,57,0.5)] transition-[width] duration-75"
                    style={{ width: `${progressPct}%` }}
                  />
                  {/* Marks A/B Indikatoren auf Progress-Bar */}
                  {markA !== null && (
                    <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]"
                         style={{ left: `calc(${(markA / clipDuration) * 100}% - 4px)` }} />
                  )}
                  {markB !== null && (
                    <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]"
                         style={{ left: `calc(${(markB / clipDuration) * 100}% - 4px)` }} />
                  )}
                  {/* Playhead Marker (oben drüber) */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-fiano-red
                               shadow-[0_0_10px_rgba(255,16,57,0.7)]
                               opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    style={{ left: `calc(${progressPct}% - 6px)` }}
                  />
                </div>

                <span className="text-[11px] font-mono text-zinc-500 tabular-nums shrink-0">
                  {formatTime(clipDuration)}
                </span>

                <button
                  onClick={() => videoRef.current?.requestFullscreen()}
                  className="w-7 h-7 rounded-md flex items-center justify-center
                             text-zinc-300 hover:bg-white/[0.06] transition"
                  aria-label={t('clipModal.fullscreen')}
                >
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6V3h3 M10 3h3v3 M3 10v3h3 M10 13h3v-3" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* ─── Edit Clip Section ──────────────────────── */}
          <div className="px-5 py-4">
            <div className="glass p-4 space-y-3.5">
              {/* Section Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-fiano-red" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM5 9a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM7 8l8-3 M7 8l8 3" />
                  </svg>
                  <span className="text-[12px] font-semibold text-zinc-200">{t('clipModal.editClip')}</span>
                </div>
                <div className="text-[10px] text-zinc-500 font-mono tabular-nums">
                  {t('clipModal.playhead')} {formatTime(playhead)}
                </div>
              </div>

              {/* Segment Timeline */}
              <SegmentEditor
                duration={clipDuration}
                segments={segments}
                onChange={setSegments}
                onCommit={commit}
                onScrub={seekTo}
              />

              {/* Action Buttons — Mark A/B + Apply + Cut at Playhead */}
              <div className="grid grid-cols-2 gap-2">
                <ActionButton
                  onClick={() => setMarkAtPlayhead('A')}
                  icon={<MarkAIcon />}
                  label={t('clipModal.setCutStart')}
                  hint={markA !== null ? `${t('clipModal.atTime')} ${markA.toFixed(2)}s` : t('clipModal.pressAtPlayhead')}
                  marked={markA !== null}
                />
                <ActionButton
                  onClick={() => setMarkAtPlayhead('B')}
                  icon={<MarkBIcon />}
                  label={t('clipModal.setCutEnd')}
                  hint={markB !== null ? `${t('clipModal.atTime')} ${markB.toFixed(2)}s` : t('clipModal.pressAtPlayhead')}
                  marked={markB !== null}
                />
                <ActionButton
                  onClick={applyMarkedCut}
                  icon={<RemoveIcon />}
                  label={t('clipModal.applyCut')}
                  hint={
                    markA !== null && markB !== null
                      ? `${t('clipModal.removes')} [${Math.min(markA, markB).toFixed(2)}s — ${Math.max(markA, markB).toFixed(2)}s]`
                      : t('clipModal.setABFirst')
                  }
                  disabled={markA === null || markB === null}
                  primary
                />
                <ActionButton
                  onClick={cutAtPlayhead}
                  icon={<SplitIcon />}
                  label={t('clipModal.cutAtPlayhead')}
                  hint={t('clipModal.splitSegment')}
                />
              </div>

              {/* Reset (secondary) */}
              <button
                onClick={resetSegments}
                className="w-full text-[11px] text-zinc-400 hover:text-white px-3 py-1.5
                           bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06]
                           hover:border-white/[0.12] rounded-lg transition"
              >
                {t('clipModal.resetCuts')}
              </button>
            </div>
          </div>
        </div>

        {/* ─── Footer ─────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
          <div className="text-[10px] text-zinc-500 font-mono">
            {t('clipModal.autoSaved')}
          </div>
          <button
            onClick={onClose}
            className="bg-fiano-red text-white text-[12px] font-semibold px-5 py-2 rounded-lg
                       hover:brightness-110 hover:shadow-[0_0_20px_rgba(255,16,57,0.45)]
                       active:scale-[0.98] transition-all"
          >
            {t('clipModal.saveChanges')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  onClick, label, hint, icon, marked, primary, disabled,
}: {
  onClick: () => void;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  /** Mark A/B ist gesetzt → amber-tinted border */
  marked?: boolean;
  /** Apply Cut → roter primary look wenn enabled */
  primary?: boolean;
  disabled?: boolean;
}) {
  const variant = disabled
    ? 'bg-white/[0.02] border-white/[0.04] text-zinc-600 cursor-not-allowed'
    : primary
      ? 'bg-fiano-red/15 border-fiano-red/40 text-white hover:bg-fiano-red/20 hover:border-fiano-red/60 shadow-[0_0_12px_rgba(255,16,57,0.15)]'
      : marked
        ? 'bg-amber-500/10 border-amber-500/40 text-white hover:bg-amber-500/15'
        : 'bg-white/[0.03] border-white/[0.06] text-zinc-200 hover:bg-white/[0.06] hover:border-white/[0.12]';

  const iconColor = disabled
    ? 'text-zinc-700'
    : primary ? 'text-fiano-red' : marked ? 'text-amber-400' : 'text-zinc-400';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all border',
        variant,
      )}
    >
      <span className={clsx('shrink-0', iconColor)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium truncate">{label}</div>
        {hint && (
          <div className={clsx(
            'text-[10px] truncate font-mono',
            disabled ? 'text-zinc-700' : 'text-zinc-500',
          )}>
            {hint}
          </div>
        )}
      </div>
    </button>
  );
}

function MarkAIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13L8 3l5 10 M5 9h6" />
    </svg>
  );
}
function MarkBIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 13V3h4a2.5 2.5 0 0 1 0 5H4 M4 8h5a2.5 2.5 0 0 1 0 5H4" />
    </svg>
  );
}
function SplitIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v12 M3 6L8 1l5 5 M3 10l5 5 5-5" />
    </svg>
  );
}
function RemoveIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 8L4 6h2l1.5 4 2-7 1.5 5L12 6h2l1 2" />
    </svg>
  );
}
