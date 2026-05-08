import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import type { Highlight, Project, ProjectVoiceOver } from '@shared/types';
import { effectiveSegments } from '@shared/types';
import { useApp } from '../stores/appStore';
import { MusicSection, resolveActiveMusic } from './sections/MusicSection';
import { IntroSection } from './sections/IntroSection';
import { VoiceOversSection } from './sections/VoiceOversSection';
import { mediaUrl } from '../lib/mediaUrl';
import { useT } from '../lib/i18n';
import { ExportSettingsDialog, defaultExportSettings, type ExportSettings } from './ExportSettingsDialog';

interface Props {
  project: Project;
  selected: Set<number>;
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ─── Builder-Item Datenmodell ──────────────────────────────────── */

type BuilderItem =
  | { kind: 'highlight'; id: string; highlightIdx: number }
  | { kind: 'inter';     id: string; path: string };

let interIdCounter = 0;
const newInterId = () => `inter-${Date.now()}-${++interIdCounter}`;

/* ─── BuilderTab ────────────────────────────────────────────────── */

export function BuilderTab({ project, selected }: Props) {
  return <BuilderEntry project={project} selected={selected} />;
}

function BuilderEntry({ project, selected }: Props) {
  const t = useT();
  if (selected.size === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06]
                          flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7l9-4 9 4-9 4-9-4z" />
              <path d="M3 12l9 4 9-4 M3 17l9 4 9-4" />
            </svg>
          </div>
          <div className="text-[14px] font-semibold text-zinc-200 mb-1.5">{t('builder.noClipsTitle')}</div>
          <div className="text-[11px] text-zinc-500 leading-relaxed">
            {t('builder.noClipsHintPre')} <span className="text-zinc-300 font-medium">{t('builder.noClipsHintTab')}</span> {t('builder.noClipsHintPost')}
          </div>
        </div>
      </div>
    );
  }

  return <BuilderWorkspace project={project} selected={selected} />;
}

function BuilderWorkspace({ project, selected }: Props) {
  const { buildVideo, pickIntroFile } = useApp();
  const [busy, setBusy] = useState(false);
  const t = useT();

  // Initialer Items-State aus selected (ordered insertion order)
  const initialItems: BuilderItem[] = useMemo(
    () =>
      [...selected]
        .filter((idx) => !!project.highlights[idx]?.clipPath)
        .map((idx) => ({ kind: 'highlight' as const, id: `h-${idx}`, highlightIdx: idx })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected],
  );

  const [items, setItems] = useState<BuilderItem[]>(initialItems);

  // Wenn selected sich ändert (User wechselt zu Highlights und ändert Auswahl) → re-init
  // Inter-Clips bleiben erhalten — werden aber neu eingereiht
  useEffect(() => {
    setItems((prev) => {
      const inters = prev.filter((it) => it.kind === 'inter');
      const newHighlights = initialItems;
      // Inter-Clips zwischen die new highlights mergen — pragmatic: alle inters ans Ende
      return [...newHighlights, ...inters];
    });
  }, [initialItems]);

  const [activeIdx, setActiveIdx] = useState<number>(0);
  const activeItem = items[activeIdx];

  const totalSec = items.reduce((sum, it) => {
    if (it.kind === 'highlight') {
      const h = project.highlights[it.highlightIdx];
      return sum + (h ? effectiveSegments(h).reduce((a, s) => a + (s.end - s.start), 0) : 0);
    }
    // Inter-Clip: Dauer unbekannt zur Zeit, schätzen ~10s
    return sum + 10;
  }, 0);

  const onAddInterClip = async () => {
    const picked = await pickIntroFile();
    if (picked) {
      setItems((prev) => [...prev, { kind: 'inter', id: newInterId(), path: picked }]);
    }
  };

  const onRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    if (activeIdx >= items.length - 1) setActiveIdx(Math.max(0, items.length - 2));
  };

  const onReorder = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    // Active-Index nachziehen
    setActiveIdx((cur) => {
      if (cur === fromIdx) return toIdx;
      if (fromIdx < cur && toIdx >= cur) return cur - 1;
      if (fromIdx > cur && toIdx <= cur) return cur + 1;
      return cur;
    });
  };

  // Phase 9.2: Export-Settings-Dialog mit Resolution/FPS/Bitrate/Encoder.
  // Default-Werte aus appDefaults.builderExport (persistiert in user-data) +
  // appDefaults.qualityMode für Encoder-Mode.
  const [showQualityDialog, setShowQualityDialog] = useState(false);
  const builderDefaults = useApp((s) => s.appDefaults.builderExport);
  const defaultQualityMode = useApp((s) => s.appDefaults.qualityMode ?? 'fast');
  const [exportSettings, setExportSettings] = useState<ExportSettings>(() => ({
    ...defaultExportSettings('youtube'),
    ...(builderDefaults ?? {}),
    qualityMode: defaultQualityMode,
  }));
  useEffect(() => {
    setExportSettings({
      ...defaultExportSettings('youtube'),
      ...(builderDefaults ?? {}),
      qualityMode: defaultQualityMode,
    });
  }, [builderDefaults, defaultQualityMode]);

  const onBuild = () => {
    if (busy) return;
    if (items.length === 0) return;
    setShowQualityDialog(true);
  };

  const runBuild = async () => {
    setShowQualityDialog(false);
    setBusy(true);
    try {
      const builderClips = items.map((it) => {
        if (it.kind === 'highlight') {
          const h = project.highlights[it.highlightIdx];
          return { master: h.clipPath!, segments: effectiveSegments(h) };
        }
        // Inter-Clip — komplettes Video (segments[0..9999] = bis Ende)
        return { master: it.path, segments: [{ start: 0, end: 9999 }] };
      });
      const name = `${project.name}-build-16x9.mp4`.replace(/[^\w\-.]/g, '_');
      await buildVideo(project.id, name, builderClips, {
        format: 'youtube',
        intro: project.intro,
        music: resolveActiveMusic(project),
        qualityMode: exportSettings.qualityMode,
        exportQuality: {
          width: exportSettings.width,
          height: exportSettings.height,
          fps: exportSettings.fps,
          bitrate: exportSettings.bitrate,
        },
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 min-w-0">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">{t('builder.title')}</h2>
        <p className="text-[11px] text-zinc-500 mt-1">{t('builder.subtitle')}</p>
      </div>

      {/* Cards-Strip mit Drag-Reorder + Add-Inter */}
      <BuildOrderStrip
        project={project}
        items={items}
        activeIdx={activeIdx}
        onSelect={setActiveIdx}
        onReorder={onReorder}
        onRemove={onRemoveItem}
        onAddInter={onAddInterClip}
        totalSec={totalSec}
      />

      {/* Big Preview Player — spielt alle Items hintereinander wie das fertige Build-Video */}
      {items.length > 0 ? (
        <BuilderPreviewArea
          project={project}
          items={items}
          activeIdx={activeIdx}
          onActiveIdxChange={setActiveIdx}
          getHighlight={(i) => project.highlights[i]}
        />
      ) : (
        <div className="glass p-12 text-center text-[12px] text-zinc-500">
          {t('builder.addToPreview')}
        </div>
      )}

      {/* Intro + Music UNTER Preview (statt nebeneinander) */}
      <div className="glass p-5">
        <IntroSection project={project} />
      </div>
      <div className="glass p-5">
        <MusicSection project={project} />
      </div>
      <div className="glass p-5">
        <VoiceOversSection project={project} totalDurationHint={totalSec} />
      </div>

      {/* Build CTA */}
      <div className="glass p-4">
        <button
          onClick={onBuild}
          disabled={busy || items.length === 0}
          className="w-full bg-fiano-red text-white py-3.5 rounded-xl font-semibold
                     hover:brightness-110 hover:shadow-[0_0_28px_rgba(255,16,57,0.5)]
                     active:scale-[0.99] disabled:opacity-50 transition-all
                     text-[13px] flex items-center justify-center gap-2"
        >
          {busy ? <><Spinner /> {t('builder.rendering')}</> : <><BuildIcon /> {t('builder.buildBtn')}</>}
        </button>
        <p className="text-[10px] text-zinc-600 text-center mt-2">
          {items.length} {items.length === 1 ? t('builder.itemSingular') : t('builder.itemPlural')} · {fmtDuration(totalSec)} · {t('builder.renderInBackground')}
        </p>
      </div>

      {/* Phase 9.2: Export-Settings-Dialog (Resolution/FPS/Bitrate/Encoder) */}
      {showQualityDialog && (
        <ExportSettingsDialog
          format="youtube"
          settings={exportSettings}
          onChange={setExportSettings}
          onCancel={() => setShowQualityDialog(false)}
          onConfirm={runBuild}
        />
      )}

    </div>
  );
}

/* ─── Voice-Over Audio Sync (Builder) ───────────────────────────
   Spielt ein Voice-Over wenn globalTime >= startSec.
   Audio-Position = globalTime - startSec.
*/
function BuilderVoiceOverAudio({
  voiceOver, globalTime, playing,
}: {
  voiceOver: ProjectVoiceOver;
  globalTime: number;
  playing: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = Math.max(0, Math.min(1, voiceOver.volume ?? 1));
    const offset = globalTime - voiceOver.startSec;
    if (playing && offset >= 0 && offset < (a.duration || 1e9)) {
      if (Math.abs(a.currentTime - offset) > 0.3) a.currentTime = offset;
      if (a.paused) a.play().catch(() => {});
    } else {
      if (!a.paused) a.pause();
      if (offset < 0) a.currentTime = 0;
    }
  }, [globalTime, playing, voiceOver.startSec, voiceOver.volume]);

  return <audio ref={audioRef} src={mediaUrl(voiceOver.path)} preload="auto" className="hidden" />;
}

/* ─── Cards-Strip with Drag-Reorder ────────────────────────────── */

function BuildOrderStrip({
  project, items, activeIdx, onSelect, onReorder, onRemove, onAddInter, totalSec,
}: {
  project: Project;
  items: BuilderItem[];
  activeIdx: number;
  onSelect: (i: number) => void;
  onReorder: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onAddInter: () => void;
  totalSec: number;
}) {
  const [dragOver, setDragOver] = useState<number | null>(null);
  const t = useT();

  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          {t('builder.buildOrder')} · {items.length}
        </div>
        <div className="text-[10px] font-mono text-zinc-500">
          {fmtDuration(totalSec)}
        </div>
      </div>

      {/* Strip-Layout wie TikTokTab: explizite Spacer-Divs statt -mx/px-Trick.
          Verhindert Glow-Clipping der ersten/letzten Card. py-5 = 20px Vertikal-Puffer. */}
      <div className="flex gap-4 overflow-x-auto overflow-y-visible py-5 snap-x scroll-pl-2">
        <div className="shrink-0 w-4" aria-hidden />
        {items.map((it, i) => (
          <div key={it.id} className="shrink-0 flex flex-col items-center">
            <BuilderClipCard
              project={project}
              item={it}
              position={i}
              isActive={i === activeIdx}
              isDragOver={dragOver === i}
              onClick={() => onSelect(i)}
              onRemove={() => onRemove(it.id)}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', String(i));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOver(i);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
                if (!isNaN(from)) onReorder(from, i);
                setDragOver(null);
              }}
            />
          </div>
        ))}

        {/* Add Video Card */}
        <button
          onClick={onAddInter}
          className="shrink-0 w-[180px] aspect-video rounded-xl border border-dashed border-white/[0.12]
                     hover:border-fiano-red/50 hover:bg-fiano-red/[0.04] transition-all
                     flex flex-col items-center justify-center gap-2 self-start mt-[26px]"
          title={t('builder.insertVideoTitle')}
        >
          <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06]
                          flex items-center justify-center transition-colors">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </div>
          <div className="text-[11px] font-semibold text-zinc-400">{t('builder.addVideo')}</div>
          <div className="text-[9px] text-zinc-600">{t('builder.addVideoHint')}</div>
        </button>
        <div className="shrink-0 w-4" aria-hidden />
      </div>
    </div>
  );
}

function BuilderClipCard({
  project, item, position, isActive, isDragOver,
  onClick, onRemove, onDragStart, onDragOver, onDragLeave, onDrop,
}: {
  project: Project;
  item: BuilderItem;
  position: number;
  isActive: boolean;
  isDragOver: boolean;
  onClick: () => void;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const isInter = item.kind === 'inter';
  const highlight = item.kind === 'highlight' ? project.highlights[item.highlightIdx] : null;
  const videoSrc = isInter ? item.path : highlight?.clipPath;
  const segments = highlight ? effectiveSegments(highlight) : [];
  const dur = isInter ? null : segments.reduce((a, s) => a + (s.end - s.start), 0);
  const reasonShort = highlight
    ? (highlight.reason ?? '').replace(/^[A-Z]+:\s*/, '').slice(0, 28)
    : (item.kind === 'inter' ? item.path.split('/').pop() ?? 'transition' : 'clip');
  const [hover, setHover] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const t = useT();

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (hover && segments.length > 0) {
      v.currentTime = segments[0]?.start ?? 0;
      v.play().catch(() => {});
    } else if (hover) {
      v.play().catch(() => {});
    } else {
      v.pause();
      if (segments.length > 0) v.currentTime = segments[0]?.start ?? 0;
      else v.currentTime = 0;
    }
  }, [hover, segments]);

  return (
    <div
      draggable
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={clsx(
        'group relative w-[230px] rounded-xl overflow-hidden text-left transition-all duration-200 snap-start cursor-pointer',
        isActive
          ? 'ring-2 ring-fiano-red shadow-[0_0_28px_rgba(255,16,57,0.35)]'
          : isInter
            ? 'ring-1 ring-amber-500/30 hover:ring-amber-500/50'
            : 'ring-1 ring-white/[0.06] hover:ring-white/[0.16] hover:-translate-y-0.5',
        isDragOver && 'scale-[1.02] ring-fiano-red/60',
      )}
    >
      <div className="relative aspect-video bg-black/60 overflow-hidden">
        {videoSrc ? (
          <video
            ref={videoRef}
            src={mediaUrl(videoSrc)}
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

        {/* Position-Badge top-left */}
        <div className={clsx(
          'absolute top-2 left-2 w-7 h-7 rounded-lg text-[12px] font-bold flex items-center justify-center',
          isInter
            ? 'bg-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.45)]'
            : 'bg-fiano-red text-white shadow-[0_0_12px_rgba(255,16,57,0.5)]',
        )}>
          {position + 1}
        </div>

        {/* Video-Tag oder Duration */}
        {isInter ? (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/90 text-black backdrop-blur-sm">
            {t('builder.videoBadge')}
          </div>
        ) : (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/70 text-white backdrop-blur-sm">
            {fmtDuration(dur ?? 0)}
          </div>
        )}

        {/* Remove-Button — bei Inter-Clips immer sichtbar, sonst on Hover */}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className={clsx(
            'absolute bottom-2 right-2 w-7 h-7 rounded-md backdrop-blur-sm transition-all flex items-center justify-center',
            'bg-black/70 hover:bg-fiano-red text-white',
            isInter ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
          title={t('builder.removeFromOrder')}
        >
          <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M2 2l8 8 M10 2L2 10" />
          </svg>
        </button>

        {/* Drag-Handle Indicator */}
        <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2
                        opacity-0 group-hover:opacity-30 pointer-events-none transition-opacity">
          <svg viewBox="0 0 16 16" className="w-5 h-5 text-white" fill="currentColor">
            <circle cx="5" cy="4" r="1" />
            <circle cx="5" cy="8" r="1" />
            <circle cx="5" cy="12" r="1" />
            <circle cx="11" cy="4" r="1" />
            <circle cx="11" cy="8" r="1" />
            <circle cx="11" cy="12" r="1" />
          </svg>
        </div>
      </div>

      <div className="p-3 bg-white/[0.04] border-t border-white/[0.06]">
        <div className={clsx(
          'text-[12px] font-medium truncate',
          isActive ? 'text-white' : 'text-zinc-200',
        )}>
          {reasonShort || `Item ${position + 1}`}
        </div>
        <div className="text-[10px] text-zinc-500 mt-0.5 font-mono">
          {isInter ? 'Transition video' : `${segments.length} ${segments.length === 1 ? 'segment' : 'segments'}`}
        </div>
      </div>
    </div>
  );
}

/* ─── BuilderPreviewArea — sequenzieller Build-Preview ──────────
   Spielt alle Items in der aktuellen Order hintereinander wie das
   finale Build-Video. Bei video-end → automatisch zum nächsten Item.
*/
function BuilderPreviewArea({
  project, items, activeIdx, onActiveIdxChange, getHighlight,
}: {
  project: Project;
  items: BuilderItem[];
  activeIdx: number;
  onActiveIdxChange: (i: number) => void;
  getHighlight: (i: number) => Highlight | undefined;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [localTime, setLocalTime] = useState(0);
  /** Cache für inter-Item Durations (highlights wir wissen aus segments) */
  const [interDurations, setInterDurations] = useState<Record<string, number>>({});

  const activeItem = items[activeIdx];
  const isInter = activeItem?.kind === 'inter';
  const highlight = activeItem?.kind === 'highlight' ? getHighlight(activeItem.highlightIdx) : null;
  const videoSrc = isInter
    ? (activeItem as Extract<BuilderItem, { kind: 'inter' }>).path
    : highlight?.clipPath;

  // Segments für Highlight (bestimmt start/end im video)
  const segments = highlight ? effectiveSegments(highlight) : [];
  const segStart = segments[0]?.start ?? 0;
  const segEnd = segments[0]?.end ?? Infinity;

  // Item Duration helper
  const itemDuration = (it: BuilderItem | undefined): number => {
    if (!it) return 0;
    if (it.kind === 'highlight') {
      const h = getHighlight(it.highlightIdx);
      return h ? effectiveSegments(h).reduce((a, s) => a + (s.end - s.start), 0) : 0;
    }
    return interDurations[it.id] ?? 10;
  };
  const totalDuration = items.reduce((sum, it) => sum + itemDuration(it), 0);
  const previousDuration = items.slice(0, activeIdx).reduce((sum, it) => sum + itemDuration(it), 0);
  const globalTime = previousDuration + localTime;

  // Time-Update + Seg-End check
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      const t = v.currentTime;
      // local-time relativ zum start des aktuellen items
      const local = isInter ? t : Math.max(0, t - segStart);
      setLocalTime(local);
      // Highlight: wenn segment ende erreicht → next item
      if (!isInter && t >= segEnd - 0.05) {
        nextItem();
      }
    };
    const onMeta = () => {
      // Inter-Clip duration cache
      if (isInter && activeItem && v.duration) {
        setInterDurations((prev) => ({ ...prev, [activeItem.id]: v.duration }));
      }
    };
    const onPlay = () => setPlaying(true);
    const onPauseEvt = () => setPlaying(false);
    const onEnded = () => nextItem();

    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPauseEvt);
    v.addEventListener('ended', onEnded);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPauseEvt);
      v.removeEventListener('ended', onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItem, isInter, segStart, segEnd]);

  const nextItem = () => {
    if (activeIdx < items.length - 1) {
      onActiveIdxChange(activeIdx + 1);
    } else {
      videoRef.current?.pause();
    }
  };

  // Auto-Play beim Item-Wechsel — bei Highlight zum segment-start
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tryPlay = () => {
      v.currentTime = isInter ? 0 : segStart;
      v.play().catch(() => {});
    };
    if (v.readyState >= 2) tryPlay();
    else v.addEventListener('loadeddata', tryPlay, { once: true });
    return () => v.removeEventListener('loadeddata', tryPlay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSrc, activeIdx]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const skipBy = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    if (delta > 0 && activeIdx < items.length - 1 && v.currentTime + delta > (isInter ? v.duration : segEnd)) {
      // Springt über Item-Grenze nach vorn
      onActiveIdxChange(activeIdx + 1);
      return;
    }
    if (delta < 0 && activeIdx > 0 && v.currentTime + delta < (isInter ? 0 : segStart)) {
      // Springt zurück ins vorherige Item
      onActiveIdxChange(activeIdx - 1);
      return;
    }
    v.currentTime = Math.max(isInter ? 0 : segStart,
      Math.min(isInter ? v.duration : segEnd, v.currentTime + delta));
  };

  const t = useT();

  // Klick auf globale Progress-Bar → finde Item + lokale Zeit
  const seekToGlobal = (e: React.MouseEvent<HTMLDivElement>) => {
    if (totalDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetGlobal = pct * totalDuration;
    let acc = 0;
    for (let i = 0; i < items.length; i++) {
      const dur = itemDuration(items[i]);
      if (targetGlobal < acc + dur || i === items.length - 1) {
        const localT = targetGlobal - acc;
        if (i !== activeIdx) {
          onActiveIdxChange(i);
          // currentTime wird im neuen useEffect gesetzt — hier already in tryPlay
          // wir setzen lokale-zeit-target für späteren load
          setTimeout(() => {
            const v = videoRef.current;
            if (!v) return;
            const it = items[i];
            const offset = it.kind === 'highlight'
              ? (effectiveSegments(getHighlight(it.highlightIdx)!)[0]?.start ?? 0)
              : 0;
            v.currentTime = offset + localT;
          }, 50);
        } else {
          const v = videoRef.current;
          if (v) v.currentTime = (isInter ? 0 : segStart) + localT;
        }
        return;
      }
      acc += dur;
    }
  };

  const itemLabel = isInter
    ? `${t('builder.videoBadge')} #${activeIdx + 1}`
    : `${t('builder.clipLabel')} #${activeIdx + 1}: ${highlight?.reason ?? t('builder.untitled')}`;

  return (
    <div className="glass p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[12px] truncate">
          <span className="text-zinc-500 font-mono">{activeIdx + 1}/{items.length}</span>
          {isInter && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[9px] font-bold uppercase tracking-wider">
              {t('builder.videoBadge')}
            </span>
          )}
          <span className="text-zinc-200 font-medium truncate">{itemLabel}</span>
        </div>
        <div className="text-[10px] text-zinc-500 font-mono shrink-0">
          {fmtTime(globalTime)} / {fmtTime(totalDuration)}
        </div>
      </div>

      <div className="rounded-xl overflow-hidden bg-black ring-1 ring-white/[0.06]">
        {videoSrc ? (
          <video
            ref={videoRef}
            src={mediaUrl(videoSrc)}
            preload="metadata"
            className="w-full aspect-video bg-black"
            onClick={togglePlay}
          />
        ) : (
          <div className="w-full aspect-video flex items-center justify-center text-zinc-600 bg-black">
            {t('builder.noPreview')}
          </div>
        )}
      </div>

      {/* Voice-Over Audio-Player — sync mit globalTime (Position in Builds gesamten Output) */}
      {(project.voiceOvers ?? []).map((vo, i) => (
        <BuilderVoiceOverAudio key={`vo-${i}-${vo.path}`} voiceOver={vo} globalTime={globalTime} playing={playing} />
      ))}

      {/* Custom Controls — global progress über alle items */}
      <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-black/40 border border-white/[0.06]">
        <button
          onClick={() => skipBy(-5)}
          className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-300 hover:bg-white/[0.06] transition"
          aria-label={t('builder.back5s')}
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
            <path d="M7 3v10l-7-5zM15 3v10l-7-5z" />
          </svg>
        </button>
        <button
          onClick={togglePlay}
          className="w-9 h-9 rounded-lg flex items-center justify-center bg-fiano-red text-white shadow-[0_0_16px_rgba(255,16,57,0.4)] hover:brightness-110 transition"
          aria-label={playing ? t('builder.pause') : t('builder.play')}
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
          aria-label={t('builder.forward5s')}
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
          aria-label={muted ? t('common.unmute') : t('common.mute')}
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
          {fmtTime(globalTime)}
        </span>
        {/* Globale Progress-Bar mit Item-Trennstrichen */}
        <div
          onClick={seekToGlobal}
          className="flex-1 h-1.5 rounded-full bg-white/[0.08] cursor-pointer relative"
        >
          <div
            className="absolute inset-y-0 left-0 bg-fiano-red rounded-full shadow-[0_0_6px_rgba(255,16,57,0.5)]"
            style={{ width: `${totalDuration > 0 ? (globalTime / totalDuration) * 100 : 0}%` }}
          />
          {/* Item-Trennstriche */}
          {items.slice(0, -1).map((_, i) => {
            const acc = items.slice(0, i + 1).reduce((s, it) => s + itemDuration(it), 0);
            const pct = totalDuration > 0 ? (acc / totalDuration) * 100 : 0;
            return (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-px bg-white/30"
                style={{ left: `${pct}%` }}
              />
            );
          })}
        </div>
        <span className="text-[10px] font-mono text-zinc-500 tabular-nums shrink-0">
          {fmtTime(totalDuration)}
        </span>
      </div>
    </div>
  );
}

/* ─── Icons ──────────────────────────────────────────────────── */

function BuildIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8l3 3 7-7" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round">
      <path d="M8 1.5a6.5 6.5 0 1 1-6.5 6.5" />
    </svg>
  );
}
