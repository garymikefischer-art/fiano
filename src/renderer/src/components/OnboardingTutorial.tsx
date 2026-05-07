import { useState } from 'react';
import clsx from 'clsx';
import { useT } from '../lib/i18n';

const ONBOARDING_KEY = 'fiano-onboarding-seen-v1';

/** Wurde der Tutorial schon einmal gesehen? */
export function hasSeenOnboarding(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return true;
  }
}

export function markOnboardingSeen(): void {
  try { window.localStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* ignore */ }
}

export function clearOnboardingSeen(): void {
  try { window.localStorage.removeItem(ONBOARDING_KEY); } catch { /* ignore */ }
}

interface Step {
  iconBg: string;
  icon: React.ReactNode;
  titleKey: string;
  bodyKey: string;
}

const STEPS: Step[] = [
  {
    iconBg: 'from-fiano-red/30 to-fiano-red/10',
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
    titleKey: 'onboarding.step1Title',
    bodyKey: 'onboarding.step1Body',
  },
  {
    iconBg: 'from-purple-500/30 to-blue-500/10',
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7v10c0 2 1 3 3 3h12c2 0 3-1 3-3V7c0-2-1-3-3-3H6c-2 0-3 1-3 3z" />
        <path d="M9 9l5 3-5 3V9z" fill="currentColor" />
      </svg>
    ),
    titleKey: 'onboarding.step2Title',
    bodyKey: 'onboarding.step2Body',
  },
  {
    iconBg: 'from-emerald-500/30 to-cyan-500/10',
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="14" height="12" rx="2" />
        <path d="M17 10l4-2v8l-4-2" />
      </svg>
    ),
    titleKey: 'onboarding.step3Title',
    bodyKey: 'onboarding.step3Body',
  },
  {
    iconBg: 'from-orange-500/30 to-red-500/10',
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12h18" />
        <path d="M12 3l9 9-9 9" />
        <circle cx="6" cy="12" r="2" />
      </svg>
    ),
    titleKey: 'onboarding.step4Title',
    bodyKey: 'onboarding.step4Body',
  },
  {
    iconBg: 'from-yellow-500/30 to-amber-500/10',
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
    titleKey: 'onboarding.step5Title',
    bodyKey: 'onboarding.step5Body',
  },
];

export function OnboardingTutorial({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  const close = () => {
    markOnboardingSeen();
    onClose();
  };

  const next = () => {
    if (isLast) close();
    else setStep((s) => s + 1);
  };

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="glass w-[640px] max-w-[92vw] p-7 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.6)] relative">
        {/* Skip-Button oben rechts */}
        <button
          onClick={close}
          className="absolute top-3 right-4 text-[11px] text-zinc-500 hover:text-zinc-200 transition"
        >
          {t('onboarding.skip')}
        </button>

        {/* Step-Counter */}
        <div className="text-[10px] uppercase tracking-[0.18em] text-fiano-red font-semibold mb-2">
          {step + 1} / {STEPS.length} · {t('onboarding.title')}
        </div>

        {/* Icon + Title */}
        <div className="flex items-start gap-4 mb-4">
          <div className={clsx(
            'shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-white',
            'bg-gradient-to-br', current.iconBg,
            'border border-white/[0.08] shadow-[0_8px_24px_rgba(0,0,0,0.35)]',
          )}>
            {current.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[18px] font-semibold text-zinc-100 mb-1.5">{t(current.titleKey)}</h2>
            <p className="text-[12px] text-zinc-300 leading-relaxed">{t(current.bodyKey)}</p>
          </div>
        </div>

        {/* Progress Dots */}
        <div className="flex items-center gap-1.5 mb-5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={clsx(
                'h-1.5 rounded-full transition-all',
                i === step ? 'w-8 bg-fiano-red' : 'w-1.5 bg-white/[0.15] hover:bg-white/[0.25]',
              )}
              aria-label={`Step ${i + 1}`}
            />
          ))}
        </div>

        {/* Action-Buttons */}
        <div className="flex justify-between items-center">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="text-[12px] text-zinc-400 hover:text-white px-3 py-2 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            ← {t('onboarding.back')}
          </button>
          <button
            onClick={next}
            className="px-5 py-2 rounded-lg text-[12px] font-semibold bg-fiano-red text-white hover:brightness-110 hover:shadow-[0_0_18px_rgba(255,16,57,0.45)] active:scale-[0.98] transition-all"
          >
            {isLast ? t('onboarding.getStarted') : t('onboarding.next')} →
          </button>
        </div>
      </div>
    </div>
  );
}
