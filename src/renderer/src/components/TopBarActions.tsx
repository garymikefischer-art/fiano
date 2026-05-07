import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as sounds from '../lib/sounds';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useApp } from '../stores/appStore';
import { useT } from '../lib/i18n';

/**
 * TopBar Right-Actions: Search-Field + Notification-Bell + Avatar.
 * Funktional verkabelt:
 * - Search: live-filter über Projects, click → Project-Detail
 * - Notifications: dropdown mit Job-Events + erfolgreichen Renders
 * - Avatar: profile-menu mit Settings / About / Sign Out
 */
interface Props {
  searchPlaceholder?: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'error';
  ts: number;
  read: boolean;
}

export function TopBarActions({ searchPlaceholder }: Props) {
  const t = useT();
  // Default fällt sprachenabhängig zurück (vorher hardcoded EN). Nur überschrieben wenn caller
  // einen sprachspezifischen Custom-Placeholder mitgibt.
  const placeholder = searchPlaceholder ?? t('topBar.searchPlaceholder');
  return (
    <div className="flex items-center gap-2.5">
      <SearchInput placeholder={placeholder} />
      <NotificationButton />
      <Avatar initial="G" />
    </div>
  );
}

/* ─── Search ────────────────────────────────────────────── */

function SearchInput({ placeholder }: { placeholder: string }) {
  const navigate = useNavigate();
  const projects = useApp((s) => s.projects);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Click-Outside schließt Dropdown
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const q = query.trim().toLowerCase();
  const projectMatches = q
    ? projects.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6)
    : [];
  const clipMatches = q
    ? projects.flatMap((p) =>
        p.highlights.map((h, i) => ({ project: p, highlight: h, idx: i })),
      ).filter((x) => (x.highlight.reason ?? '').toLowerCase().includes(q)).slice(0, 6)
    : [];

  const hasResults = projectMatches.length + clipMatches.length > 0;

  const goToProject = (id: string) => {
    setOpen(false);
    setQuery('');
    navigate(`/project/${id}`);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <svg
        viewBox="0 0 16 16"
        className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none"
        fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      >
        <circle cx="7" cy="7" r="5" />
        <path d="M14 14l-3.2-3.2" />
      </svg>
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className="w-56 pl-9 pr-3 py-1.5 text-[12px] rounded-lg
                   bg-white/[0.04] border border-white/[0.08]
                   placeholder:text-zinc-500 text-white
                   focus:outline-none focus:bg-white/[0.06] focus:border-white/[0.16]
                   transition-colors"
      />

      {/* Dropdown mit Ergebnissen */}
      {open && q && (
        <div className="absolute top-full right-0 mt-2 w-80 max-h-[420px] overflow-y-auto z-50
                        bg-fiano-black border border-white/[0.08] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
          {!hasResults ? (
            <div className="p-4 text-[11px] text-zinc-500 text-center">
              No matches for "<span className="text-zinc-300">{query}</span>"
            </div>
          ) : (
            <>
              {projectMatches.length > 0 && (
                <div className="border-b border-white/[0.06]">
                  <div className="px-3 pt-3 pb-1.5 text-[9px] uppercase tracking-[0.16em] text-zinc-600">
                    Projects · {projectMatches.length}
                  </div>
                  {projectMatches.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => goToProject(p.id)}
                      className="w-full text-left px-3 py-2 hover:bg-white/[0.05] transition flex items-center gap-2"
                    >
                      <div className="w-6 h-6 rounded-md bg-fiano-red/15 border border-fiano-red/30 flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 16 16" className="w-3 h-3 text-fiano-red" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M2 6h12 M6 3v10" /></svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium text-zinc-200 truncate">{p.name}</div>
                        <div className="text-[10px] text-zinc-500">
                          {p.highlights.length} clips · {p.status}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {clipMatches.length > 0 && (
                <div>
                  <div className="px-3 pt-3 pb-1.5 text-[9px] uppercase tracking-[0.16em] text-zinc-600">
                    Clips · {clipMatches.length}
                  </div>
                  {clipMatches.map((m, i) => (
                    <button
                      key={`${m.project.id}-${m.idx}-${i}`}
                      onClick={() => goToProject(m.project.id)}
                      className="w-full text-left px-3 py-2 hover:bg-white/[0.05] transition"
                    >
                      <div className="text-[12px] text-zinc-200 truncate">
                        {m.highlight.reason}
                      </div>
                      <div className="text-[10px] text-zinc-500 truncate">
                        in {m.project.name}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Notification-Button ───────────────────────────────── */

function NotificationButton() {
  const currentJob = useApp((s) => s.currentJob);
  const projects = useApp((s) => s.projects);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const lastJobRef = useRef<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Click-Outside schließt
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Listen auf Job-Completion → Notification
  useEffect(() => {
    if (currentJob) {
      // job läuft — merke aktive job
      lastJobRef.current = `${currentJob.projectId}-${currentJob.step}`;
      return;
    }
    // Job beendet — wenn vorher ein job lief, generiere notification + sound
    if (lastJobRef.current) {
      const projectId = lastJobRef.current.split('-')[0];
      const project = projects.find((p) => p.id === projectId);
      const isError = project?.status === 'error';
      setNotifications((prev) => [
        {
          id: `n-${Date.now()}`,
          title: isError ? 'Render failed' : 'Render complete',
          message: project?.name ?? 'Unknown project',
          type: isError ? 'error' : 'success',
          ts: Date.now(),
          read: false,
        },
        ...prev.slice(0, 49),
      ]);
      try { isError ? sounds.error() : sounds.exportDone(); } catch {}
      lastJobRef.current = null;
    }
  }, [currentJob, projects]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };
  const clearAll = () => setNotifications([]);

  const toggleOpen = () => {
    if (!open && unreadCount > 0) {
      // beim Öffnen alle als gelesen markieren
      setTimeout(markAllRead, 1500);
    }
    setOpen(!open);
  };

  const t = useT();

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={toggleOpen}
        aria-label={t('topBar.notificationsAria')}
        className="relative w-8 h-8 rounded-lg flex items-center justify-center
                   bg-white/[0.04] border border-white/[0.08] text-zinc-300
                   hover:bg-white/[0.08] hover:text-white transition-colors"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor"
             strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full
                           bg-fiano-red text-white text-[8px] font-bold flex items-center justify-center
                           shadow-[0_0_6px_rgba(255,16,57,0.6)]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full right-0 mt-2 w-80 max-h-[440px] z-50
                        bg-fiano-black border border-white/[0.08] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)]
                        flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
            <div className="text-[12px] font-semibold text-zinc-200">{t('topBar.notifications')}</div>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-[10px] text-zinc-500 hover:text-fiano-red transition"
              >
                {t('topBar.clearAll')}
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-[11px] text-zinc-500 text-center">
                {t('topBar.noNotificationsYet')}
                <div className="text-[10px] text-zinc-600 mt-1">
                  {t('topBar.noNotificationsHint')}
                </div>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={clsx(
                    'px-4 py-2.5 border-b border-white/[0.04] hover:bg-white/[0.03] transition',
                    !n.read && 'bg-fiano-red/[0.04]',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className={clsx(
                      'shrink-0 w-1.5 h-1.5 rounded-full mt-1.5',
                      n.type === 'success' ? 'bg-emerald-400'
                        : n.type === 'error' ? 'bg-fiano-red'
                        : 'bg-zinc-500',
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-zinc-200">{n.title}</div>
                      <div className="text-[11px] text-zinc-500 truncate">{n.message}</div>
                      <div className="text-[9px] text-zinc-600 font-mono mt-1">
                        {fmtRelative(n.ts, t)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function fmtRelative(ts: number, t: (key: string) => string): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return t('topBar.justNow');
  if (diff < 3600) return `${Math.floor(diff / 60)}${t('topBar.minutesAgoSuffix')}`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}${t('topBar.hoursAgoSuffix')}`;
  return new Date(ts).toLocaleDateString();
}

/* ─── Avatar / Profile-Menu ─────────────────────────────── */

function Avatar({ initial }: { initial: string }) {
  const navigate = useNavigate();
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Beim Open: Position des Buttons berechnen für Portal-Render
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPopupPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
  }, [open]);

  const goTo = (path: string) => { setOpen(false); navigate(path); };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        aria-label={t('topBar.profileAria')}
        className="relative w-8 h-8 rounded-full flex items-center justify-center
                   bg-gradient-to-br from-fiano-red/80 to-fiano-red/50
                   text-white text-[11px] font-bold
                   hover:brightness-110 transition shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
      >
        {initial}
        <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500
                         shadow-[0_0_0_2px_#090b0c]" />
      </button>

      {/* Profile Dropdown — Portal nach document.body damit kein stacking-context (glass-cards
          mit backdrop-filter) das Popup einsperren kann. z-[9999] über allem. */}
      {open && popupPos && createPortal(
        <div
          className="fixed w-60 z-[9999]
                     bg-zinc-950 border border-white/[0.10] rounded-xl shadow-[0_24px_60px_rgba(0,0,0,0.75)]
                     overflow-hidden backdrop-blur-xl"
          style={{ top: popupPos.top, right: popupPos.right }}
          onMouseDown={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-fiano-red/80 to-fiano-red/50
                            text-white text-[14px] font-bold flex items-center justify-center shrink-0
                            shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-zinc-200">Gary Fischer</div>
              <div className="text-[10px] text-zinc-500">{t('topBar.proPlanLabel')}</div>
            </div>
          </div>

          {/* Menu */}
          <div className="py-1">
            <MenuItem icon={<IconUser />}      label={t('topBar.myAccount')}   onClick={() => goTo('/settings?section=general')} />
            <MenuItem icon={<IconSettings />}  label={t('topBar.preferences')}  onClick={() => goTo('/settings?section=appearance')} />
            <MenuItem icon={<IconKey />}       label={t('topBar.apiKeys')}     onClick={() => goTo('/settings?section=api-keys')} />
            <div className="my-1 border-t border-white/[0.06]" />
            <MenuItem icon={<IconHelp />}      label={t('topBar.helpAbout')}
              onClick={() => goTo('/help')} />
            <MenuItem icon={<IconSignOut />}   label={t('topBar.signOut')}     danger
              onClick={() => { setOpen(false); window.alert(t('topBar.signOutAlert')); }} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function MenuItem({
  icon, label, onClick, danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full px-4 py-2 text-left flex items-center gap-2.5 text-[12px] transition',
        danger
          ? 'text-zinc-400 hover:bg-fiano-red/10 hover:text-fiano-red'
          : 'text-zinc-300 hover:bg-white/[0.05] hover:text-white',
      )}
    >
      <span className="w-3.5 h-3.5 shrink-0">{icon}</span>
      <span dangerouslySetInnerHTML={{ __html: label }} />
    </button>
  );
}

function IconUser()    { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="5" r="2.5"/><path d="M3 14c0-3 2-5 5-5s5 2 5 5"/></svg>; }
function IconSettings(){ return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="2"/><path d="M13 9.5c0 .3.1.6.3.8 .3.3 .2.7-.1 1l-.7.7c-.3.3-.7.4-1 .1-.2-.2-.5-.3-.8-.3 -.3.1-.6.4-.7.7v.5c0 .4-.3.7-.7.7H8.7c-.4 0-.7-.3-.7-.7v-.5c-.1-.3-.4-.6-.7-.7-.3-.1-.6 0-.8.2-.3.3-.7.2-1-.1l-.7-.7c-.3-.3-.4-.7-.1-1 .2-.2.3-.5.3-.8-.1-.3-.4-.6-.7-.7H4c-.4 0-.7-.3-.7-.7V7.3c0-.4.3-.7.7-.7h.5c.3-.1.6-.4.7-.7"/></svg>; }
function IconKey()     { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="10" r="3"/><path d="M9 10l5-5 M12 5l2 2 M11 6l2 2"/></svg>; }
function IconHelp()    { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M6 6c0-1 1-2 2-2s2 1 2 2-2 2-2 3 M8 12h.01"/></svg>; }
function IconSignOut() { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h5 M11 5l3 3-3 3 M14 8H7"/></svg>; }
