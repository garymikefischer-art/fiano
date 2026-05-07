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
  signInWithPassword(email: string, password: string): Promise<{ ok: boolean; error?: string }>;
  signUpWithPassword(email: string, password: string): Promise<{ ok: boolean; error?: string }>;
  signInWithGoogle(): Promise<{ ok: boolean; error?: string }>;
  signOut(): Promise<void>;
  fetchSubscription(): Promise<void>;
  clearError(): void;
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
      set({ lastError: error.message });
      return { ok: false, error: error.message };
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
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      set({ lastError: error.message });
      return { ok: false, error: error.message };
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
  // Loopback-Flow (Dev + Prod):
  //  1. Main startet HTTP-Server auf 127.0.0.1:PORT
  //  2. signInWithOAuth({ redirectTo: 'http://127.0.0.1:PORT/auth-callback' })
  //  3. Browser → Google → Supabase → 127.0.0.1:PORT/?code=...
  //  4. Server fängt code ab → IPC-Event → exchangeCodeForSession (siehe init)
  async signInWithGoogle() {
    set({ lastError: null });
    try {
      // Loopback-Server starten (gibt freien Port + URL zurück)
      const startRes = await window.api.invoke<{ callbackUrl: string; port: number }>(
        'auth.startOauthLoopback',
      );
      if (!startRes?.ok || !startRes.data?.callbackUrl) {
        const msg = (startRes as { error?: string })?.error ?? 'Failed to start auth loopback';
        set({ lastError: msg });
        return { ok: false, error: msg };
      }
      const callbackUrl = startRes.data.callbackUrl;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          skipBrowserRedirect: true,
        },
      });
      if (error || !data?.url) {
        await window.api.invoke('auth.stopOauthLoopback');
        set({ lastError: error?.message ?? 'OAuth init failed' });
        return { ok: false, error: error?.message };
      }
      // OAuth-URL extern öffnen — User wählt Google-Account, callback geht zum Loopback
      await window.api.invoke('shell.openExternal', { url: data.url });
      return { ok: true };
    } catch (err: any) {
      set({ lastError: err?.message ?? String(err) });
      return { ok: false, error: err?.message };
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
