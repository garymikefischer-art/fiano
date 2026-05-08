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

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
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

function jsonResp(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
