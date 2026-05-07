import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import type { Project } from '@shared/types';
import { useApp } from '../stores/appStore';
import { ImportDialog } from '../components/ImportDialog';
import { TopBarActions } from '../components/TopBarActions';
import { FianoLogo } from '../components/FianoLogo';
import { mediaUrl } from '../lib/mediaUrl';
import { useT } from '../lib/i18n';

/**
 * Home / Landing-Page nach Mockup:
 * - Hero (Heading + Description + 2 CTAs + App-Mockup-Visual)
 * - Feature-Cards-Row (5 Cards)
 * - Recent Projects (4 echte Cards + "+ New Project" Empty)
 */
export function HomePage() {
  const projects = useApp((s) => s.projects);
  const [importing, setImporting] = useState(false);
  const recentProjects = projects.slice(0, 4);
  const t = useT();

  return (
    <div className="relative h-full flex flex-col bg-fiano-black overflow-hidden">
      {/* Background-Glow (CSS-only, smooth) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="fiano-bg-tint" />
        <div className="fiano-bg-glow" />
      </div>

      <div className="relative h-full flex flex-col">
        {/* Top Bar (Search/Notif/Avatar rechts) */}
        <header className="relative shrink-0">
          <div className="flex items-center justify-end px-8 py-4">
            <TopBarActions searchPlaceholder={t('topBar.searchPlaceholder')} />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
        </header>

        <div className="flex-1 px-8 py-7 overflow-y-auto space-y-7">
          <HeroSection onAdd={() => setImporting(true)} />
          <FeatureCardsRow onAdd={() => setImporting(true)} />
          <RecentProjects projects={recentProjects} onAdd={() => setImporting(true)} />
        </div>
      </div>

      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

/* ─── Hero ──────────────────────────────────────────────────── */

function HeroSection({ onAdd }: { onAdd: () => void }) {
  const t = useT();
  return (
    <div className="relative glass overflow-hidden p-8 md:p-10
                    grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-8 items-center">
      {/* Decorative red glow top-right */}
      <div
        className="absolute -top-20 -right-10 w-[480px] h-[480px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(255,16,57,0.32) 0%, transparent 60%)',
          filter: 'blur(40px)',
        }}
      />

      {/* Left: copy + CTAs */}
      <div className="relative space-y-5 max-w-md">
        <h1 className="text-[40px] font-bold leading-[1.05] tracking-tight">
          {t('home.heroLine1')}<br />
          <span className="text-fiano-red">{t('home.heroLine2Highlight')}</span> {t('home.heroLine2Rest')}
        </h1>
        <p className="text-[14px] text-zinc-400 leading-relaxed">
          {t('home.heroDescription')}
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            onClick={onAdd}
            className="bg-fiano-red text-white text-[12px] font-semibold px-5 py-3 rounded-lg
                       hover:brightness-110 hover:shadow-[0_0_28px_rgba(255,16,57,0.45)]
                       active:scale-[0.97] transition-all flex items-center gap-2"
          >
            <PlusIcon /> {t('home.newProject')}
          </button>
          <button
            onClick={onAdd}
            className="bg-white/[0.04] border border-white/[0.08] text-white text-[12px] font-semibold
                       px-5 py-3 rounded-lg hover:bg-white/[0.08] hover:border-white/[0.15]
                       active:scale-[0.98] transition-all flex items-center gap-2"
          >
            <ImportIcon /> {t('home.importVideo')}
          </button>
        </div>
      </div>

      {/* Right: App-Mockup-Visual */}
      <div className="relative">
        <AppMockup />
      </div>
    </div>
  );
}

function AppMockup() {
  return (
    <div className="relative aspect-[16/10] rounded-2xl overflow-hidden ring-1 ring-white/[0.1]
                    shadow-[0_20px_60px_rgba(0,0,0,0.5),0_0_60px_rgba(255,16,57,0.18)]">
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-fiano-black to-zinc-900" />

      {/* Fake titlebar */}
      <div className="relative px-3 py-2.5 flex items-center gap-2 border-b border-white/[0.06] bg-black/50 backdrop-blur-sm">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
        </div>
        <div className="ml-3 text-[9px] text-zinc-600 font-mono">Clips · fiano</div>
      </div>

      {/* App Layout: sidebar | center | right panel */}
      <div className="relative grid grid-cols-[18%_55%_27%] h-[calc(100%-32px)]">
        {/* Sidebar */}
        <div className="border-r border-white/[0.06] p-3 space-y-3">
          <FianoLogo className="h-3 w-auto opacity-70" />
          <div className="space-y-1.5 pt-2">
            <div className="h-1.5 bg-fiano-red/70 rounded w-3/4" />
            <div className="h-1.5 bg-white/[0.08] rounded w-2/3" />
            <div className="h-1.5 bg-white/[0.06] rounded w-3/4" />
            <div className="h-1.5 bg-white/[0.06] rounded w-1/2" />
          </div>
          <div className="pt-2 space-y-1">
            <div className="h-1 bg-white/[0.04] rounded w-full" />
            <div className="h-1 bg-white/[0.04] rounded w-2/3" />
            <div className="h-1 bg-white/[0.04] rounded w-3/4" />
          </div>
        </div>

        {/* Center: Video Preview */}
        <div className="p-3 flex flex-col gap-2">
          {/* Cards-Strip mock */}
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={clsx(
                  'aspect-video flex-1 rounded-md',
                  i === 0
                    ? 'bg-gradient-to-br from-fiano-red/30 to-fiano-red/10 ring-1 ring-fiano-red'
                    : 'bg-white/[0.04]',
                )}
              />
            ))}
          </div>
          {/* Player */}
          <div className="aspect-video rounded-md bg-gradient-to-br from-zinc-800 to-zinc-900
                          ring-1 ring-white/[0.06] flex items-center justify-center relative">
            <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 ml-0.5 text-white/80" fill="currentColor">
                <path d="M3.5 3v10l10-5z" />
              </svg>
            </div>
            {/* Roter Progress am unteren Rand */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/[0.08]">
              <div className="h-full bg-fiano-red w-2/5 shadow-[0_0_4px_rgba(255,16,57,0.6)]" />
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="border-l border-white/[0.06] p-3 space-y-2">
          <div className="flex gap-2 mb-1">
            <div className="h-1.5 bg-fiano-red rounded w-1/4" />
            <div className="h-1.5 bg-white/[0.06] rounded w-1/4" />
            <div className="h-1.5 bg-white/[0.06] rounded w-1/4" />
          </div>
          <div className="space-y-1.5 pt-1">
            <div className="h-2 bg-white/[0.06] rounded w-full" />
            <div className="grid grid-cols-2 gap-1">
              <div className="h-3 bg-white/[0.04] rounded" />
              <div className="h-3 bg-white/[0.06] ring-1 ring-fiano-red/30 rounded" />
            </div>
            <div className="h-1 bg-white/[0.04] rounded w-1/2" />
            <div className="h-2 bg-white/[0.04] rounded w-full" />
            <div className="h-1 bg-fiano-red/60 rounded w-1/3" />
          </div>
        </div>
      </div>

      {/* Roter Top-Glow */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-fiano-red to-transparent" />
    </div>
  );
}

/* ─── Feature Cards Row ─────────────────────────────────────── */

function FeatureCardsRow({ onAdd }: { onAdd: () => void }) {
  const t = useT();
  const cards: FeatureCardData[] = [
    {
      gradient: 'from-fuchsia-500/20 to-purple-500/10',
      iconBg: 'bg-fuchsia-500/15',
      iconColor: 'text-fuchsia-400',
      icon: <SparkleIcon />,
      title: t('home.featureAiHighlights'),
      description: t('home.featureAiHighlightsDesc'),
      action: t('home.featureAiHighlightsAction'),
      onClick: onAdd,
    },
    {
      gradient: 'from-blue-500/20 to-sky-500/10',
      iconBg: 'bg-blue-500/15',
      iconColor: 'text-blue-400',
      icon: <CCIcon />,
      title: t('home.featureSubtitles'),
      description: t('home.featureSubtitlesDesc'),
      action: t('home.featureSubtitlesAction'),
      onClick: onAdd,
    },
    {
      gradient: 'from-amber-500/20 to-orange-500/10',
      iconBg: 'bg-amber-500/15',
      iconColor: 'text-amber-400',
      icon: <EffectsIcon />,
      title: t('home.featureEffects'),
      description: t('home.featureEffectsDesc'),
      action: t('home.featureEffectsAction'),
      onClick: onAdd,
    },
    {
      gradient: 'from-pink-500/20 to-fiano-red/10',
      iconBg: 'bg-pink-500/15',
      iconColor: 'text-pink-400',
      icon: <MusicNoteIcon />,
      title: t('home.featureMusic'),
      description: t('home.featureMusicDesc'),
      action: t('home.featureMusicAction'),
      onClick: onAdd,
    },
    {
      gradient: 'from-emerald-500/20 to-teal-500/10',
      iconBg: 'bg-emerald-500/15',
      iconColor: 'text-emerald-400',
      icon: <ExportIcon />,
      title: t('home.featureExport'),
      description: t('home.featureExportDesc'),
      action: t('home.featureExportAction'),
      onClick: onAdd,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((c, i) => (
        <FeatureCard key={i} {...c} />
      ))}
    </div>
  );
}

interface FeatureCardData {
  gradient: string;
  iconBg: string;
  iconColor: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
}

function FeatureCard({ gradient, iconBg, iconColor, icon, title, description, action, onClick }: FeatureCardData) {
  return (
    <div className={clsx(
      'glass glass-hover relative overflow-hidden p-5 group',
      'flex flex-col gap-4 cursor-pointer',
    )}
      onClick={onClick}
    >
      {/* Gradient Wash */}
      <div className={clsx('absolute inset-0 bg-gradient-to-br pointer-events-none opacity-60', gradient)} />

      <div className="relative flex flex-col gap-3 flex-1">
        <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center', iconBg, iconColor)}>
          {icon}
        </div>
        <div className="space-y-1">
          <h3 className="text-[14px] font-semibold tracking-tight">{title}</h3>
          <p className="text-[11px] text-zinc-400 leading-relaxed">{description}</p>
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="relative w-full flex items-center justify-between text-[11px] font-medium
                   px-3 py-2 rounded-lg bg-fiano-red text-white
                   hover:brightness-110 hover:shadow-[0_0_18px_rgba(255,16,57,0.4)]
                   active:scale-[0.98] transition-all"
      >
        <span>{action}</span>
        <ArrowRightIcon />
      </button>
    </div>
  );
}

/* ─── Recent Projects ───────────────────────────────────────── */

function RecentProjects({
  projects, onAdd,
}: { projects: Project[]; onAdd: () => void }) {
  const t = useT();
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[16px] font-semibold tracking-tight">{t('home.recentProjects')}</h2>
        <Link
          to="/projects"
          className="text-[11px] font-medium text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
        >
          {t('home.viewAllProjects')} <ArrowRightIcon />
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {projects.map((p) => (
          <RecentProjectCard key={p.id} project={p} />
        ))}
        <NewProjectCard onClick={onAdd} />
      </div>
    </div>
  );
}

function RecentProjectCard({ project }: { project: Project }) {
  const t = useT();
  const isManual = project.mode === 'manual';
  const firstClip = project.highlights[0]?.clipPath;
  const subtitle = isManual
    ? `${project.highlights.length} ${t('library.clipsLabel')} · ${t('home.manualLabel')}`
    : `${project.highlights.length} ${t('library.clipsLabel')} · ${formatRelativeShort(project.createdAt, t)}`;

  return (
    <Link
      to={`/project/${project.id}`}
      className="group block rounded-xl overflow-hidden ring-1 ring-white/[0.06] hover:ring-white/[0.16]
                 hover:-translate-y-0.5 transition-all duration-200"
    >
      <div className="relative aspect-video bg-black/60 overflow-hidden">
        {firstClip ? (
          <video
            src={mediaUrl(firstClip)}
            muted
            loop
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
            onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
            onMouseLeave={(e) => e.currentTarget.pause()}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700">
            <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M10 9l5 3-5 3z" fill="currentColor" />
            </svg>
          </div>
        )}
      </div>
      <div className="p-3 bg-white/[0.04] border-t border-white/[0.06]">
        <div className="text-[12px] font-semibold truncate">{project.name}</div>
        <div className="text-[10px] text-zinc-500 mt-0.5 font-mono">{subtitle}</div>
      </div>
    </Link>
  );
}

function NewProjectCard({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button
      onClick={onClick}
      className="group rounded-xl overflow-hidden ring-1 ring-dashed ring-white/[0.1]
                 hover:ring-fiano-red/50 hover:bg-fiano-red/[0.03] transition-all
                 flex flex-col items-center justify-center gap-3 min-h-[180px] p-6"
    >
      <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.06]
                      flex items-center justify-center group-hover:bg-fiano-red/10 group-hover:border-fiano-red/40 transition-colors">
        <svg viewBox="0 0 16 16" className="w-4 h-4 text-zinc-500 group-hover:text-fiano-red transition-colors"
             fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M8 3v10M3 8h10" />
        </svg>
      </div>
      <div className="text-[12px] font-semibold text-zinc-300">{t('home.newProject')}</div>
    </button>
  );
}

/* ─── Helpers ──────────────────────────────────────────────── */

function formatRelativeShort(ts: number, t: (key: string) => string): string {
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${t('home.today')} ${hh}:${mm}`;
  }
  const dayDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (dayDiff === 1) return t('home.yesterday');
  if (dayDiff < 7) return `${dayDiff} ${t('home.daysAgo')}`;
  return date.toLocaleDateString();
}

/* ─── Icons ────────────────────────────────────────────────── */

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}
function ImportIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v8 M5 8l3 3 3-3 M3 13h10" />
    </svg>
  );
}
function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10 M9 4l4 4-4 4" />
    </svg>
  );
}
function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M12 3l1.8 4.6L18.5 9.4l-4.7 1.8L12 16l-1.8-4.8L5.5 9.4l4.7-1.8z" />
      <path d="M19 15l.7 1.8L21.5 17.5l-1.8.7L19 20l-.7-1.8L16.5 17.5l1.8-.7z" opacity="0.7" />
    </svg>
  );
}
function CCIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M9 10a2 2 0 0 0-2 2 2 2 0 0 0 2 2 M16 10a2 2 0 0 0-2 2 2 2 0 0 0 2 2" />
    </svg>
  );
}
function EffectsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6z" />
      <path d="M19 14l.9 2.5L22 17l-2.1 1L19 21l-.9-2.5L16 17l2.1-1z" opacity="0.7" />
      <path d="M5 16l.7 2L7.5 19l-1.8.7L5 22l-.7-2.3L2.5 19l1.8-1z" opacity="0.5" />
    </svg>
  );
}
function MusicNoteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V6l11-2v13" />
      <circle cx="6" cy="18" r="2.5" fill="currentColor" />
      <circle cx="17" cy="16" r="2.5" fill="currentColor" />
    </svg>
  );
}
function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12 M7 9l5-5 5 5" />
      <rect x="4" y="16" width="16" height="4" rx="1.5" />
    </svg>
  );
}
