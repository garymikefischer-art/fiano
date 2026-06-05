-- Audit-H-2 (2026-06-05): Render-Quota race-condition-frei machen.
--
-- Problem: check_and_increment_render_quota las render_count, prüfte das Limit
-- und inkrementierte in GETRENNTEN Statements ohne Lock (TOCTOU). Bei parallelen
-- Requests desselben Users (z.B. 5er-Burst innerhalb des Rate-Limit-Fensters)
-- lasen alle denselben Count, bestanden alle den Limit-Check und inkrementierten
-- → Monats-Limit (die einzige harte Kostengrenze) konnte überschritten werden.
--
-- Fix: pg_advisory_xact_lock(userId) am Funktionsanfang serialisiert konkurrierende
-- Aufrufe pro User für die Dauer der Transaktion (= der RPC-Call). Der Lock wird
-- automatisch am Transaktionsende freigegeben. Sonst Logik IDENTISCH zu 006 —
-- minimaler, risikoarmer Patch. Creator 50, Pro 100.
--
-- get_render_quota_status (read-only, ohne Increment) braucht keinen Lock und
-- bleibt unverändert.

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
  -- Audit-H-2: Per-User-Serialisierung gegen die TOCTOU-Race. hashtextextended
  -- mapped die UUID deterministisch auf den bigint-Lock-Key. Hält bis Tx-Ende.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  current_month := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');

  SELECT plan, status, lifetime, current_period_end
    INTO v_plan, v_status, v_lifetime, v_period_end
  FROM public.subscriptions
  WHERE user_id = p_user_id
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_status = 'active'
     AND (v_period_end IS NULL OR v_period_end > now())
     AND v_plan IN ('creator', 'pro') THEN
    v_active_plan := v_plan;
  ELSE
    v_active_plan := 'inactive';
  END IF;
  PERFORM v_lifetime;

  v_monthly_limit := CASE v_active_plan
    WHEN 'inactive'  THEN 0
    WHEN 'creator'   THEN 50
    WHEN 'pro'       THEN 100
    ELSE 0
  END;
  v_allows_4k := v_active_plan = 'pro';

  IF v_active_plan = 'inactive' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'subscription_required',
      'plan', v_active_plan,
      'monthly_limit', 0
    );
  END IF;

  IF p_resolution = '4k' AND NOT v_allows_4k THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'resolution_locked',
      'plan', v_active_plan,
      'requested_resolution', p_resolution,
      'monthly_limit', v_monthly_limit
    );
  END IF;

  SELECT render_count INTO v_current_count
  FROM public.render_usage
  WHERE user_id = p_user_id AND month_key = current_month;

  v_current_count := COALESCE(v_current_count, 0);

  IF v_current_count >= v_monthly_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'monthly_limit_exceeded',
      'plan', v_active_plan,
      'render_count', v_current_count,
      'monthly_limit', v_monthly_limit
    );
  END IF;

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
