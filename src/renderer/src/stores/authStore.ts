import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/**
 * Auth-Store für fiano (Phase 6).
 *
 * Verwaltet:
 *  - Supabase-Session (access/refresh token, user)
 *  - Subscription-State aus public.subscriptions (plan, status, lifetime)
 *  - Loading-Phase beim App-Start (während Session aus safeStorage hydratisiert wird)
 *
 * Lebenszyklus:
 *  1. App start → init() → liest Session aus safeStorage → restores via supabase.auth.setSession
 *  2. Falls Session valid → fetchSubscription() → Plan im Store
 *  3. supabase.auth.onAuthStateChange → bei Token-Refresh erneut nach safeStorage schreiben
 *  4. signOut → clearSession + Store leer + Routing zurück zur LoginPage
 */

export type Plan = 'creator' | 'pro' | 'studio_lifetime';
export type SubStatus =
  | 'active' | 'trialing' | 'past_due' | 'canceled'
  | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused';

export interface Subscription {
  plan: Plan;
  status: SubStatus | string;
  lifetime: boolean;
  current_period_end: string | null;
}

interface AuthState {
  initializing: boolean;
  user: User | null;
  session: Session | null;
  subscription: Subscription | null;
  /** Letzter Auth-Fehler — z.B. „Invalid login credentials". */
  lastError: string | null;

  init(): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<{ ok: boolean; error?: string; needsConfirmation?: boolean }>;
  signUpWithPassword(email: string, password: string): Promise<{ ok: boolean; error?: string }>;
  signInWithGoogle(): Promise<{ ok: boolean; error?: string }>;
  resendConfirmation(email: string): Promise<{ ok: boolean; error?: string }>;
  signOut(): Promise<void>;
  fetchSubscription(): Promise<void>;
  clearError(): void;
}

/** Macht aus cryptischen Supabase-Errors verständliche User-facing Strings.
 *  Wir nutzen das übers ganze AuthStore — egal ob signIn, signUp, oder resend. */
function humanizeAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('email rate limit')) {
    return 'Too many email requests. Please wait ~1 hour, or set up Custom SMTP in Supabase to remove the limit.';
  }
  if (m.includes('over_email_send_rate_limit')) {
    return 'Too many email requests. Please wait ~1 hour.';
  }
  if (m.includes('email not confirmed')) {
    return 'Please confirm your email first. Check your inbox or request a new confirmation email below.';
  }
  if (m.includes('invalid login credentials')) {
    return 'Email or password is incorrect.';
  }
  if (m.includes('user already registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  return msg;
}

// Module-level guard gegen mehrfaches init() (StrictMode, Re-Renders).
let initStarted = false;
const INIT_TIMEOUT_MS = 8000;

export const useAuth = create<AuthState>((set, get) => ({
  initializing: true,
  user: null,
  session: null,
  subscription: null,
  lastError: null,

  // ─── Session beim App-Start aus safeStorage laden ─────────────────────
  async init() {
    // Idempotent — StrictMode + HMR sonst doppelt
    if (initStarted) return;
    initStarted = true;

    // Hartes Timeout-Sicherheitsnetz: in jedem Fall nach 8s die UI freischalten,
    // damit der User nicht im LoadingScreen hängt wenn Network/Supabase langsam ist.
    const safetyTimer = setTimeout(() => {
      if (get().initializing) {
        console.warn('[auth] init timeout — forcing UI release');
        set({ initializing: false });
      }
    }, INIT_TIMEOUT_MS);

    // Listener für künftige Token-Refreshes registrieren — bevor wir restoren.
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        await window.api.invoke('auth.clearSession');
        set({ user: null, session: null, subscription: null });
        return;
      }
      // Session-Update (Login, Refresh, OAuth-Callback) → encrypted persisting.
      await window.api.invoke('auth.saveSession', { sessionJson: JSON.stringify(session) });
      set({ user: session.user, session });
      // Subscription nachladen
      get().fetchSubscription();
    });

    // OAuth-Code aus Loopback-Server empfangen (Dev + Prod). PKCE-flow → wir
    // tauschen den ?code=... gegen eine Session via exchangeCodeForSession.
    if (window.api.onAuthOauthCode) {
      window.api.onAuthOauthCode(async (payload) => {
        if (payload.error) {
          set({ lastError: payload.error });
          return;
        }
        if (!payload.code) return;
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(payload.code);
          if (error) {
            console.warn('[auth] exchangeCodeForSession:', error.message);
            set({ lastError: error.message });
            return;
          }
          if (data.session) {
            await window.api.invoke('auth.saveSession', { sessionJson: JSON.stringify(data.session) });
            set({ user: data.user ?? data.session.user, session: data.session });
            await get().fetchSubscription();
          }
        } catch (err) {
          console.warn('[auth] code exchange failed:', err);
        }
      });
    }

    // Legacy fiano://-Hash-Callback (Production-Path falls Loopback nicht greift).
    if (window.api.onAuthCallback) {
      window.api.onAuthCallback(async (url: string) => {
        try {
          const hashIdx = url.indexOf('#');
          if (hashIdx < 0) return;
          const params = new URLSearchParams(url.slice(hashIdx + 1));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          if (!accessToken || !refreshToken) return;
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) { set({ lastError: error.message }); return; }
          if (data.session) {
            await window.api.invoke('auth.saveSession', { sessionJson: JSON.stringify(data.session) });
            set({ user: data.user ?? data.session.user, session: data.session });
            await get().fetchSubscription();
          }
        } catch (err) {
          console.warn('[auth] hash callback handler error:', err);
        }
      });
    }

    try {
      const stored = await window.api.invoke<string | null>('auth.loadSession');
      const sessionJson = stored?.ok ? (stored.data as string | null) : null;
      if (sessionJson) {
        const parsed = JSON.parse(sessionJson) as Session;
        // setSession kann hängen wenn Refresh-Token expired und kein Network — race mit Timeout
        const restorePromise = supabase.auth.setSession({
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        });
        const timeoutPromise = new Promise<{ data: { session: null; user: null }; error: Error }>(
          (resolve) => setTimeout(
            () => resolve({ data: { session: null, user: null }, error: new Error('setSession timeout') }),
            6000,
          ),
        );
        const result = await Promise.race([restorePromise, timeoutPromise]);
        const { data, error } = result as Awaited<typeof restorePromise>;
        if (!error && data.session) {
          set({ user: data.user ?? data.session.user, session: data.session });
          // fetchSubscription auch nicht blockierend — fire-and-forget
          get().fetchSubscription().catch((e) => console.warn('[auth] sub fetch:', e));
        } else {
          console.warn('[auth] session restore failed:', error?.message ?? 'unknown');
          // Session abgelaufen / invalid — clean up
          await window.api.invoke('auth.clearSession');
        }
      }
    } catch (err) {
      console.warn('[auth] init failed:', err);
    } finally {
      clearTimeout(safetyTimer);
      set({ initializing: false });
    }
  },

  // ─── Email/Password Login ──────────────────────────────────────────────
  async signInWithPassword(email, password) {
    set({ lastError: null });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const friendly = humanizeAuthError(error.message);
      set({ lastError: friendly });
      // Special-Case: Email noch nicht confirmed → UI soll Resend-Button zeigen
      const needsConfirmation = error.message.toLowerCase().includes('email not confirmed');
      return { ok: false, error: friendly, needsConfirmation };
    }
    if (data.session) {
      await window.api.invoke('auth.saveSession', { sessionJson: JSON.stringify(data.session) });
      set({ user: data.user, session: data.session });
      await get().fetchSubscription();
    }
    return { ok: true };
  },

  async signUpWithPassword(email, password) {
    set({ lastError: null });
    // emailRedirectTo: Supabase ersetzt {{ .ConfirmationURL }} im Template so dass
    // der finale Redirect zur Loopback-URL geht (statt zur Default-Site-URL).
    // Damit landet der User nach Email-Klick auf unserer 127.0.0.1:PORT — wenn
    // fiano dann läuft, wird der User automatisch eingeloggt.
    const lp = await window.api.invoke<{ callbackUrl: string | null }>('auth.getLoopbackUrl');
    const emailRedirectTo = lp?.ok ? lp.data?.callbackUrl ?? undefined : undefined;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: emailRedirectTo ? { emailRedirectTo } : undefined,
    });
    if (error) {
      const friendly = humanizeAuthError(error.message);
      set({ lastError: friendly });
      return { ok: false, error: friendly };
    }
    // Wenn Email-Confirmation an ist (Default), kommt session=null zurück. User muss
    // erst bestätigen. UI muss das anzeigen.
    if (data.session) {
      await window.api.invoke('auth.saveSession', { sessionJson: JSON.stringify(data.session) });
      set({ user: data.user, session: data.session });
      await get().fetchSubscription();
    }
    return { ok: true };
  },

  // ─── Google OAuth ──────────────────────────────────────────────────────
  // Persistenter Loopback (siehe authLoopback.ts) läuft schon beim App-Start.
  // Wir holen die URL via IPC und nutzen sie als redirectTo.
  async signInWithGoogle() {
    set({ lastError: null });
    try {
      const lp = await window.api.invoke<{ callbackUrl: string | null }>('auth.getLoopbackUrl');
      const callbackUrl = lp?.ok ? lp.data?.callbackUrl : null;
      if (!callbackUrl) {
        const msg = 'Auth loopback not running — please restart fiano';
        set({ lastError: msg });
        return { ok: false, error: msg };
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          skipBrowserRedirect: true,
        },
      });
      if (error || !data?.url) {
        set({ lastError: error?.message ?? 'OAuth init failed' });
        return { ok: false, error: error?.message };
      }
      await window.api.invoke('shell.openExternal', { url: data.url });
      return { ok: true };
    } catch (err: any) {
      set({ lastError: err?.message ?? String(err) });
      return { ok: false, error: err?.message };
    }
  },

  // ─── Email-Confirmation erneut senden ─────────────────────────────────
  async resendConfirmation(email) {
    set({ lastError: null });
    try {
      const lp = await window.api.invoke<{ callbackUrl: string | null }>('auth.getLoopbackUrl');
      const emailRedirectTo = lp?.ok ? lp.data?.callbackUrl ?? undefined : undefined;
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: emailRedirectTo ? { emailRedirectTo } : undefined,
      });
      if (error) {
        const friendly = humanizeAuthError(error.message);
        set({ lastError: friendly });
        return { ok: false, error: friendly };
      }
      return { ok: true };
    } catch (err: any) {
      const friendly = humanizeAuthError(err?.message ?? String(err));
      set({ lastError: friendly });
      return { ok: false, error: friendly };
    }
  },

  async signOut() {
    await supabase.auth.signOut();
    await window.api.invoke('auth.clearSession');
    set({ user: null, session: null, subscription: null });
  },

  // ─── Subscription aus public.subscriptions lesen ──────────────────────
  async fetchSubscription() {
    const userId = get().user?.id;
    if (!userId) { set({ subscription: null }); return; }
    const { data, error } = await supabase
      .from('subscriptions')
      .select('plan, status, lifetime, current_period_end')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[auth] fetchSubscription:', error.message);
      set({ subscription: null });
      return;
    }
    set({ subscription: data ? {
      plan: data.plan as Plan,
      status: data.status,
      lifetime: !!data.lifetime,
      current_period_end: data.current_period_end,
    } : null });
  },

  clearError() { set({ lastError: null }); },
}));

/**
 * Helper: hat dieser User Zugriff auf die App?
 * Aktiver Plan = subscription.status='active' || lifetime=true
 */
export function hasActiveAccess(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (sub.lifetime) return true;
  return sub.status === 'active' || sub.status === 'trialing';
}
