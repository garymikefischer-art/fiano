import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { checkPasswordStrength, strengthLabel, strengthColor } from '../lib/passwordStrength';

/**
 * ResetPasswordPage hat zwei Modi:
 *
 *  1. **Request-Mode**: User landet hier durch Klick auf "Forgot password?"
 *     in der LoginPage. Email-Form → schickt Reset-Email.
 *
 *  2. **Update-Mode**: User klickt auf den Reset-Link in der Email →
 *     Loopback fängt Code → exchangeCodeForSession → User hat eine
 *     temporäre Session mit Recovery-Marker. AuthGate erkennt ?type=recovery
 *     in der URL und routet hier rein. User setzt neues Passwort.
 */
export function ResetPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestReset = useAuth((s) => s.requestPasswordReset);
  const updatePassword = useAuth((s) => s.updatePassword);
  const session = useAuth((s) => s.session);
  const lastError = useAuth((s) => s.lastError);
  const clearError = useAuth((s) => s.clearError);

  const isRecovery = searchParams.get('type') === 'recovery' && !!session;

  // Request-Mode state
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  // Update-Mode state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updated, setUpdated] = useState(false);
  const strength = useMemo(() => checkPasswordStrength(newPassword), [newPassword]);

  useEffect(() => { clearError(); }, [clearError]);

  const onRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !email) return;
    setBusy(true);
    const res = await requestReset(email.trim());
    setBusy(false);
    if (res.ok) setSent(true);
  };

  const onUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !strength.meetsAll || newPassword !== confirmPassword) return;
    setBusy(true);
    const res = await updatePassword(newPassword);
    setBusy(false);
    if (res.ok) {
      setUpdated(true);
      // Nach kurzer Anzeige ins App rein (oder zu Pricing falls kein Plan)
      setTimeout(() => navigate('/', { replace: true }), 1500);
    }
  };

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  return (
    <div className="relative h-full flex flex-col bg-fiano-black overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="fiano-bg-tint" />
        <div className="fiano-bg-glow" />
      </div>

      <div className="relative h-full flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="glass p-7 space-y-5">
            {isRecovery ? (
              // ─── UPDATE-MODE: Set new password ───────────────────
              updated ? (
                <div className="text-center space-y-3 py-4">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <h2 className="text-[16px] font-semibold text-zinc-100">{t('auth.passwordUpdated')}</h2>
                  <p className="text-[12px] text-zinc-400">{t('auth.passwordUpdatedBody')}</p>
                </div>
              ) : (
                <>
                  <div>
                    <h1 className="text-[20px] font-semibold tracking-tight">{t('auth.resetTitle')}</h1>
                    <p className="text-[12px] text-zinc-500 mt-1">{t('auth.resetSubtitle')}</p>
                  </div>

                  <form onSubmit={onUpdateSubmit} className="space-y-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                        {t('auth.newPassword')}
                      </label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={8}
                        disabled={busy}
                        className="w-full mt-1 px-3 py-2 rounded-lg text-[13px]
                                   bg-white/[0.04] border border-white/[0.08] text-white
                                   focus:outline-none focus:bg-white/[0.06] focus:border-fiano-red/50 transition-colors"
                      />
                      {newPassword.length > 0 && (
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
                          <div className="text-[10px] text-zinc-500">
                            {strengthLabel(strength.score, t)}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                        {t('auth.confirmPassword')}
                      </label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        disabled={busy}
                        className="w-full mt-1 px-3 py-2 rounded-lg text-[13px]
                                   bg-white/[0.04] border border-white/[0.08] text-white
                                   focus:outline-none focus:bg-white/[0.06] focus:border-fiano-red/50 transition-colors"
                      />
                      {confirmPassword.length > 0 && !passwordsMatch && (
                        <div className="text-[10px] text-fiano-red mt-1">{t('auth.passwordsDontMatch')}</div>
                      )}
                    </div>

                    {lastError && (
                      <div className="text-[11px] text-fiano-red bg-fiano-red/[0.08] border border-fiano-red/20 rounded-md px-3 py-2">
                        {lastError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={busy || !strength.meetsAll || !passwordsMatch}
                      className={clsx(
                        'w-full py-2.5 rounded-lg text-[13px] font-semibold transition-all',
                        busy || !strength.meetsAll || !passwordsMatch
                          ? 'bg-fiano-red/40 text-white/50 cursor-not-allowed'
                          : 'bg-fiano-red text-white hover:brightness-110 hover:shadow-[0_0_24px_rgba(255,16,57,0.45)]',
                      )}
                    >
                      {busy ? t('auth.updating') : t('auth.updatePassword')}
                    </button>
                  </form>
                </>
              )
            ) : sent ? (
              // ─── REQUEST-MODE: Email sent confirmation ────────────
              <div className="text-center space-y-3 py-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-fiano-red/15 border border-fiano-red/30 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-7 h-7 text-fiano-red" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>
                <h2 className="text-[16px] font-semibold text-zinc-100">{t('auth.resetEmailSent')}</h2>
                <p className="text-[12px] text-zinc-400 leading-relaxed">{t('auth.resetEmailSentBody').replace('{email}', email)}</p>
                <Link to="/login" className="inline-block mt-2 text-[12px] text-fiano-red hover:brightness-110 font-medium">
                  {t('auth.backToSignIn')}
                </Link>
              </div>
            ) : (
              // ─── REQUEST-MODE: Email-Form ─────────────────────────
              <>
                <div>
                  <h1 className="text-[20px] font-semibold tracking-tight">{t('auth.forgotTitle')}</h1>
                  <p className="text-[12px] text-zinc-500 mt-1">{t('auth.forgotSubtitle')}</p>
                </div>

                <form onSubmit={onRequestSubmit} className="space-y-3">
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
                      placeholder="you@example.com"
                      className="w-full mt-1 px-3 py-2 rounded-lg text-[13px]
                                 bg-white/[0.04] border border-white/[0.08] text-white
                                 placeholder:text-zinc-600
                                 focus:outline-none focus:bg-white/[0.06] focus:border-fiano-red/50 transition-colors"
                    />
                  </div>

                  {lastError && (
                    <div className="text-[11px] text-fiano-red bg-fiano-red/[0.08] border border-fiano-red/20 rounded-md px-3 py-2">
                      {lastError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={busy || !email}
                    className={clsx(
                      'w-full py-2.5 rounded-lg text-[13px] font-semibold transition-all',
                      busy || !email
                        ? 'bg-fiano-red/40 text-white/50 cursor-not-allowed'
                        : 'bg-fiano-red text-white hover:brightness-110 hover:shadow-[0_0_24px_rgba(255,16,57,0.45)]',
                    )}
                  >
                    {busy ? t('auth.sendingEmail') : t('auth.sendResetEmail')}
                  </button>
                </form>

                <div className="text-[12px] text-zinc-500 text-center pt-2 border-t border-white/[0.06]">
                  <Link to="/login" className="text-fiano-red hover:brightness-110 font-medium">
                    ← {t('auth.backToSignIn')}
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
