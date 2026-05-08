import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { FianoLogo } from './FianoLogo';
import { WindowControls } from './WindowControls';
import { useApp } from '../stores/appStore';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';

/* ─── Sidebar ─────────────────────────────────────────────────── */

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const projects = useApp((s) => s.projects);
  const lastVisitedId = useApp((s) => s.lastVisitedProjectId);
  const createEmpty = useApp((s) => s.createEmptyProject);
  const createFromFile = useApp((s) => s.createFromFile);
  const createFromMultipleFiles = useApp((s) => s.createFromMultipleFiles);
  const createQuickTikTok = useApp((s) => s.createQuickTikTok);
  const createFromUrl = useApp((s) => s.createFromUrl);

  const [showUrlModal, setShowUrlModal] = useState(false);

  // Aktiver Project-Context aus URL ableiten (/project/:id?tab=…)
  const ctx = useMemo(() => {
    const m = location.pathname.match(/^\/project\/([^/]+)/);
    const projectId = m?.[1] ?? null;
    const tab = new URLSearchParams(location.search).get('tab');
    return { projectId, tab };
  }, [location.pathname, location.search]);

  const inProject = ctx.projectId !== null;

  /** Resolve target Project-ID für context-Tabs:
   *  1. Aktuell offen (URL)
   *  2. Zuletzt besucht (localStorage-persisted, übersteht App-Restart)
   *  3. Neuestes Project (createdAt DESC)
   *  4. null → fallback auf /projects
   */
  const targetProjectId = useMemo(() => {
    if (ctx.projectId) return ctx.projectId;
    if (lastVisitedId && projects.find((p) => p.id === lastVisitedId)) return lastVisitedId;
    return projects[0]?.id ?? null;
  }, [ctx.projectId, lastVisitedId, projects]);

  const tabLink = (tab: string): string =>
    targetProjectId ? `/project/${targetProjectId}?tab=${tab}` : '/projects';

  /** Standalone-Editor-Click:
   *  - In Project: NavLink-Default (in Editor-Tab springen)
   *  - Außerhalb: erstelle leeres Quick-Edit-Project + navigiere dorthin
   */
  const onEditClick = async (e: React.MouseEvent) => {
    if (inProject) return;  // NavLink übernimmt
    e.preventDefault();
    const p = await createEmpty();
    if (p) navigate(`/project/${p.id}?tab=editor`);
  };

  /** Tools-Actions — alle starten Import-Workflows. */
  const onSingleFileImport = async (e: React.MouseEvent) => {
    e.preventDefault();
    const p = await createFromFile();
    if (p) navigate(`/project/${p.id}`);
  };
  const onMultiFileImport = async (e: React.MouseEvent) => {
    e.preventDefault();
    const p = await createFromMultipleFiles();
    if (p) navigate(`/project/${p.id}`);
  };
  const onQuickTikTokImport = async (e: React.MouseEvent) => {
    e.preventDefault();
    const p = await createQuickTikTok();
    if (p) navigate(`/project/${p.id}?tab=tiktok`);
  };
  const onUrlImport = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowUrlModal(true);
  };
  const onUrlSubmit = async (url: string) => {
    setShowUrlModal(false);
    const p = await createFromUrl(url);
    if (p) navigate(`/project/${p.id}`);
  };

  const activeProjectName = ctx.projectId
    ? projects.find((p) => p.id === ctx.projectId)?.name ?? null
    : null;
  const noProjects = projects.length === 0;
  const t = useT();
  const noProjectsHint = noProjects ? t('sidebar.noProjectsYet') : undefined;

  return (
    <aside className="w-64 bg-fiano-black border-r border-white/[0.06] flex flex-col">
      {/* Drag region: enthält Window-Controls (Win/Linux) bzw. nur Drag-Space (Mac für Traffic-Lights) */}
      <div className="h-9 flex items-center justify-start [-webkit-app-region:drag]">
        <WindowControls />
      </div>

      {/* Logo */}
      <div className="pl-[0.3rem] pr-5 pt-0 [-webkit-app-region:no-drag]">
        <FianoLogo className="h-28 w-auto" />
      </div>

      {/* Trennlinie unter Logo */}
      <div className="mx-5 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent [-webkit-app-region:no-drag]" />

      {/* Nav scroll-area */}
      <div className="flex-1 overflow-y-auto px-3 pt-4 pb-4 [-webkit-app-region:no-drag] space-y-5">
        <Section label={t('sidebar.library')}>
          <Item to="/" icon={<IconHome />} label={t('sidebar.home')}
                isActive={({ pathname }) => pathname === '/'} />
          <Item to="/projects" icon={<IconProjects />} label={t('sidebar.projects')}
                isActive={({ pathname }) => pathname === '/projects'} />
          <Item
            to={tabLink('clips')}
            icon={<IconClips />}
            label={t('sidebar.clips')}
            disabledHint={noProjectsHint}
            isActive={({ pathname }) => pathname.startsWith('/project/') && (ctx.tab === 'clips' || ctx.tab === null)}
          />
          <Item
            to={tabLink('tiktok')}
            icon={<IconTikTok />}
            label={t('sidebar.tiktokClips')}
            disabledHint={noProjectsHint}
            isActive={({ pathname }) => pathname.startsWith('/project/') && ctx.tab === 'tiktok'}
          />
          <Item
            to={tabLink('builder')}
            icon={<IconBuilder />}
            label={t('sidebar.builder')}
            disabledHint={noProjectsHint}
            isActive={({ pathname }) => pathname.startsWith('/project/') && ctx.tab === 'builder'}
          />
          <Item
            to={inProject ? tabLink('editor') : '#'}
            icon={<IconEdit />}
            label={t('sidebar.edit')}
            badge={t('common.new')}
            onClick={onEditClick}
            isActive={({ pathname }) => pathname.startsWith('/project/') && ctx.tab === 'editor'}
          />
          <Item to="/thumbnail" icon={<IconThumbnail />} label={t('sidebar.thumbnails')} badge={t('common.new')}
                isActive={({ pathname }) => pathname === '/thumbnail'} />
        </Section>

        <Section label={t('sidebar.tools')}>
          {/* Alle Tools sind Import-Shortcuts → eröffnen einen Workflow + navigieren ins neue Project. */}
          <Item
            to="#"
            onClick={onQuickTikTokImport}
            icon={<IconTikTok />}
            label={t('sidebar.quickTikTok')}
          />
          <Item
            to="#"
            onClick={onSingleFileImport}
            icon={<IconUpload />}
            label={t('sidebar.singleFileUpload')}
          />
          <Item
            to="#"
            onClick={onMultiFileImport}
            icon={<IconMultiFile />}
            label={t('sidebar.multipleClips')}
          />
          <Item
            to="#"
            onClick={onUrlImport}
            icon={<IconLink />}
            label={t('sidebar.convertVideo')}
          />
        </Section>

        <Section label={t('sidebar.settings')}>
          <Item to="/settings?section=general" icon={<IconGeneral />} label={t('sidebar.settingsGeneral')}
                isActive={({ pathname, search }) => pathname === '/settings' && (new URLSearchParams(search).get('section') || 'general') === 'general'} />
          <Item to="/settings?section=export" icon={<IconExport />} label={t('sidebar.settingsExport')}
                isActive={({ pathname, search }) => pathname === '/settings' && new URLSearchParams(search).get('section') === 'export'} />
          <Item to="/settings?section=appearance" icon={<IconAppearance />} label={t('sidebar.settingsAppearance')}
                isActive={({ pathname, search }) => pathname === '/settings' && new URLSearchParams(search).get('section') === 'appearance'} />
          <Item to="/settings?section=api-keys" icon={<IconKeys />} label={t('sidebar.settingsApiKeys')}
                isActive={({ pathname, search }) => pathname === '/settings' && new URLSearchParams(search).get('section') === 'api-keys'} />
        </Section>

        {/* Subtle Hinweis welches Project gerade als „Context" gilt */}
        {activeProjectName && (
          <div className="px-3 pt-2 border-t border-white/[0.04]">
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-600 mb-1">{t('sidebar.inProject')}</div>
            <div className="text-[10px] text-zinc-400 truncate" title={activeProjectName}>
              {activeProjectName}
            </div>
          </div>
        )}
      </div>

      {/* Pro Plan Card (kosmetisch) */}
      <div className="px-3 pb-4 pt-2 [-webkit-app-region:no-drag]">
        <ProPlanCard />
      </div>

      {showUrlModal && (
        <UrlImportModal
          onSubmit={onUrlSubmit}
          onCancel={() => setShowUrlModal(false)}
        />
      )}
    </aside>
  );
}

/* ─── URL-Import Modal ────────────────────────────────────────── */

function UrlImportModal({
  onSubmit, onCancel,
}: {
  onSubmit: (url: string) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  const isValid = (s: string) => /^https?:\/\//i.test(s.trim()) && s.trim().length > 8;

  const submit = () => {
    const v = url.trim();
    if (!isValid(v)) { setError(t('urlModal.invalidUrl')); return; }
    setError(null);
    onSubmit(v);
  };

  // ESC closes, Enter submits
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-md animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="glass w-[440px] max-w-[90vw] p-6 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-fiano-red/15 border border-fiano-red/40
                          flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                 strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-fiano-red">
              <path d="M9 13a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1.5 1.5" />
              <path d="M15 11a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1.5-1.5" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-semibold text-zinc-100 leading-tight">{t('urlModal.title')}</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
              {t('urlModal.description')}
            </p>
          </div>
        </div>

        <input
          type="url"
          autoFocus
          value={url}
          onChange={(e) => { setUrl(e.target.value); if (error) setError(null); }}
          onKeyDown={onKeyDown}
          placeholder="https://www.youtube.com/watch?v=…"
          spellCheck={false}
          className="w-full px-3.5 py-2.5 rounded-lg bg-black/40 border border-white/[0.10]
                     text-[13px] text-zinc-100 placeholder:text-zinc-600 font-mono
                     focus:outline-none focus:border-fiano-red/60 focus:bg-black/60
                     focus:shadow-[0_0_0_1px_rgba(255,16,57,0.35),0_0_18px_rgba(255,16,57,0.18)]
                     transition-all"
        />

        {error && (
          <div className="mt-2 text-[11px] text-red-400">{error}</div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-[12px] font-medium border border-white/[0.10]
                       text-zinc-300 hover:bg-white/[0.05] hover:border-white/[0.20] hover:text-white
                       transition-all"
          >
            {t('urlModal.cancel')}
          </button>
          <button
            onClick={submit}
            disabled={!isValid(url)}
            className="px-4 py-2 rounded-lg text-[12px] font-semibold
                       bg-fiano-red text-white
                       hover:brightness-110 hover:shadow-[0_0_18px_rgba(255,16,57,0.45)]
                       active:scale-[0.98]
                       disabled:opacity-40 disabled:hover:shadow-none disabled:hover:brightness-100
                       transition-all"
          >
            {t('urlModal.import')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Section / Item ──────────────────────────────────────────── */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="px-3 pb-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
        {label}
      </div>
      {children}
    </div>
  );
}

interface ItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  /** Tooltip wenn der Link „kontextlos" aktiv ist (z.B. Tools ohne Project) */
  disabledHint?: string;
  /** Optional: predicate für Active-State */
  isActive?: (ctx: { pathname: string; tab: string | null; search: string }) => boolean;
  /** Optional: custom click-handler (z.B. Edit-Standalone-Flow) */
  onClick?: (e: React.MouseEvent) => void;
}

function Item({ to, icon, label, badge, disabledHint, isActive, onClick }: ItemProps) {
  const location = useLocation();
  const tab = new URLSearchParams(location.search).get('tab');
  const active = isActive
    ? isActive({ pathname: location.pathname, tab, search: location.search })
    : location.pathname === to.split('?')[0];

  const isHinted = !!disabledHint;

  return (
    <NavLink
      to={to}
      onClick={onClick}
      title={disabledHint}
      className={clsx(
        'group relative flex items-center gap-3 px-3 py-2 rounded-lg text-[12px] font-medium transition-all duration-200',
        active
          ? 'bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
          : isHinted
            ? 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
            : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white',
      )}
    >
      <span
        className={clsx(
          'absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full transition-all duration-200',
          active ? 'bg-fiano-red opacity-100 shadow-[0_0_12px_rgba(255,16,57,0.6)]' : 'opacity-0',
        )}
        aria-hidden
      />
      <span className="w-4 h-4 flex items-center justify-center text-current">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span className="text-[8px] font-bold tracking-wider px-1.5 py-0.5 rounded
                         bg-fiano-red/15 text-fiano-red border border-fiano-red/30">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

/**
 * Sidebar-Footer-Card: zeigt aktuellen Plan-Status.
 *  - Lifetime  → "Lifetime Access" Badge, kein Upgrade-Button
 *  - Pro       → "All features unlocked", kein Upgrade-Button
 *  - Creator   → "X / 25 projects" mit Progress-Bar + Upgrade-Button
 *  - Sonst (no plan / canceled) → reine Upgrade-Karte
 */
function ProPlanCard() {
  const t = useT();
  const navigate = useNavigate();
  const subscription = useAuth((s) => s.subscription);
  const projects = useApp((s) => s.projects);

  const goPricing = () => navigate('/pricing');

  // Lifetime — Premium-Badge, kein Upgrade
  if (subscription?.lifetime) {
    return (
      <div className="glass p-3 rounded-2xl">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-fiano-red/15 border border-fiano-red/30
                          flex items-center justify-center shrink-0">
            <FianoLogo variant="mark" className="w-4 h-auto" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold leading-tight">fiano</div>
            <div className="text-[10px] text-fiano-red/90 font-semibold uppercase tracking-wider">
              {t('sidebar.planLifetime')}
            </div>
          </div>
        </div>
        <div className="mt-2.5 px-2 py-1.5 rounded-lg bg-fiano-red/[0.08] border border-fiano-red/20 text-center">
          <div className="text-[10px] text-zinc-300">{t('sidebar.lifetimeBadge')}</div>
        </div>
      </div>
    );
  }

  // Pro — alle Features, optionales Upgrade auf Lifetime
  if (subscription?.plan === 'pro') {
    const cancelPending = subscription.cancel_at_period_end && subscription.status === 'active';
    const cancelDate = cancelPending && subscription.current_period_end
      ? new Date(subscription.current_period_end).toLocaleDateString()
      : null;
    return (
      <div className="glass p-3 rounded-2xl">
        <div className="flex items-center gap-2.5 mb-2.5">
          <div className="w-8 h-8 rounded-xl bg-fiano-red/15 border border-fiano-red/30
                          flex items-center justify-center shrink-0">
            <FianoLogo variant="mark" className="w-4 h-auto" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold leading-tight">fiano</div>
            <div className="text-[10px] text-fiano-red/90 font-semibold uppercase tracking-wider">
              {t('sidebar.planPro')}
            </div>
          </div>
        </div>

        {cancelPending && cancelDate ? (
          <div className="mb-2 px-2 py-1.5 rounded-lg bg-amber-500/[0.08] border border-amber-500/20 text-[10px] text-amber-300">
            {t('sidebar.cancelPending').replace('{date}', cancelDate)}
          </div>
        ) : (
          <div className="mb-2 text-[10px] text-zinc-500">{t('sidebar.proAllUnlocked')}</div>
        )}

        <button
          onClick={goPricing}
          className="w-full py-1.5 rounded-lg text-[11px] font-semibold
                     bg-white/[0.04] border border-white/[0.10] text-zinc-300
                     hover:bg-fiano-red/10 hover:border-fiano-red/40 hover:text-fiano-red transition-all"
        >
          {t('sidebar.upgradeToLifetime')}
        </button>
      </div>
    );
  }

  // Creator — Project-Limit + Upgrade-Button
  if (subscription?.plan === 'creator') {
    const max = 25;
    const used = projects.length;
    const pct = Math.min(100, (used / max) * 100);
    const nearLimit = used >= max - 3;
    const cancelPending = subscription.cancel_at_period_end && subscription.status === 'active';
    const cancelDate = cancelPending && subscription.current_period_end
      ? new Date(subscription.current_period_end).toLocaleDateString()
      : null;

    return (
      <div className="glass p-3 rounded-2xl">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-xl bg-fiano-red/15 border border-fiano-red/30
                          flex items-center justify-center shrink-0">
            <FianoLogo variant="mark" className="w-4 h-auto" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold leading-tight">fiano</div>
            <div className="text-[10px] text-fiano-red/90 font-medium">{t('sidebar.planCreator')}</div>
          </div>
        </div>

        {cancelPending && cancelDate && (
          <div className="mb-2 px-2 py-1.5 rounded-lg bg-amber-500/[0.08] border border-amber-500/20 text-[10px] text-amber-300">
            {t('sidebar.cancelPending').replace('{date}', cancelDate)}
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-zinc-500">{t('sidebar.projectsLabel')}</span>
            <span className={clsx('font-mono', nearLimit ? 'text-fiano-red' : 'text-zinc-300')}>
              {used} / {max}
            </span>
          </div>
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={clsx(
                'h-full rounded-full transition-all',
                nearLimit
                  ? 'bg-fiano-red shadow-[0_0_8px_rgba(255,16,57,0.6)]'
                  : 'bg-fiano-red/70',
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <button
          onClick={goPricing}
          className="w-full mt-3 py-1.5 rounded-lg text-[11px] font-semibold
                     bg-fiano-red text-white hover:brightness-110 hover:shadow-[0_0_12px_rgba(255,16,57,0.5)]
                     active:scale-[0.98] transition-all"
        >
          {t('sidebar.upgradeToPro')}
        </button>
      </div>
    );
  }

  // Kein aktiver Plan (sollte durch AuthGate eh nicht passieren — Fallback)
  return (
    <div className="glass p-3 rounded-2xl">
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="w-8 h-8 rounded-xl bg-fiano-red/15 border border-fiano-red/30
                        flex items-center justify-center shrink-0">
          <FianoLogo variant="mark" className="w-4 h-auto" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold leading-tight">fiano</div>
          <div className="text-[10px] text-zinc-500">{t('sidebar.noPlan')}</div>
        </div>
      </div>
      <button
        onClick={goPricing}
        className="w-full py-1.5 rounded-lg text-[11px] font-semibold
                   bg-fiano-red text-white hover:brightness-110 transition"
      >
        {t('sidebar.upgradePlan')}
      </button>
    </div>
  );
}

/* ─── Icon-Set ─────────────────────────────────────────────────── */
function svgProps(extra = {}) {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: 'w-full h-full',
    ...extra,
  } as const;
}

function IconHome() {
  return (
    <svg {...svgProps()}>
      <path d="M3 11l9-7 9 7v9a1.5 1.5 0 0 1-1.5 1.5h-3.5V14h-8v6.5H4.5A1.5 1.5 0 0 1 3 19z" />
    </svg>
  );
}
function IconProjects() {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18 M9 5v14" />
    </svg>
  );
}
function IconClips() {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="4" width="6" height="16" rx="1.5" />
      <rect x="11" y="4" width="6" height="16" rx="1.5" />
      <path d="M19 4l2 .5-2 15.5" />
    </svg>
  );
}
function IconTikTok() {
  return (
    <svg {...svgProps()}>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="M10 9.5v5.5a2 2 0 1 0 2-2" />
      <path d="M12 9V7" />
    </svg>
  );
}
function IconBuilder() {
  return (
    <svg {...svgProps()}>
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 12l9 4 9-4 M3 17l9 4 9-4" />
    </svg>
  );
}
function IconEdit() {
  return (
    <svg {...svgProps()}>
      <path d="M14 4l6 6L9 21H3v-6L14 4z" />
      <path d="M13 5l6 6" />
    </svg>
  );
}
function IconThumbnail() {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M3 17l5-4 4 3 3-2 6 4" />
    </svg>
  );
}
function IconGeneral() {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M8 21h8 M12 18v3" />
    </svg>
  );
}
function IconAI() {
  return (
    <svg {...svgProps()}>
      <path d="M12 3l1.8 4 4.2.6-3 3 .8 4.4L12 13l-3.8 2 .8-4.4-3-3 4.2-.6z" />
    </svg>
  );
}
function IconUpload() {
  return (
    <svg {...svgProps()}>
      <path d="M12 16V4 M7 9l5-5 5 5" />
      <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
    </svg>
  );
}
function IconMultiFile() {
  return (
    <svg {...svgProps()}>
      <rect x="4" y="3" width="11" height="14" rx="1.5" />
      <rect x="8" y="6" width="11" height="14" rx="1.5" />
    </svg>
  );
}
function IconLink() {
  return (
    <svg {...svgProps()}>
      <path d="M9 13a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1.5 1.5" />
      <path d="M15 11a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1.5-1.5" />
    </svg>
  );
}
function IconSubtitle() {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 11h10 M7 15h6" />
    </svg>
  );
}
function IconEffects() {
  return (
    <svg {...svgProps()}>
      <path d="M5 3l1.5 3.5L10 8l-3.5 1.5L5 13l-1.5-3.5L0 8l3.5-1.5z" transform="translate(1 0)" />
      <path d="M16 11l1 2.5L19.5 14.5l-2.5 1L16 18l-1-2.5L12.5 14.5l2.5-1z" />
    </svg>
  );
}
function IconMusic() {
  return (
    <svg {...svgProps()}>
      <path d="M9 19V6l11-2v13" />
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="17" cy="17" r="2.5" />
    </svg>
  );
}
function IconExport() {
  return (
    <svg {...svgProps()}>
      <path d="M12 4v12 M7 9l5-5 5 5" />
      <rect x="4" y="16" width="16" height="4" rx="1" />
    </svg>
  );
}
function IconAppearance() {
  return (
    <svg {...svgProps()}>
      <path d="M12 3a9 9 0 0 0 0 18c1 0 2-.4 2-1.5 0-1-1-1.5-1-2.5s1-1.5 2-1.5h2a4 4 0 0 0 4-4 9 9 0 0 0-9-8.5z" />
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" />
      <circle cx="16.5" cy="10.5" r="1" fill="currentColor" />
    </svg>
  );
}
function IconKeys() {
  return (
    <svg {...svgProps()}>
      <circle cx="8" cy="14" r="3.5" />
      <path d="M11 12l9-9 M16 7l3 3 M14 9l3 3" />
    </svg>
  );
}
