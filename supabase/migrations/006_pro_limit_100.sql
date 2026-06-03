-- Phase D-Pricing-Update (2026-06-03): Pro-Plan-Monthly-Limit von 200 → 100 Renders.
-- Hintergrund: User-Decision vor Mobile-Launch. Vorheriger Wert "200" war auf
-- der Mobile-UI als "Unlimited renders" deklariert (UI-Lüge) — bei realer
-- Heavy-User-Auslastung (z.B. 1h Quellvideo pro Session => 30-100 Clips =>
-- bis ~2000 Renders/Monat moeglich) wuerde die Cloud-Run-Marge negativ. 100
-- Renders entsprechen ~25-50 typischen Stream-Highlights pro Woche bei <$0.50
-- Render-Kosten und ~25 EUR Netto-Revenue pro Pro-User/Monat.
--
-- Diese Migration ueberschreibt die beiden SQL-RPCs aus 003_creator_limit_50.sql
-- nochmals — Logik identisch, nur das v_monthly_limit CASE für 'pro' aendert
-- sich von 200 → 100. Creator bleibt bei 50.
--
-- Sync gehalten mit:
--   - services/render-worker/src/planCheck.ts (doc-comment)
--   - packages/shared/src/i18n/locales/*.ts ('pricing.f.unlimited' string)
--   - packages/mobile/src/screens/PricingScreen.tsx (Plan-Karte)
--   - src/renderer/src/pages/PricingPage.tsx (Desktop-Plan-Karte)

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

  SELECT plan, status, lifetime, current_period_end
    INTO v_plan, v_status, v_lifetime, v_period_end
  FROM public.subscriptions
  WHERE user_id = p_user_id;

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
    WHEN 'creator'   THEN 50   -- Phase D-Pricing (2026-05-26): war 30
    WHEN 'pro'       THEN 100  -- Phase D-Pricing-Update (2026-06-03): war 200
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
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  current_month := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');

  SELECT plan, status, lifetime, current_period_end
    INTO v_plan, v_status, v_lifetime, v_period_end
  FROM public.subscriptions
  WHERE user_id = p_user_id;

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
    WHEN 'creator'   THEN 50   -- Phase D-Pricing (2026-05-26): war 30
    WHEN 'pro'       THEN 100  -- Phase D-Pricing-Update (2026-06-03): war 200
    ELSE 0
  END;

  SELECT render_count INTO v_current_count
  FROM public.render_usage
  WHERE user_id = p_user_id AND month_key = current_month;

  RETURN jsonb_build_object(
    'plan', v_active_plan,
    'render_count', COALESCE(v_current_count, 0),
    'monthly_limit', v_monthly_limit,
    'allows_4k', v_active_plan = 'pro'
  );
END;
$$;
