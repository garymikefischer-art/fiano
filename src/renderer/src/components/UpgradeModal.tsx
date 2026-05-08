/**
 * UpgradeModal — Apple-Liquid-Glass Dialog der erscheint wenn ein User auf
 * ein gelocktes Feature klickt. Liest globalen Store-State.
 *
 * Wird in App.tsx einmal gemountet. Render-no-op wenn kein Lock-Feature aktiv.
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../lib/i18n';
import { useUpgradeModal } from '../stores/upgradeModalStore';
import { FEATURE_LABEL_KEY, FEATURE_MIN_PLAN } from '../lib/features';
import type { Plan } from '../stores/authStore';
import { useAuth } from '../stores/authStore';

const PLAN_NAME_KEY: Record<Plan, string> = {
  creator: 'pricing.creatorName',
  pro: 'pricing.proName',
  studio_lifetime: 'pricing.lifetimeName',
};

/** required-plan → highlight-Param der PricingPage. */
function highlightForPlan(plan: Plan): 'pro' | 'lifetime' | 'creator' {
  if (plan === 'studio_lifetime') return 'lifetime';
  if (plan === 'pro') return 'pro';
  return 'creator';
}

export function UpgradeModal() {
  const t = useT();
  const featureId = useUpgradeModal((s) => s.featureId);
  const close = useUpgradeModal((s) => s.close);
  const subscription = useAuth((s) => s.subscription);
  const currentPlan = subscription?.plan ?? null;

  // ESC-Taste schließt
  useEffect(() => {
    if (!featureId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [featureId, close]);

  if (!featureId) return null;

  const requiredPlan = FEATURE_MIN_PLAN[featureId];
  const featureName = t(FEATURE_LABEL_KEY[featureId]);
  const requiredPlanName = t(PLAN_NAME_KEY[requiredPlan]);
  const currentPlanName = currentPlan ? t(PLAN_NAME_KEY[currentPlan]) : '—';

  const onUpgrade = () => {
    const highlight = highlightForPlan(requiredPlan);
    window.location.hash = `#/pricing?highlight=${highlight}`;
    close();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-md animate-fade-in"
      onClick={close}
    >
      <div
        className="glass relative w-[480px] max-w-[92vw] p-7 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close-X */}
        <button
          onClick={close}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition"
          aria-label={t('upgradeModal.close')}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M6 18L18 6" />
          </svg>
        </button>

        {/* Schloss-Icon im Glow-Kreis */}
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-fiano-red/30 to-fiano-red/5 border border-fiano-red/20 shadow-[0_0_24px_rgba(255,16,57,0.25)]">
            <svg viewBox="0 0 24 24" className="w-7 h-7 text-fiano-red" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <div className="text-[10px] uppercase tracking-[0.18em] text-fiano-red font-semibold text-center mb-2">
          {t('upgradeModal.eyebrow')}
        </div>
        <h2 className="text-[18px] font-semibold text-zinc-100 text-center mb-2">
          {featureName}
        </h2>
        <p className="text-[13px] text-zinc-300 text-center leading-relaxed mb-5">
          {t('upgradeModal.body').replace('{plan}', requiredPlanName)}
        </p>

        {/* Plan-Vergleich */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="rounded-xl p-3 bg-white/[0.03] border border-white/[0.06]">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              {t('upgradeModal.currentPlan')}
            </div>
            <div className="text-[13px] font-medium text-zinc-200">
              {currentPlanName}
            </div>
          </div>
          <div className="rounded-xl p-3 bg-fiano-red/10 border border-fiano-red/30">
            <div className="text-[10px] uppercase tracking-wider text-fiano-red/80 mb-1">
              {t('upgradeModal.requiredPlan')}
            </div>
            <div className="text-[13px] font-semibold text-zinc-100">
              {requiredPlanName}
            </div>
          </div>
        </div>

        {/* Action-Buttons */}
        <div className="flex gap-2">
          <button
            onClick={close}
            className="flex-1 px-4 py-2.5 rounded-lg text-[12px] text-zinc-300 hover:text-white hover:bg-white/[0.06] transition"
          >
            {t('upgradeModal.maybeLater')}
          </button>
          <button
            onClick={onUpgrade}
            className="flex-1 px-4 py-2.5 rounded-lg text-[12px] font-semibold bg-fiano-red text-white hover:brightness-110 hover:shadow-[0_0_18px_rgba(255,16,57,0.45)] active:scale-[0.98] transition-all"
          >
            {t('upgradeModal.upgradeNow')} →
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
