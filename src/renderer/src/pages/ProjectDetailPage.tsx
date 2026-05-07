import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { useApp } from '../stores/appStore';
import { SourceTab } from '../components/SourceTab';
import { ClipsTab } from '../components/ClipsTab';
import { TikTokTab } from '../components/TikTokTab';
import { BuilderTab } from '../components/BuilderTab';
import { EditorTab } from '../components/EditorTab';
import { TopBarActions } from '../components/TopBarActions';
import { RightRailContext } from '../components/RightRailContext';
import * as sounds from '../lib/sounds';
import { useT } from '../lib/i18n';

type Tab = 'clips' | 'manual' | 'tiktok' | 'builder' | 'editor';

function useTabLabels(): Record<Tab, string> {
  const t = useT();
  return {
    clips:   t('projectDetail.tabHighlights'),
    manual:  t('projectDetail.tabManual'),
    tiktok:  t('projectDetail.tabTikTok'),
    builder: t('projectDetail.tabBuilder'),
    editor:  t('projectDetail.tabEdit'),
  };
}

const TAB_ORDER: Tab[] = ['clips', 'manual', 'tiktok', 'builder', 'editor'];

/** Legacy URL-Param compat: alter `?tab=source` → `manual`. */
function normalizeTab(t: string | null): Tab {
  if (t === 'source') return 'manual';
  if (t && (TAB_ORDER as string[]).includes(t)) return t as Tab;
  return 'clips';
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const project = useApp((s) => s.projects.find((p) => p.id === id));
  const location = useLocation();
  const navigate = useNavigate();

  // Tab direkt aus URL ableiten (statt via useState + useEffect-Sync) — so reagieren wir
  // garantiert auch auf reine Query-String-Änderungen aus der Sidebar (gleicher pathname).
  const tab = useMemo<Tab>(
    () => normalizeTab(new URLSearchParams(location.search).get('tab')),
    [location.search],
  );
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Sound beim Project-Open (einmal pro mount für eine Project-ID)
  // Plus: zuletzt-besuchtes Project tracken für Sidebar-Context-Routing
  const setLastVisitedProject = useApp((s) => s.setLastVisitedProject);
  useEffect(() => {
    if (project) {
      try { sounds.projectOpen(); } catch {}
      setLastVisitedProject(project.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const setTab = (t: Tab) => {
    navigate({ search: `?tab=${t}` }, { replace: true });
  };

  if (!project) {
    return <ProjectNotFound />;
  }

  const autoCount = project.highlights.filter((h) => h.origin !== 'manual').length;
  const manualCount = project.highlights.filter((h) => h.origin === 'manual').length;
  const showRail = tab === 'tiktok';
  const [railEl, setRailEl] = useState<HTMLElement | null>(null);
  const tabLabels = useTabLabels();
  const t = useT();

  // Background-Glow nur in den 4 „Card"-Tabs, nicht im Editor (eigenes voll-flächiges Layout).
  const showBgGlow = tab !== 'editor';

  return (
    <RightRailContext.Provider value={showRail ? railEl : null}>
    <div className="h-full flex bg-fiano-black animate-fade-in relative overflow-hidden">
    {/* ─── Smooth Background-Glow (1:1 zur Library-Page) ──────────── */}
    {showBgGlow && (
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="fiano-bg-tint" />
        <div className="fiano-bg-glow" />
      </div>
    )}
    <div className="relative h-full flex flex-col flex-1 min-w-0">
      {/* ─── Header (sticky) ───────────────────────────────────────── */}
      <header className="relative shrink-0 px-8 pt-6 pb-0 bg-fiano-black/85 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="flex items-center justify-between gap-6 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/projects"
              className="w-7 h-7 rounded-lg flex items-center justify-center
                         text-zinc-500 hover:text-white hover:bg-white/[0.06] transition shrink-0"
              aria-label="Back to library"
            >
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 12L6 8l4-4" />
              </svg>
            </Link>
            <h1 className="text-[20px] font-semibold tracking-tight">{t('projectDetail.headerClips')}</h1>
            <span className="text-[10px] font-bold leading-none px-2 py-1 rounded-md
                            bg-fiano-red text-white shadow-[0_0_14px_rgba(255,16,57,0.45)]">
              {project.highlights.length}
            </span>
            <span className="text-[12px] text-zinc-500 font-medium ml-2 truncate min-w-0">
              · {project.name}
            </span>
          </div>

          <div className="shrink-0">
            <TopBarActions />
          </div>
        </div>

        {/* Tabs — rote underline für aktiv, dezent für inaktiv */}
        <nav className="flex items-center gap-1 -mb-px">
          {TAB_ORDER.map((tk) => (
            <button
              key={tk}
              onClick={() => setTab(tk)}
              className={clsx(
                'relative px-4 py-2.5 text-[12px] font-medium transition-colors',
                tab === tk ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {tabLabels[tk]}
              {tab === tk && (
                <span
                  className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-fiano-red
                             shadow-[0_0_8px_rgba(255,16,57,0.7)]"
                  aria-hidden
                />
              )}
            </button>
          ))}
        </nav>
      </header>

      {/* ─── Tab Content — Editor hat eigenes vollflächiges Layout ─
           overflow-x-visible explicit (overflow-y-auto allein würde per CSS-Spec auch x clippen) — damit Card-Glow nicht abgeschnitten wird */}
      <div className={clsx(
        'flex-1 overflow-hidden',
        tab === 'editor' ? '' : 'overflow-y-auto overflow-x-visible px-8 py-7',
      )}>
        {tab === 'manual'  && <SourceTab project={project} />}
        {tab === 'clips'   && (
          <ClipsTab project={project} selected={selected} setSelected={setSelected}
                    onJumpToBuilder={() => setTab('builder')} />
        )}
        {tab === 'tiktok'  && <TikTokTab project={project} />}
        {tab === 'builder' && <BuilderTab project={project} selected={selected} />}
        {tab === 'editor'  && <EditorTab project={project} />}
      </div>

      {/* ─── Bottom Action Bar (kosmetische Project-Info) ──────────── */}
      <BottomBar
        projectName={project.name}
        sourceLabel={
          project.mode === 'manual'
            ? t('projectDetail.manualCollection')
            : project.source?.value ?? '—'
        }
        autoCount={autoCount}
        manualCount={manualCount}
      />
    </div>
    {/* Right-Rail Slot (full-height) — wird vom aktiven Tab via Portal gefüllt */}
    {showRail && (
      <div
        ref={setRailEl}
        className="w-[360px] flex-shrink-0 border-l border-white/[0.06] bg-fiano-black flex flex-col min-h-0"
      />
    )}
    </div>
    </RightRailContext.Provider>
  );
}

interface BottomBarProps {
  projectName: string;
  sourceLabel: string;
  autoCount: number;
  manualCount: number;
}

function BottomBar({ projectName, sourceLabel, autoCount, manualCount }: BottomBarProps) {
  const total = autoCount + manualCount;
  const t = useT();
  return (
    <div className="shrink-0 h-[68px] border-t border-white/[0.06] bg-fiano-black/85 backdrop-blur-xl px-8 flex items-center">
      <div className="grid grid-cols-3 gap-4 items-center w-full">
        <InfoCell
          icon={<IconFolder />}
          label={t('projectDetail.bottomProject')}
          value={projectName}
          mono={false}
        />
        <InfoCell
          icon={<IconSource />}
          label={t('projectDetail.bottomSource')}
          value={sourceLabel}
          mono
        />
        <InfoCell
          icon={<IconHighlights />}
          label={t('projectDetail.bottomHighlightsFound')}
          value={`${total}`}
          subValue={`${autoCount} ${t('projectDetail.autoLabel')} · ${manualCount} ${t('projectDetail.manualLabel')}`}
        />
      </div>
    </div>
  );
}

function ProjectNotFound() {
  const t = useT();
  return (
    <div className="p-8 text-zinc-500">
      {t('projectDetail.notFound')} <Link to="/projects" className="text-fiano-red hover:brightness-110">{t('projectDetail.backToLibrary')}</Link>
    </div>
  );
}

function InfoCell({
  icon, label, value, subValue, mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06]
                      flex items-center justify-center text-zinc-400 shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-600 leading-tight">
          {label}
        </div>
        <div className={clsx(
          'text-[12px] text-white leading-tight truncate',
          mono ? 'font-mono' : 'font-medium',
        )}>
          {value}
        </div>
        {subValue && (
          <div className="text-[10px] text-zinc-500 mt-0.5">{subValue}</div>
        )}
      </div>
    </div>
  );
}

/* ─── Bottom-Bar Icons ─────────────────────────────────────────── */
function IconFolder() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}
function IconSource() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconHighlights() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M12 3v3 M5 6l2 2 M19 6l-2 2 M3 12h3 M21 12h-3 M5 18l2-2 M19 18l-2-2 M12 21v-3" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}
