// RevenueCat Webhook Handler — Supabase Edge Function (Deno)
// M5 / D3 (2026-06-05): Empfängt RevenueCat-Events (Mobile-IAP) und
// synchronisiert dieselbe `subscriptions`-Tabelle, die Desktop via Stripe nutzt
// (unified source of truth, siehe PROJECT_SUMMARY §7a).
//
// Setup:
//   1. RevenueCat Dashboard → Integrations → Webhooks → Add:
//        - URL:  https://zibzcaknqzxgwootfjxc.functions.supabase.co/revenuecat-webhook
//        - Authorization header: <ein langes zufälliges Secret>
//   2. supabase secrets set REVENUECAT_WEBHOOK_AUTH=<dasselbe Secret>
//   3. supabase functions deploy revenuecat-webhook --no-verify-jwt
//      (--no-verify-jwt: RevenueCat sendet keinen Supabase-JWT, wir prüfen
//       stattdessen den Authorization-Header gegen REVENUECAT_WEBHOOK_AUTH)
//
// Mapping:
//   - app_user_id == Supabase user_id (die App ruft Purchases.logIn(userId)).
//   - entitlement_ids 'creator'/'pro' → plan. product_id-Fallback.
//   - Status wird primär aus expiration_at_ms abgeleitet (self-correcting bei
//     out-of-order Events): expiration in der Zukunft → active, sonst canceled.
//     BILLING_ISSUE → past_due. CANCELLATION (auto-renew off) → active +
//     cancel_at_period_end=true bis zum Period-Ende.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

type Plan = 'creator' | 'pro';

interface RcEvent {
  type: string;
  app_user_id?: string;
  original_app_user_id?: string;
  entitlement_ids?: string[] | null;
  entitlement_id?: string | null;
  product_id?: string | null;
  expiration_at_ms?: number | null;
  store?: string | null;
  environment?: string | null;
}

// UUID-Check: nur echte Supabase-user_ids upserten, keine anonymen
// RevenueCat-IDs ($RCAnonymousID:...) — die entstehen nur wenn ein Kauf VOR
// dem Login passiert, was unser Paywall-Flow ausschließt.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function planFromEvent(ev: RcEvent): Plan | null {
  const ents = ev.entitlement_ids ?? (ev.entitlement_id ? [ev.entitlement_id] : []);
  if (ents.includes('pro')) return 'pro';
  if (ents.includes('creator')) return 'creator';
  // Fallback über product_id (z.B. 'pro_monthly:monthly' / 'creator_monthly').
  const pid = ev.product_id ?? '';
  if (pid.startsWith('pro_monthly')) return 'pro';
  if (pid.startsWith('creator_monthly')) return 'creator';
  return null;
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Auth: RevenueCat sendet den im Dashboard konfigurierten Authorization-Header
  // 1:1. Wir vergleichen gegen das Secret. Fehlt das Secret server-side →
  // 500 (Fehlkonfiguration), damit RevenueCat retry-t statt Events zu verlieren.
  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  if (!expected) {
    console.error('[rc-webhook] REVENUECAT_WEBHOOK_AUTH nicht gesetzt');
    return new Response('Server misconfigured', { status: 500 });
  }
  if (req.headers.get('Authorization') !== expected) {
    console.warn('[rc-webhook] Authorization-Header stimmt nicht');
    return new Response('Unauthorized', { status: 401 });
  }

  let body: { event?: RcEvent };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  const ev = body.event;
  if (!ev) return new Response('No event', { status: 400 });

  console.log(`[rc-webhook] ${ev.type} user=${ev.app_user_id} product=${ev.product_id}`);

  // TEST-Event (Dashboard-Button) + nicht-relevante Typen: 200 ohne Schreiben.
  if (ev.type === 'TEST') {
    return new Response(JSON.stringify({ received: true, test: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  }

  const userId = ev.app_user_id ?? '';
  if (!UUID_RE.test(userId)) {
    // Anonyme ID oder fehlend → können wir keiner Supabase-Row zuordnen.
    console.warn(`[rc-webhook] kein gültiger user_id (app_user_id=${userId}) — skip`);
    return new Response(JSON.stringify({ received: true, skipped: 'no_user' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  }

  const plan = planFromEvent(ev);
  if (!plan) {
    console.warn(`[rc-webhook] kein Plan ableitbar (product=${ev.product_id}) — skip`);
    return new Response(JSON.stringify({ received: true, skipped: 'no_plan' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  }

  const expMs = ev.expiration_at_ms ?? null;
  const periodEndIso = expMs ? new Date(expMs).toISOString() : null;

  // Status primär aus der Expiration ableiten (robust gegen out-of-order Events).
  let status: 'active' | 'canceled' | 'past_due' = 'active';
  if (ev.type === 'BILLING_ISSUE') {
    status = 'past_due';
  } else if (ev.type === 'EXPIRATION') {
    status = 'canceled';
  } else if (expMs && expMs < Date.now()) {
    status = 'canceled';
  }
  // CANCELLATION = Auto-Renew aus, Entitlement aber aktiv bis Period-Ende.
  const cancelAtPeriodEnd = ev.type === 'CANCELLATION';

  try {
    const { error } = await supabase.from('subscriptions').upsert(
      {
        user_id: userId,
        revenuecat_app_user_id: userId,
        // Stripe-Felder bei RevenueCat-Rows leer lassen.
        stripe_customer_id: null,
        stripe_subscription_id: null,
        plan,
        status,
        current_period_end: periodEndIso,
        lifetime: false,
        cancel_at_period_end: cancelAtPeriodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    // Fehler NICHT verschlucken — sonst meldet der Webhook fälschlich 200 und
    // RevenueCat retry-t nie. throw → 500 → RevenueCat stellt das Event erneut zu.
    if (error) throw new Error(`subscriptions upsert failed: ${error.message}`);
  } catch (err) {
    console.error('[rc-webhook] Handler-Fehler:', err);
    return new Response(`Handler error: ${(err as Error).message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
});
