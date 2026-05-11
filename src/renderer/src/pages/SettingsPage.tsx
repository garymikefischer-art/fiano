import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import type { FacecamRegion } from '@shared/types';
import { useApp } from '../stores/appStore';
import { useAuth } from '../stores/authStore';
import { createCheckoutSession, createPortalSession, deleteAccount } from '../lib/stripe';
import { supabase } from '../lib/supabase';
import { mediaUrl } from '../lib/mediaUrl';
import { TopBarActions } from '../components/TopBarActions';
import * as sounds from '../lib/sounds';
import { useT, LANGUAGES, type LanguageCode } from '../lib/i18n';
import { useFeature } from '../lib/features';
import { useUpgradeModal } from '../stores/upgradeModalStore';
import { LockBadge } from '../components/FeatureLock';

type SettingsSection = 'account' | 'general' | 'language' | 'export' | 'appearance' | 'api-keys';

/** Section-Liste i18n-aware via useT — Re-Render bei Sprachwechsel. */
function useSections(): Array<{ id: SettingsSection; label: string }> {
  const t = useT();
  return [
    { id: 'account',    label: t('settings.sectionAccount') },
    { id: 'general',    label: t('settings.sectionGeneral') },
    { id: 'language',   label: t('settings.languageHeading') },
    { id: 'export',     label: t('settings.sectionExport') },
    { id: 'appearance', label: t('settings.sectionAppearance') },
    { id: 'api-keys',   label: t('settings.sectionApiKeys') },
  ];
}
const SECTION_IDS: SettingsSection[] = ['account', 'general', 'language', 'export', 'appearance', 'api-keys'];

export function SettingsPage() {
  const { hasApiKey, binaries, setApiKey, clearApiKey, refreshHealth, loadAppDefaults } = useApp();
  const t = useT();
  const sections = useSections();
  const [val, setVal] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const initialSection = (searchParams.get('section') as SettingsSection) || 'general';
  const [section, setSectionState] = useState<SettingsSection>(initialSection);
  const setSection = (s: SettingsSection) => {
    setSectionState(s);
    setSearchParams({ section: s }, { replace: true });
  };
  useEffect(() => {
    const fromUrl = searchParams.get('section') as SettingsSection | null;
    if (fromUrl && SECTION_IDS.includes(fromUrl) && fromUrl !== section) setSectionState(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const refreshGeminiKey = useApp((s) => s.refreshGeminiKey);
  useEffect(() => {
    refreshHealth();
    loadAppDefaults();
    refreshGeminiKey();
  }, [refreshHealth, loadAppDefaults, refreshGeminiKey]);

  const save = async () => {
    if (!val.trim() || busy) return;
    setBusy(true);
    const ok = await setApiKey(val.trim());
    setBusy(false);
    if (ok) {
      setVal('');
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  };

  const remove = async () => {
    setBusy(true);
    await clearApiKey();
    setBusy(false);
  };

  return (
    <div className="h-full flex flex-col bg-fiano-black">
      {/* TopBar */}
      <header className="relative shrink-0">
        <div className="flex items-center justify-between gap-6 px-8 py-4">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight">{t('settings.title')}</h1>
            <p className="text-[11px] text-zinc-500 mt-0.5">{t('settings.subtitle')}</p>
          </div>
          <TopBarActions searchPlaceholder={t('topBar.searchSettingsPlaceholder')} />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
      </header>

      {/* 2-column: Section-Tabs left + content right */}
      <div className="flex-1 flex min-h-0">
        {/* Section-Sidebar */}
        <div className="w-48 shrink-0 border-r border-white/[0.06] p-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500 px-2 pb-2">{t('settings.sectionsLabel')}</div>
          <nav className="space-y-0.5">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={clsx(
                  'w-full text-left px-3 py-2 rounded-lg text-[12px] font-medium transition-all relative',
                  section === s.id
                    ? 'bg-white/[0.07] text-white'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white',
                )}
              >
                {section === s.id && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-fiano-red shadow-[0_0_10px_rgba(255,16,57,0.6)]" />
                )}
                {s.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-8 max-w-2xl mx-auto pb-16 space-y-6">

          {section === 'account' && <AccountSection />}

          {section === 'appearance' && <AppearanceSection />}

          {section === 'general' && <GeneralSection />}

          {section === 'language' && <LanguageSection />}

          {section === 'export' && <ExportSection />}

          {section === 'api-keys' && (
            <>
              <h2 className="text-[14px] font-semibold">API Keys &amp; Tools</h2>

      {/* API KEY */}
      <section className="bg-panel rounded-xl p-6 border border-zinc-800">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium">OpenAI API Key</label>
          {hasApiKey ? (
            <span className="text-xs text-emerald-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Configured
            </span>
          ) : (
            <span className="text-xs text-amber-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Not set
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500 mt-1 mb-4">
          Used for transcription and highlight detection.
          Stored encrypted in your OS keychain via Electron safeStorage.
        </p>

        <div className="flex gap-2">
          <input
            type="password"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder={hasApiKey ? 'Enter new key to replace…' : 'sk-...'}
            className="flex-1 bg-surface border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono
                       focus:outline-none focus:border-brand"
          />
          <button
            onClick={save}
            disabled={!val.trim() || busy}
            className="bg-brand text-white text-sm px-4 rounded-lg hover:opacity-90 disabled:opacity-40 min-w-20"
          >
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>

        {hasApiKey && (
          <button
            onClick={remove}
            disabled={busy}
            className="mt-3 text-xs text-red-400 hover:text-red-300"
          >
            Remove stored key
          </button>
        )}

        <div className="mt-4 text-[11px] text-zinc-600">
          Get a key at <span className="text-zinc-400">platform.openai.com/api-keys</span>
        </div>
      </section>

      {/* GEMINI API KEY */}
      <GeminiKeySection />

      {/* DEFAULT FACECAM */}
      <DefaultFacecamSection />

      {/* DEFAULT GAMEPLAY */}
      <DefaultGameplaySection />

      {/* URL IMPORT DISCLAIMER (Phase 9.5.8.2 — rechtliche Absicherung) */}
      <section className="bg-panel rounded-xl p-6 border border-zinc-800">
        <h3 className="text-sm font-medium mb-2">URL Import Disclaimer</h3>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Importing videos from YouTube, Twitch or similar platforms uses yt-dlp.
          You are solely responsible for compliance with each platform's Terms of
          Service and applicable copyright law. Download and edit only content
          you own or have explicit permission to use. fiano provides the tool —
          you decide what to import. Do not distribute downloaded material
          without the rights-holder's consent.
        </p>
      </section>

      {/* BINARIES */}
      <BinariesSection refreshHealth={refreshHealth} binaries={binaries} />

      {/* FFMPEG INSTALLS DIAGNOSTIC */}
      <FfmpegDiagnosticSection />
            </>
          )}

          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Appearance Section: Light/Dark Mode Toggle ────────────── */

function AppearanceSection() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('fiano.theme') as 'dark' | 'light') || 'dark';
  });
  const t = useT();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('fiano.theme', theme);
  }, [theme]);

  return (
    <>
      <h2 className="text-[14px] font-semibold">{t('settingsAppearance.heading')}</h2>
      <div className="glass p-5 space-y-4">
        <div>
          <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500 mb-2">{t('settingsAppearance.themeLabel')}</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setTheme('dark')}
              className={clsx(
                'p-4 rounded-xl border-2 text-left transition',
                theme === 'dark'
                  ? 'border-fiano-red bg-fiano-red/10'
                  : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]',
              )}
            >
              <div
                className="w-full aspect-video rounded-md mb-2 relative overflow-hidden"
                style={{ backgroundColor: '#090b0c', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="absolute top-0 left-0 w-1/4 h-full" style={{ backgroundColor: 'rgba(255,16,57,0.2)' }} />
                <div className="absolute inset-2 rounded-sm" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
              </div>
              <div className="text-[12px] font-semibold">{t('settingsAppearance.dark')}</div>
              <div className="text-[10px] text-zinc-500">{t('settingsAppearance.darkHint')}</div>
            </button>
            <button
              onClick={() => setTheme('light')}
              className={clsx(
                'p-4 rounded-xl border-2 text-left transition',
                theme === 'light'
                  ? 'border-fiano-red bg-fiano-red/10'
                  : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]',
              )}
            >
              <div
                className="w-full aspect-video rounded-md mb-2 relative overflow-hidden"
                style={{ backgroundColor: '#f5f5f5', border: '1px solid #d4d4d8' }}
              >
                <div className="absolute top-0 left-0 w-1/4 h-full" style={{ backgroundColor: 'rgba(255,16,57,0.2)' }} />
                <div className="absolute inset-2 rounded-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e4e7' }} />
              </div>
              <div className="text-[12px] font-semibold">{t('settingsAppearance.light')}</div>
              <div className="text-[10px] text-zinc-500">{t('settingsAppearance.lightHint')}</div>
            </button>
          </div>
        </div>
        <div className="text-[10px] text-zinc-600 leading-relaxed border-t border-white/[0.06] pt-3">
          {t('settingsAppearance.lightBetaHint')}
        </div>
      </div>
    </>
  );
}

/* ─── Sounds Section: Toggle + Sample-Buttons ───────────────── */

function SoundsSection() {
  const [muted, setMutedState] = useState<boolean>(() => sounds.isMuted());

  const toggle = () => {
    const next = !muted;
    sounds.setMuted(next);
    setMutedState(next);
    if (!next) {
      // Bei Activate gleich ein sample abspielen
      try { sounds.notify(); } catch {}
    }
  };

  return (
    <>
      <h2 className="text-[14px] font-semibold mt-6">Sounds</h2>
      <div className="glass p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[12px] font-medium">Sound Effects</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">
              Procedural sounds for app start, project open, export complete & errors.
            </div>
          </div>
          <button
            onClick={toggle}
            className={clsx(
              'relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer',
              !muted ? 'bg-fiano-red' : 'bg-white/[0.10]',
            )}
            aria-label={muted ? 'Enable sounds' : 'Mute sounds'}
          >
            <span
              className={clsx(
                'pointer-events-none absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
                !muted ? 'translate-x-5' : 'translate-x-0',
              )}
            />
          </button>
        </div>

        {!muted && (
          <div>
            <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500 mb-2">Test sounds</div>
            <div className="flex flex-wrap gap-2">
              <SoundTestButton label="App Start" onClick={() => sounds.appStart()} />
              <SoundTestButton label="Project Open" onClick={() => sounds.projectOpen()} />
              <SoundTestButton label="Export Done" onClick={() => sounds.exportDone()} />
              <SoundTestButton label="Notify" onClick={() => sounds.notify()} />
              <SoundTestButton label="Error" onClick={() => sounds.error()} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function SoundTestButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-md text-[11px] bg-white/[0.04] border border-white/[0.08]
                 hover:bg-white/[0.08] hover:border-fiano-red/40 transition"
    >
      {label}
    </button>
  );
}

function BinariesSection({
  refreshHealth, binaries,
}: { refreshHealth: () => void; binaries: any[] }) {
  const sup = useApp((s) => s.subtitleSupport);
  const noBurnIn = !sup.libass && !sup.drawtext;
  return (
    <section className="bg-panel rounded-xl p-6 border border-zinc-800">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium">Required tools</h2>
        <button onClick={refreshHealth} className="text-xs text-zinc-500 hover:text-white">
          Re-check
        </button>
      </div>
      <div className="space-y-2">
        {binaries.length === 0 && <div className="text-xs text-zinc-500">Checking…</div>}
        {binaries.map((b) => (
          <div key={b.name} className="flex items-center gap-3 text-sm">
            <span className={clsx(
              'w-2 h-2 rounded-full shrink-0',
              b.path ? 'bg-emerald-400' : 'bg-red-400',
            )} />
            <span className="font-mono text-xs w-20">{b.name}</span>
            {b.path ? (
              <span className="text-xs text-zinc-500 font-mono truncate flex-1">{b.path}</span>
            ) : (
              <span className="text-xs text-zinc-400 flex-1">
                Not found · install: <span className="font-mono text-zinc-300">{b.installHint}</span>
              </span>
            )}
          </div>
        ))}

        {/* Subtitle-Filter Status (libass + drawtext separat) */}
        <div className="pt-2 border-t border-zinc-800 mt-2 space-y-1.5">
          <div className="flex items-center gap-3 text-sm">
            <span className={clsx(
              'w-2 h-2 rounded-full shrink-0',
              sup.libass ? 'bg-emerald-400' : 'bg-zinc-500',
            )} />
            <span className="font-mono text-xs w-20">libass</span>
            <span className="text-xs flex-1 text-zinc-500">
              {sup.libass ? 'ASS-style subtitles available' : 'not installed'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className={clsx(
              'w-2 h-2 rounded-full shrink-0',
              sup.drawtext ? 'bg-emerald-400' : 'bg-zinc-500',
            )} />
            <span className="font-mono text-xs w-20">drawtext</span>
            <span className="text-xs flex-1 text-zinc-500">
              {sup.drawtext ? 'libfreetype available — text burn-in works' : 'not installed (libfreetype missing)'}
            </span>
          </div>
          {noBurnIn && (
            <div className="mt-2 p-3 bg-amber-950/30 border border-amber-900/50 rounded text-[11px] text-amber-100 leading-relaxed">
              <strong className="block text-amber-200 mb-2">⚠ Subtitle burn-in not possible</strong>
              <div className="mb-2">Your FFmpeg has neither libass nor libfreetype. Standard <span className="font-mono">brew install ffmpeg</span> ist eine slim-Variante seit 2024+.</div>
              <div className="mb-1.5 text-amber-200 font-medium">Fix mit ffmpeg-full (alle Codecs+Filter):</div>
              <ol className="list-decimal list-inside space-y-1 font-mono text-[10px] text-amber-50">
                <li>brew uninstall ffmpeg</li>
                <li>brew install ffmpeg-full</li>
                <li>App komplett neu starten · dann hier "Re-check"</li>
              </ol>
              <div className="mt-2 text-zinc-400">
                Manuell verifizieren: <span className="font-mono text-zinc-200">ffmpeg -filters | grep -E "subtitles|drawtext"</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//   Default Facecam — gilt für neue TikTok-Clips, drag/resize wie im Editor
// ════════════════════════════════════════════════════════════════════════════
function DefaultFacecamSection() {
  const defaults = useApp((s) => s.appDefaults.facecam);
  const splitRatio = useApp((s) => s.appDefaults.splitRatio);
  const testClipPath = useApp((s) => s.appDefaults.testClipPath);
  const setDefaultFacecam = useApp((s) => s.setDefaultFacecam);
  const setDefaultSplitRatio = useApp((s) => s.setDefaultSplitRatio);
  const setTestClipPath = useApp((s) => s.setTestClipPath);
  const pickTestClipFile = useApp((s) => s.pickTestClipFile);

  const [local, setLocal] = useState<FacecamRegion>(defaults);
  const [splitLocal, setSplitLocal] = useState<number>(splitRatio);
  useEffect(() => { setLocal(defaults); }, [defaults]);
  useEffect(() => { setSplitLocal(splitRatio); }, [splitRatio]);

  const onPickTestClip = async () => {
    const path = await pickTestClipFile();
    if (path) await setTestClipPath(path);
  };
  const onRemoveTestClip = async () => { await setTestClipPath(null); };

  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<'move' | 'resize' | null>(null);
  const valsRef = useRef(local);
  valsRef.current = local;

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
      let next: FacecamRegion;
      if (drag === 'move') {
        next = {
          ...cur,
          x: clamp(cur.x + dx, 0, 1 - cur.width),
          y: clamp(cur.y + dy, 0, 1 - cur.height),
        };
      } else {
        next = {
          ...cur,
          width:  clamp(cur.width + dx,  0.05, 1 - cur.x),
          height: clamp(cur.height + dy, 0.05, 1 - cur.y),
        };
      }
      setLocal(next);
    };
    const onUp = () => {
      setDrag(null);
      setDefaultFacecam(valsRef.current);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, setDefaultFacecam]);

  const snap = (preset: 'tl' | 'tr' | 'bl' | 'br' | 'bc') => {
    const w = local.width;
    const h = local.height;
    let x = 0, y = 0;
    if (preset === 'tl') { x = 0;       y = 0; }
    if (preset === 'tr') { x = 1 - w;   y = 0; }
    if (preset === 'bl') { x = 0;       y = 1 - h; }
    if (preset === 'br') { x = 1 - w;   y = 1 - h; }
    if (preset === 'bc') { x = (1-w)/2; y = 1 - h; }
    const next = { x, y, width: w, height: h };
    setLocal(next);
    setDefaultFacecam(next);
  };

  return (
    <section className="bg-panel rounded-xl p-6 border border-zinc-800">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-medium">Default Facecam</h2>
        <span className="text-[10px] text-zinc-500 font-mono">
          x:{(local.x*100).toFixed(0)}% y:{(local.y*100).toFixed(0)}% · {(local.width*100).toFixed(0)}×{(local.height*100).toFixed(0)}%
        </span>
      </div>
      <p className="text-xs text-zinc-500 mt-1 mb-3">
        Wird bei neuen TikTok-Clips automatisch als Facecam-Region und Größe verwendet.
      </p>

      {/* Test-Clip-Picker */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[11px] text-zinc-500">Test clip:</span>
        {testClipPath ? (
          <>
            <span
              className="text-[11px] text-zinc-300 font-mono truncate flex-1 min-w-0"
              title={testClipPath}
            >
              {lastSegment(testClipPath)}
            </span>
            <button
              onClick={onPickTestClip}
              className="text-[10px] text-zinc-400 hover:text-white px-2 py-0.5 bg-zinc-800 rounded"
            >
              Replace
            </button>
            <button
              onClick={onRemoveTestClip}
              className="text-[10px] text-red-400 hover:text-red-300 px-2 py-0.5 bg-zinc-800 rounded"
            >
              Remove
            </button>
          </>
        ) : (
          <button
            onClick={onPickTestClip}
            className="text-[11px] text-zinc-300 hover:text-white px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded flex-1 text-left"
          >
            + Choose test clip
          </button>
        )}
      </div>

      {/* Editor-Frame mit Video oder Schraffur */}
      <div
        ref={wrapRef}
        className="relative aspect-video bg-zinc-900 rounded-lg overflow-hidden touch-none select-none"
        style={!testClipPath ? {
          backgroundImage:
            'repeating-linear-gradient(45deg, #1a1a1d 0 8px, #17171a 8px 16px)',
        } : undefined}
      >
        {testClipPath ? (
          <video
            src={mediaUrl(testClipPath)}
            muted
            playsInline
            loop
            autoPlay
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-700">
            16:9 Master Frame · drop a test clip above
          </div>
        )}

        {/* Facecam-Rect Overlay */}
        <div
          className={clsx(
            'absolute border-2 border-brand bg-brand/20 cursor-move',
            drag === 'move' && 'bg-brand/30',
          )}
          style={{
            left:   `${local.x * 100}%`,
            top:    `${local.y * 100}%`,
            width:  `${local.width * 100}%`,
            height: `${local.height * 100}%`,
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

      <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-500">
        <span>Snap:</span>
        <button onClick={() => snap('tl')} className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">TL</button>
        <button onClick={() => snap('tr')} className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">TR</button>
        <button onClick={() => snap('bl')} className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">BL</button>
        <button onClick={() => snap('br')} className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">BR</button>
        <button onClick={() => snap('bc')} className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">B-Center</button>
      </div>

      {/* Default Split Ratio Slider */}
      <div className="mt-5 pt-4 border-t border-zinc-800">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-zinc-300 font-medium">Default Facecam Größe (Stacked-Layout)</span>
          <span className="font-mono text-brand">{Math.round(splitLocal * 100)}% / {Math.round((1 - splitLocal) * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.2} max={0.8} step={0.01}
          value={splitLocal}
          onChange={(e) => setSplitLocal(parseFloat(e.target.value))}
          onPointerUp={() => setDefaultSplitRatio(splitLocal)}
          className="w-full accent-brand"
        />
        <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
          <span>klein</span>
          <span>50/50</span>
          <span>groß</span>
        </div>
      </div>
    </section>
  );
}

function lastSegment(p: string): string {
  return p.split('/').pop() ?? p;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ════════════════════════════════════════════════════════════════════════════
//   FFmpeg Diagnose — zeigt alle gefundenen Binaries, libass-Status, Override
// ════════════════════════════════════════════════════════════════════════════
function FfmpegDiagnosticSection() {
  const listFfmpegInstalls = useApp((s) => s.listFfmpegInstalls);
  const setFfmpegPath = useApp((s) => s.setFfmpegPath);
  const refreshHealth = useApp((s) => s.refreshHealth);
  const currentOverride = useApp((s) => s.appDefaults.ffmpegPath);

  const [installs, setInstalls] = useState<Array<{ path: string; libass: boolean; drawtext: boolean; version: string; isActive: boolean; isBundled?: boolean }>>([]);
  const [overrideInput, setOverrideInput] = useState('');
  const [scanning, setScanning] = useState(false);

  const scan = async () => {
    setScanning(true);
    try {
      const list = await listFfmpegInstalls();
      setInstalls(list);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => { scan(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setOverrideInput(currentOverride ?? ''); }, [currentOverride]);

  const useThis = async (path: string) => {
    await setFfmpegPath(path);
    await scan();
    await refreshHealth();
  };

  const saveOverride = async () => {
    await setFfmpegPath(overrideInput.trim());
    await scan();
    await refreshHealth();
  };

  const clearOverride = async () => {
    await setFfmpegPath('');
    await scan();
    await refreshHealth();
  };

  return (
    <section className="bg-panel rounded-xl p-6 border border-zinc-800">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium">FFmpeg Diagnose</h2>
        <button onClick={scan} disabled={scanning} className="text-xs text-zinc-500 hover:text-white disabled:opacity-50">
          {scanning ? 'Scanning…' : '🔄 Re-scan'}
        </button>
      </div>
      <p className="text-xs text-zinc-500 mb-3">
        Alle gefundenen FFmpeg-Binaries auf deinem System. Wähle eines mit <span className="text-emerald-400">libass</span>{' '}
        + <span className="text-emerald-400">drawtext</span> für Subtitle-Burn-In.
      </p>

      <div className="space-y-1.5">
        {installs.length === 0 ? (
          <div className="text-[11px] text-zinc-600 italic">No FFmpeg installations detected.</div>
        ) : (
          installs.map((inst) => (
            <div
              key={inst.path}
              className={clsx(
                'rounded p-2.5 border text-[11px]',
                inst.isActive ? 'border-brand bg-brand/5' : 'border-zinc-800 bg-zinc-900/50',
              )}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-zinc-200 truncate" title={inst.path}>
                    {inst.path}
                    {inst.isActive && <span className="ml-2 text-brand text-[10px] font-bold">ACTIVE</span>}
                    {inst.isBundled && (
                      <span className="ml-2 inline-flex items-center gap-1 text-emerald-400 text-[10px] font-bold uppercase tracking-wider"
                            title="Mit fiano gebundelt — keine Homebrew/Manuell-Installation nötig">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        BUNDLED
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-zinc-500">{inst.version || '?'}</span>
                    <span className={inst.libass ? 'text-emerald-400' : 'text-zinc-600'}>
                      {inst.libass ? '✓ libass' : '✗ libass'}
                    </span>
                    <span className={inst.drawtext ? 'text-emerald-400' : 'text-zinc-600'}>
                      {inst.drawtext ? '✓ drawtext' : '✗ drawtext'}
                    </span>
                  </div>
                </div>
                {!inst.isActive && (
                  <button
                    onClick={() => useThis(inst.path)}
                    className="text-[10px] bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded"
                  >
                    Use
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Manual Override */}
      <div className="mt-4 pt-4 border-t border-zinc-800 space-y-2">
        <div className="text-xs font-medium text-zinc-300">Manual override</div>
        <p className="text-[11px] text-zinc-500">
          Falls du ein FFmpeg an einem ungewöhnlichen Pfad hast — manuell eintragen:
        </p>
        <div className="flex gap-2">
          <input
            value={overrideInput}
            onChange={(e) => setOverrideInput(e.target.value)}
            placeholder="(empty = auto)"
            className="flex-1 bg-surface border border-zinc-800 rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-brand"
          />
          <button onClick={saveOverride}
            className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs px-3 rounded">
            Save
          </button>
          {currentOverride && (
            <button onClick={clearOverride}
              className="bg-zinc-800 hover:bg-zinc-700 text-red-400 text-xs px-3 rounded">
              Clear
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//   Default Gameplay-Region — für neue TikTok-Clips (wird in Stacked-Bottom verwendet)
// ════════════════════════════════════════════════════════════════════════════
function DefaultGameplaySection() {
  const defaults = useApp((s) => s.appDefaults.gameplay);
  const testClipPath = useApp((s) => s.appDefaults.testClipPath);
  const setDefaultGameplay = useApp((s) => s.setDefaultGameplay);

  const [local, setLocal] = useState(defaults);
  useEffect(() => { setLocal(defaults); }, [defaults]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<'move' | 'resize' | null>(null);
  const valsRef = useRef(local);
  valsRef.current = local;

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
      let next;
      if (drag === 'move') {
        next = {
          ...cur,
          x: clamp(cur.x + dx, 0, 1 - cur.width),
          y: clamp(cur.y + dy, 0, 1 - cur.height),
        };
      } else {
        next = {
          ...cur,
          width: clamp(cur.width + dx, 0.05, 1 - cur.x),
          height: clamp(cur.height + dy, 0.05, 1 - cur.y),
        };
      }
      setLocal(next);
    };
    const onUp = () => { setDrag(null); setDefaultGameplay(valsRef.current); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, setDefaultGameplay]);

  const reset = () => {
    const next = { x: 0, y: 0, width: 1, height: 1 };
    setLocal(next);
    setDefaultGameplay(next);
  };

  return (
    <section className="bg-panel rounded-xl p-6 border border-zinc-800">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-medium">Default Gameplay Region</h2>
        <span className="text-[10px] text-zinc-500 font-mono">
          x:{(local.x*100).toFixed(0)}% y:{(local.y*100).toFixed(0)}% · {(local.width*100).toFixed(0)}×{(local.height*100).toFixed(0)}%
        </span>
      </div>
      <p className="text-xs text-zinc-500 mt-1 mb-3">
        Welcher Frame-Bereich als Gameplay (unten) im Stacked-TikTok-Layout verwendet wird.
        Default = ganzes Frame. Setze es z.B. auf den Bereich ohne Facecam-Overlay.
      </p>

      <div
        ref={wrapRef}
        className="relative aspect-video bg-zinc-900 rounded-lg overflow-hidden touch-none select-none"
        style={!testClipPath ? {
          backgroundImage: 'repeating-linear-gradient(45deg, #1a1a1d 0 8px, #17171a 8px 16px)',
        } : undefined}
      >
        {testClipPath ? (
          <video
            src={mediaUrl(testClipPath)}
            muted playsInline loop autoPlay
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-700">
            16:9 Master Frame
          </div>
        )}

        <div
          className={clsx(
            'absolute border-2 border-cyan-400 bg-cyan-400/15 cursor-move',
            drag === 'move' && 'bg-cyan-400/25',
          )}
          style={{
            left:   `${local.x * 100}%`,
            top:    `${local.y * 100}%`,
            width:  `${local.width * 100}%`,
            height: `${local.height * 100}%`,
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

      <button
        onClick={reset}
        className="mt-3 text-[10px] text-zinc-400 hover:text-white px-3 py-1.5 bg-zinc-800 rounded"
      >
        Reset to full frame
      </button>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//   Gemini API Key — für Thumbnail Generator
// ════════════════════════════════════════════════════════════════════════════
function GeminiKeySection() {
  const hasGeminiKey = useApp((s) => s.hasGeminiKey);
  const setGeminiKey = useApp((s) => s.setGeminiKey);
  const clearGeminiKey = useApp((s) => s.clearGeminiKey);
  const currentModel = useApp((s) => s.appDefaults.geminiImageModel);
  const setGeminiImageModel = useApp((s) => s.setGeminiImageModel);
  const listGeminiModels = useApp((s) => s.listGeminiModels);
  const [val, setVal] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const [modelInput, setModelInput] = useState('');
  const [modelSaved, setModelSaved] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<Array<{ name: string; displayName: string }> | null>(null);
  const [discovering, setDiscovering] = useState(false);
  useEffect(() => { setModelInput(currentModel ?? ''); }, [currentModel]);

  const saveModel = async () => {
    await setGeminiImageModel(modelInput.trim());
    setModelSaved(true);
    setTimeout(() => setModelSaved(false), 1500);
  };

  const discover = async () => {
    setDiscovering(true);
    try {
      const r = await listGeminiModels();
      if (r) setDiscoveredModels(r.imageLike.length ? r.imageLike : r.all);
    } finally {
      setDiscovering(false);
    }
  };

  const save = async () => {
    if (!val.trim() || busy) return;
    setBusy(true);
    const ok = await setGeminiKey(val.trim());
    setBusy(false);
    if (ok) {
      setVal('');
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  };

  return (
    <section className="bg-panel rounded-xl p-6 border border-zinc-800">
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium">Gemini API Key (Thumbnails)</label>
        {hasGeminiKey ? (
          <span className="text-xs text-emerald-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Configured
          </span>
        ) : (
          <span className="text-xs text-zinc-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" /> Not set
          </span>
        )}
      </div>
      <p className="text-xs text-zinc-500 mt-1 mb-3">
        For Thumbnail Generator (Gemini 2.5 Flash Image). Stored encrypted via safeStorage.
        Get key at <span className="font-mono text-zinc-400">aistudio.google.com/app/apikey</span>.
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder={hasGeminiKey ? 'Enter new key to replace…' : 'AIza…'}
          className="flex-1 bg-surface border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
        />
        <button onClick={save} disabled={!val.trim() || busy}
          className="bg-brand text-white text-sm px-4 rounded-lg hover:opacity-90 disabled:opacity-40 min-w-20">
          {saved ? '✓ Saved' : 'Save'}
        </button>
      </div>
      {hasGeminiKey && (
        <button onClick={clearGeminiKey} disabled={busy}
          className="mt-3 text-xs text-red-400 hover:text-red-300">
          Remove stored key
        </button>
      )}

      {/* Image-Model Override + Discovery */}
      {hasGeminiKey && (
        <div className="mt-5 pt-5 border-t border-zinc-800 space-y-2">
          <div className="text-xs font-medium text-zinc-300">Image Model</div>
          <p className="text-[11px] text-zinc-500">
            Auto-Fallback probiert <span className="font-mono">gemini-2.5-flash-image-preview</span>,{' '}
            <span className="font-mono">gemini-2.0-flash-preview-image-generation</span>,{' '}
            <span className="font-mono">gemini-2.0-flash-exp</span>.
            Override nur nutzen wenn keiner davon für deinen Key freigegeben ist.
          </p>
          <div className="flex gap-2">
            <input
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              placeholder="(empty = auto-fallback)"
              className="flex-1 bg-surface border border-zinc-800 rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-brand"
            />
            <button onClick={saveModel}
              className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs px-3 rounded min-w-16">
              {modelSaved ? '✓' : 'Save'}
            </button>
            <button onClick={discover} disabled={discovering}
              className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs px-3 rounded disabled:opacity-50">
              {discovering ? '...' : 'List'}
            </button>
          </div>
          {discoveredModels && (
            <div className="mt-2 max-h-48 overflow-y-auto bg-zinc-900 rounded border border-zinc-800">
              {discoveredModels.length === 0 ? (
                <div className="text-[11px] text-zinc-500 p-2 italic">No image-capable models found for this key.</div>
              ) : (
                discoveredModels.map((m) => (
                  <button
                    key={m.name}
                    onClick={() => { setModelInput(m.name); }}
                    className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-zinc-800 border-b border-zinc-800 last:border-0"
                  >
                    <div className="font-mono text-zinc-200">{m.name}</div>
                    {m.displayName && <div className="text-zinc-500 text-[10px]">{m.displayName}</div>}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ─── General Section ─────────────────────────────────────── */

function GeneralSection() {
  const confirmDelete = useApp((s) => s.appDefaults.confirmDelete ?? true);
  const soundsEnabled = useApp((s) => s.appDefaults.soundsEnabled ?? true);
  const setConfirmDelete = useApp((s) => s.setConfirmDelete);
  const setSoundsEnabled = useApp((s) => s.setSoundsEnabled);
  const t = useT();

  return (
    <>
      <h2 className="text-[14px] font-semibold">{t('settingsGeneral.heading')}</h2>

      <section className="glass p-5 space-y-4">
        <ToggleRow
          label={t('settingsGeneral.confirmDeleteLabel')}
          hint={t('settingsGeneral.confirmDeleteHint')}
          checked={confirmDelete}
          onChange={setConfirmDelete}
        />
        <Divider />
        <ToggleRow
          label={t('settingsGeneral.soundsLabel')}
          hint={t('settingsGeneral.soundsHint')}
          checked={soundsEnabled}
          onChange={setSoundsEnabled}
        />
      </section>

      <div className="text-[11px] text-zinc-500 leading-relaxed">
        {t('settingsGeneral.footer')}
      </div>
    </>
  );
}

/* ─── Export Section ─────────────────────────────────────── */

function ExportSection() {
  const editorExport = useApp((s) => s.appDefaults.editorExport ?? { width: 1920, height: 1080, fps: 30, bitrate: '30M' });
  const setEditorExportDefaults = useApp((s) => s.setEditorExportDefaults);
  const fourKFeature = useFeature('export_4k');
  const highBitrateFeature = useFeature('export_high_bitrate');
  const openUpgrade = useUpgradeModal((s) => s.open);

  // Phase 9.3: Plan-Limits — Creator max 1080p + 5M, Pro alles offen.
  const RESOLUTIONS: Array<{ label: string; w: number; h: number; pro?: boolean }> = [
    { label: '4K · 2160p',      w: 3840, h: 2160, pro: true },
    { label: '1440p',           w: 2560, h: 1440, pro: true },
    { label: 'Full HD · 1080p', w: 1920, h: 1080 },
    { label: 'HD · 720p',       w: 1280, h: 720 },
    { label: '480p',            w: 854,  h: 480 },
  ];
  const FPS_OPTIONS = [24, 30, 60];
  const BITRATES: Array<{ label: string; value: string; pro?: boolean }> = [
    { label: 'Lossless · 50M',   value: '50M', pro: true },
    { label: 'Maximum · 30M',    value: '30M', pro: true },
    { label: 'High · 20M',       value: '20M', pro: true },
    { label: 'Standard · 15M',   value: '15M', pro: true },
    { label: 'Compressed · 10M', value: '10M', pro: true },
    { label: 'Eco · 5M',         value: '5M' },
    { label: 'Mobile · 3M',      value: '3M' },
  ];

  const currentResLabel = RESOLUTIONS.find((r) => r.w === editorExport.width && r.h === editorExport.height)?.label
    ?? `Custom · ${editorExport.width}×${editorExport.height}`;

  return (
    <>
      <h2 className="text-[14px] font-semibold">Export</h2>

      <section className="glass p-5 space-y-5">
        <div>
          <div className="text-[12px] font-semibold text-zinc-200 mb-1">Editor Timeline Export</div>
          <div className="text-[11px] text-zinc-500 mb-4">
            Default values when exporting from the Edit-Tab. Override per export in the dialog.
          </div>

          <SelectRow label="Resolution" value={currentResLabel}>
            <div className="grid grid-cols-2 gap-1.5">
              {RESOLUTIONS.map((r) => {
                const active = r.w === editorExport.width && r.h === editorExport.height;
                const locked = r.pro && !fourKFeature.unlocked;
                return (
                  <button key={r.label}
                    onClick={() => {
                      if (locked) { openUpgrade('export_4k'); return; }
                      setEditorExportDefaults({ width: r.w, height: r.h });
                    }}
                    className={clsx(selectBtnClass(active), locked && 'opacity-60', 'flex items-center justify-center gap-1.5')}>
                    {locked && <LockBadge />}
                    {r.label}
                  </button>
                );
              })}
            </div>
          </SelectRow>

          <SelectRow label="Frame rate" value={`${editorExport.fps} fps`}>
            <div className="grid grid-cols-3 gap-1.5">
              {FPS_OPTIONS.map((f) => (
                <button key={f}
                  onClick={() => setEditorExportDefaults({ fps: f })}
                  className={selectBtnClass(editorExport.fps === f)}>
                  {f} fps
                </button>
              ))}
            </div>
          </SelectRow>

          <SelectRow label="Bitrate" value={editorExport.bitrate}>
            <div className="grid grid-cols-2 gap-1.5">
              {BITRATES.map((b) => {
                const locked = b.pro && !highBitrateFeature.unlocked;
                return (
                  <button key={b.value}
                    onClick={() => {
                      if (locked) { openUpgrade('export_high_bitrate'); return; }
                      setEditorExportDefaults({ bitrate: b.value });
                    }}
                    className={clsx(selectBtnClass(editorExport.bitrate === b.value), locked && 'opacity-60', 'flex items-center justify-center gap-1.5')}>
                    {locked && <LockBadge />}
                    {b.label}
                  </button>
                );
              })}
            </div>
          </SelectRow>
        </div>
      </section>

      {/* ─── Encoder Quality (eigene Section damit deutlich sichtbar) ──────── */}
      <QualityModeSection />
    </>
  );
}

/** Encoder-Quality-Mode — eigene glass-Section damit deutlich sichtbar. */
function QualityModeSection() {
  const t = useT();
  const qualityMode = useApp((s) => s.appDefaults.qualityMode ?? 'fast');
  const setQualityMode = useApp((s) => s.setQualityMode);
  const qualityFeature = useFeature('quality_render_mode');
  const openUpgrade = useUpgradeModal((s) => s.open);
  const opts: Array<{ value: 'fast' | 'quality'; label: string; hint: string; pro?: boolean }> = [
    {
      value: 'fast',
      label: t('settings.qualityModeFast'),
      hint: t('settings.qualityModeFastHint'),
    },
    {
      value: 'quality',
      label: t('settings.qualityModeQuality'),
      hint: t('settings.qualityModeQualityHint'),
      pro: true,
    },
  ];
  return (
    <section className="glass p-5">
      <div className="text-[12px] font-semibold text-zinc-200 mb-1">{t('settings.qualityModeLabel')}</div>
      <div className="text-[11px] text-zinc-500 mb-4">{t('settings.qualityModeDesc')}</div>
      <div className="grid grid-cols-2 gap-2">
        {opts.map((o) => {
          const active = qualityMode === o.value;
          const locked = o.pro && !qualityFeature.unlocked;
          return (
            <button key={o.value}
              onClick={() => {
                if (locked) { openUpgrade('quality_render_mode'); return; }
                setQualityMode(o.value);
              }}
              className={clsx(
                'relative text-left rounded-lg px-4 py-3 border transition',
                active
                  ? 'bg-fiano-red/15 border-fiano-red/45 text-white shadow-[0_0_18px_rgba(255,16,57,0.18)]'
                  : locked
                    ? 'bg-white/[0.02] border-white/[0.06] text-zinc-400 opacity-70 hover:opacity-90'
                    : 'bg-white/[0.03] border-white/[0.08] text-zinc-300 hover:bg-white/[0.06]',
              )}
            >
              {locked && (
                <span className="absolute top-2 right-2"><LockBadge /></span>
              )}
              <div className="text-[12px] font-semibold">{o.label}</div>
              <div className="text-[10px] text-zinc-500 mt-1 leading-relaxed">{o.hint}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ─── UI helpers ───────────────────────────────────────── */

function ToggleRow({
  label, hint, checked, onChange,
}: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer group">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-zinc-100">{label}</div>
        {hint && <div className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx(
          'shrink-0 w-10 h-6 rounded-full p-0.5 transition-all',
          checked ? 'bg-fiano-red shadow-[0_0_12px_rgba(255,16,57,0.45)]' : 'bg-white/[0.10]',
        )}
      >
        <div className={clsx(
          'w-5 h-5 rounded-full bg-white transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0',
        )} />
      </button>
    </label>
  );
}

function SelectRow({
  label, value, children,
}: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[12px] font-medium text-zinc-200">{label}</div>
        <div className="text-[11px] font-mono text-zinc-500">{value}</div>
      </div>
      {children}
    </div>
  );
}

function selectBtnClass(active: boolean) {
  return clsx(
    'text-[11px] font-medium py-2 px-3 rounded-lg border transition-all active:scale-[0.98]',
    active
      ? 'bg-fiano-red/15 border-fiano-red/55 text-white shadow-[0_0_0_1px_rgba(255,16,57,0.3)]'
      : 'bg-white/[0.03] border-white/[0.08] text-zinc-300 hover:bg-white/[0.06] hover:border-white/[0.16] hover:text-white',
  );
}

function Divider() {
  return <div className="h-px bg-white/[0.06]" />;
}

/* ─── Account Section (Phase 6.1) ─────────────────────────── */

function AccountSection() {
  const t = useT();
  const user = useAuth((s) => s.user);
  const subscription = useAuth((s) => s.subscription);
  const signOut = useAuth((s) => s.signOut);
  const fetchSubscription = useAuth((s) => s.fetchSubscription);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<'upgrade' | 'portal' | 'delete' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Plan-Hierarchie für Upgrade: Creator → Pro → Studio Lifetime
  // Lifetime hat keinen weiteren Upgrade-Pfad.
  const upgradeTarget: 'pro' | 'studio_lifetime' | null =
    subscription?.lifetime ? null
    : subscription?.plan === 'creator' ? 'pro'
    : subscription?.plan === 'pro'     ? 'studio_lifetime'
    : null;

  const handleUpgrade = async () => {
    if (busy || !upgradeTarget) return;
    setBusy('upgrade');
    setErrorMsg(null);
    const res = await createCheckoutSession(upgradeTarget);
    if (res.url) await window.api.invoke('shell.openExternal', { url: res.url });
    else setErrorMsg(res.error ?? 'Failed');
    setTimeout(() => setBusy(null), 2000);
  };

  const handlePortal = async () => {
    if (busy) return;
    setBusy('portal');
    setErrorMsg(null);
    const res = await createPortalSession();
    if (res.url) await window.api.invoke('shell.openExternal', { url: res.url });
    else setErrorMsg(res.error ?? 'Failed');
    setTimeout(() => setBusy(null), 2000);
  };

  const handleDeleteAccount = async () => {
    if (busy) return;
    setBusy('delete');
    setErrorMsg(null);
    const res = await deleteAccount();
    if (res.ok) {
      // signOut räumt Session + Realtime auf, Routing-Gate wirft auf LoginPage
      await signOut();
    } else {
      setErrorMsg(res.error ?? 'Delete failed');
      setBusy(null);
    }
  };

  const planLabel = subscription?.lifetime
    ? t('settings.account.planLifetime')
    : subscription?.plan === 'pro'
      ? t('settings.account.planPro')
      : subscription?.plan === 'creator'
        ? t('settings.account.planCreator')
        : t('settings.account.planNone');

  const renewLabel = (() => {
    if (!subscription) return null;
    if (subscription.lifetime) return t('settings.account.renewLifetime');
    if (subscription.status === 'canceled') {
      // Sub ist bereits beendet (period-end durch oder admin-cancel sofort)
      return t('settings.account.renewCanceledEnded');
    }
    if (!subscription.current_period_end) return null;
    const d = new Date(subscription.current_period_end);
    const dateStr = d.toLocaleDateString();
    if (subscription.cancel_at_period_end) {
      // Sub läuft noch — wird am period-end automatisch beendet
      return t('settings.account.cancelEffectiveOn').replace('{date}', dateStr);
    }
    return t('settings.account.renewsOn').replace('{date}', dateStr);
  })();

  const initial = (user?.user_metadata?.full_name?.[0] ?? user?.email?.[0] ?? 'f').toUpperCase();
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || '';

  return (
    <>
      <h2 className="text-[14px] font-semibold mb-4">{t('settings.sectionAccount')}</h2>

      {/* Profil-Header */}
      <section className="bg-panel rounded-xl p-6 border border-zinc-800">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-fiano-red/80 to-fiano-red/50
                          text-white text-[20px] font-bold flex items-center justify-center shrink-0
                          shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-zinc-100 truncate">{displayName || '—'}</div>
            <div className="text-[12px] text-zinc-500 truncate">{user?.email ?? '—'}</div>
            <div className="text-[10px] text-zinc-600 font-mono mt-1">
              {t('settings.account.userId')}: {user?.id?.slice(0, 8) ?? '—'}…
            </div>
          </div>
        </div>
      </section>

      {/* Plan-Status */}
      <section className="bg-panel rounded-xl p-6 border border-zinc-800 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[12px] text-zinc-500">{t('settings.account.currentPlan')}</div>
            <div className="text-[18px] font-semibold text-zinc-100 mt-1">{planLabel}</div>
            {renewLabel && (
              <div className="text-[11px] text-zinc-500 mt-1">{renewLabel}</div>
            )}
          </div>
          <div className={clsx(
            'px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider',
            subscription?.lifetime
              ? 'bg-fiano-red/15 text-fiano-red border border-fiano-red/30'
              : subscription?.cancel_at_period_end && subscription?.status === 'active'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : subscription?.status === 'active' || subscription?.status === 'trialing'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : subscription?.status === 'past_due'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-zinc-700/30 text-zinc-400 border border-zinc-600/40',
          )}>
            {subscription?.lifetime
              ? '✦ Lifetime'
              : subscription?.cancel_at_period_end && subscription?.status === 'active'
                ? t('settings.account.statusCancelPending')
                : subscription?.status ?? t('settings.account.statusInactive')}
          </div>
        </div>

        {/* Action-Buttons je nach Plan-State */}
        {!subscription?.lifetime && (
          <>
            {errorMsg && (
              <div className="text-[11px] text-fiano-red bg-fiano-red/[0.08] border border-fiano-red/20 rounded-md px-3 py-2">
                {errorMsg}
              </div>
            )}
            <div className="flex gap-2 pt-2 border-t border-zinc-800 flex-wrap">
              {upgradeTarget && (
                <button
                  onClick={handleUpgrade}
                  disabled={busy !== null}
                  className="text-[12px] font-semibold px-4 py-2 rounded-lg
                             bg-fiano-red text-white hover:brightness-110 transition disabled:opacity-50"
                >
                  {busy === 'upgrade'
                    ? t('settings.account.opening')
                    : upgradeTarget === 'pro'
                      ? t('settings.account.upgradeToPro')
                      : t('settings.account.upgradeToLifetime')}
                </button>
              )}
              <button
                onClick={handlePortal}
                disabled={busy !== null}
                className="text-[12px] font-medium px-4 py-2 rounded-lg
                           bg-white/[0.04] border border-white/[0.10] text-zinc-300
                           hover:bg-white/[0.08] transition disabled:opacity-50"
              >
                {busy === 'portal' ? t('settings.account.opening') : t('settings.account.manageBilling')}
              </button>
              <button
                onClick={() => fetchSubscription()}
                className="text-[12px] font-medium px-4 py-2 rounded-lg
                           bg-white/[0.04] border border-white/[0.10] text-zinc-400
                           hover:bg-white/[0.08] transition"
              >
                {t('settings.account.refresh')}
              </button>
            </div>
          </>
        )}
      </section>

      {/* GDPR Data Export — Art. 20 Datenportabilität */}
      <DataExportSection />

      {/* Sign-Out */}
      <section className="bg-panel rounded-xl p-6 border border-zinc-800">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[12px] font-semibold text-zinc-200">{t('settings.account.signOutTitle')}</div>
            <div className="text-[11px] text-zinc-500 mt-1">{t('settings.account.signOutBody')}</div>
          </div>
          <button
            onClick={signOut}
            className="text-[12px] font-medium px-4 py-2 rounded-lg
                       text-fiano-red border border-fiano-red/30 hover:bg-fiano-red/10 transition"
          >
            {t('settings.account.signOut')}
          </button>
        </div>
      </section>

      {/* Danger Zone — Account löschen */}
      <section className="bg-panel rounded-xl p-6 border border-fiano-red/30">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[12px] font-semibold text-fiano-red">{t('settings.account.deleteTitle')}</div>
            <div className="text-[11px] text-zinc-500 mt-1 max-w-md">{t('settings.account.deleteBody')}</div>
          </div>
          <button
            onClick={() => setShowDeleteModal(true)}
            disabled={busy !== null}
            className="text-[12px] font-medium px-4 py-2 rounded-lg shrink-0
                       text-white bg-fiano-red/80 hover:bg-fiano-red transition disabled:opacity-50"
          >
            {t('settings.account.deleteButton')}
          </button>
        </div>
      </section>

      {/* Delete-Konfirmations-Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-fiano-red/40 rounded-2xl p-7 max-w-md w-full shadow-[0_30px_80px_rgba(0,0,0,0.8)]">
            <div className="flex items-start gap-3 mb-4">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-fiano-red/15 border border-fiano-red/40 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-fiano-red" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div>
                <div className="text-[15px] font-semibold text-zinc-100">{t('settings.account.deleteConfirmTitle')}</div>
                <div className="text-[12px] text-zinc-400 mt-1 leading-relaxed">{t('settings.account.deleteConfirmBody')}</div>
              </div>
            </div>

            <ul className="text-[12px] text-zinc-400 space-y-1.5 mb-4 pl-3">
              <li>• {t('settings.account.deleteBullet1')}</li>
              <li>• {t('settings.account.deleteBullet2')}</li>
              <li>• {t('settings.account.deleteBullet3')}</li>
            </ul>

            <div className="space-y-2 mb-4">
              <label className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                {t('settings.account.deleteConfirmInstruction')}
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                disabled={busy !== null}
                className="w-full px-3 py-2 rounded-lg text-[13px]
                           bg-white/[0.04] border border-white/[0.08] text-white
                           placeholder:text-zinc-600 font-mono
                           focus:outline-none focus:bg-white/[0.06] focus:border-fiano-red/50 transition-colors"
              />
            </div>

            {errorMsg && (
              <div className="text-[11px] text-fiano-red bg-fiano-red/[0.08] border border-fiano-red/20 rounded-md px-3 py-2 mb-3">
                {errorMsg}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(''); setErrorMsg(null); }}
                disabled={busy !== null}
                className="text-[12px] font-medium px-4 py-2 rounded-lg
                           bg-white/[0.04] border border-white/[0.10] text-zinc-300
                           hover:bg-white/[0.08] transition disabled:opacity-50"
              >
                {t('settings.account.deleteCancel')}
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || busy !== null}
                className={clsx(
                  'text-[12px] font-semibold px-4 py-2 rounded-lg transition',
                  deleteConfirmText !== 'DELETE' || busy !== null
                    ? 'bg-fiano-red/30 text-white/50 cursor-not-allowed'
                    : 'bg-fiano-red text-white hover:brightness-110',
                )}
              >
                {busy === 'delete' ? t('settings.account.deleting') : t('settings.account.deleteFinal')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Language Section (i18n) ────────────────────────────── */

/**
 * GDPR Art. 20 — Datenexport. User kann seine kompletten App-Daten als
 * strukturierte JSON-Datei herunterladen. Sammelt:
 *  - User + Profile + Subscription (Supabase)
 *  - Alle Projekte (lokaler appStore)
 *  - Metadata (Export-Datum, App-Version, GDPR-Hinweis)
 */
function DataExportSection() {
  const t = useT();
  const user = useAuth((s) => s.user);
  const subscription = useAuth((s) => s.subscription);
  const projects = useApp((s) => s.projects);
  const [busy, setBusy] = useState(false);
  const [lastPath, setLastPath] = useState<string | null>(null);

  const onExport = async () => {
    if (busy || !user) return;
    setBusy(true);
    setLastPath(null);
    try {
      // Profile + Subscription via Supabase
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      const exportObj = {
        meta: {
          exportDate:        new Date().toISOString(),
          fianoVersion:      'data-export-v1',
          gdprArticle:       'Art. 20 GDPR — Right to Data Portability',
          notice:            'This export contains all personal data fiano stores about you. Local files (videos, clips, thumbnails) are not included — they remain on your device.',
          contact:           'office@fiano.at',
        },
        account: {
          id:                user.id,
          email:             user.email,
          createdAt:         user.created_at,
          lastSignInAt:      user.last_sign_in_at,
          provider:          user.app_metadata?.provider ?? 'email',
        },
        profile: profile ?? null,
        subscription: subscription ?? null,
        projects: projects.map((p) => ({
          id:           p.id,
          name:         p.name,
          mode:         p.mode,
          status:       p.status,
          videoType:    p.videoType,
          createdAt:    p.createdAt,
          updatedAt:    p.updatedAt,
          highlightCount: p.highlights?.length ?? 0,
        })),
      };
      const json = JSON.stringify(exportObj, null, 2);
      const r = await window.api.invoke<{ path: string } | null>('account.exportData', {
        json,
        suggestedName: `fiano-data-export-${new Date().toISOString().slice(0, 10)}.json`,
      });
      if (r?.ok && r.data?.path) setLastPath(r.data.path);
    } catch (err: any) {
      console.warn('[settings] data export failed:', err);
      window.alert(`Export failed: ${err?.message ?? String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-panel rounded-xl p-6 border border-zinc-800">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[12px] font-semibold text-zinc-200">{t('settings.account.dataExportTitle')}</div>
          <div className="text-[11px] text-zinc-500 mt-1 max-w-md">{t('settings.account.dataExportBody')}</div>
        </div>
        <button
          onClick={onExport}
          disabled={busy || !user}
          className="text-[12px] font-medium px-4 py-2 rounded-lg shrink-0
                     text-zinc-300 border border-zinc-700 hover:border-fiano-red/40 hover:text-white hover:bg-white/[0.04]
                     transition disabled:opacity-50"
        >
          {busy ? t('settings.account.dataExporting') : t('settings.account.dataExportButton')}
        </button>
      </div>
      {lastPath && (
        <div className="mt-3 text-[10px] text-emerald-400/80 bg-emerald-500/[0.06] border border-emerald-500/20 rounded-lg px-3 py-2">
          {t('settings.account.dataExportSaved')}: <span className="font-mono">{lastPath}</span>
        </div>
      )}
    </section>
  );
}

function LanguageSection() {
  const t = useT();
  const currentLang = useApp((s) => (s.appDefaults.language as LanguageCode | undefined) ?? 'en');
  const setLang = useApp((s) => s.setLanguage);

  return (
    <>
      <h2 className="text-[14px] font-semibold">{t('settings.languageHeading')}</h2>
      <p className="text-[11px] text-zinc-500 leading-relaxed">{t('settings.languageDescription')}</p>

      <section className="glass p-5 space-y-3">
        <div className="text-[12px] font-medium text-zinc-200">{t('settings.languageLabel')}</div>
        <div className="grid grid-cols-3 gap-2">
          {LANGUAGES.map((l) => {
            const active = l.code === currentLang;
            return (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                className={clsx(
                  'text-left px-3 py-2.5 rounded-lg border transition-all active:scale-[0.98]',
                  active
                    ? 'bg-fiano-red/15 border-fiano-red/55 text-white shadow-[0_0_0_1px_rgba(255,16,57,0.3)]'
                    : 'bg-white/[0.03] border-white/[0.08] text-zinc-300 hover:bg-white/[0.06] hover:border-white/[0.16] hover:text-white',
                )}
              >
                <div className="text-[12px] font-medium">{l.nativeName}</div>
                <div className="text-[10px] font-mono text-zinc-500 mt-0.5 uppercase">{l.code}</div>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
