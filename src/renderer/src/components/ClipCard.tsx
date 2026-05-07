import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { ClipSegment, ExportFormat, Highlight } from '@shared/types';
import { effectiveSegments } from '@shared/types';
import { mediaUrl } from '../lib/mediaUrl';
import { SegmentEditor } from './SegmentEditor';
import { useT } from '../lib/i18n';

interface Props {
  highlight: Highlight;
  index: number;
  /** Optional: Position in der angezeigten (sortierten) Liste — nur für die UI-Nummer.
   *  `index` bleibt der Original-Array-Index fürs Backend. */
  displayIndex?: number;
  selected: boolean;
  onToggle: () => void;
  /** Segments commiten (an IPC). */
  onCommitSegments: (segments: ClipSegment[]) => void;
  /** Export starten — Parent baut den Save-As-Flow. */
  onExport: (format: ExportFormat, segments: ClipSegment[]) => void;
  /** Click auf Preview öffnet großes Editor-Modal. */
  onOpenEditor?: () => void;
}

export function ClipCard({ highlight, index, displayIndex, selected, onToggle, onCommitSegments, onExport, onOpenEditor }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const hasClip = !!highlight.clipPath;
  const clipDuration = Math.max(0.1, highlight.end - highlight.start);

  const [segments, setSegments] = useState<ClipSegment[]>(() => effectiveSegments(highlight));

  useEffect(() => {
    setSegments(effectiveSegments(highlight));
  }, [highlight.segments, highlight.trimStart, highlight.trimEnd, clipDuration]);

  const segIdxRef = useRef(0);
  const [exportOpen, setExportOpen] = useState(false);
  const t = useT();

  const onEnter = () => {
    const v = ref.current;
    if (!v) return;
    segIdxRef.current = 0;
    v.currentTime = segments[0]?.start ?? 0;
    v.play().catch(() => {});
  };
  const onLeave = () => {
    const v = ref.current;
    if (!v) return;
    v.pause();
    segIdxRef.current = 0;
    v.currentTime = segments[0]?.start ?? 0;
  };
  const onTime = () => {
    const v = ref.current;
    if (!v || segments.length === 0) return;
    const cur = segments[segIdxRef.current] ?? segments[0];
    if (v.currentTime > cur.end) {
      const nextIdx = (segIdxRef.current + 1) % segments.length;
      segIdxRef.current = nextIdx;
      v.currentTime = segments[nextIdx].start;
    }
  };

  return (
    <div
      className={clsx(
        'rounded-2xl overflow-hidden border backdrop-blur-xl transition-all duration-200 group',
        selected
          ? 'border-fiano-red/55 bg-white/[0.05] shadow-[0_0_0_1px_rgba(255,16,57,0.45),0_0_28px_rgba(255,16,57,0.25),0_4px_24px_rgba(0,0,0,0.35)]'
          : 'border-white/[0.06] bg-white/[0.03] shadow-[0_4px_24px_rgba(0,0,0,0.35)] hover:border-fiano-red/45 hover:shadow-[0_0_0_1px_rgba(255,16,57,0.35),0_0_22px_rgba(255,16,57,0.2),0_8px_32px_rgba(0,0,0,0.5)] hover:-translate-y-0.5',
      )}
    >
      <div
        className="aspect-video bg-black relative flex items-center justify-center cursor-pointer group/preview"
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onClick={onToggle}
        onDoubleClick={(e) => { e.stopPropagation(); onOpenEditor?.(); }}
      >
        {hasClip ? (
          <video
            ref={ref}
            src={mediaUrl(highlight.clipPath)}
            muted
            playsInline
            loop
            preload="metadata"
            className="w-full h-full object-contain bg-black"
            onTimeUpdate={onTime}
          />
        ) : (
          <div className="flex flex-col items-center text-zinc-700 gap-1">
            <div className="text-3xl">⚠</div>
            <div className="text-[10px] text-zinc-500">{t('clipCard.renderFailed')}</div>
          </div>
        )}

        {/* Top-left: Index-Badge */}
        <div className="absolute top-2.5 left-2.5 px-2 py-1 rounded-md bg-black/70 backdrop-blur-md
                        text-[11px] font-medium text-zinc-200 border border-white/[0.08] z-20">
          #{(displayIndex ?? index) + 1}
        </div>
        {/* Top-right: Score-Badge */}
        <div className="absolute top-2.5 right-2.5 px-2 py-1 rounded-md bg-black/70 backdrop-blur-md
                        text-[11px] font-medium text-fiano-red border border-fiano-red/30 z-20
                        flex items-center gap-1">
          <span className="text-[10px]">★</span>
          <span className="font-mono tabular-nums">{highlight.score.toFixed(2)}</span>
        </div>
        {onOpenEditor && hasClip && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenEditor(); }}
            className="absolute bottom-2.5 left-2.5 px-2.5 py-1.5 rounded-md bg-black/70 backdrop-blur-md
                       border border-white/[0.10] text-[11px] text-white font-medium
                       opacity-0 group-hover/preview:opacity-100 hover:bg-black/85 hover:border-white/[0.20]
                       transition z-20"
            title={t('clipCard.openEditor')}
          >
            ✎ {t('clipCard.edit')}
          </button>
        )}
        {selected && (
          <div className="absolute bottom-2.5 right-2.5 w-7 h-7 rounded-full bg-fiano-red text-white
                          flex items-center justify-center shadow-[0_0_14px_rgba(255,16,57,0.55)] z-20">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <path d="M3 8l3 3 7-7" />
            </svg>
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div className="text-[11px] text-zinc-500 font-mono truncate" title={highlight.reason}>
          {highlight.reason}
        </div>

        {hasClip && (
          <SegmentEditor
            duration={clipDuration}
            segments={segments}
            onChange={setSegments}
            onScrub={(t) => {
              if (ref.current) ref.current.currentTime = t;
            }}
            onCommit={(next) => onCommitSegments(next)}
          />
        )}

        <div className="flex gap-2 relative">
          <button
            onClick={onToggle}
            className={clsx(
              'flex-1 text-[12px] font-semibold py-2 rounded-lg transition-all border active:scale-[0.98]',
              selected
                ? 'bg-fiano-red border-fiano-red text-white hover:brightness-110 hover:shadow-[0_0_18px_rgba(255,16,57,0.4)]'
                : 'border-fiano-red/45 text-fiano-red bg-transparent hover:bg-fiano-red/10 hover:border-fiano-red/70',
            )}
          >
            {selected ? '✓ ' + t('clipCard.selected') : t('clipCard.select')}
          </button>

          <button
            onClick={() => setExportOpen((v) => !v)}
            disabled={!hasClip}
            className="text-[12px] font-medium py-2 px-3 rounded-lg
                       border border-white/[0.10] text-zinc-300 bg-transparent
                       hover:bg-white/[0.05] hover:border-white/[0.20] hover:text-white
                       disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent
                       active:scale-[0.98] transition-all"
          >
            {t('clipCard.export')} ▾
          </button>

          {exportOpen && (
            <div
              className="absolute right-0 bottom-full mb-1.5 rounded-xl border border-white/[0.10]
                         bg-fiano-black/95 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.55)] z-30
                         overflow-hidden min-w-[220px] py-1 animate-fade-in"
              onMouseLeave={() => setExportOpen(false)}
            >
              <ExportMenuItem
                label={t('clipCard.exportYouTube')}
                hint="16:9 · 1920×1080"
                onClick={() => { setExportOpen(false); onExport('youtube', segments); }}
              />
              <ExportMenuItem
                label={t('clipCard.exportTikTok')}
                hint="9:16 · center crop"
                onClick={() => { setExportOpen(false); onExport('tiktok', segments); }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExportMenuItem({
  label, hint, onClick,
}: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 hover:bg-white/[0.05] transition block"
    >
      <div className="text-[12px] text-zinc-100 font-medium">{label}</div>
      <div className="text-[10px] text-zinc-500 mt-0.5">{hint}</div>
    </button>
  );
}
