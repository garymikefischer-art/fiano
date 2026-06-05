-- M5 / D3 (2026-06-05): RevenueCat-IAP-Integration (Mobile).
--
-- Der RevenueCat-Webhook (supabase/functions/revenuecat-webhook) schreibt
-- Mobile-Käufe in dieselbe `subscriptions`-Tabelle, die Desktop via Stripe
-- nutzt (unified source of truth, siehe PROJECT_SUMMARY §7a). Upsert läuft
-- über user_id == RevenueCat app_user_id.
--
-- Diese Migration fügt nur eine nullable Traceability-Spalte hinzu, damit man
-- im Dashboard sieht ob eine Row von RevenueCat (Mobile) oder Stripe (Desktop)
-- stammt. Keine Logik-Änderung, kein Backfill nötig.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS revenuecat_app_user_id text;

COMMENT ON COLUMN public.subscriptions.revenuecat_app_user_id IS
  'M5: RevenueCat app_user_id (== Supabase user_id) bei Mobile-IAP-Käufen. NULL bei Stripe-Desktop-Rows.';
