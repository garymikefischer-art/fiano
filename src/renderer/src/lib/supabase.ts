import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase-Client für fiano (Phase 6 Auth + Subscriptions).
 *
 * Sessions persistieren NICHT in localStorage (Default), sondern werden
 * via IPC in safeStorage (OS-Keychain) verschlüsselt abgelegt. Wir nutzen
 * dafür `persistSession: false` und ein eigenes `customStorage` interface
 * über die IPC-Bridge — siehe authStore.ts wie session restored wird.
 */

const URL  = import.meta.env.VITE_SUPABASE_URL  as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!URL || !ANON) {
  // Fail loud — User soll merken dass .env fehlt, statt cryptic runtime errors.
  // eslint-disable-next-line no-console
  console.error(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env. ' +
    'Auth will not work. Copy .env.example → .env and fill in values from Supabase dashboard.',
  );
}

export const supabase: SupabaseClient = createClient(URL ?? '', ANON ?? '', {
  auth: {
    persistSession: false,     // wir machen das über safeStorage selbst
    autoRefreshToken: true,
    detectSessionInUrl: false, // wir sind kein Browser, kein Hash-Callback
    // PKCE: Supabase schickt nach OAuth einen ?code=... Query-Parameter (server-readable
    // im Loopback) statt einem #access_token Hash-Fragment (client-only). Wir tauschen
    // den Code dann via exchangeCodeForSession gegen die Session aus.
    flowType: 'pkce',
  },
});

export type { Session };
