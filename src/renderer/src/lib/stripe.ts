import { supabase } from './supabase';

/**
 * Helper für Stripe-Edge-Functions im Renderer.
 *
 * Beide Functions brauchen den User-JWT als Authorization-Header damit die
 * Edge Function den User identifizieren kann (für customer-id-lookup,
 * checkout-metadata.user_id usw.).
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

async function getAuthHeader(): Promise<string | null> {
  let { data } = await supabase.auth.getSession();
  // Wenn Session in <60s abläuft → refresh damit der Edge-Function-Call nicht
  // mit expired Token feuert.
  const expiresAt = data.session?.expires_at;
  if (expiresAt && expiresAt * 1000 < Date.now() + 60_000) {
    try {
      await supabase.auth.refreshSession();
      ({ data } = await supabase.auth.getSession());
    } catch (err) {
      console.warn('[stripe] refreshSession failed:', err);
    }
  }
  const token = data.session?.access_token;
  return token ? `Bearer ${token}` : null;
}

/** Liefert die Loopback-Base-URL für success/cancel/return URLs. */
async function getBaseUrl(): Promise<string> {
  try {
    const lp = await window.api.invoke<{ callbackUrl: string | null }>('auth.getLoopbackUrl');
    if (lp?.ok && lp.data?.callbackUrl) {
      return lp.data.callbackUrl.replace('/auth-callback', '');
    }
  } catch {/* ignore */}
  return 'http://127.0.0.1:51999';
}

/** Erzeugt eine Stripe-Checkout-Session und liefert die URL zurück.
 *  Caller öffnet die URL via shell.openExternal. */
export async function createCheckoutSession(plan: 'creator' | 'pro' | 'studio_lifetime'): Promise<{ url?: string; error?: string }> {
  const auth = await getAuthHeader();
  if (!auth) return { error: 'Not authenticated' };
  const base = await getBaseUrl();
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({
        plan,
        success_url: `${base}/checkout-success?plan=${plan}`,
        cancel_url:  `${base}/checkout-cancel`,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.url) return { error: data?.error ?? `HTTP ${res.status}` };
    return { url: data.url };
  } catch (err: any) {
    return { error: err?.message ?? String(err) };
  }
}

/** Account komplett löschen — Stripe-Customer + Supabase-User.
 *  Caller sollte signOut + Routing zur LoginPage selbst handhaben. */
export async function deleteAccount(): Promise<{ ok?: boolean; error?: string }> {
  const auth = await getAuthHeader();
  if (!auth) return { error: 'Not authenticated' };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: '{}',
    });
    const data = await res.json();
    if (!res.ok || !data.ok) return { error: data?.error ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (err: any) {
    return { error: err?.message ?? String(err) };
  }
}

/** Erzeugt eine Customer-Portal-Session (Cancel, Card-Update, Rechnungen). */
export async function createPortalSession(): Promise<{ url?: string; error?: string }> {
  const auth = await getAuthHeader();
  if (!auth) return { error: 'Not authenticated' };
  const base = await getBaseUrl();
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ return_url: `${base}/portal-return` }),
    });
    const data = await res.json();
    if (!res.ok || !data.url) return { error: data?.error ?? `HTTP ${res.status}` };
    return { url: data.url };
  } catch (err: any) {
    return { error: err?.message ?? String(err) };
  }
}
