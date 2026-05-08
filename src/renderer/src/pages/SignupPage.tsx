import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { checkPasswordStrength, strengthLabel, strengthColor } from '../lib/passwordStrength';

/**
 * SignupPage — Email/Password Sign-up.
 *
 * Nach erfolgreichem Sign-up:
 *  - Wenn Email-Confirmation an ist (Default in Supabase): User sieht "check email" Hinweis,
 *    bleibt auf der Seite, kein Auto-Login.
 *  - Wenn Email-Confirmation aus ist: direkt eingeloggt → router schickt zur Pricing-Page.
 */
export function SignupPage() {
  const t = useT();
  const navigate = useNavigate();
  const signUp = useAuth((s) => s.signUpWithPassword);
  const signInGoogle = useAuth((s) => s.signInWithGoogle);
  const resendConfirmation = useAuth((s) => s.resendConfirmation);
  const lastError = useAuth((s) => s.lastError);
  const clearError = useAuth((s) => s.clearError);
  const user = useAuth((s) => s.user);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  // Cooldown nach Resend (verhindert spammen + zeigt Status)
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Cooldown-Timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleResend = async () => {
    if (resendCooldown > 0 || resendStatus === 'sending') return;
    setResendStatus('sending');
    const res = await resendConfirmation(email);
    if (res.ok) {
      setResendStatus('sent');
      setResendCooldown(60);
    } else {
      setResendStatus('error');
    }
  };

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  useEffect(() => { clearError(); }, [clearError]);

  const strength = useMemo(() => checkPasswordStrength(password), [password]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !email || !strength.meetsAll) return;
    setBusy(true);
    const res = await signUp(email.trim(), password);
    setBusy(false);
    if (res.ok && !useAuth.getState().session) {
      // Sign-up okay aber keine Session → Email-Confirmation an
      setNeedsConfirmation(true);
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
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="fiano-bg-tint" />
        <div className="fiano-bg-glow" />
      </div>

      <div className="relative h-full flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="glass p-7 space-y-5">
            {needsConfirmation ? (
              <div className="text-center space-y-3 py-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-fiano-red/15 border border-fiano-red/30 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-7 h-7 text-fiano-red" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>
                <h2 className="text-[16px] font-semibold text-zinc-100">{t('auth.checkEmailTitle')}</h2>
                <p className="text-[12px] text-zinc-400 leading-relaxed">{t('auth.checkEmailBody').replace('{email}', email)}</p>

                {/* Resend-Block */}
                <div className="pt-3 mt-2 border-t border-white/[0.06] space-y-2">
                  <div className="text-[11px] text-zinc-500">{t('auth.didntReceive')}</div>
                  <button
                    onClick={handleResend}
                    disabled={resendCooldown > 0 || resendStatus === 'sending'}
                    className={clsx(
                      'text-[12px] font-medium px-4 py-2 rounded-lg transition w-full',
                      resendCooldown > 0 || resendStatus === 'sending'
                        ? 'bg-white/[0.04] border border-white/[0.06] text-zinc-500 cursor-not-allowed'
                        : 'bg-white/[0.04] border border-white/[0.10] text-zinc-300 hover:bg-white/[0.08] hover:text-white',
                    )}
                  >
                    {resendStatus === 'sending'
                      ? t('auth.sendingEmail')
                      : resendCooldown > 0
                        ? t('auth.resendIn').replace('{seconds}', String(resendCooldown))
                        : t('auth.resendEmail')}
                  </button>
                  {resendStatus === 'sent' && resendCooldown > 0 && (
                    <div className="text-[11px] text-emerald-400">✓ {t('auth.resendSuccess')}</div>
                  )}
                  {resendStatus === 'error' && lastError && (
                    <div className="text-[11px] text-fiano-red bg-fiano-red/[0.08] border border-fiano-red/20 rounded-md px-3 py-2 text-left">
                      {lastError}
                    </div>
                  )}
                </div>

                <Link
                  to="/login"
                  className="inline-block mt-2 text-[12px] text-fiano-red hover:brightness-110 font-medium"
                >
                  {t('auth.backToSignIn')}
                </Link>
              </div>
            ) : (
              <>
                <div>
                  <h1 className="text-[20px] font-semibold tracking-tight">{t('auth.signUpTitle')}</h1>
                  <p className="text-[12px] text-zinc-500 mt-1">{t('auth.signUpSubtitle')}</p>
                </div>

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
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      disabled={busy}
                      className="w-full mt-1 px-3 py-2 rounded-lg text-[13px]
                                 bg-white/[0.04] border border-white/[0.08] text-white
                                 placeholder:text-zinc-600
                                 focus:outline-none focus:bg-white/[0.06] focus:border-fiano-red/50
                                 transition-colors"
                    />

                    {/* Live Strength-Indicator */}
                    {password.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex gap-1 h-1">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div
                              key={i}
                              className={clsx(
                                'flex-1 rounded-full transition-colors',
                                i <= strength.score ? strengthColor(strength.score) : 'bg-white/[0.06]',
                              )}
                            />
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-500">
                            {strengthLabel(strength.score, t)}
                          </span>
                        </div>

                        {/* Rule-Checkliste — zeigt was fehlt */}
                        {!strength.meetsAll && (
                          <ul className="text-[10px] text-zinc-500 space-y-0.5 mt-1.5">
                            <Rule ok={strength.rules.length}  label={t('auth.ruleLength')} />
                            <Rule ok={strength.rules.upper}   label={t('auth.ruleUpper')} />
                            <Rule ok={strength.rules.lower}   label={t('auth.ruleLower')} />
                            <Rule ok={strength.rules.digit}   label={t('auth.ruleDigit')} />
                            <Rule ok={strength.rules.special} label={t('auth.ruleSpecial')} />
                          </ul>
                        )}
                      </div>
                    )}
                  </div>

                  {lastError && (
                    <div className="text-[11px] text-fiano-red bg-fiano-red/[0.08] border border-fiano-red/20 rounded-md px-3 py-2">
                      {lastError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={busy || !email || !strength.meetsAll}
                    className={clsx(
                      'w-full py-2.5 rounded-lg text-[13px] font-semibold transition-all',
                      busy || !email || !strength.meetsAll
                        ? 'bg-fiano-red/40 text-white/50 cursor-not-allowed'
                        : 'bg-fiano-red text-white hover:brightness-110 hover:shadow-[0_0_24px_rgba(255,16,57,0.45)] active:scale-[0.98]',
                    )}
                  >
                    {busy ? t('auth.signingUp') : t('auth.signUp')}
                  </button>
                </form>

                <div className="text-[12px] text-zinc-500 text-center pt-2 border-t border-white/[0.06]">
                  {t('auth.haveAccount')}{' '}
                  <Link to="/login" className="text-fiano-red hover:brightness-110 font-medium">
                    {t('auth.signIn')}
                  </Link>
                </div>
              </>
            )}
          </div>

          <div className="text-center mt-6 text-[10px] text-zinc-600">
            {t('auth.byContinuing')}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Single password-strength-rule line: green check or grey dot + label. */
function Rule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={clsx(
        'w-3 h-3 rounded-full flex items-center justify-center text-[8px] shrink-0',
        ok ? 'bg-emerald-400 text-zinc-900' : 'bg-white/[0.08] text-zinc-700',
      )}>
        {ok ? '✓' : '·'}
      </span>
      <span className={ok ? 'text-emerald-400/80' : 'text-zinc-500'}>{label}</span>
    </li>
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
