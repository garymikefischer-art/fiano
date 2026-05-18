-- ============================================================================
-- 003_stripe_events_dedupe.sql
-- ============================================================================
-- Datum:    2026-05-18
-- Phase:    A6.6 — Stripe Webhook Replay-Protection (P1-3)
-- Audit-Ref: SECURITY_AUDIT_2026-05-16.md P1-3
-- ============================================================================
--
-- Problem: Stripe-Webhook merkt sich keine processed event_ids → ein Attacker
-- könnte einen captured event-body innerhalb der signature-TTL (5min) replay
-- senden. Worst case: gecancelte subscription wird reaktiviert, doppelte
-- updates auf subscriptions-Table, race conditions.
--
-- Lösung: stripe_events_processed Tabelle als idempotency-store. Webhook
-- insertet event_id VOR dem handle. Bei duplicate key (PK constraint) →
-- skip + return 200 (Stripe akzeptiert das als "already received").
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stripe_events_processed (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_events_processed IS 'Phase A6.6: Idempotency-Store für Stripe-Webhook events. Verhindert Replay-Attacks.';

-- RLS: service_role only (Webhook nutzt service-role-Key).
ALTER TABLE public.stripe_events_processed ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.stripe_events_processed FROM anon;
REVOKE ALL ON public.stripe_events_processed FROM authenticated;
GRANT ALL ON public.stripe_events_processed TO service_role;

-- Cleanup-Job: events älter als 30 Tage löschen (Stripe re-sends nicht
-- nach so langer Zeit, Storage-Cleanup). Manuell via cron oder Supabase
-- pg_cron extension.
-- Optional: CREATE INDEX ON public.stripe_events_processed (processed_at);
