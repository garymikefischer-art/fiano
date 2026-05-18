// Stripe Customer Portal — Supabase Edge Function (Deno)
//
// Aufruf vom Client:
//   POST https://<project>.functions.supabase.co/stripe-portal
//   Headers: Authorization: Bearer <user-jwt>
//   Body: { return_url }
//
// Antwort:
//   { url: 'https://billing.stripe.com/p/session/...' }
//
// Der Client öffnet die URL via shell.openExternal → User kann Card updaten,
// Subscription cancellen, Rechnungen anschauen. Nach Cancel: Stripe sendet
// 'customer.subscription.deleted' an unseren Webhook → Subscription wird auf
// status='canceled' gesetzt → Realtime-Listener im Renderer reagiert.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-11-20.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

// Phase A6.6 (2026-05-18): CORS Origin-Whitelist (P1-4).
function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  let allowed = '';
  const ALLOWED = ['app://fiano', 'fiano://', 'https://fiano.app', 'https://www.fiano.app'];
  if (origin && ALLOWED.includes(origin)) allowed = origin;
  else if (origin.endsWith('.expo.dev') || origin.startsWith('exp://')) allowed = origin;
  else if (origin.startsWith('http://127.0.0.1:') || origin.startsWith('http://localhost:')) allowed = origin;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return jsonResp({ error: `Invalid JWT: ${userErr?.message ?? 'no user'}` }, 401);
    }
    const user = userData.user;

    const body = await req.json().catch(() => null) as { return_url?: string } | null;
    if (!body?.return_url) return jsonResp({ error: 'Missing return_url' }, 400);

    // Stripe-Customer-ID aus subscriptions-Tabelle holen
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      return jsonResp({ error: 'No active subscription found for this user' }, 404);
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: body.return_url,
    });

    return jsonResp({ url: portal.url }, 200);
  } catch (err: any) {
    console.error('[stripe-portal]', err);
    return jsonResp({ error: err?.message ?? String(err) }, 500);
  }
});

// jsonResp moved inside serve handler to scope corsHeaders correctly (A6.6).
