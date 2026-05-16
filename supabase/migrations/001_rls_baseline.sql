-- ============================================================================
-- 001_rls_baseline.sql
-- ============================================================================
-- Datum:    2026-05-16
-- Phase:    A1 — RLS-Baseline + GRANTs-Härtung
-- Autor:    Claude (claude/modest-greider-5dd6e1)
-- Backup:   git tag pre-phase-rls-setup-20260516
-- ============================================================================
--
-- ─── Stand vor diesem File ─────────────────────────────────────────────────
--
-- Tabellen:
--   profiles      — id (uuid PK = auth.uid), email, full_name, avatar_url, created_at
--   subscriptions — id (uuid PK), user_id (uuid), stripe_*, plan, status,
--                   current_period_end, lifetime, cancel_at_period_end, updated_at
--
-- RLS-Status:
--   profiles      — enabled, 2 policies (SELECT/UPDATE own)
--   subscriptions — enabled, 1 policy  (SELECT own)
--
-- Trigger:
--   on_auth_user_created (auth.users AFTER INSERT) → handle_new_user()
--   Legt beim Sign-up automatisch profile-row an (SECURITY DEFINER bypasst RLS)
--
-- Default-GRANTs (vor diesem File):
--   anon, authenticated, postgres, service_role → ALL auf beiden Tabellen
--   ⚠️ Das ist überzogen. RLS deckt zwar SELECT/UPDATE/DELETE/INSERT ab, aber
--   "defense in depth" verlangt explizite GRANTs (besonders im Hinblick auf
--   30.10.2026 Supabase-Default-Change).
--
-- ─── Was dieses File macht ─────────────────────────────────────────────────
--
-- 1. REVOKE überzogene GRANTs auf anon + authenticated
-- 2. GRANT genau das was die App braucht (SELECT/UPDATE)
-- 3. service_role behält ALL (für Edge Functions/Webhooks)
-- 4. Re-create der bestehenden Policies (idempotent, als Versions-Doku)
--
-- ─── Schreib-Operationen-Mapping ───────────────────────────────────────────
--
-- profiles INSERT  → Trigger handle_new_user() (SECURITY DEFINER bypasst RLS)
-- profiles UPDATE  → Desktop SettingsPage.tsx (authenticated, own row)
-- profiles DELETE  → delete-account Edge Function (service_role)
--
-- subscriptions SELECT          → Mobile authStore.fetchSubscription (authenticated, own)
--                              → Desktop authStore (authenticated, own + Realtime)
-- subscriptions INSERT/UPDATE  → stripe-webhook Edge Function (verify_jwt=false,
--                                nutzt service_role intern)
-- subscriptions DELETE         → delete-account Edge Function (service_role)
--
-- ─── Sicherheits-Garantien nach Apply ──────────────────────────────────────
--
-- ❌ anon          — kein Zugriff auf profiles oder subscriptions
-- ✅ authenticated — sieht nur eigenen profile-row (SELECT+UPDATE), eigene
--                    subscription (SELECT only)
-- ✅ service_role  — voller Zugriff (Edge Functions/Webhooks)
--
-- ============================================================================


-- ──────────────────────────────────────────────────────────────────────────
-- profiles
-- ──────────────────────────────────────────────────────────────────────────

-- 1) Überzogene GRANTs zurückziehen
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles FROM authenticated;

-- 2) Explizit was wir brauchen
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;

-- 3) RLS bleibt enabled (ist es schon, idempotent)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4) Policies idempotent re-create
DROP POLICY IF EXISTS "view own profile" ON public.profiles;
CREATE POLICY "view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "update own profile" ON public.profiles;
CREATE POLICY "update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Hinweis: INSERT- und DELETE-Policy bewusst NICHT angelegt
--   INSERT → läuft via Trigger handle_new_user() (security definer)
--   DELETE → läuft via delete-account Edge Function (service_role)


-- ──────────────────────────────────────────────────────────────────────────
-- subscriptions
-- ──────────────────────────────────────────────────────────────────────────

-- 1) Überzogene GRANTs zurückziehen
REVOKE ALL ON public.subscriptions FROM anon;
REVOKE ALL ON public.subscriptions FROM authenticated;

-- 2) Nur SELECT für User (Schreiben ausschliesslich via service_role)
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO service_role;

-- 3) RLS bleibt enabled
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- 4) Policies idempotent re-create
DROP POLICY IF EXISTS "view own subscription" ON public.subscriptions;
CREATE POLICY "view own subscription"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Hinweis: INSERT/UPDATE/DELETE-Policies bewusst NICHT angelegt
--   Alle Schreib-Ops via service_role (stripe-webhook, delete-account)


-- ============================================================================
-- VERIFY (nach Apply ausführen)
-- ============================================================================
--
-- 1) GRANTs-Check (sollte folgendes liefern):
--    profiles      | authenticated | SELECT, UPDATE
--    profiles      | service_role  | DELETE, INSERT, SELECT, UPDATE
--    subscriptions | authenticated | SELECT
--    subscriptions | service_role  | DELETE, INSERT, SELECT, UPDATE
--    (anon nicht mehr vorhanden in Results)
--
-- SELECT table_name, grantee,
--        string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND table_name IN ('profiles', 'subscriptions')
--   AND grantee IN ('anon', 'authenticated', 'service_role')
-- GROUP BY table_name, grantee
-- ORDER BY table_name, grantee;
--
-- 2) Anon-Test (sollte permission-denied liefern):
-- SET LOCAL ROLE anon;
-- SELECT count(*) FROM public.profiles;       -- → permission denied for table profiles
-- SELECT count(*) FROM public.subscriptions;  -- → permission denied for table subscriptions
-- RESET ROLE;
--
-- 3) Policies sind da:
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
--
-- ============================================================================
-- ROLLBACK (falls etwas in der App bricht — easy revert)
-- ============================================================================
--
-- GRANT ALL ON public.profiles TO anon;
-- GRANT ALL ON public.profiles TO authenticated;
-- GRANT ALL ON public.subscriptions TO anon;
-- GRANT ALL ON public.subscriptions TO authenticated;
--
-- ============================================================================
