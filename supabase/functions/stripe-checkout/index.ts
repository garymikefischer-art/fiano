// Stripe Checkout Session — Supabase Edge Function (Deno)
//
// Aufruf vom Client:
//   POST https://<project>.functions.supabase.co/stripe-checkout
//   Headers: Authorization: Bearer <user-jwt>
//   Body: { plan: 'creator' | 'pro' | 'studio_lifetime', success_url, cancel_url }
//
// Antwort:
//   { url: 'https://checkout.stripe.com/c/pay/cs_test_...' }
//
// Der Client öffnet die URL via shell.openExternal → User zahlt → Stripe redirected
// zurück zur success_url. Parallel feuert Stripe einen 'checkout.session.completed'-
// Event an den stripe-webhook (existing) der dann die subscriptions-Tabelle updated.
//
// Setup:
//   supabase functions deploy stripe-checkout
//   (mit verify-jwt — wir brauchen den user-JWT um den User zu identifizieren)
//
// Secrets nutzt diese Function: STRIPE_SECRET_KEY, STRIPE_PRICE_*

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-11-20.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const PLAN_TO_PRICE: Record<string, string | undefined> = {
  creator:         Deno.env.get('STRIPE_PRICE_CREATOR'),
  pro:             Deno.env.get('STRIPE_PRICE_PRO'),
  studio_lifetime: Deno.env.get('STRIPE_PRICE_STUDIO_LIFETIME'),
};

const PLAN_MODE: Record<string, 'subscription' | 'payment'> = {
  creator:         'subscription',
  pro:             'subscription',
  studio_lifetime: 'payment',
};

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405);

  try {
    // User aus Authorization-Header lesen
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResp({ error: 'Missing Authorization header' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return jsonResp({ error: 'Invalid JWT' }, 401);
    const user = userData.user;

    // Body parsen
    const body = await req.json().catch(() => null) as
      | { plan?: string; success_url?: string; cancel_url?: string }
      | null;
    if (!body?.plan || !body.success_url || !body.cancel_url) {
      return jsonResp({ error: 'Missing plan / success_url / cancel_url' }, 400);
    }
    const plan = body.plan as keyof typeof PLAN_TO_PRICE;
    const priceId = PLAN_TO_PRICE[plan];
    const mode = PLAN_MODE[plan];
    if (!priceId || !mode) return jsonResp({ error: `Unknown plan: ${plan}` }, 400);

    // Existierender Stripe-Customer-ID? (subscriptions-Tabelle nachschauen)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = existingSub?.stripe_customer_id ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
    }

    // Checkout-Session erstellen
    const session = await stripe.checkout.sessions.create({
      mode,
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: body.success_url,
      cancel_url: body.cancel_url,
      metadata: { user_id: user.id, plan },
      // Bei subscription mode: subscription_data damit auch dort metadata landet
      ...(mode === 'subscription'
        ? { subscription_data: { metadata: { user_id: user.id, plan } } }
        : {}),
      allow_promotion_codes: true,
      // Tax automatisch berechnen falls Stripe Tax aktiv ist (sonst egal)
      automatic_tax: { enabled: false },
    });

    return jsonResp({ url: session.url, id: session.id }, 200);
  } catch (err: any) {
    console.error('[stripe-checkout]', err);
    return jsonResp({ error: err?.message ?? String(err) }, 500);
  }
});

function jsonResp(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
