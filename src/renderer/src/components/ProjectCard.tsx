import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import type { Project } from '@shared/types';
import { useApp } from '../stores/appStore';
import { mediaUrl } from '../lib/mediaUrl';
import { useT } from '../lib/i18n';

// In-Memory-Cache für Cover-URLs (überlebt Card-Re-Renders, nicht App-Neustart).
// Verhindert dass jeder Card-Mount erneut den IPC-Call ausführt.
const coverCache = new Map<string, string | null>();

function useStatusLabels(): Record<Project['status'], string> {
  const t = useT();
  return {
    created:    t('projectCard.statusCreated'),
    analyzing:  t('projectCard.statusAnalyzing'),
    ready:      t('projectCard.statusReady'),
    error:      t('projectCard.statusError'),
  };
}

const statusColor: Record<Project['status'], string> = {
  created:    'text-zinc-400',
  analyzing:  'text-fiano-red',
  ready:      'text-emerald-400',
  error:      'text-red-400',
};

/** Mockup-Format: "Today · 14:32" / "Yesterday · 18:41" / "May 01 · 19:05" */
function formatCardDate(timestamp: number, t: (key: string) => string): string {
  const d = new Date(timestamp);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (sameDay)     return `${t('home.today')} · ${time}`;
  if (isYesterday) return `${t('home.yesterday')} · ${time}`;
  const month = d.toLocaleString('en-US', { month: 'short' });
  const day = String(d.getDate()).padStart(2, '0');
  return `${month} ${day} · ${time}`;
}

export function ProjectCard({ project }: { project: Project }) {
  const { startAnalysis, deleteProject, renameProject, currentJob } = useApp();
  const confirmDelete = useApp((s) => s.appDefaults.confirmDelete ?? true);
  const isActive  = currentJob?.projectId === project.id;
  const isManual  = project.mode === 'manual';
  const isError   = project.status === 'error';
  const isAnalyzing = project.status === 'analyzing' || isActive;
  const t = useT();
  const statusLabel = useStatusLabels();

  const clipsCount = project.highlights.length;

  // ─── 3-Dot-Menu + Rename-Inline-Edit State ──────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = () => {
    setRenameValue(project.name);
    setRenaming(true);
    setMenuOpen(false);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };
  const commitRename = async () => {
    const v = renameValue.trim();
    if (!v || v === project.name) { setRenaming(false); setRenameValue(project.name); return; }
    setRenaming(false);
    await renameProject(project.id, v);
  };
  const cancelRename = () => {
    setRenaming(false);
    setRenameValue(project.name);
  };

  // Cover-Standbild: erstes Highlight-clipPath als Source. Lazy aus Main extrahiert + gecached.
  const [coverPath, setCoverPath] = useState<string | null>(coverCache.get(project.id) ?? null);
  useEffect(() => {
    if (coverCache.has(project.id)) return;  // schon angefragt
    const candidates = project.highlights.map((h) => h.clipPath).filter((p): p is string => !!p);
    if (candidates.length === 0) {
      coverCache.set(project.id, null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await window.api.invoke<{ path: string | null }>('project.getCover', {
          id: project.id,
          sourcePaths: candidates,
        });
        if (cancelled) return;
        const p = res.ok ? (res.data?.path ?? null) : null;
        coverCache.set(project.id, p);
        setCoverPath(p);
      } catch {
        coverCache.set(project.id, null);
      }
    })();
    return () => { cancelled = true; };
  }, [project.id, project.highlights]);
  const statusText = isActive
    ? `${currentJob.step} · ${Math.round(currentJob.percent)}%`
    : statusLabel[project.status];

  return (
    <div
      className="rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.03]
                 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.35)]
                 transition-all duration-200
                 hover:border-fiano-red/55 hover:shadow-[0_0_0_1px_rgba(255,16,57,0.45),0_0_28px_rgba(255,16,57,0.25),0_8px_32px_rgba(0,0,0,0.5)]
                 hover:-translate-y-0.5 group"
    >
      {/* ─── Thumbnail-Frame ──────────────────────────── */}
      <Link to={`/project/${project.id}`} className="block">
        <div className="aspect-video bg-black/40 flex items-center justify-center relative overflow-hidden">
          {/* Cover-Standbild (FFmpeg-extrahiertes Frame aus erstem Highlight) — sonst SVG-Fallback */}
          {coverPath ? (
            <img
              src={mediaUrl(coverPath)}
              alt={project.name}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              draggable={false}
            />
          ) : (
            <ProjectThumbnail project={project} />
          )}

          {/* Subtler Dark-Gradient unten für Lesbarkeit der Badges (nur bei Cover) */}
          {coverPath && (
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/30 z-[1] pointer-events-none" />
          )}

          {/* Subtiles diagonal-Light-Sweep auf Hover */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none
                          bg-gradient-to-br from-white/[0.04] via-transparent to-fiano-red/[0.06] z-10" />

          {/* Top-left Badge: "X clips" */}
          <div className="absolute top-2.5 left-2.5 px-2 py-1 rounded-md bg-black/70 backdrop-blur-md
                          text-[11px] font-medium text-zinc-200 border border-white/[0.08] z-20">
            {clipsCount} {clipsCount === 1 ? t('projectCard.clipSingular') : t('projectCard.clipPlural')}
          </div>

          {/* Top-right: 3-Dot Menu */}
          <div className="absolute top-2.5 right-2.5 z-20">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen((o) => !o); }}
              onBlur={() => setTimeout(() => setMenuOpen(false), 130)}
              className={clsx(
                'w-7 h-7 rounded-md bg-black/70 backdrop-blur-md border flex items-center justify-center transition',
                menuOpen
                  ? 'border-fiano-red/55 text-white'
                  : 'border-white/[0.08] text-zinc-300 hover:text-white hover:border-white/[0.18]',
              )}
              title={t('projectCard.moreOptions')}
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <circle cx="3"  cy="8" r="1.4" />
                <circle cx="8"  cy="8" r="1.4" />
                <circle cx="13" cy="8" r="1.4" />
              </svg>
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 w-44 rounded-xl border border-white/[0.10]
                           bg-fiano-black/95 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.55)]
                           py-1 animate-fade-in"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              >
                <button
                  onMouseDown={(e) => { e.preventDefault(); startRename(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-zinc-200
                             hover:bg-white/[0.05] hover:text-white transition text-left"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-zinc-500">
                    <path d="M11.5 2.5l2 2L6 12 3 13l1-3z" />
                  </svg>
                  {t('projectCard.rename')}
                </button>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setMenuOpen(false);
                    if (!confirmDelete || window.confirm(`${t('projectCard.deleteConfirm')} „${project.name}"?\n${t('projectCard.deleteConfirmHint')}`)) {
                      deleteProject(project.id);
                    }
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-zinc-200
                             hover:bg-red-500/10 hover:text-red-300 transition text-left"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-zinc-500">
                    <path d="M3 4h10 M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1 M6 7v5 M10 7v5 M4 4l1 9a1 1 0 001 1h4a1 1 0 001-1l1-9" />
                  </svg>
                  {t('projectCard.delete')}
                </button>
              </div>
            )}
          </div>

          {/* Analysis Progressbar */}
          {isActive && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-fiano-red/30 z-20">
              <div
                className="h-full bg-fiano-red shadow-[0_0_12px_rgba(255,16,57,0.6)] transition-all"
                style={{ width: `${currentJob.percent}%` }}
              />
            </div>
          )}
        </div>
      </Link>

      {/* ─── Card-Body ────────────────────────────────── */}
      <div className="px-4 pt-3.5 pb-4 space-y-3">
        <div className="space-y-0.5">
          {renaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
              }}
              className="w-full px-2 py-1 -mx-2 -my-1 rounded-md bg-white/[0.04] border border-fiano-red/55
                         text-[14px] font-semibold tracking-tight text-zinc-50
                         focus:outline-none focus:border-fiano-red focus:bg-white/[0.06]
                         focus:shadow-[0_0_0_1px_rgba(255,16,57,0.4),0_0_18px_rgba(255,16,57,0.18)]"
              spellCheck={false}
              maxLength={120}
            />
          ) : (
            <div className="font-semibold truncate text-[14px] tracking-tight text-zinc-50" title={project.name}>
              {project.name}
            </div>
          )}
          <div className="text-[11px] text-zinc-500 font-medium">
            {formatCardDate(project.createdAt, t)}
          </div>
        </div>

        <div className="space-y-1">
          <div className={clsx('text-[12px] font-semibold', statusColor[project.status])}>
            {statusText}
          </div>
          {!isManual && project.status === 'ready' && (
            <div className="text-[11px] text-zinc-500">
              {clipsCount} {t('projectCard.highlightsDetected')}
            </div>
          )}
          {isManual && (
            <div className="text-[11px] text-zinc-500">
              {clipsCount} {clipsCount === 1 ? t('projectCard.clipSingular') : t('projectCard.clipPlural')} · {t('projectCard.manual')}
            </div>
          )}
          {isError && project.errorMessage && (
            <div className="text-[11px] text-red-400/90 line-clamp-2">{project.errorMessage}</div>
          )}
        </div>

        {/* Open — primärer Button (full width, rot) */}
        <Link
          to={`/project/${project.id}`}
          className="block w-full text-center text-[12px] font-semibold py-2.5 rounded-lg
                     bg-fiano-red text-white
                     hover:brightness-110 hover:shadow-[0_0_20px_rgba(255,16,57,0.45)]
                     active:scale-[0.98] transition-all"
        >
          {t('projectCard.open')}
        </Link>

        {/* Re-analyze + Delete — outline-Style, halb-halb */}
        <div className="flex gap-2">
          {!isManual ? (
            <button
              onClick={() => startAnalysis(project.id)}
              disabled={!!currentJob || isAnalyzing}
              className="flex-1 text-[12px] font-semibold py-2 rounded-lg
                         border border-fiano-red/45 text-fiano-red bg-transparent
                         hover:bg-fiano-red/10 hover:border-fiano-red/70
                         active:scale-[0.98] disabled:opacity-40 disabled:hover:bg-transparent
                         transition-all"
            >
              {project.status === 'ready' ? t('projectCard.reanalyze') : isError ? t('projectCard.retry') : t('projectCard.analyze')}
            </button>
          ) : (
            <span aria-hidden className="flex-1" />
          )}
          <button
            onClick={() => deleteProject(project.id)}
            className="flex-1 text-[12px] font-medium py-2 rounded-lg
                       border border-white/[0.10] text-zinc-300 bg-transparent
                       hover:bg-white/[0.05] hover:border-white/[0.20] hover:text-white
                       active:scale-[0.98] transition-all"
          >
            {t('projectCard.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Thumbnail-Visual: dezente Iconographie pro Mode (kein Cover-Image). */
function ProjectThumbnail({ project }: { project: Project }) {
  const isManual = project.mode === 'manual';
  const isUrl = project.source?.kind === 'url';
  return (
    <div className="text-zinc-700 group-hover:text-zinc-500 transition-colors">
      <svg viewBox="0 0 64 64" className="w-14 h-14" fill="none" stroke="currentColor"
           strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        {isManual ? (
          <>
            <path d="M8 18l24-10 24 10v28L32 56 8 46z" />
            <path d="M8 18l24 10 24-10" />
            <path d="M32 28v28" />
          </>
        ) : isUrl ? (
          <>
            <path d="M22 32a8 8 0 0 1 8-8h6a8 8 0 0 1 0 16h-3" />
            <path d="M42 32a8 8 0 0 1-8 8h-6a8 8 0 0 1 0-16h3" />
          </>
        ) : (
          <>
            <rect x="10" y="14" width="44" height="36" rx="3" />
            <path d="M10 22h44 M10 42h44 M22 14v36 M42 14v36" />
            <circle cx="32" cy="32" r="5" fill="currentColor" fillOpacity="0.15" />
          </>
        )}
      </svg>
    </div>
  );
}
