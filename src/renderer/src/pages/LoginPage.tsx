import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';

/**
 * LoginPage — Email/Password + Google OAuth.
 *
 * Pre-App-Gate: Wenn nicht eingeloggt, zeigt der App-Router diese Page.
 * Liquid-Glass-Design im fiano-Branding (rot, Glass-Karten, dezent animierter Background).
 */
export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const signIn = useAuth((s) => s.signInWithPassword);
  const signInGoogle = useAuth((s) => s.signInWithGoogle);
  const resendConfirmation = useAuth((s) => s.resendConfirmation);
  const lastError = useAuth((s) => s.lastError);
  const clearError = useAuth((s) => s.clearError);
  const user = useAuth((s) => s.user);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  // Wenn schon eingeloggt → direkt weiter (Routing-Gate kümmert sich um Plan-Check)
  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  // Bei Mount: alten Error löschen
  useEffect(() => { clearError(); }, [clearError]);

  // Cooldown-Timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !email || !password) return;
    setBusy(true);
    const res = await signIn(email.trim(), password);
    setBusy(false);
    setNeedsConfirmation(!!res.needsConfirmation);
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resendStatus === 'sending' || !email) return;
    setResendStatus('sending');
    const res = await resendConfirmation(email.trim());
    if (res.ok) {
      setResendStatus('sent');
      setResendCooldown(60);
    } else {
      setResendStatus('idle');
    }
  };

  const onGoogle = async () => {
    if (busy) return;
    setBusy(true);
    await signInGoogle();
    setBusy(false);
  };

  return (
    <div className="relative h-full flex flex-col bg-fiano-black overflow-hidden">
      {/* Background-Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="fiano-bg-tint" />
        <div className="fiano-bg-glow" />
      </div>

      <div className="relative h-full flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Glass-Card */}
          <div className="glass p-7 space-y-5">
            <div>
              <h1 className="text-[20px] font-semibold tracking-tight">{t('auth.signInTitle')}</h1>
              <p className="text-[12px] text-zinc-500 mt-1">{t('auth.signInSubtitle')}</p>
            </div>

            {/* Google */}
            <button
              onClick={onGoogle}
              disabled={busy}
              className={clsx(
                'w-full flex items-center justify-center gap-3 py-2.5 rounded-lg',
                'bg-white text-zinc-900 font-semibold text-[13px]',
                'hover:brightness-95 transition disabled:opacity-50',
              )}
            >
              <GoogleIcon />
              {t('auth.continueWithGoogle')}
            </button>

            <div className="flex items-center gap-3 text-[10px] text-zinc-600 uppercase tracking-[0.16em]">
              <div className="flex-1 h-px bg-white/[0.08]" />
              <span>{t('auth.or')}</span>
              <div className="flex-1 h-px bg-white/[0.08]" />
            </div>

            {/* Email/Password */}
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  {t('auth.email')}
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={busy}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-[13px]
                             bg-white/[0.04] border border-white/[0.08] text-white
                             placeholder:text-zinc-600
                             focus:outline-none focus:bg-white/[0.06] focus:border-fiano-red/50
                             transition-colors"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  {t('auth.password')}
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={busy}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-[13px]
                             bg-white/[0.04] border border-white/[0.08] text-white
                             placeholder:text-zinc-600
                             focus:outline-none focus:bg-white/[0.06] focus:border-fiano-red/50
                             transition-colors"
                />
              </div>

              {lastError && (
                <div className="text-[11px] text-fiano-red bg-fiano-red/[0.08] border border-fiano-red/20 rounded-md px-3 py-2">
                  {lastError}
                </div>
              )}

              {/* Resend-Block — erscheint wenn signIn 'Email not confirmed' returnt */}
              {needsConfirmation && (
                <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5 space-y-2">
                  <div className="text-[11px] text-amber-300">{t('auth.notConfirmedHint')}</div>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0 || resendStatus === 'sending' || !email}
                    className={clsx(
                      'text-[11px] font-medium px-3 py-1.5 rounded-md transition w-full',
                      resendCooldown > 0 || resendStatus === 'sending' || !email
                        ? 'bg-white/[0.04] text-zinc-500 cursor-not-allowed'
                        : 'bg-fiano-red text-white hover:brightness-110',
                    )}
                  >
                    {resendStatus === 'sending'
                      ? t('auth.sendingEmail')
                      : resendCooldown > 0
                        ? t('auth.resendIn').replace('{seconds}', String(resendCooldown))
                        : t('auth.resendEmail')}
                  </button>
                  {resendStatus === 'sent' && resendCooldown > 0 && (
                    <div className="text-[10px] text-emerald-400">✓ {t('auth.resendSuccess')}</div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={busy || !email || !password}
                className={clsx(
                  'w-full py-2.5 rounded-lg text-[13px] font-semibold transition-all',
                  busy || !email || !password
                    ? 'bg-fiano-red/40 text-white/50 cursor-not-allowed'
                    : 'bg-fiano-red text-white hover:brightness-110 hover:shadow-[0_0_24px_rgba(255,16,57,0.45)] active:scale-[0.98]',
                )}
              >
                {busy ? t('auth.signingIn') : t('auth.signIn')}
              </button>
            </form>

            <div className="text-[12px] text-zinc-500 text-center pt-2 border-t border-white/[0.06]">
              {t('auth.noAccount')}{' '}
              <Link to="/signup" className="text-fiano-red hover:brightness-110 font-medium">
                {t('auth.signUp')}
              </Link>
            </div>
          </div>

          {/* Footer-Hinweise */}
          <div className="text-center mt-6 text-[10px] text-zinc-600">
            {t('auth.byContinuing')}
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.61z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.83.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.97 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.16.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z" fill="#FBBC05"/>
      <path d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58A8.97 8.97 0 0 0 9 0 9 9 0 0 0 .96 4.96L3.97 7.3C4.68 5.16 6.66 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
