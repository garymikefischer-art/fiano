import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { ClipSegment } from '@shared/types';

interface Props {
  duration: number;
  segments: ClipSegment[];
  onChange: (next: ClipSegment[]) => void;
  onCommit?: (next: ClipSegment[]) => void;
  /** Wird beim Drag gefeuert — Parent kann das Video an die Position seeken. */
  onScrub?: (time: number) => void;
}

const MIN_GAP = 0.5;       // Minimaler Abstand zwischen Handles
const CUT_GAP = 1.5;       // Anfangs-Gap beim "Add Cut" (zur Hälfte vor/nach Mitte)
const MIN_CUTTABLE = 4;    // Segment muss mindestens so lang sein zum Cutten

interface Drag {
  segIdx: number;
  handle: 'start' | 'end';
}

/**
 * Multi-Segment Editor:
 * - Jedes Segment hat 2 Handles (start/end), unabhängig draggable
 * - Cut-Away-Bereiche dunkel
 * - "+ Cut Segment" splittet das größte Segment in der Mitte
 * - Segment kann gelöscht werden (× Button), wenn >1 Segmente
 */
export function SegmentEditor({ duration, segments, onChange, onCommit, onScrub }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const segsRef = useRef(segments);
  segsRef.current = segments;

  const xToTime = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(duration, ((clientX - r.left) / Math.max(r.width, 1)) * duration));
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const t = xToTime(e.clientX);
      const next = [...segsRef.current];
      const constrained = clampHandle(next, drag.segIdx, drag.handle, t, duration);
      next[drag.segIdx] = { ...next[drag.segIdx], [drag.handle]: constrained };
      onChange(next);
      onScrub?.(constrained);
    };
    const onUp = () => {
      setDrag(null);
      onCommit?.(segsRef.current);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, duration, onChange, onCommit, onScrub]);

  const addCut = () => {
    let largestIdx = 0;
    let largestSize = 0;
    for (let i = 0; i < segments.length; i++) {
      const sz = segments[i].end - segments[i].start;
      if (sz > largestSize) { largestSize = sz; largestIdx = i; }
    }
    if (largestSize < MIN_CUTTABLE) return;

    const seg = segments[largestIdx];
    const center = (seg.start + seg.end) / 2;
    const next = [
      ...segments.slice(0, largestIdx),
      { start: seg.start, end: center - CUT_GAP / 2 },
      { start: center + CUT_GAP / 2, end: seg.end },
      ...segments.slice(largestIdx + 1),
    ];
    onChange(next);
    onCommit?.(next);
  };

  const removeSegment = (idx: number) => {
    if (segments.length <= 1) return;
    const next = segments.filter((_, i) => i !== idx);
    onChange(next);
    onCommit?.(next);
  };

  const totalKept = segments.reduce((s, seg) => s + (seg.end - seg.start), 0);

  return (
    <div className="select-none">
      <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono mb-1 px-0.5">
        <span>{segments[0]?.start.toFixed(1) ?? '0.0'}s</span>
        <span className="text-brand">
          {totalKept.toFixed(1)}s · {segments.length} {segments.length === 1 ? 'segment' : 'segments'}
        </span>
        <span>{(segments[segments.length - 1]?.end ?? duration).toFixed(1)}s</span>
      </div>

      <div
        ref={trackRef}
        className="relative h-6 bg-zinc-900 rounded touch-none"
      >
        {/* Cut-Away-Bereiche (dunkel) — alles was NICHT in einem Segment liegt */}
        {renderCutAways(segments, duration)}

        {/* Active Segments + Handles */}
        {segments.map((seg, i) => (
          <SegmentBars
            key={i}
            seg={seg}
            duration={duration}
            isActive={drag?.segIdx === i}
            onDragHandle={(handle) => setDrag({ segIdx: i, handle })}
            onRemove={segments.length > 1 ? () => removeSegment(i) : undefined}
          />
        ))}
      </div>

      <div className="flex items-center justify-between mt-1.5">
        <button
          onClick={addCut}
          disabled={!segments.some((s) => s.end - s.start >= MIN_CUTTABLE)}
          className="text-[10px] text-zinc-300 hover:text-white px-2 py-1 bg-zinc-800/70 hover:bg-zinc-800 rounded disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
        >
          ✂ Cut Segment
        </button>
        {segments.length > 1 && (
          <span className="text-[10px] text-zinc-500">
            tip: × on segment removes it
          </span>
        )}
      </div>
    </div>
  );
}

function renderCutAways(segments: ClipSegment[], duration: number) {
  if (segments.length === 0) return null;
  const blocks: JSX.Element[] = [];
  let last = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s.start > last) {
      blocks.push(
        <div
          key={`cut-${i}`}
          className="absolute inset-y-0 bg-black/50"
          style={{ left: `${(last / duration) * 100}%`, width: `${((s.start - last) / duration) * 100}%` }}
        />,
      );
    }
    last = s.end;
  }
  if (last < duration) {
    blocks.push(
      <div
        key="cut-end"
        className="absolute inset-y-0 bg-black/50"
        style={{ left: `${(last / duration) * 100}%`, right: 0 }}
      />,
    );
  }
  return blocks;
}

function SegmentBars({
  seg, duration, isActive, onDragHandle, onRemove,
}: {
  seg: ClipSegment;
  duration: number;
  isActive: boolean;
  onDragHandle: (h: 'start' | 'end') => void;
  onRemove?: () => void;
}) {
  const startPct = (seg.start / Math.max(duration, 0.01)) * 100;
  const endPct = (seg.end / Math.max(duration, 0.01)) * 100;

  return (
    <>
      <div
        className={clsx('absolute inset-y-0 bg-brand/30', isActive && 'bg-brand/50')}
        style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
      />
      <div
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onDragHandle('start'); }}
        className="absolute top-0 bottom-0 w-2.5 bg-brand cursor-ew-resize -ml-[5px] rounded hover:scale-x-125 transition-transform"
        style={{ left: `${startPct}%` }}
      />
      <div
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onDragHandle('end'); }}
        className="absolute top-0 bottom-0 w-2.5 bg-brand cursor-ew-resize -ml-[5px] rounded hover:scale-x-125 transition-transform"
        style={{ left: `${endPct}%` }}
      />
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute -top-1.5 w-4 h-4 bg-red-500 hover:bg-red-400 text-white text-[10px] rounded-full flex items-center justify-center"
          style={{ left: `calc(${(startPct + endPct) / 2}% - 8px)` }}
          title="Remove segment"
        >
          ×
        </button>
      )}
    </>
  );
}

function clampHandle(
  segments: ClipSegment[],
  i: number,
  handle: 'start' | 'end',
  newValue: number,
  duration: number,
): number {
  let lo = 0;
  let hi = duration;
  const seg = segments[i];
  if (handle === 'start') {
    if (i > 0) lo = segments[i - 1].end + MIN_GAP;
    hi = seg.end - MIN_GAP;
  } else {
    lo = seg.start + MIN_GAP;
    if (i < segments.length - 1) hi = segments[i + 1].start - MIN_GAP;
  }
  return Math.max(lo, Math.min(hi, newValue));
}
