// Account-Delete — Supabase Edge Function (Deno)
//
// Aufruf vom Client (mit User-JWT):
//   POST https://<project>.functions.supabase.co/delete-account
//   Headers: Authorization: Bearer <user-jwt>
//   Body: (kein Body nötig)
//
// Was passiert:
//   1. Aktive Subscription cancellen (falls vorhanden) — at_period_end=false (sofort)
//   2. Stripe-Customer löschen (falls vorhanden)
//   3. Supabase auth.users-Row löschen — Cascade löscht profiles + subscriptions
//
// Antwort:
//   200 { ok: true }
//   401 { error: 'Invalid JWT' }
//   500 { error: '...' }
//
// Setup: supabase functions deploy delete-account

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-11-20.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

// Phase A6.6 (2026-05-18): CORS Origin-Whitelist statt '*' (P1-4 Audit).
// '*' erlaubt jeden Browser → CSRF-Amplification mit gestohlenem JWT
// möglich. Whitelist: fiano custom-scheme + Expo dev + production-Domain.
const ALLOWED_ORIGINS = [
  'app://fiano',
  'fiano://',
  'https://fiano.app',
  'https://www.fiano.app',
  // Expo dev environments:
  // (regex match unten für *.expo.dev / exp:// scheme)
];
function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  let allowed = '';
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    allowed = origin;
  } else if (origin.endsWith('.expo.dev') || origin.startsWith('exp://')) {
    allowed = origin;
  } else if (origin.startsWith('http://127.0.0.1:') || origin.startsWith('http://localhost:')) {
    // Desktop Electron loopback (auth-callback uses dynamic port).
    allowed = origin;
  }
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  // Helper inside serve um corsHeaders zu schließen.
  function jsonResp(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResp({ error: 'Missing Authorization header' }, 401);
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return jsonResp({ error: 'Empty token' }, 401);

    const supabaseAnon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return jsonResp({ error: `Invalid JWT: ${userErr?.message ?? 'no user'}` }, 401);
    }
    const user = userData.user;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Subscription/Customer in Stripe cleanen (best-effort — Fehler nicht propagieren,
    //    weil Account-Delete trotzdem durchgehen soll)
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (sub?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      } catch (err) {
        console.warn('[delete-account] subscription cancel failed:', err);
      }
    }
    if (sub?.stripe_customer_id) {
      try {
        await stripe.customers.del(sub.stripe_customer_id);
      } catch (err) {
        console.warn('[delete-account] customer delete failed:', err);
      }
    }

    // 2. Supabase auth-User löschen — Cascade-FK löscht profiles + subscriptions automatisch
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (delErr) {
      return jsonResp({ error: `Delete user failed: ${delErr.message}` }, 500);
    }

    return jsonResp({ ok: true }, 200);
  } catch (err: any) {
    console.error('[delete-account]', err);
    return jsonResp({ error: err?.message ?? String(err) }, 500);
  }
});

// (jsonResp moved inside serve handler to scope corsHeaders correctly.)
