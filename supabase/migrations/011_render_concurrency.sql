-- ============================================================================
-- 011_render_concurrency.sql
-- ============================================================================
-- Datum:    2026-06-17
-- Audit-Ref: SECURITY_AUDIT_2026-06-10.md  K-3 (Denial-of-Wallet)
-- Backup:   git tag pre-security-update-20260617
-- ============================================================================
--
-- Problem (K-3): Die Render-Quota zählt nur die GESAMT-Anzahl pro Monat, nicht
-- die GLEICHZEITIGEN Renders. Mit `concurrency=1` belegt jeder Render eine
-- ganze Cloud-Run-Instanz bis zum Timeout. Ein einzelner User kann so mit
-- parallelen /render-Requests die komplette Fleet (max-instances) belegen
-- → Service-DoS für alle + maximale Brennrate (Denial-of-Wallet).
--
-- Lösung: Hartes Per-User-Concurrency-Limit in derselben atomaren Quota-RPC
-- (der advisory_xact_lock serialisiert ohnehin schon pro User):
--   * render_usage bekommt einen `in_flight`-Zähler (laufende Renders).
--   * check_and_increment_render_quota inkrementiert in_flight beim Start und
--     weist ab, sobald in_flight >= MAX_CONCURRENT (=1, siehe AskUserQuestion
--     2026-06-17 → "1, max. Schutz").
--   * Der Worker ruft release_render_slot() im finally (dekrementiert in_flight),
--     egal ob der Render erfolgreich war, fehlschlug oder gekillt wurde.
--
-- Stale-Guard: Crasht ein Render (OOM / Instanz-Kill) ohne release, bliebe der
-- Slot sonst dauerhaft belegt. Ein in_flight-Slot, der länger als 15 min nicht
-- aktualisiert wurde, gilt als verwaist und wird zurückgesetzt. 15 min liegt
-- weit über dem maximalen Render-Budget (2 Pässe × 400s + Overhead ≈ 14 min).
--
-- Sonst Logik IDENTISCH zu 010 (period_end-frei, Creator 50 / Pro 100, 4K=Pro).
-- CREATE OR REPLACE mit unveränderter Signatur (uuid, text) → GRANTs bleiben
-- erhalten (kein DROP), Worker-Aufruf ändert sich nicht.
-- ============================================================================

-- ─── Schema: in_flight-Zähler ───────────────────────────────────────────────
ALTER TABLE public.render_usage
  ADD COLUMN IF NOT EXISTS in_flight int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS in_flight_updated_at timestamptz;

COMMENT ON COLUMN public.render_usage.in_flight IS
  'K-3: Anzahl aktuell laufender Renders dieses Users. Inkrement in check_and_increment_render_quota, Dekrement in release_render_slot. Stale-Reset nach 15 min.';

-- ─── Atomic Quota-Check + Increment (jetzt MIT Concurrency-Limit) ────────────
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
  -- K-3: max. gleichzeitige Renders pro User (AskUserQuestion 2026-06-17 = 1).
  v_max_concurrent constant int := 1;
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
  v_in_flight int;
  v_in_flight_at timestamptz;
BEGIN
  -- Audit-H-2: Per-User-Serialisierung gegen TOCTOU-Race (Lock bis Tx-Ende).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  current_month := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');

  -- Plan/Status aus subscriptions.
  SELECT plan, status, lifetime, current_period_end
    INTO v_plan, v_status, v_lifetime, v_period_end
  FROM public.subscriptions
  WHERE user_id = p_user_id
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  -- Fix 2026-06-08 (Migration 010): KEIN current_period_end-Check (verpasster
  -- Renewal-Webhook sperrte sonst zahlende User aus). Nur status + plan.
  IF v_status IN ('active', 'trialing')
     AND v_plan IN ('creator', 'pro') THEN
    v_active_plan := v_plan;
  ELSE
    v_active_plan := 'inactive';
  END IF;
  PERFORM v_lifetime;
  PERFORM v_period_end;

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

  -- render_usage: in_flight (monatsunabhängig) + render_count (nur lfd. Monat).
  -- Ein SELECT; fehlt die Row → beide NULL → COALESCE unten.
  SELECT
    in_flight,
    in_flight_updated_at,
    CASE WHEN month_key = current_month THEN render_count ELSE 0 END
    INTO v_in_flight, v_in_flight_at, v_current_count
  FROM public.render_usage
  WHERE user_id = p_user_id;

  -- ── K-3: Concurrency-Check ────────────────────────────────────────────────
  v_in_flight := COALESCE(v_in_flight, 0);
  -- Stale-Guard: verwaiste Slots (Render gecrasht ohne release) nach 15 min
  -- als frei behandeln.
  IF v_in_flight_at IS NOT NULL AND v_in_flight_at < now() - interval '15 minutes' THEN
    v_in_flight := 0;
  END IF;
  IF v_in_flight >= v_max_concurrent THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'concurrency_limit',
      'plan', v_active_plan,
      'monthly_limit', v_monthly_limit,
      'max_concurrent', v_max_concurrent
    );
  END IF;

  -- ── Monatslimit ───────────────────────────────────────────────────────────
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

  -- ── Increment: render_count (+1) UND in_flight (+1) ───────────────────────
  -- v_in_flight ist hier stale-korrigiert → in_flight = v_in_flight + 1.
  INSERT INTO public.render_usage
    (user_id, month_key, render_count, in_flight, in_flight_updated_at, last_render_at, updated_at)
  VALUES (p_user_id, current_month, 1, 1, now(), now(), now())
  ON CONFLICT (user_id) DO UPDATE
    SET render_count = CASE
          WHEN render_usage.month_key = current_month
            THEN render_usage.render_count + 1
          ELSE 1
        END,
        month_key = current_month,
        in_flight = v_in_flight + 1,
        in_flight_updated_at = now(),
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

-- ─── release_render_slot: in_flight dekrementieren (Worker-finally) ──────────
-- Wird vom Worker IMMER nach Render-Ende aufgerufen (success/fail/timeout).
-- Idempotent-sicher via GREATEST(0, ...) — ein doppelter Release kann nicht
-- ins Negative laufen.
CREATE OR REPLACE FUNCTION public.release_render_slot(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  UPDATE public.render_usage
     SET in_flight = GREATEST(0, in_flight - 1),
         in_flight_updated_at = now()
   WHERE user_id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.release_render_slot IS
  'K-3: Gibt einen in_flight-Render-Slot frei. Aufruf vom Worker im finally nach jedem Render-Versuch.';

-- ─── GRANTs (nur service_role) ──────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.release_render_slot(uuid) FROM public;
REVOKE ALL ON FUNCTION public.release_render_slot(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.release_render_slot(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_render_slot(uuid) TO service_role;
