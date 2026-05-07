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
  // Öffnet System-Browser → User authorisiert → callback URL mit Token kommt
  // an Supabase → Session wird in supabase.auth.onAuthStateChange empfangen.
  // Für Electron muss redirectTo eine Custom-URL-Scheme-Variante sein, sonst
  // bleibt der OAuth in einem fremden Browser hängen.
  // → Phase 6.1 MVP: wir machen das mit "Open external + paste session"-Flow,
  // ODER wir nutzen Supabase's signInWithOAuth + popup window.
  async signInWithGoogle() {
    set({ lastError: null });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'fiano://auth-callback', // Custom-Scheme — wird vom Main-Prozess abgefangen
        skipBrowserRedirect: true,           // wir öffnen URL selbst extern
      },
    });
    if (error || !data?.url) {
      set({ lastError: error?.message ?? 'OAuth init failed' });
      return { ok: false, error: error?.message };
    }
    // URL extern öffnen via IPC
    await window.api.invoke('shell.openExternal', { url: data.url });
    // Den Callback fangen wir dann im Main-Prozess via 'fiano://' protocol →
    // sendet uns die Tokens via IPC zurück. Wird in Phase 6.1.5 verkabelt.
    return { ok: true };
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
