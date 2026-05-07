import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useApp } from '../stores/appStore';
import { ImportDialog } from '../components/ImportDialog';
import { ProjectCard } from '../components/ProjectCard';
import { TopBarActions } from '../components/TopBarActions';
import { useT } from '../lib/i18n';

type SortKey = 'created' | 'updated' | 'name';

function useSortLabels(): Record<SortKey, string> {
  const t = useT();
  return {
    created: t('library.sortCreated'),
    updated: t('library.sortUpdated'),
    name:    t('library.sortName'),
  };
}

const SORT_STORAGE_KEY = 'fiano:library:sortBy';

function readSortPref(): SortKey {
  try {
    const v = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (v === 'created' || v === 'updated' || v === 'name') return v;
  } catch { /* ignore */ }
  return 'created';
}

export function LibraryPage() {
  const projects = useApp((s) => s.projects);
  const hasApiKey = useApp((s) => s.hasApiKey);
  const binaries = useApp((s) => s.binaries);
  const [importing, setImporting] = useState(false);
  const [sortBy, setSortByState] = useState<SortKey>(readSortPref);
  const t = useT();

  const setSortBy = (k: SortKey) => {
    try { window.localStorage.setItem(SORT_STORAGE_KEY, k); } catch {}
    setSortByState(k);
  };

  const missingBins = binaries.filter((b) => !b.path);
  const totalHighlights = projects.reduce((sum, p) => sum + p.highlights.length, 0);

  // Sortierte Kopie. Default: created DESC.
  const sortedProjects = useMemo(() => {
    const arr = [...projects];
    if (sortBy === 'name') {
      arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    } else if (sortBy === 'updated') {
      arr.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
    } else {
      arr.sort((a, b) => b.createdAt - a.createdAt);
    }
    return arr;
  }, [projects, sortBy]);

  return (
    <div className="relative h-full flex flex-col bg-fiano-black overflow-hidden">
      {/* ─── Smooth Background-Glow (pure CSS, kein image/canvas) ──── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="fiano-bg-tint" />
        <div className="fiano-bg-glow" />
      </div>

      {/* Content über den Orbs */}
      <div className="relative h-full flex flex-col">
      {/* ─── Top Bar: glas-header mit prominenter Typo + roter Akzent ─── */}
      <header className="relative shrink-0 border-b border-white/[0.06] bg-fiano-black/80 backdrop-blur-xl">
        {/* Subtile rote Glow-Linie unten — gibt dem Header Charakter */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-fiano-red/30 to-transparent" />

        <div className="flex items-center justify-between gap-6 px-8 py-4">
          <div className="flex items-baseline gap-3 shrink-0">
            <h1 className="text-[20px] font-semibold tracking-tight">{t('library.title')}</h1>
            <span className="text-[11px] font-mono text-zinc-600">
              {projects.length} {projects.length === 1 ? t('library.projectSingular') : t('library.projectPlural')}
              {totalHighlights > 0 && <> · {totalHighlights} {t('library.clipsLabel')}</>}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <TopBarActions searchPlaceholder={t('library.searchPlaceholder')} />
            <button
              onClick={() => setImporting(true)}
              className="group flex items-center gap-2 bg-fiano-red text-white text-[12px] font-semibold
                         px-4 py-2 rounded-lg
                         hover:brightness-110 hover:shadow-[0_0_24px_rgba(255,16,57,0.45)]
                         active:scale-[0.97] transition-all"
            >
              <PlusIcon />
              {t('library.newVideo')}
            </button>
          </div>
        </div>
      </header>

      {(!hasApiKey || missingBins.length > 0) && (
        <SetupBanner missingBins={missingBins.map((b) => b.name)} hasApiKey={hasApiKey} />
      )}

      <div className="flex-1 px-8 py-7 overflow-y-auto">
        {projects.length === 0 ? (
          <EmptyState onAdd={() => setImporting(true)} />
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="text-[11px] text-zinc-500">
                {t('library.showing')} <span className="text-zinc-300 font-medium">{sortedProjects.length}</span>{' '}
                {sortedProjects.length === 1 ? t('library.projectSingular') : t('library.projectPlural')}
              </div>
              <SortDropdown value={sortBy} onChange={setSortBy} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {sortedProjects.map((p) => <ProjectCard key={p.id} project={p} />)}
            </div>
          </>
        )}
      </div>

      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2"
         strokeLinecap="round" className="w-3.5 h-3.5 transition-transform group-hover:rotate-90 duration-300">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function SetupBanner({ hasApiKey, missingBins }: { hasApiKey: boolean; missingBins: string[] }) {
  const t = useT();
  return (
    <div className="mx-8 mt-5 px-4 py-3 rounded-xl bg-amber-950/20 border border-amber-900/40 flex items-start gap-3">
      <svg viewBox="0 0 20 20" className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" fill="currentColor">
        <path d="M10 2 1 18h18zm0 5v5m0 2v.5" stroke="#090b0c" strokeWidth="1" strokeLinecap="round" />
      </svg>
      <div className="flex-1 space-y-0.5">
        <div className="text-[12px] font-semibold text-amber-200">{t('library.setupRequired')}</div>
        <div className="text-[11px] text-amber-100/70">
          {!hasApiKey && <>{t('library.setupNoApiKey')} </>}
          {missingBins.length > 0 && (
            <>{t('library.setupMissingTools')} <span className="font-mono">{missingBins.join(', ')}</span></>
          )}
        </div>
      </div>
      <Link
        to="/settings"
        className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-amber-500 text-black hover:bg-amber-400 transition"
      >
        {t('library.openSettings')}
      </Link>
    </div>
  );
}

function SortDropdown({
  value, onChange,
}: { value: SortKey; onChange: (k: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const labels = useSortLabels();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all',
          open
            ? 'bg-white/[0.07] border-white/[0.18] text-white'
            : 'bg-white/[0.03] border-white/[0.08] text-zinc-300 hover:bg-white/[0.06] hover:border-white/[0.14] hover:text-white',
        )}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-zinc-500">
          <path d="M3 5h10 M5 8h6 M7 11h2" />
        </svg>
        <span>{t('library.sortLabel')}: <span className="text-white">{labels[value]}</span></span>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
             className={clsx('w-3 h-3 transition-transform', open && 'rotate-180')}>
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 rounded-xl border border-white/[0.10]
                        bg-fiano-black/95 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.55)] z-30
                        py-1.5 animate-fade-in">
          {(['created', 'updated', 'name'] as SortKey[]).map((k) => (
            <button
              key={k}
              onMouseDown={(e) => { e.preventDefault(); onChange(k); setOpen(false); }}
              className={clsx(
                'w-full text-left flex items-center justify-between gap-2 px-3 py-2 text-[12px] transition-colors',
                value === k
                  ? 'text-white bg-white/[0.05]'
                  : 'text-zinc-300 hover:bg-white/[0.04] hover:text-white',
              )}
            >
              <span>{labels[k]}</span>
              {value === k && (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-fiano-red">
                  <path d="M3 8l3 3 7-7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const t = useT();
  return (
    <div className="h-full flex items-center justify-center">
      <button
        onClick={onAdd}
        className="group flex flex-col items-center gap-3 p-14 rounded-2xl
                   border border-dashed border-white/[0.08]
                   hover:border-fiano-red/50 hover:bg-fiano-red/[0.03]
                   transition-all"
      >
        <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06]
                        flex items-center justify-center group-hover:bg-fiano-red/10 group-hover:border-fiano-red/40 transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
               strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-zinc-500 group-hover:text-fiano-red transition-colors">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </div>
        <div className="space-y-1 text-center">
          <div className="text-[13px] font-semibold text-zinc-200">{t('library.emptyTitle')}</div>
          <div className="text-[11px] text-zinc-500">{t('library.emptyHint')}</div>
        </div>
      </button>
    </div>
  );
}
