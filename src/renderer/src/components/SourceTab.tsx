import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import type { Project, Highlight } from '@shared/types';
import { mediaUrl } from '../lib/mediaUrl';
import { useApp } from '../stores/appStore';
import { useT } from '../lib/i18n';

/* ─── Time-Formatter ──────────────────────────────────────── */

/** "01:19" — Minuten:Sekunden ohne Decimal (für Total/Duration). */
function fmtMS(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
/** "00:18.2" — Minuten:Sekunden.Zehntel (für Highlight-Times). */
function fmtMSt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const t = Math.floor((sec - Math.floor(sec)) * 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${t}`;
}
/** "3.5.2026, 14:11:17" — Datum-Format wie im Mockup. */
function fmtCreated(timestamp: number): string {
  const d = new Date(timestamp);
  const date = `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return `${date}, ${time}`;
}

/* ─── Root ──────────────────────────────────────────────── */

export function SourceTab({ project }: { project: Project }) {
  const isManual    = project.mode === 'manual';
  const isAuto      = project.mode === 'auto';
  const isReady     = project.status === 'ready';
  const showEditor  = isManual || (isAuto && isReady);
  const t = useT();

  return (
    <div className="space-y-5">
      <InfoCard project={project} />
      {showEditor ? (
        <TwoColumnEditor project={project} />
      ) : (
        <div className="glass p-5 text-[12px] text-zinc-400">
          {t('sourceTab.waitForAnalysis')}{' '}
          (<span className="text-zinc-500">{t('sourceTab.currentStatus')}:</span> <span className="text-zinc-200 font-mono">{project.status}</span>).
        </div>
      )}
    </div>
  );
}

/* ─── Info-Card ─────────────────────────────────────────── */

function InfoCard({ project }: { project: Project }) {
  const isManual = project.mode === 'manual';
  const t = useT();
  const sourceTypeLabel =
    isManual                              ? t('sourceTab.localFile') :
    project.source?.kind === 'file'       ? t('sourceTab.localFile') :
    project.source?.kind === 'url'        ? 'URL' : '—';
  const pathOrUrl =
    isManual ? (project.highlights[0]?.clipPath ?? '—') :
    (project.source?.value ?? '—');

  // Cover-Frame aus dem ersten verfügbaren Clip-Path
  const [coverPath, setCoverPath] = useState<string | null>(null);
  useEffect(() => {
    const candidates = project.highlights.map((h) => h.clipPath).filter((p): p is string => !!p);
    if (candidates.length === 0) { setCoverPath(null); return; }
    let cancelled = false;
    window.api.invoke<{ path: string | null }>('project.getCover', {
      id: project.id, sourcePaths: candidates,
    }).then((r) => { if (!cancelled) setCoverPath(r.ok ? (r.data?.path ?? null) : null); });
    return () => { cancelled = true; };
  }, [project.id, project.highlights]);

  // Duration aus erstem clipPath probieren (kein extra IPC nötig — video-element via ref).
  const [duration, setDuration] = useState<number | null>(null);
  const probeRef = useRef<HTMLVideoElement>(null);
  const probePath = project.highlights.find((h) => h.clipPath)?.clipPath ?? null;
  // Bei manual: Total = Summe aller Clip-Längen. Bei auto: Source-Duration (= probePath geht nicht
  // weil das ein 16:9-Master-Clip ist, nicht das Source-Video).
  const totalDuration = useMemo(() => {
    if (isManual) return project.highlights.reduce((s, h) => s + Math.max(0, h.end - h.start), 0);
    if (duration !== null) return duration;
    // Fallback: max(end) der Highlights — nicht exact aber Plausibel
    return project.highlights.reduce((m, h) => Math.max(m, h.end), 0);
  }, [isManual, duration, project.highlights]);

  return (
    <div className="glass p-5 flex flex-col lg:flex-row gap-5">
      <div className="flex-1 grid grid-cols-3 gap-x-6 gap-y-4">
        <Field label={t('sourceTab.mode')}       value={isManual ? t('sourceTab.modeManual') : t('sourceTab.modeAuto')} />
        <Field label={t('sourceTab.sourceType')} value={sourceTypeLabel} />
        <Field label={t('sourceTab.status')}     value={project.status} highlight={project.status === 'ready'} />
        <Field label={t('sourceTab.name')}       value={project.name} />
        <div className="col-span-2">
          <Field label={sourceTypeLabel === 'URL' ? 'URL' : t('sourceTab.path')} value={pathOrUrl} mono />
        </div>
        <Field label={t('sourceTab.created')}    value={fmtCreated(project.createdAt)} />
        <Field label={t('sourceTab.duration')}   value={totalDuration > 0 ? fmtMS(totalDuration) : '—'} />
        <Field label={t('sourceTab.highlights')} value={String(project.highlights.length)} />
      </div>

      {/* Cover-Standbild + 3-Dot Menu */}
      <div className="w-full lg:w-[280px] aspect-video rounded-xl overflow-hidden bg-black/40 relative shrink-0 ring-1 ring-white/[0.08]">
        {coverPath ? (
          <img src={mediaUrl(coverPath)} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-700">
            <svg viewBox="0 0 64 64" className="w-12 h-12" fill="none" stroke="currentColor"
                 strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="10" y="14" width="44" height="36" rx="3" />
              <path d="M10 22h44" />
              <circle cx="32" cy="32" r="5" fill="currentColor" fillOpacity="0.15" />
            </svg>
          </div>
        )}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); /* TODO: kontext-menu */ }}
          className="absolute top-2 right-2 w-7 h-7 rounded-md bg-black/70 backdrop-blur-md
                     border border-white/[0.08] text-zinc-300 hover:text-white hover:border-white/[0.18]
                     flex items-center justify-center transition z-10"
          title={t('sourceTab.moreOptions')}
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <circle cx="3"  cy="8" r="1.4" />
            <circle cx="8"  cy="8" r="1.4" />
            <circle cx="13" cy="8" r="1.4" />
          </svg>
        </button>
      </div>

      {/* Hidden Video für Duration-Probe (auto-mode mit URL-source: falls highlights[0].clipPath existiert,
          probe das. Sonst keine duration verfügbar — fmt zeigt '—'). */}
      {!isManual && probePath && (
        <video
          ref={probeRef}
          src={mediaUrl(probePath)}
          preload="metadata"
          className="hidden"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || null)}
        />
      )}
    </div>
  );
}

function Field({
  label, value, mono, highlight,
}: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500 mb-1">{label}</div>
      <div className={clsx(
        'text-[12px] truncate',
        highlight ? 'text-emerald-400 font-medium' : 'text-zinc-200',
        mono && 'font-mono break-all',
      )} title={value}>
        {value}
      </div>
    </div>
  );
}

/* ─── 2-Spalten-Editor: Liste + Video+Timeline ──────────── */

function TwoColumnEditor({ project }: { project: Project }) {
  const isManual = project.mode === 'manual';
  const addManualHighlight   = useApp((s) => s.addManualHighlight);
  const getProjectSourcePath = useApp((s) => s.getProjectSourcePath);

  // Video-Source:
  //  Auto-mode: project.source video (download oder local file)
  //  Manual-mode: highlights[0].clipPath als preview (Add ist bei manual-mode disabled)
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  useEffect(() => {
    if (isManual) {
      setSourcePath(project.highlights[0]?.clipPath ?? null);
    } else {
      getProjectSourcePath(project.id).then(setSourcePath);
    }
  }, [project.id, isManual, getProjectSourcePath, project.highlights]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [playhead, setPlayhead] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Click auf Highlight in Liste/Timeline → Playhead springt zum Start
  const seekToHighlight = (idx: number) => {
    const h = project.highlights[idx];
    if (!h) return;
    setSelectedIdx(idx);
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = h.start;
    setPlayhead(h.start);
  };

  const t = useT();

  // + Add Highlight
  const onAddHighlight = async () => {
    if (isManual) {
      window.alert(t('sourceTab.alertManualOnly'));
      return;
    }
    const start = playhead;
    const end = Math.min(duration || start + 5, start + 5);
    if (end - start < 1) {
      window.alert(t('sourceTab.alertNeedRunway'));
      return;
    }
    setBusy(true);
    try {
      await addManualHighlight(project.id, start, end);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
      <HighlightList
        project={project}
        selectedIdx={selectedIdx}
        onSelect={seekToHighlight}
        onAdd={onAddHighlight}
        addBusy={busy}
        addDisabled={isManual}
      />
      {/* Rechte Spalte: sticky beim Scrollen, damit Video + Timeline immer sichtbar bleiben */}
      <div className="lg:sticky lg:top-0 lg:self-start">
        <VideoPanel
          sourcePath={sourcePath}
          videoRef={videoRef}
          playhead={playhead}
          setPlayhead={setPlayhead}
          duration={duration}
          setDuration={setDuration}
          playing={playing}
          setPlaying={setPlaying}
          highlights={project.highlights}
          selectedIdx={selectedIdx}
          onMarkerClick={seekToHighlight}
        />
      </div>
    </div>
  );
}

/* ─── Linke Spalte: Highlight-Liste ─────────────────────── */

function HighlightList({
  project, selectedIdx, onSelect, onAdd, addBusy, addDisabled,
}: {
  project: Project;
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
  onAdd: () => void;
  addBusy: boolean;
  addDisabled: boolean;
}) {
  const deleteHighlight = useApp((s) => s.deleteHighlight);
  const t = useT();

  return (
    <div className="glass p-5 flex flex-col">
      <div className="mb-4 shrink-0">
        <div className="text-[14px] font-semibold text-zinc-100">{t('sourceTab.manualHighlightsTitle')}</div>
        <div className="text-[11px] text-zinc-500 mt-0.5">
          {t('sourceTab.manualHighlightsHint')}
        </div>
      </div>

      <div className="space-y-2.5">
        {project.highlights.length === 0 && (
          <div className="text-[11px] text-zinc-600 italic px-1 py-3">
            {t('sourceTab.noHighlightsHint')}
          </div>
        )}
        {/* Chronologisch sortieren, Original-Index für Backend-Updates behalten. */}
        {project.highlights
          .map((h, i) => ({ h, i }))
          .sort((a, b) => a.h.start - b.h.start)
          .map(({ h, i }) => (
          <HighlightItem
            key={i}
            index={i}
            highlight={h}
            selected={selectedIdx === i}
            rendered={!!h.clipPath}
            onSelect={() => onSelect(i)}
            onDelete={() => {
              if (window.confirm(`${t('sourceTab.deleteHighlightConfirm')} #${i + 1}?`)) {
                deleteHighlight(project.id, i);
              }
            }}
          />
        ))}
      </div>

      <button
        onClick={onAdd}
        disabled={addBusy || addDisabled}
        className={clsx(
          'mt-4 w-full py-3 rounded-lg text-[13px] font-semibold border-2 border-dashed transition-all',
          addDisabled
            ? 'border-white/[0.08] text-zinc-600 cursor-not-allowed'
            : addBusy
              ? 'border-fiano-red/40 text-fiano-red/60 cursor-wait'
              : 'border-fiano-red/45 text-fiano-red hover:bg-fiano-red/[0.08] hover:border-fiano-red/70 active:scale-[0.99]',
        )}
        title={addDisabled ? t('sourceTab.addDisabledHint') : undefined}
      >
        {addBusy ? t('sourceTab.adding') : t('sourceTab.addHighlight')}
      </button>
    </div>
  );
}

function HighlightItem({
  index, highlight, selected, rendered, onSelect, onDelete,
}: {
  index: number;
  highlight: Highlight;
  selected: boolean;
  rendered: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const dur = Math.max(0, highlight.end - highlight.start);
  const t = useT();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      className={clsx(
        'flex items-center gap-3 px-3.5 py-3 rounded-xl cursor-pointer border transition-all duration-200 select-none',
        'backdrop-blur-xl',
        selected
          ? 'border-fiano-red/55 bg-white/[0.06] shadow-[0_0_0_1px_rgba(255,16,57,0.45),0_0_28px_rgba(255,16,57,0.25),0_4px_24px_rgba(0,0,0,0.35)]'
          : 'border-white/[0.06] bg-white/[0.03] shadow-[0_4px_24px_rgba(0,0,0,0.35)] hover:border-fiano-red/40 hover:bg-white/[0.05] hover:shadow-[0_0_0_1px_rgba(255,16,57,0.3),0_0_18px_rgba(255,16,57,0.15),0_6px_28px_rgba(0,0,0,0.45)] hover:-translate-y-px',
      )}
    >
      {/* Drag-handle (visuell — Reorder kommt in eigener Phase) */}
      <span className="text-zinc-600 cursor-grab shrink-0" title={t('sourceTab.dragSoon')}>
        <svg viewBox="0 0 16 16" className="w-3.5 h-4" fill="currentColor">
          <circle cx="6"  cy="3"  r="1" /><circle cx="10" cy="3"  r="1" />
          <circle cx="6"  cy="8"  r="1" /><circle cx="10" cy="8"  r="1" />
          <circle cx="6"  cy="13" r="1" /><circle cx="10" cy="13" r="1" />
        </svg>
      </span>

      {/* Nummer-Badge */}
      <span className="w-6 h-6 rounded-full bg-fiano-red text-white text-[11px] font-bold flex items-center justify-center shrink-0
                       shadow-[0_0_10px_rgba(255,16,57,0.45)]">
        {index + 1}
      </span>

      {/* Times */}
      <span className="text-[12px] font-mono text-zinc-200 tabular-nums shrink-0">{fmtMSt(highlight.start)}</span>
      <span className="text-zinc-600 shrink-0">→</span>
      <span className="text-[12px] font-mono text-zinc-200 tabular-nums shrink-0">{fmtMSt(highlight.end)}</span>
      <span className="flex-1" />
      <span className="text-[12px] font-mono text-zinc-400 tabular-nums shrink-0">{fmtMSt(dur)}</span>

      {/* Edit + Delete */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); /* TODO: edit-modal in eigener Phase */ }}
        className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/[0.08] transition shrink-0"
        title={t('sourceTab.editSoon')}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
          <path d="M11.5 2.5l2 2L6 12 3 13l1-3z" />
        </svg>
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition shrink-0"
        title={t('sourceTab.deleteHighlight')}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
          <path d="M3 4h10 M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1 M6 7v5 M10 7v5 M4 4l1 9a1 1 0 001 1h4a1 1 0 001-1l1-9" />
        </svg>
      </button>

      {/* Rendering indicator wenn clipPath noch nicht da */}
      {!rendered && (
        <span className="text-[9px] font-mono text-amber-400 uppercase tracking-wider shrink-0" title={t('sourceTab.renderingTitle')}>
          {t('sourceTab.rendering')}
        </span>
      )}
    </div>
  );
}

/* ─── Rechte Spalte: Video + Custom Controls + Highlight-Markers Timeline ── */

function VideoPanel({
  sourcePath, videoRef, playhead, setPlayhead, duration, setDuration, playing, setPlaying,
  highlights, selectedIdx, onMarkerClick,
}: {
  sourcePath: string | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  playhead: number;
  setPlayhead: (t: number) => void;
  duration: number;
  setDuration: (d: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  highlights: Highlight[];
  selectedIdx: number | null;
  onMarkerClick: (idx: number) => void;
}) {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const t = useT();

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  };
  const skipBy = (delta: number) => {
    const v = videoRef.current; if (!v) return;
    const next = Math.max(0, Math.min(duration, v.currentTime + delta));
    v.currentTime = next;
    setPlayhead(next);
  };
  const seekFromBar = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current; const v = videoRef.current;
    if (!bar || !v || duration <= 0) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
    setPlayhead(pct * duration);
  };

  if (!sourcePath) {
    return (
      <div className="glass p-5 flex items-center justify-center text-[12px] text-zinc-500 min-h-[460px]">
        {t('sourceTab.sourceNotAvailable')}
      </div>
    );
  }

  const progressPct = duration > 0 ? (playhead / duration) * 100 : 0;

  return (
    <div className={clsx(
      'flex flex-col gap-3',
      expanded && 'fixed inset-0 z-50 bg-fiano-black/95 backdrop-blur-xl p-8',
    )}>
      {/* Video + Custom Controls */}
      <div className="rounded-xl overflow-hidden bg-black ring-1 ring-white/[0.08] relative">
        <video
          ref={videoRef}
          src={mediaUrl(sourcePath)}
          preload="metadata"
          className="w-full aspect-video bg-black"
          onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onClick={togglePlay}
        />

        {/* Expand-Button top-right */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="absolute top-2 right-2 w-7 h-7 rounded-md bg-black/65 backdrop-blur-md
                     border border-white/[0.08] text-zinc-300 hover:text-white hover:border-white/[0.18]
                     flex items-center justify-center transition z-10"
          title={expanded ? t('sourceTab.collapse') : t('sourceTab.expand')}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            {expanded
              ? <path d="M10 2v3h3 M2 10h3v3 M13 13l-4-4 M3 3l4 4" />
              : <path d="M2 6V2h4 M14 6V2h-4 M2 10v4h4 M14 10v4h-4" />}
          </svg>
        </button>

        {/* Custom-Controls Bar */}
        <div className="bg-black/95 border-t border-white/[0.08] px-3 py-2 flex items-center gap-3">
          <button onClick={() => skipBy(-5)}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-300 hover:bg-white/[0.06] transition"
                  title={t('sourceTab.back5s')}>
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
              <path d="M7 3v10l-7-5zM15 3v10l-7-5z" />
            </svg>
          </button>
          <button onClick={togglePlay}
                  className="w-9 h-9 rounded-lg flex items-center justify-center bg-white text-black hover:bg-zinc-100 transition shrink-0"
                  aria-label={playing ? t('sourceTab.pause') : t('sourceTab.play')}>
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
          <button onClick={() => skipBy(5)}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-300 hover:bg-white/[0.06] transition"
                  title={t('sourceTab.forward5s')}>
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
              <path d="M9 3v10l7-5zM1 3v10l7-5z" />
            </svg>
          </button>

          <span className="text-[11px] font-mono text-zinc-400 tabular-nums shrink-0 ml-1">
            {fmtMSt(playhead)} / {fmtMSt(duration)}
          </span>

          {/* Progress Bar */}
          <div ref={progressBarRef} onClick={seekFromBar}
               className="flex-1 h-1.5 rounded-full bg-white/[0.10] cursor-pointer relative group">
            <div className="absolute inset-y-0 left-0 bg-fiano-red rounded-full shadow-[0_0_8px_rgba(255,16,57,0.5)]"
                 style={{ width: `${progressPct}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_8px_rgba(255,16,57,0.6)] border border-fiano-red"
                 style={{ left: `calc(${progressPct}% - 6px)` }} />
          </div>

          {/* CC + Settings (visuell wie Mockup, ohne Funktion für jetzt) */}
          <button className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/[0.06] transition shrink-0"
                  title={t('sourceTab.captionsSoon')}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <rect x="2" y="4" width="12" height="8" rx="1.5" />
              <path d="M5 7.5h2 M5 9.5h2 M9 7.5h2 M9 9.5h2" />
            </svg>
          </button>
          <button className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/[0.06] transition shrink-0"
                  title={t('sourceTab.settingsTitle')}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <circle cx="8" cy="8" r="2" />
              <path d="M8 1.5v2 M8 12.5v2 M14.5 8h-2 M3.5 8h-2 M12.6 3.4l-1.4 1.4 M4.8 11.2l-1.4 1.4 M12.6 12.6l-1.4-1.4 M4.8 4.8L3.4 3.4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Highlight-Markers Timeline mit Pseudo-Waveform */}
      <HighlightTimeline
        duration={duration}
        highlights={highlights}
        selectedIdx={selectedIdx}
        onMarkerClick={onMarkerClick}
        playhead={playhead}
      />
    </div>
  );
}

/* ─── Highlight-Markers-Timeline mit deterministischer Pseudo-Waveform ── */

function HighlightTimeline({
  duration, highlights, selectedIdx, onMarkerClick, playhead,
}: {
  duration: number;
  highlights: Highlight[];
  selectedIdx: number | null;
  onMarkerClick: (idx: number) => void;
  playhead: number;
}) {
  // Deterministische Pseudo-Wave (kein echter Audio-Decode — kosmetisch wie Mockup)
  const bars = useMemo(() => {
    const N = 180;
    const out: number[] = [];
    let seed = 1337;
    for (let i = 0; i < N; i++) {
      // Mulberry32-ish PRNG für stabile bars
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const r = (seed >>> 0) / 0xffffffff;
      // Vary mit niedriger Frequenz für „music"-Look
      const lfo = 0.55 + 0.35 * Math.sin(i / 7);
      out.push(0.18 + r * 0.6 * lfo);
    }
    return out;
  }, []);

  // Time-Marker (max 6 Beschriftungen)
  const ticks = useMemo(() => {
    if (duration <= 0) return [] as Array<{ t: number; pct: number }>;
    const stepCandidates = [5, 10, 15, 30, 60, 120, 300, 600];
    const step = stepCandidates.find((s) => duration / s <= 8) ?? 600;
    const out: Array<{ t: number; pct: number }> = [];
    for (let t = 0; t <= duration + 0.001; t += step) {
      out.push({ t, pct: (t / duration) * 100 });
    }
    return out;
  }, [duration]);

  return (
    <div className="rounded-xl bg-black/30 ring-1 ring-white/[0.06] p-3">
      <div className="relative h-[88px]">
        {/* Pseudo-Waveform */}
        <div className="absolute inset-0 flex items-center gap-[2px] px-1">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 bg-zinc-700/60 rounded-sm"
              style={{ height: `${Math.round(h * 70)}%`, minHeight: 2 }}
            />
          ))}
        </div>

        {/* Highlight-Markers (rote Boxen + Nummern-Badge) */}
        {duration > 0 && highlights.map((h, i) => {
          const left  = Math.max(0, (h.start / duration) * 100);
          const right = Math.min(100, (h.end   / duration) * 100);
          const width = Math.max(1, right - left);
          const isSelected = selectedIdx === i;
          return (
            <button
              key={i}
              onClick={() => onMarkerClick(i)}
              className={clsx(
                'absolute top-3 bottom-3 rounded-md transition-all',
                'border bg-fiano-red/30 hover:bg-fiano-red/45',
                isSelected
                  ? 'border-fiano-red ring-2 ring-fiano-red/55 shadow-[0_0_18px_rgba(255,16,57,0.5)]'
                  : 'border-fiano-red/65',
              )}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`#${i + 1} · ${fmtMSt(h.start)} → ${fmtMSt(h.end)}`}
            >
              {/* Nummer-Badge oben mittig */}
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-fiano-red text-white
                               text-[10px] font-bold flex items-center justify-center shadow-[0_0_10px_rgba(255,16,57,0.6)]">
                {i + 1}
              </span>
            </button>
          );
        })}

        {/* Playhead-Indicator */}
        {duration > 0 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-white/80 pointer-events-none"
            style={{ left: `${(playhead / duration) * 100}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-white" />
          </div>
        )}
      </div>

      {/* Time-Beschriftungen */}
      <div className="relative h-4 mt-1">
        {ticks.map((tk, i) => (
          <span
            key={i}
            className="absolute text-[9px] font-mono text-zinc-600 tabular-nums -translate-x-1/2"
            style={{ left: `${tk.pct}%` }}
          >
            {fmtMS(tk.t)}
          </span>
        ))}
      </div>
    </div>
  );
}
