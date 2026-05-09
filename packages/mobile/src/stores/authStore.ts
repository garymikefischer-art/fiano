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
import { supabase } from '../lib/supabase';

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
  signOut: () => Promise<void>;
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

  signOut: async () => {
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
