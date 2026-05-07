import { FianoLogo } from '../components/FianoLogo';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';

/**
 * PricingPage — Phase 6.2 wird die echten Stripe-Checkout-Karten implementieren.
 * Phase 6.1 Stub: zeigt einen Hinweis dass der Plan noch nicht aktiv ist
 * + Sign-Out-Option, falls der User sich vertan hat.
 */
export function PricingPage() {
  const t = useT();
  const signOut = useAuth((s) => s.signOut);
  const user = useAuth((s) => s.user);

  return (
    <div className="relative h-full flex flex-col bg-fiano-black overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="fiano-bg-tint" />
        <div className="fiano-bg-glow" />
      </div>

      <div className="relative h-full flex items-center justify-center p-8">
        <div className="w-full max-w-md text-center">
          <FianoLogo className="h-20 w-auto mx-auto mb-6" />

          <div className="glass p-7 space-y-4">
            <h1 className="text-[20px] font-semibold tracking-tight">{t('pricing.welcomeTitle')}</h1>
            <p className="text-[12px] text-zinc-400 leading-relaxed">
              {t('pricing.welcomeBody').replace('{email}', user?.email ?? '')}
            </p>

            <div className="rounded-xl border border-fiano-red/20 bg-fiano-red/[0.05] p-4 text-[12px] text-zinc-300">
              {t('pricing.phase62Soon')}
            </div>

            <button
              onClick={signOut}
              className="text-[11px] text-zinc-500 hover:text-fiano-red transition mt-2"
            >
              {t('auth.signOut')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
