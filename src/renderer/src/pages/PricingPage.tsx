import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { FianoLogo } from '../components/FianoLogo';
import { useAuth } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import { useT } from '../lib/i18n';

/**
 * PricingPage — 3 Plans im Apple/Liquid-Glass-Stil.
 * Phase 6.2: kein Free-Tier, kein Trial. Sign-up → direkt Plan wählen → Stripe Checkout.
 *
 * Plans:
 *   - Creator           17,99 €/mo    (subscription)
 *   - Pro               29,99 €/mo    (subscription, hervorgehoben)
 *   - Studio Lifetime  299 €          (one-time payment)
 *
 * Klick auf "Get [Plan]" → Edge Function 'stripe-checkout' → Stripe-URL → System-Browser.
 * Nach erfolgreicher Zahlung: Stripe-Webhook updated subscriptions-Tabelle, Realtime-
 * Subscription im AuthStore reagiert → User landet automatisch in der App.
 */

type PlanId = 'creator' | 'pro' | 'studio_lifetime';

interface PlanDef {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  cta: string;
  highlight?: boolean;
}

export function PricingPage() {
  const t = useT();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const session = useAuth((s) => s.session);
  const subscription = useAuth((s) => s.subscription);

  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Bewusst KEIN useEffect-Redirect bei active subscription — Pro-User soll
  // diese Seite besuchen können um auf Lifetime upzugraden, Creator auf Pro etc.
  // Auto-Navigate-zu-Home nach Checkout-Success läuft im AuthStore-Polling.

  // Aktueller Plan: bestimmt welche Card "Current plan" zeigt + welche Karten
  // disabled sind (man kann nicht zu einem niedrigeren Tier wechseln).
  const currentPlan = subscription?.lifetime ? 'studio_lifetime' : subscription?.plan;
  const planRank: Record<PlanId, number> = { creator: 1, pro: 2, studio_lifetime: 3 };
  const currentRank = currentPlan ? planRank[currentPlan as PlanId] : 0;

  const plans: PlanDef[] = [
    {
      id: 'creator',
      name: t('pricing.creatorName'),
      price: '17,99 €',
      period: t('pricing.perMonth'),
      tagline: t('pricing.creatorTagline'),
      features: [
        t('pricing.f.autoHighlights'),
        t('pricing.f.manualHighlights'),
        t('pricing.f.tiktokTab'),
        t('pricing.f.builder'),
        t('pricing.f.multiTrack'),
        t('pricing.f.subtitleStudio'),
        t('pricing.f.musicIntro'),
        t('pricing.f.basicEffects'),
        t('pricing.f.fullhd'),
        t('pricing.f.creatorLimit'),
      ],
      cta: t('pricing.getCreator'),
    },
    {
      id: 'pro',
      name: t('pricing.proName'),
      price: '29,99 €',
      period: t('pricing.perMonth'),
      tagline: t('pricing.proTagline'),
      highlight: true,
      features: [
        t('pricing.f.allCreator'),
        t('pricing.f.podcastHighlights'),
        t('pricing.f.thumbnailGen'),
        t('pricing.f.aiMask'),
        t('pricing.f.stabilizer'),
        t('pricing.f.lutFilters'),
        t('pricing.f.layeredSubs'),
        t('pricing.f.export4k'),
        t('pricing.f.qualityMode'),
        t('pricing.f.unlimited'),
        t('pricing.f.priorityQueue'),
        t('pricing.f.earlyAccess'),
      ],
      cta: t('pricing.getPro'),
    },
    {
      id: 'studio_lifetime',
      name: t('pricing.lifetimeName'),
      price: '299 €',
      period: t('pricing.oneTime'),
      tagline: t('pricing.lifetimeTagline'),
      features: [
        t('pricing.f.allPro'),
        t('pricing.f.lifetimeBadge'),
        t('pricing.f.allFutureUpdates'),
        t('pricing.f.allFutureLocal'),
        t('pricing.f.lifetimeNoSub'),
      ],
      cta: t('pricing.getLifetime'),
    },
  ];

  const startCheckout = async (planId: PlanId) => {
    if (busy) return;
    setBusy(planId);
    setError(null);

    try {
      // Loopback-URL als success/cancel — User bleibt in der App nachher.
      // Cancel: zurück zur PricingPage. Success: zurück zur App (loopback fängt
      // den 'session_id' query param ab und schließt — Webhook macht den Rest).
      const lp = await window.api.invoke<{ callbackUrl: string | null }>('auth.getLoopbackUrl');
      const baseUrl = lp?.ok && lp.data?.callbackUrl
        ? lp.data.callbackUrl.replace('/auth-callback', '')
        : 'http://127.0.0.1:51999';

      const accessToken = session?.access_token;
      if (!accessToken) {
        setError(t('pricing.errorNotAuthed'));
        setBusy(null);
        return;
      }

      // Edge Function aufrufen
      const supabaseUrl = (supabase as unknown as { supabaseUrl: string }).supabaseUrl
        ?? import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          plan: planId,
          success_url: `${baseUrl}/checkout-success?plan=${planId}`,
          cancel_url:  `${baseUrl}/checkout-cancel`,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data?.error ?? `Checkout failed (HTTP ${res.status})`);
        setBusy(null);
        return;
      }

      // Stripe-Checkout-URL extern öffnen
      await window.api.invoke('shell.openExternal', { url: data.url });
      // busy bleibt aktiv bis User zurückkommt (Realtime-Sync übernimmt dann)
      // — wir resetten nach 3 Sek damit der Button nicht ewig "loading" zeigt
      setTimeout(() => setBusy(null), 3000);
    } catch (err: any) {
      console.warn('[pricing] checkout failed:', err);
      setError(err?.message ?? String(err));
      setBusy(null);
    }
  };

  return (
    <div className="relative h-full flex flex-col bg-fiano-black overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="fiano-bg-tint" />
        <div className="fiano-bg-glow" />
      </div>

      <div className="relative h-full overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-12">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-10">
            <FianoLogo className="h-16 w-auto mb-4" />
            <h1 className="text-[28px] font-semibold tracking-tight">
              {currentPlan ? t('pricing.headlineUpgrade') : t('pricing.headline')}
            </h1>
            <p className="text-[13px] text-zinc-400 mt-2 max-w-md">
              {currentPlan ? t('pricing.subheadUpgrade') : t('pricing.subhead')}
            </p>
            {user?.email && (
              <div className="text-[11px] text-zinc-500 mt-3">
                {t('pricing.signedInAs').replace('{email}', user.email)}
                {' · '}
                <button onClick={signOut} className="text-fiano-red hover:brightness-110 underline-offset-2 hover:underline">
                  {t('auth.signOut')}
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="max-w-md mx-auto mb-6 text-[12px] text-fiano-red bg-fiano-red/[0.08] border border-fiano-red/20 rounded-lg px-4 py-3 text-center">
              {error}
            </div>
          )}

          {/* 3 Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {plans.map((plan) => {
              const isCurrent = currentPlan === plan.id;
              const isLowerTier = currentRank > 0 && planRank[plan.id] <= currentRank;
              return (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  busy={busy === plan.id}
                  disabled={busy !== null && busy !== plan.id}
                  current={isCurrent}
                  lowerTier={isLowerTier && !isCurrent}
                  onSelect={() => startCheckout(plan.id)}
                />
              );
            })}
          </div>

          <div className="text-center mt-8 text-[11px] text-zinc-600 max-w-md mx-auto">
            {t('pricing.footnote')}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  plan, busy, disabled, current, lowerTier, onSelect,
}: {
  plan: PlanDef;
  busy: boolean;
  disabled: boolean;
  current: boolean;
  lowerTier: boolean;
  onSelect: () => void;
}) {
  const t = useT();

  // Button disabled wenn: gerade busy, anderer Plan busy, current plan, oder lower tier
  const buttonDisabled = busy || disabled || current || lowerTier;
  const buttonLabel = busy
    ? t('pricing.opening')
    : current
      ? t('pricing.currentPlan')
      : lowerTier
        ? t('pricing.notAvailable')
        : plan.cta;

  return (
    <div className={clsx(
      'relative rounded-3xl p-7 transition-all flex flex-col',
      'backdrop-blur-xl',
      current
        ? 'bg-gradient-to-b from-emerald-500/[0.10] to-emerald-500/[0.02] border-2 border-emerald-500/40'
        : plan.highlight
          ? 'bg-gradient-to-b from-fiano-red/[0.12] to-fiano-red/[0.02] border-2 border-fiano-red/40 shadow-[0_0_60px_rgba(255,16,57,0.18)]'
          : 'bg-white/[0.03] border border-white/[0.08]',
    )}>
      {current && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full
                        bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider">
          {t('pricing.currentPlan')}
        </div>
      )}
      {!current && plan.highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full
                        bg-fiano-red text-white text-[10px] font-bold uppercase tracking-wider
                        shadow-[0_0_20px_rgba(255,16,57,0.6)]">
          {t('pricing.mostPopular')}
        </div>
      )}

      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-semibold">
          {plan.name}
        </div>
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="text-[34px] font-bold tracking-tight">{plan.price}</span>
          <span className="text-[12px] text-zinc-500">{plan.period}</span>
        </div>
        <div className="text-[12px] text-zinc-400 mt-1.5 leading-snug">{plan.tagline}</div>
      </div>

      <button
        onClick={onSelect}
        disabled={buttonDisabled}
        className={clsx(
          'w-full py-3 rounded-xl text-[13px] font-semibold transition-all',
          current
            ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 cursor-default'
            : lowerTier
              ? 'bg-white/[0.02] border border-white/[0.05] text-zinc-600 cursor-not-allowed'
              : plan.highlight
                ? busy || disabled
                  ? 'bg-fiano-red/40 text-white/50 cursor-not-allowed'
                  : 'bg-fiano-red text-white hover:brightness-110 hover:shadow-[0_0_24px_rgba(255,16,57,0.5)] active:scale-[0.98]'
                : busy || disabled
                  ? 'bg-white/[0.04] border border-white/[0.06] text-zinc-500 cursor-not-allowed'
                  : 'bg-white/[0.06] border border-white/[0.12] text-white hover:bg-white/[0.10] hover:border-fiano-red/40',
        )}
      >
        {buttonLabel}
      </button>

      {/* Features */}
      <ul className="space-y-2 mt-6 flex-1">
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px] text-zinc-300 leading-snug">
            <span className={clsx(
              'shrink-0 w-4 h-4 rounded-full mt-0.5 flex items-center justify-center text-[9px]',
              plan.highlight ? 'bg-fiano-red/20 text-fiano-red' : 'bg-emerald-500/15 text-emerald-400',
            )}>
              ✓
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
