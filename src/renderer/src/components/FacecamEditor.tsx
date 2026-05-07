import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { FacecamRegion } from '@shared/types';
import { mediaUrl } from '../lib/mediaUrl';

interface Props {
  src?: string;
  facecam: FacecamRegion;
  onChange: (next: FacecamRegion) => void;
  onCommit?: (next: FacecamRegion) => void;
}

const MIN_SIZE = 0.05;

/**
 * Editor zum Positionieren der Facecam-Region IM Master-Clip.
 * - Source als 16:9 Vorschau
 * - Rechteck-Overlay drag-/resizable
 * - Bottom-Right-Handle für Resize
 */
export function FacecamEditor({ src, facecam, onChange, onCommit }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<'move' | 'resize' | null>(null);

  // Aktuelle Werte ringbuffer'd damit onCommit-Closure aktuell ist
  const valsRef = useRef(facecam);
  valsRef.current = facecam;

  const wrapToNorm = (clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: (clientX - r.left) / r.width,
      y: (clientY - r.top) / r.height,
    };
  };

  useEffect(() => {
    if (!drag) return;

    let lastPointer = { x: 0, y: 0 };
    let initial = { ...facecam };
    let initialPointerSet = false;

    const onMove = (e: PointerEvent) => {
      const pos = wrapToNorm(e.clientX, e.clientY);
      if (!initialPointerSet) {
        lastPointer = pos;
        initialPointerSet = true;
        return;
      }
      const dx = pos.x - lastPointer.x;
      const dy = pos.y - lastPointer.y;
      lastPointer = pos;

      if (drag === 'move') {
        const cur = valsRef.current;
        const newX = clamp(cur.x + dx, 0, 1 - cur.width);
        const newY = clamp(cur.y + dy, 0, 1 - cur.height);
        onChange({ ...cur, x: newX, y: newY });
      } else {
        // Resize von BR-Handle: width/height nach unten/rechts
        const cur = valsRef.current;
        const newW = clamp(cur.width + dx, MIN_SIZE, 1 - cur.x);
        const newH = clamp(cur.height + dy, MIN_SIZE, 1 - cur.y);
        onChange({ ...cur, width: newW, height: newH });
      }
    };
    const onUp = () => {
      setDrag(null);
      onCommit?.(valsRef.current);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Snap-Buttons (4 Ecken + Center-Bottom) ──────────────────────────────
  const snap = (preset: 'tl' | 'tr' | 'bl' | 'br' | 'bc') => {
    const w = facecam.width;
    const h = facecam.height;
    let x = 0, y = 0;
    if (preset === 'tl') { x = 0;       y = 0; }
    if (preset === 'tr') { x = 1 - w;   y = 0; }
    if (preset === 'bl') { x = 0;       y = 1 - h; }
    if (preset === 'br') { x = 1 - w;   y = 1 - h; }
    if (preset === 'bc') { x = (1-w)/2; y = 1 - h; }
    const next = { x, y, width: w, height: h };
    onChange(next);
    onCommit?.(next);
  };

  return (
    <div className="space-y-2">
      <div
        ref={wrapRef}
        className="relative aspect-video bg-black rounded overflow-hidden touch-none select-none"
      >
        <video
          src={mediaUrl(src)}
          muted
          playsInline
          loop
          preload="metadata"
          className="w-full h-full object-contain"
          onLoadedData={(e) => { (e.currentTarget as HTMLVideoElement).play().catch(() => {}); }}
        />

        {/* Facecam Rect Overlay */}
        <div
          className={clsx(
            'absolute border-2 border-brand bg-brand/15 cursor-move touch-none',
            drag === 'move' && 'bg-brand/25',
          )}
          style={{
            left: `${facecam.x * 100}%`,
            top: `${facecam.y * 100}%`,
            width: `${facecam.width * 100}%`,
            height: `${facecam.height * 100}%`,
          }}
          onPointerDown={(e) => { e.preventDefault(); setDrag('move'); }}
        >
          <div className="absolute top-0.5 left-0.5 text-[9px] bg-brand text-white px-1 rounded">
            facecam
          </div>
          <div
            className="absolute -bottom-1 -right-1 w-3 h-3 bg-brand rounded-sm cursor-se-resize"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setDrag('resize'); }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
        <span>Snap:</span>
        <button onClick={() => snap('tl')} className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">TL</button>
        <button onClick={() => snap('tr')} className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">TR</button>
        <button onClick={() => snap('bl')} className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">BL</button>
        <button onClick={() => snap('br')} className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">BR</button>
        <button onClick={() => snap('bc')} className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">B-Center</button>
        <span className="ml-auto font-mono">
          {(facecam.width * 100).toFixed(0)}×{(facecam.height * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
