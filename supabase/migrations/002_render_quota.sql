-- ============================================================================
-- 002_render_quota.sql
-- ============================================================================
-- Datum:    2026-05-18
-- Phase:    A6.3 — Server-side Plan-Enforcement + Monthly Render-Quota (P0-2)
-- Autor:    Claude (claude/relaxed-borg-6f90d1)
-- Backup:   git tag pre-phase-a6.3-plan-check-20260518
-- Audit-Ref: SECURITY_AUDIT_2026-05-16.md P0-2
-- ============================================================================
--
-- Problem (P0-2 aus Audit):
--   Worker `authMiddleware` checkt JWT, aber kein Plan oder Quota. Mobile-
--   Paywall ist die einzige Sperre — `ExportScreen` callt `runRenderJob()`
--   mit User-JWT, Worker akzeptiert jeden authenticated User.
--   → Free-User können via curl unlimited 4K-Renders + Whisper-Calls machen.
--
-- Lösung:
--   1. `render_usage` Tabelle pro User mit (month_key, render_count).
--   2. RPC `check_and_increment_render_quota(p_user_id, p_resolution)` atomic.
--   3. Worker callt RPC vor jedem render. Bei 402 → Mobile zeigt UpgradeModal.
--
-- Plan-Limits (hardcoded im Worker, einfacher änderbar als hier in SQL):
--   free:             3 renders/Monat, max 1080p
--   creator:          30 renders/Monat, max 1080p
--   pro:              300 renders/Monat, 4K OK
--   studio_lifetime:  unlimited, 4K OK
--
-- Schema-Design:
--   render_usage hat 1 row pro user. Bei Monatswechsel wird `month_key` und
--   `render_count` ge-reset. Kein time-series — nur aktueller Monat. Spart
--   Storage + ist für die UseCase (Quota-Check) ausreichend.
-- ============================================================================

-- ─── Tabelle ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.render_usage (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'YYYY-MM' Format (z.B. '2026-05'). Bei Monatswechsel reset.
  month_key text NOT NULL,
  render_count int NOT NULL DEFAULT 0,
  last_render_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.render_usage IS 'Phase A6.3: Monthly Render-Quota per User. Auto-reset bei Monatswechsel.';

-- ─── RLS aktivieren ─────────────────────────────────────────────────────────
ALTER TABLE public.render_usage ENABLE ROW LEVEL SECURITY;

-- Read-Policy: User darf eigene Quota lesen (für UI-Anzeige).
DROP POLICY IF EXISTS render_usage_select_own ON public.render_usage;
CREATE POLICY render_usage_select_own
  ON public.render_usage
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Keine INSERT/UPDATE/DELETE Policies für authenticated — der Worker
-- nutzt service_role + die SECURITY DEFINER RPC für mutations. So kann
-- ein curl-User NICHT direkt seinen render_count manipulieren.

-- ─── GRANTs ─────────────────────────────────────────────────────────────────
REVOKE ALL ON public.render_usage FROM anon;
REVOKE ALL ON public.render_usage FROM authenticated;
GRANT SELECT ON public.render_usage TO authenticated;
GRANT ALL ON public.render_usage TO service_role;

-- ─── Atomic Increment-RPC ───────────────────────────────────────────────────
-- Returns ein JSON: { allowed, render_count, plan, monthly_limit }.
-- Wird IMMER inkrementiert wenn allowed=true (nach erfolgreichem Render).
-- Bei allowed=false bleibt counter unverändert.

CREATE OR REPLACE FUNCTION public.check_and_increment_render_quota(
  p_user_id uuid,
  p_resolution text DEFAULT '1080p'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_month text;
  v_plan text;
  v_status text;
  v_lifetime boolean;
  v_period_end timestamptz;
  v_active_plan text;
  v_monthly_limit int;
  v_allows_4k boolean;
  v_current_count int;
  v_new_count int;
BEGIN
  current_month := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');

  -- Plan ableiten aus subscriptions.
  SELECT plan, status, lifetime, current_period_end
    INTO v_plan, v_status, v_lifetime, v_period_end
  FROM public.subscriptions
  WHERE user_id = p_user_id;

  IF v_lifetime IS TRUE THEN
    v_active_plan := 'studio_lifetime';
  ELSIF v_status = 'active'
        AND (v_period_end IS NULL OR v_period_end > now())
        AND v_plan IN ('creator', 'pro') THEN
    v_active_plan := v_plan;
  ELSE
    v_active_plan := 'free';
  END IF;

  -- Plan-Limits.
  v_monthly_limit := CASE v_active_plan
    WHEN 'free'             THEN 3
    WHEN 'creator'          THEN 30
    WHEN 'pro'              THEN 300
    WHEN 'studio_lifetime'  THEN 1000000  -- praktisch unlimited
    ELSE 0
  END;
  v_allows_4k := v_active_plan IN ('pro', 'studio_lifetime');

  -- Resolution-Check: 4K nur für pro/lifetime.
  IF p_resolution = '4k' AND NOT v_allows_4k THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'resolution_locked',
      'plan', v_active_plan,
      'requested_resolution', p_resolution,
      'monthly_limit', v_monthly_limit
    );
  END IF;

  -- Aktuellen counter holen (für richtigen Monat).
  SELECT render_count INTO v_current_count
  FROM public.render_usage
  WHERE user_id = p_user_id AND month_key = current_month;

  v_current_count := COALESCE(v_current_count, 0);

  -- Quota-Check.
  IF v_current_count >= v_monthly_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'monthly_limit_exceeded',
      'plan', v_active_plan,
      'render_count', v_current_count,
      'monthly_limit', v_monthly_limit
    );
  END IF;

  -- Increment (atomic upsert).
  INSERT INTO public.render_usage (user_id, month_key, render_count, last_render_at, updated_at)
  VALUES (p_user_id, current_month, 1, now(), now())
  ON CONFLICT (user_id) DO UPDATE
    SET render_count = CASE
          WHEN render_usage.month_key = current_month
            THEN render_usage.render_count + 1
          ELSE 1
        END,
        month_key = current_month,
        last_render_at = now(),
        updated_at = now()
    RETURNING render_count INTO v_new_count;

  RETURN jsonb_build_object(
    'allowed', true,
    'plan', v_active_plan,
    'render_count', v_new_count,
    'monthly_limit', v_monthly_limit
  );
END;
$$;

COMMENT ON FUNCTION public.check_and_increment_render_quota IS 'Phase A6.3: Atomic Quota-Check + Increment. Aufruf VOR jedem Worker-Render. SECURITY DEFINER damit Worker (service_role) das ohne RLS-Bypass-Hack nutzen kann.';

-- service_role darf die RPC ausführen.
REVOKE ALL ON FUNCTION public.check_and_increment_render_quota(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.check_and_increment_render_quota(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.check_and_increment_render_quota(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_increment_render_quota(uuid, text) TO service_role;

-- ─── Plan-only-Resolver (read-only, ohne increment) ─────────────────────────
-- Für UI-Anzeige "X von Y Renders diesen Monat" — User darf seine
-- eigene Plan + Quota lesen, aber NICHT incrementen.

CREATE OR REPLACE FUNCTION public.get_render_quota_status(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_month text;
  v_plan text;
  v_status text;
  v_lifetime boolean;
  v_period_end timestamptz;
  v_active_plan text;
  v_monthly_limit int;
  v_current_count int;
BEGIN
  -- Nur eigene Quota.
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  current_month := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');

  SELECT plan, status, lifetime, current_period_end
    INTO v_plan, v_status, v_lifetime, v_period_end
  FROM public.subscriptions
  WHERE user_id = p_user_id;

  IF v_lifetime IS TRUE THEN
    v_active_plan := 'studio_lifetime';
  ELSIF v_status = 'active'
        AND (v_period_end IS NULL OR v_period_end > now())
        AND v_plan IN ('creator', 'pro') THEN
    v_active_plan := v_plan;
  ELSE
    v_active_plan := 'free';
  END IF;

  v_monthly_limit := CASE v_active_plan
    WHEN 'free'             THEN 3
    WHEN 'creator'          THEN 30
    WHEN 'pro'              THEN 300
    WHEN 'studio_lifetime'  THEN 1000000
    ELSE 0
  END;

  SELECT render_count INTO v_current_count
  FROM public.render_usage
  WHERE user_id = p_user_id AND month_key = current_month;

  RETURN jsonb_build_object(
    'plan', v_active_plan,
    'render_count', COALESCE(v_current_count, 0),
    'monthly_limit', v_monthly_limit,
    'allows_4k', v_active_plan IN ('pro', 'studio_lifetime')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_render_quota_status(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_render_quota_status(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_render_quota_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_render_quota_status(uuid) TO service_role;
