import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { GameplayRegion } from '@shared/types';
import { mediaUrl } from '../lib/mediaUrl';

interface Props {
  src?: string;
  gameplay: GameplayRegion;
  onChange: (next: GameplayRegion) => void;
  onCommit?: (next: GameplayRegion) => void;
}

const MIN_SIZE = 0.05;

/**
 * Gameplay-Region Editor — analog zu FacecamEditor, aber visuell andere Farbe (cyan).
 * Definiert welcher Bereich des Source-Frames als "Gameplay" extrahiert wird.
 * Default {0, 0, 1, 1} = ganzes Frame (no-op).
 */
export function GameplayEditor({ src, gameplay, onChange, onCommit }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<'move' | 'resize' | null>(null);
  const valsRef = useRef(gameplay);
  valsRef.current = gameplay;

  useEffect(() => {
    if (!drag) return;
    let lastNorm = { x: 0, y: 0 };
    let firstMove = true;
    const toNorm = (e: PointerEvent) => {
      const el = wrapRef.current;
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    const onMove = (e: PointerEvent) => {
      const p = toNorm(e);
      if (firstMove) { lastNorm = p; firstMove = false; return; }
      const dx = p.x - lastNorm.x;
      const dy = p.y - lastNorm.y;
      lastNorm = p;
      const cur = valsRef.current;
      let next: GameplayRegion;
      if (drag === 'move') {
        next = {
          ...cur,
          x: clamp(cur.x + dx, 0, 1 - cur.width),
          y: clamp(cur.y + dy, 0, 1 - cur.height),
        };
      } else {
        next = {
          ...cur,
          width:  clamp(cur.width + dx,  MIN_SIZE, 1 - cur.x),
          height: clamp(cur.height + dy, MIN_SIZE, 1 - cur.y),
        };
      }
      onChange(next);
    };
    const onUp = () => { setDrag(null); onCommit?.(valsRef.current); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    const next = { x: 0, y: 0, width: 1, height: 1 };
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
          muted playsInline loop preload="metadata"
          className="w-full h-full object-contain"
          onLoadedData={(e) => { (e.currentTarget as HTMLVideoElement).play().catch(() => {}); }}
        />
        <div
          className={clsx(
            'absolute border-2 border-cyan-400 bg-cyan-400/15 cursor-move touch-none',
            drag === 'move' && 'bg-cyan-400/25',
          )}
          style={{
            left:   `${gameplay.x * 100}%`,
            top:    `${gameplay.y * 100}%`,
            width:  `${gameplay.width * 100}%`,
            height: `${gameplay.height * 100}%`,
          }}
          onPointerDown={(e) => { e.preventDefault(); setDrag('move'); }}
        >
          <div className="absolute top-0.5 left-0.5 text-[9px] bg-cyan-400 text-black px-1 rounded font-medium">
            gameplay
          </div>
          <div
            className="absolute -bottom-1 -right-1 w-3 h-3 bg-cyan-400 rounded-sm cursor-se-resize"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setDrag('resize'); }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
        <button onClick={reset} className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">Reset (full)</button>
        <span className="ml-auto font-mono">
          {(gameplay.width * 100).toFixed(0)}×{(gameplay.height * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
