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
    const { error } = await supabase.auth.signUp({ email, password });
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
    const { data, error } = await supabase
      .from('subscriptions')
      .select('plan, status, lifetime, current_period_end, cancel_at_period_end')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[auth] fetchSubscription failed:', error.message);
      return;
    }
    set({ subscription: data ?? null });
  },
}));
