// Stripe Webhook Handler — Supabase Edge Function (Deno)
// Empfängt Stripe-Events, syncronisiert subscriptions-Table.
//
// Setup:
// 1. supabase secrets set STRIPE_SECRET_KEY=sk_test_...
// 2. supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
// 3. supabase secrets set STRIPE_PRICE_CREATOR=price_...
// 4. supabase secrets set STRIPE_PRICE_PRO=price_...
// 5. supabase secrets set STRIPE_PRICE_STUDIO_LIFETIME=price_...
// 6. supabase functions deploy stripe-webhook --no-verify-jwt
//    (--no-verify-jwt weil Stripe sendet ohne Supabase-JWT)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-11-20.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Stripe-Price-IDs → unsere Plan-Namen
const PRICE_TO_PLAN: Record<string, 'creator' | 'pro' | 'studio_lifetime'> = {
  [Deno.env.get('STRIPE_PRICE_CREATOR') ?? '']:        'creator',
  [Deno.env.get('STRIPE_PRICE_PRO') ?? '']:            'pro',
  [Deno.env.get('STRIPE_PRICE_STUDIO_LIFETIME') ?? '']: 'studio_lifetime',
};

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing stripe-signature', { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.error('Signature verification failed:', err);
    return new Response(`Invalid signature: ${(err as Error).message}`, { status: 400 });
  }

  console.log(`[stripe-webhook] ${event.type} id=${event.id}`);

  // Phase A6.6 (2026-05-18): Replay-protection via event-id dedupe (P1-3
  // Audit). Stripe-Webhook-Signature ist 5min-TTL — innerhalb des Windows
  // könnte ein Attacker mit captured event-body replay senden + z.B.
  // cancelled subscription reaktivieren.
  // Tabelle stripe_events_processed (event_id PK) wird via migration 003
  // angelegt. Hier insertieren wir vor dem handle — bei duplicate primary-
  // key error: 200 mit dedupe-Notiz returnen (skip).
  {
    const { error: dedupeErr } = await supabase
      .from('stripe_events_processed')
      .insert({ event_id: event.id, event_type: event.type });
    if (dedupeErr) {
      const msg = dedupeErr.message ?? '';
      if (msg.includes('duplicate key') || dedupeErr.code === '23505') {
        console.log(`[stripe-webhook] DEDUPED ${event.type} id=${event.id}`);
        return new Response(JSON.stringify({ received: true, deduped: true }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      console.warn(`[stripe-webhook] dedupe insert failed: ${msg}`);
      // Bei anderem Fehler: weitermachen (Tabelle existiert vielleicht
      // noch nicht in dev) — defense-in-depth, signature-check schützt eh.
    }
  }

  try {
    switch (event.type) {
      // ────────────────────────────────────────────────────────
      // Initialer Checkout (Subscription ODER Lifetime)
      // ────────────────────────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        if (!userId) { console.warn('No user_id in metadata'); break; }

        const customerId = session.customer as string;

        if (session.mode === 'payment') {
          // Studio Lifetime — one-time
          const items = await stripe.checkout.sessions.listLineItems(session.id);
          const priceId = items.data[0]?.price?.id ?? '';
          const plan = PRICE_TO_PLAN[priceId] ?? 'studio_lifetime';

          await supabase.from('subscriptions').upsert({
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: null,
            plan,
            status: 'active',
            current_period_end: null,
            lifetime: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
        } else if (session.mode === 'subscription') {
          const subId = session.subscription as string;
          const sub = await stripe.subscriptions.retrieve(subId);
          const priceId = sub.items.data[0]?.price.id ?? '';
          const plan = PRICE_TO_PLAN[priceId] ?? 'creator';

          await supabase.from('subscriptions').upsert({
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subId,
            plan,
            status: sub.status,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            lifetime: false,
            cancel_at_period_end: !!sub.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
        }
        break;
      }

      // ────────────────────────────────────────────────────────
      // Subscription updated (renewal, plan-change)
      // ────────────────────────────────────────────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id;
        if (!userId) break;
        const priceId = sub.items.data[0]?.price.id ?? '';
        const plan = PRICE_TO_PLAN[priceId] ?? 'creator';

        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: sub.customer as string,
          stripe_subscription_id: sub.id,
          plan,
          status: sub.status,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          lifetime: false,
          cancel_at_period_end: !!sub.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        break;
      }

      // ────────────────────────────────────────────────────────
      // Subscription canceled (period-end durch oder Sofort-Cancel)
      // ────────────────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id;
        if (!userId) break;

        await supabase.from('subscriptions').update({
          status: 'canceled',
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId);
        break;
      }

      // ────────────────────────────────────────────────────────
      // Payment failed → status past_due
      // ────────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (!subId) break;
        const sub = await stripe.subscriptions.retrieve(subId);
        const userId = sub.metadata?.user_id;
        if (!userId) break;

        await supabase.from('subscriptions').update({
          status: 'past_due',
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId);
        break;
      }

      default:
        // Andere Events ignorieren
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error('Handler error:', err);
    return new Response(`Handler error: ${(err as Error).message}`, { status: 500 });
  }
});