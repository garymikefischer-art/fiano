import { useState } from 'react';
import clsx from 'clsx';
import { TopBarActions } from '../components/TopBarActions';
import { FianoLogo } from '../components/FianoLogo';
import { useT } from '../lib/i18n';

type Section = 'getting-started' | 'features' | 'api-keys' | 'install' | 'shortcuts' | 'faq' | 'about';

function useHelpSections(): Array<{ key: Section; label: string; icon: React.ReactNode }> {
  const t = useT();
  return [
    { key: 'getting-started', label: t('help.gettingStarted'), icon: <IconRocket /> },
    { key: 'features',        label: t('help.features'),       icon: <IconStar /> },
    { key: 'api-keys',        label: t('help.apiKeys'),        icon: <IconKey /> },
    { key: 'install',         label: t('help.installTools'),   icon: <IconTerminal /> },
    { key: 'shortcuts',       label: t('help.shortcuts'),      icon: <IconKeyboard /> },
    { key: 'faq',             label: t('help.faq'),            icon: <IconQuestion /> },
    { key: 'about',           label: t('help.about'),          icon: <IconInfo /> },
  ];
}

export function HelpPage() {
  const [section, setSection] = useState<Section>('getting-started');
  const t = useT();
  const sections = useHelpSections();

  return (
    <div className="relative h-full flex flex-col bg-fiano-black overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="fiano-bg-tint" />
        <div className="fiano-bg-glow" />
      </div>

      <div className="relative h-full flex flex-col">
        {/* Top-Bar */}
        <header className="relative shrink-0 border-b border-white/[0.06] bg-fiano-black/80 backdrop-blur-xl">
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-fiano-red/30 to-transparent" />
          <div className="flex items-center justify-between gap-6 px-8 py-4">
            <div className="flex items-baseline gap-3">
              <h1 className="text-[20px] font-semibold tracking-tight">{t('help.pageTitle')}</h1>
              <span className="text-[11px] font-mono text-zinc-600">{t('help.pageSubtitle')}</span>
            </div>
            <TopBarActions searchPlaceholder={t('help.searchPlaceholder')} />
          </div>
        </header>

        <div className="flex-1 flex min-h-0">
          {/* Section Sidebar */}
          <aside className="w-56 shrink-0 border-r border-white/[0.06] py-5 px-3 space-y-0.5 overflow-y-auto">
            {sections.map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={clsx(
                  'group relative w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[12px] font-medium transition-all duration-200',
                  section === s.key
                    ? 'bg-white/[0.07] text-white'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white',
                )}
              >
                <span className={clsx(
                  'absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full transition-all duration-200',
                  section === s.key ? 'bg-fiano-red opacity-100 shadow-[0_0_12px_rgba(255,16,57,0.6)]' : 'opacity-0',
                )} />
                <span className="w-4 h-4">{s.icon}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </aside>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-8 py-8">
            <div className="max-w-3xl mx-auto pb-16 space-y-6">
              {section === 'getting-started' && <GettingStarted />}
              {section === 'features'        && <Features />}
              {section === 'api-keys'        && <ApiKeysGuide />}
              {section === 'install'         && <InstallGuide />}
              {section === 'shortcuts'       && <Shortcuts />}
              {section === 'faq'             && <Faq />}
              {section === 'about'           && <About />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sections ─────────────────────────────────────────────── */

function GettingStarted() {
  const t = useT();
  return (
    <>
      <SectionTitle title={t('help.gettingStartedTitle')} subtitle={t('help.gettingStartedSubtitle')} />

      <Card>
        <Step n={1} title={t('help.step1Title')}>
          <p>{t('help.step1P1')}</p>
          <p className="mt-2">{t('help.step1P2Pre')} <code className="bg-white/[0.05] px-1.5 py-0.5 rounded text-fiano-red font-mono text-[11px]">sk-…</code> {t('help.step1P2Post')}</p>
        </Step>
        <Step n={2} title={t('help.step2Title')}>
          <p>{t('help.step2P1')}</p>
          <Code>brew install ffmpeg yt-dlp</Code>
          <p className="mt-2 text-[11px] text-zinc-500">{t('help.step2P2Pre')} <code className="text-zinc-300">--enable-libass</code> {t('help.step2P2Post')}</p>
        </Step>
        <Step n={3} title={t('help.step3Title')}>
          <p>{t('help.step3P1')}</p>
          <ul className="list-disc list-inside space-y-1 mt-2 text-zinc-400">
            <li><strong className="text-zinc-200">{t('help.step3Bullet1Strong')}</strong> {t('help.step3Bullet1Rest')}</li>
            <li><strong className="text-zinc-200">{t('help.step3Bullet2Strong')}</strong> {t('help.step3Bullet2Rest')}</li>
            <li><strong className="text-zinc-200">{t('help.step3Bullet3Strong')}</strong> {t('help.step3Bullet3Rest')}</li>
          </ul>
        </Step>
        <Step n={4} title={t('help.step4Title')}>
          <p>{t('help.step4P1')}</p>
          <p className="mt-2 text-[11px] text-zinc-500">{t('help.step4P2')}</p>
        </Step>
        <Step n={5} title={t('help.step5Title')}>
          <p>{t('help.step5P1')}</p>
          <ul className="list-disc list-inside space-y-1 mt-2 text-zinc-400">
            <li><strong className="text-zinc-200">{t('help.step5Bullet1Strong')}</strong> {t('help.step5Bullet1Rest')}</li>
            <li><strong className="text-zinc-200">{t('help.step5Bullet2Strong')}</strong> {t('help.step5Bullet2Rest')}</li>
            <li><strong className="text-zinc-200">{t('help.step5Bullet3Strong')}</strong> {t('help.step5Bullet3Rest')}</li>
            <li><strong className="text-zinc-200">{t('help.step5Bullet4Strong')}</strong> {t('help.step5Bullet4Rest')}</li>
          </ul>
        </Step>
      </Card>
    </>
  );
}

function Features() {
  const t = useT();
  return (
    <>
      <SectionTitle title={t('help.featuresTitle')} subtitle={t('help.featuresSubtitle')} />

      <FeatureCard icon="🎯" title={t('help.feat1Title')}>
        {t('help.feat1Body')}
      </FeatureCard>

      <FeatureCard icon="📱" title={t('help.feat2Title')}>
        {t('help.feat2Body')}
      </FeatureCard>

      <FeatureCard icon="🎬" title={t('help.feat3Title')}>
        {t('help.feat3Body')}
      </FeatureCard>

      <FeatureCard icon="✂️" title={t('help.feat4Title')}>
        {t('help.feat4Body')}
      </FeatureCard>

      <FeatureCard icon="🗣️" title={t('help.feat5Title')}>
        {t('help.feat5Body')}
      </FeatureCard>

      <FeatureCard icon="🖼️" title={t('help.feat6Title')}>
        {t('help.feat6Body')}
      </FeatureCard>

      <FeatureCard icon="📝" title={t('help.feat7Title')}>
        {t('help.feat7Body')}
      </FeatureCard>
    </>
  );
}

function ApiKeysGuide() {
  const t = useT();
  return (
    <>
      <SectionTitle title={t('help.apiKeysTitle')} subtitle={t('help.apiKeysSubtitle')} />

      <Card>
        <h3 className="text-[14px] font-semibold text-zinc-100 mb-2">{t('help.apiOpenaiTitle')}</h3>
        <p className="text-[12px] text-zinc-400 mb-3">{t('help.apiOpenaiRequired')}</p>
        <ol className="list-decimal list-inside space-y-2 text-[12px] text-zinc-300">
          <li>{t('help.apiOpenaiStep1Pre')} <ExternalLink href="https://platform.openai.com/api-keys">platform.openai.com/api-keys</ExternalLink></li>
          <li>{t('help.apiOpenaiStep2Pre')} <strong>{t('help.apiOpenaiStep2Btn')}</strong></li>
          <li>{t('help.apiOpenaiStep3Pre')} <code className="bg-white/[0.05] px-1.5 py-0.5 rounded text-fiano-red font-mono text-[11px]">sk-…</code> {t('help.apiOpenaiStep3Post')}</li>
          <li>{t('help.apiOpenaiStep4')}</li>
        </ol>
        <Note>{t('help.apiOpenaiCosts')}</Note>
      </Card>

      <Card>
        <h3 className="text-[14px] font-semibold text-zinc-100 mb-2">{t('help.apiGeminiTitle')}</h3>
        <p className="text-[12px] text-zinc-400 mb-3">{t('help.apiGeminiRequired')}</p>
        <ol className="list-decimal list-inside space-y-2 text-[12px] text-zinc-300">
          <li>{t('help.apiGeminiStep1Pre')} <ExternalLink href="https://aistudio.google.com/apikey">aistudio.google.com/apikey</ExternalLink></li>
          <li>{t('help.apiGeminiStep2Pre')} <strong>{t('help.apiGeminiStep2Btn')}</strong> {t('help.apiGeminiStep2Post')}</li>
          <li>{t('help.apiGeminiStep3Pre')} <code className="bg-white/[0.05] px-1.5 py-0.5 rounded text-fiano-red font-mono text-[11px]">AIza…</code> {t('help.apiGeminiStep3Post')}</li>
          <li>{t('help.apiGeminiStep4')}</li>
        </ol>
        <Note>{t('help.apiGeminiNote')}</Note>
      </Card>
    </>
  );
}

function InstallGuide() {
  const t = useT();
  return (
    <>
      <SectionTitle title={t('help.installTitle')} subtitle={t('help.installSubtitle')} />

      <Card>
        <h3 className="text-[14px] font-semibold text-zinc-100 mb-2">{t('help.installMacTitle')}</h3>
        <p className="text-[12px] text-zinc-400 mb-3">{t('help.installMacIfNoBrew')}</p>
        <Code>{`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`}</Code>
        <p className="text-[12px] text-zinc-400 mt-4 mb-2">{t('help.installMacThenBoth')}</p>
        <Code>brew install ffmpeg yt-dlp</Code>
        <Note>{t('help.installMacLibassPre')} <code className="text-zinc-300">libass</code> {t('help.installMacLibassPost')}</Note>
      </Card>

      <Card>
        <h3 className="text-[14px] font-semibold text-zinc-100 mb-2">{t('help.installWinTitle')}</h3>
        <p className="text-[12px] text-zinc-400 mb-2">{t('help.installWinPowershell')}</p>
        <Code>{`winget install Gyan.FFmpeg
winget install yt-dlp.yt-dlp`}</Code>
        <p className="text-[12px] text-zinc-400 mt-4 mb-2">{t('help.installWinScoop')}</p>
        <Code>{`scoop install ffmpeg yt-dlp`}</Code>
      </Card>

      <Card>
        <h3 className="text-[14px] font-semibold text-zinc-100 mb-2">{t('help.installVerifyTitle')}</h3>
        <p className="text-[12px] text-zinc-400 mb-2">{t('help.installVerifyRun')}</p>
        <Code>{`ffmpeg -version
yt-dlp --version`}</Code>
        <p className="text-[12px] text-zinc-400 mt-3">{t('help.installVerifyDiagPre')} <strong className="text-zinc-200">{t('help.installVerifyDiagBold')}</strong> {t('help.installVerifyDiagPost')}</p>
      </Card>
    </>
  );
}

function Shortcuts() {
  const t = useT();
  return (
    <>
      <SectionTitle title={t('help.shortcutsTitle')} subtitle={t('help.shortcutsSubtitle')} />

      <Card>
        <h3 className="text-[14px] font-semibold text-zinc-100 mb-3">{t('help.shortcutsEditor')}</h3>
        <ShortcutTable rows={[
          ['Space',      t('help.scPlayPause')],
          ['S',          t('help.scSplit')],
          ['Cmd+Z',      t('help.scUndo')],
          ['Cmd+Shift+Z',t('help.scRedo')],
          ['Delete',     t('help.scDelete')],
          ['Shift+Delete',t('help.scRippleDelete')],
          ['← / →',      t('help.scFrame')],
          ['Shift+← / →',t('help.scSecond')],
        ]} />
      </Card>

      <Card>
        <h3 className="text-[14px] font-semibold text-zinc-100 mb-3">{t('help.shortcutsGlobal')}</h3>
        <ShortcutTable rows={[
          ['Cmd+,',  t('help.scOpenSettings')],
          ['Cmd+N',  t('help.scNewProject')],
          ['Cmd+W',  t('help.scCloseView')],
          ['Esc',    t('help.scCloseModal')],
        ]} />
      </Card>
    </>
  );
}

function Faq() {
  const t = useT();
  return (
    <>
      <SectionTitle title={t('help.faqTitle')} />

      <FaqItem q={t('help.faqStorage')}>
        {t('help.faqStorageA1Pre')} <code className="bg-white/[0.05] px-1.5 py-0.5 rounded text-fiano-red font-mono text-[11px]">~/Library/Application Support/fiano/projects/</code>.
        {' '}{t('help.faqStorageA2')}
      </FaqItem>

      <FaqItem q={t('help.faqFirstHighlight')}>
        {t('help.faqFirstHighlightA')}
      </FaqItem>

      <FaqItem q={t('help.faqOffline')}>
        {t('help.faqOfflineA')}
      </FaqItem>

      <FaqItem q={t('help.faqHevc')}>
        {t('help.faqHevcA1')} <code className="text-zinc-300 font-mono">userData/cache/transcoded/</code>.
        {' '}{t('help.faqHevcA2')}
      </FaqItem>

      <FaqItem q={t('help.faqSubtitles')}>
        {t('help.faqSubtitlesA')}
      </FaqItem>

      <FaqItem q={t('help.faqAiMask')}>
        {t('help.faqAiMaskA')}
      </FaqItem>

      <FaqItem q={t('help.faqExportOffline')}>
        {t('help.faqExportOfflineA')}
      </FaqItem>

      <FaqItem q={t('help.faqCosts')}>
        {t('help.faqCostsA')}
      </FaqItem>
    </>
  );
}

function About() {
  const t = useT();
  return (
    <>
      <SectionTitle title={t('help.aboutTitle')} />

      <Card>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-fiano-red/15 border border-fiano-red/30
                          flex items-center justify-center shrink-0">
            <FianoLogo variant="mark" className="w-7 h-auto" />
          </div>
          <div>
            <div className="text-[20px] font-bold tracking-tight">fiano</div>
            <div className="text-[12px] text-fiano-red/90 font-medium">{t('help.aboutTagline')}</div>
          </div>
        </div>
        <p className="text-[12px] text-zinc-400 leading-relaxed">
          {t('help.aboutBody')}
        </p>
      </Card>

      <Card>
        <h3 className="text-[14px] font-semibold text-zinc-100 mb-3">{t('help.aboutTechStack')}</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
          <KV k={t('help.techPlatform')}   v="Electron 31 (Mac + Windows)" />
          <KV k={t('help.techFrontend')}   v="React 18 + Tailwind + Zustand" />
          <KV k={t('help.techVideo')}      v="System FFmpeg (libass)" />
          <KV k={t('help.techDownload')}   v="yt-dlp (YouTube + Twitch)" />
          <KV k={t('help.techTranscript')} v="OpenAI Whisper" />
          <KV k={t('help.techTts')}        v="OpenAI TTS-1" />
          <KV k={t('help.techThumbnails')} v="Gemini 2.5 Flash" />
          <KV k={t('help.techAiMask')}     v="SAM 1 ONNX (local)" />
        </div>
      </Card>

      <Card>
        <h3 className="text-[14px] font-semibold text-zinc-100 mb-2">{t('help.privacyTitle')}</h3>
        <ul className="list-disc list-inside space-y-1 text-[12px] text-zinc-400">
          <li>{t('help.privacy1')}</li>
          <li>{t('help.privacy2')}</li>
          <li>{t('help.privacy3')}</li>
          <li>{t('help.privacy4')}</li>
        </ul>
      </Card>
    </>
  );
}

/* ─── UI Helpers ──────────────────────────────────────────── */

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-[22px] font-semibold tracking-tight text-zinc-50">{title}</h2>
      {subtitle && <p className="text-[12px] text-zinc-500 mt-1">{subtitle}</p>}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="glass p-6 space-y-4">{children}</div>;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-7 h-7 rounded-full bg-fiano-red text-white text-[12px] font-bold
                      flex items-center justify-center shadow-[0_0_10px_rgba(255,16,57,0.4)]">{n}</div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[13px] font-semibold text-zinc-100 mb-1.5">{title}</h3>
        <div className="text-[12px] text-zinc-400 leading-relaxed space-y-1">{children}</div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="glass p-5 flex gap-4">
      <div className="shrink-0 w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06]
                      flex items-center justify-center text-[20px]">{icon}</div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[13px] font-semibold text-zinc-100 mb-1">{title}</h3>
        <p className="text-[12px] text-zinc-400 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

function FaqItem({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-white/[0.02] transition">
        <span className="text-[13px] font-medium text-zinc-100">{q}</span>
        <svg viewBox="0 0 16 16" className={clsx('w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform', open && 'rotate-180')}
             fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-4 text-[12px] text-zinc-400 leading-relaxed border-t border-white/[0.04]">
          <div className="pt-3">{children}</div>
        </div>
      )}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-black/60 border border-white/[0.08] rounded-lg p-3 text-[11px] font-mono text-zinc-200 overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 px-3 py-2 rounded-lg bg-fiano-red/[0.05] border border-fiano-red/20 text-[11px] text-zinc-300 leading-relaxed">
      <strong className="text-fiano-red">Note:</strong> {children}
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
       className="text-fiano-red hover:brightness-125 underline underline-offset-2">
      {children}
    </a>
  );
}

function ShortcutTable({ rows }: { rows: Array<[string, string]> }) {
  return (
    <table className="w-full text-[12px]">
      <tbody>
        {rows.map(([key, desc], i) => (
          <tr key={i} className="border-b border-white/[0.04] last:border-0">
            <td className="py-2 pr-4 w-32">
              <kbd className="px-2 py-1 rounded-md bg-white/[0.06] border border-white/[0.10]
                              text-[10px] font-mono text-zinc-200">{key}</kbd>
            </td>
            <td className="py-2 text-zinc-400">{desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-[0.16em]">{k}</div>
      <div className="text-zinc-200">{v}</div>
    </div>
  );
}

/* ─── Icons ──────────────────────────────────────────────── */

function IconRocket() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full"><path d="M5 13l4 4 6-9 4-4-3-3-9 6-2 6z"/><path d="M9 17l-3 3"/></svg>;
}
function IconStar() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full"><path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>;
}
function IconKey() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full"><circle cx="8" cy="14" r="4"/><path d="M11 12l9-9 M16 7l3 3"/></svg>;
}
function IconTerminal() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 9l3 3-3 3 M12 15h6"/></svg>;
}
function IconKeyboard() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01 M10 10h.01 M14 10h.01 M18 10h.01 M6 14h12"/></svg>;
}
function IconQuestion() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full"><circle cx="12" cy="12" r="9"/><path d="M9 9c0-2 1.5-3 3-3s3 1 3 3-3 3-3 5 M12 17h.01"/></svg>;
}
function IconInfo() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01 M12 12v5"/></svg>;
}
