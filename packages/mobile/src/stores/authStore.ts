/**
 * Auth Store für Mobile.
 *
 * - Lädt persistierte Session aus expo-secure-store beim Start
 * - Handhabt sign-in / sign-up / sign-out
 * - Lädt Subscription aus Supabase `subscriptions` Tabelle (gleiches Schema wie Desktop)
 *
 * RevenueCat-Sync ist post-MVP (siehe Phase 9.4.x).
 */

import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { ENV } from '../lib/env';

export type Plan = 'creator' | 'pro' | 'studio_lifetime' | null;

interface Subscription {
  plan: Plan;
  status: string | null;
  lifetime: boolean;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  /** Phase C5.3 (2026-05-19): Plan-Counter Felder aus supabase. */
  render_count?: number | null;
  monthly_limit?: number | null;
  render_count_reset_at?: string | null;
}

interface AuthState {
  initializing: boolean;
  session: Session | null;
  user: User | null;
  subscription: Subscription | null;

  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<{ ok: boolean; canceled?: boolean; error?: string }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  fetchSubscription: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  initializing: true,
  session: null,
  user: null,
  subscription: null,

  init: async () => {
    const { data } = await supabase.auth.getSession();
    set({ session: data.session, user: data.session?.user ?? null });

    supabase.auth.onAuthStateChange((_evt, session) => {
      set({ session, user: session?.user ?? null });
      if (session?.user) {
        get().fetchSubscription();
      } else {
        set({ subscription: null });
      }
    });

    if (data.session?.user) {
      await get().fetchSubscription();
    }
    set({ initializing: false });
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  signUp: async (email, password) => {
    // Phase A6.3.3 (2026-05-18): emailRedirectTo via Linking → fiano://auth-callback
    // damit der Confirm-Link in der Email zurück in die App führt statt zur
    // 404-Seite (Default Supabase Site-URL). Muss in Supabase-Dashboard unter
    // Authentication → URL Configuration → Redirect URLs whitelisted sein.
    const redirectTo = Linking.createURL('auth-callback');
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
  },

  signInWithGoogle: async () => {
    // Redirect-URL nutzt das in app.json registrierte scheme "fiano".
    // → Production: "fiano://auth-callback"
    // → Dev/Expo Go: "exp://<host>--/auth-callback" (auto-resolved von Linking)
    // Diese URL muss im Supabase-Dashboard unter Authentication → URL Configuration
    // als "Redirect URL" eingetragen sein, sonst lehnt Supabase die Tokens ab.
    const redirectTo = Linking.createURL('auth-callback');

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) return { ok: false, error: error.message };
    if (!data?.url) return { ok: false, error: 'No OAuth URL returned from Supabase' };

    // openAuthSessionAsync öffnet einen in-app Browser (ASWebAuthenticationSession auf iOS,
    // Custom Tabs auf Android) und fängt den redirect automatisch ab.
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { ok: false, canceled: true };
    }
    if (result.type !== 'success' || !result.url) {
      return { ok: false, error: 'OAuth flow did not complete' };
    }

    // Supabase legt access_token + refresh_token in den URL-Hash:
    //   fiano://auth-callback#access_token=...&refresh_token=...&token_type=bearer
    const hashIdx = result.url.indexOf('#');
    const hash = hashIdx >= 0 ? result.url.slice(hashIdx + 1) : '';
    const params = new URLSearchParams(hash);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) {
      return { ok: false, error: 'Missing tokens in OAuth callback' };
    }
    const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
    if (setErr) return { ok: false, error: setErr.message };
    return { ok: true };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, subscription: null });
  },

  deleteAccount: async () => {
    const session = get().session;
    if (!session?.access_token) throw new Error('Not authenticated');
    const res = await fetch(`${ENV.SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: '{}',
    });
    const data: { ok?: boolean; error?: string } = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    await supabase.auth.signOut();
    set({ session: null, user: null, subscription: null });
  },

  fetchSubscription: async () => {
    const userId = get().user?.id;
    if (!userId) return;
    // Phase C5.3.1 Bug-Fix (2026-05-19): render_count + monthly_limit sind
    // NICHT in subscriptions table. render_count steckt in `render_usage`
    // (pro month_key row), monthly_limit ist derived aus plan (creator=30,
    // pro=200, sonst 0). User-Report nach Round-5: "column subscriptions.
    // render_count does not exist".
    const { data, error } = await supabase
      .from('subscriptions')
      .select('plan, status, lifetime, current_period_end, cancel_at_period_end')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[auth] fetchSubscription failed:', error.message);
      return;
    }
    // Plan-Counter: separate query an render_usage für aktuellen Monat.
    // Schema 'YYYY-MM' aus to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM') —
    // siehe supabase/migrations/002_render_quota.sql.
    const currentMonth = new Date().toISOString().slice(0, 7); // "2026-05"
    let renderCount: number | null = null;
    try {
      const { data: usage, error: usageErr } = await supabase
        .from('render_usage')
        .select('render_count')
        .eq('user_id', userId)
        .eq('month_key', currentMonth)
        .maybeSingle();
      if (!usageErr) renderCount = usage?.render_count ?? 0;
    } catch (e) {
      // render_usage RLS könnte read-block-en — silent fail, UI zeigt dann
      // einfach keinen counter.
      console.warn('[auth] render_usage fetch failed', e);
    }
    // monthly_limit aus dem plan ableiten (sync mit planCheck.ts).
    const plan = data?.plan ?? null;
    const monthlyLimit =
      plan === 'creator' ? 30 : plan === 'pro' ? 200 : 0;
    set({
      subscription: data
        ? {
            ...data,
            render_count: renderCount,
            monthly_limit: monthlyLimit,
            render_count_reset_at: null,
          }
        : null,
    });
  },
}));
