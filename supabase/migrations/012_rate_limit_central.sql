-- ============================================================================
-- 012_rate_limit_central.sql
-- ============================================================================
-- Datum:    2026-06-17
-- Audit-Ref: SECURITY_AUDIT_2026-06-10.md  K-1 + K-2 (Denial-of-Wallet)
-- Backup:   git tag pre-security-update-20260617
-- ============================================================================
--
-- Problem (K-1): Das Worker-Rate-Limit (express-rate-limit) nutzt den
-- In-Memory-MemoryStore → zählt PRO Cloud-Run-Instanz. Bei concurrency=1 +
-- mehreren Instanzen wird "render 5/min" real zu 5×N/min, und jeder Cold-Start
-- nullt den Zähler. Faktisch wirkungslos, sobald >1 Instanz läuft.
--
-- Problem (K-2, Teil 3): Kein Per-IP-Limit → Multi-Account-/Trial-Farming von
-- einer Quelle ungebremst.
--
-- Lösung: Ein ZENTRALER Zähler in Postgres, geteilt über alle Instanzen.
--   * Tabelle rate_limit_counters (1 Row pro Bucket-Key).
--   * RPC check_rate_limit(p_key, p_max, p_window_sec) — atomar via advisory
--     lock, Sliding-Fixed-Window mit Reset. Gibt {allowed, retry_after_sec}.
--   * Der Worker ruft sie als Middleware vor den teuren Endpoints auf:
--       - render:<userId>        max 5  / 60s     (K-1)
--       - upload-url:<userId>    max 30 / 60s     (K-1)
--       - render-ip:<ip>         max 20 / 86400s  (K-2 Per-IP-Tageslimit)
--
-- Bucket-Key-Konvention: "<endpoint>:<identifier>". Der Aufrufer baut den Key.
-- ============================================================================

-- ─── Tabelle ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  bucket_key   text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count        int NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rate_limit_counters IS
  'K-1/K-2: Zentraler Rate-Limit-Store (geteilt über alle Cloud-Run-Instanzen). Bucket-Key = "<endpoint>:<identifier>".';

-- RLS an, KEINE Policies → kein authenticated/anon-Zugriff. Nur service_role
-- (RLS-Bypass) + die SECURITY-DEFINER-RPC mutieren die Tabelle. So kann ein
-- curl-User seinen Zähler nicht selbst zurücksetzen.
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_counters FROM anon;
REVOKE ALL ON public.rate_limit_counters FROM authenticated;
GRANT ALL ON public.rate_limit_counters TO service_role;

-- ─── RPC: atomarer Check + Increment ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_max int,
  p_window_sec int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count int;
  v_window_end timestamptz;
BEGIN
  -- Serialisiert konkurrierende Requests auf denselben Bucket bis Tx-Ende.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_key, 0));

  SELECT window_start, count
    INTO v_window_start, v_count
  FROM public.rate_limit_counters
  WHERE bucket_key = p_key;

  -- Neues oder abgelaufenes Fenster → reset.
  IF v_window_start IS NULL
     OR v_window_start + make_interval(secs => p_window_sec) <= v_now THEN
    v_window_start := v_now;
    v_count := 0;
  END IF;

  v_window_end := v_window_start + make_interval(secs => p_window_sec);

  -- Limit erreicht → ablehnen (KEIN Increment, damit ein dauernd hämmernder
  -- Client das Fenster nicht endlos verlängert).
  IF v_count >= p_max THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'count', v_count,
      'limit', p_max,
      'retry_after_sec', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_window_end - v_now))))::int
    );
  END IF;

  v_count := v_count + 1;

  INSERT INTO public.rate_limit_counters (bucket_key, window_start, count, updated_at)
  VALUES (p_key, v_window_start, v_count, v_now)
  ON CONFLICT (bucket_key) DO UPDATE
    SET window_start = v_window_start,
        count = v_count,
        updated_at = v_now;

  RETURN jsonb_build_object(
    'allowed', true,
    'count', v_count,
    'limit', p_max,
    'remaining', p_max - v_count
  );
END;
$$;

COMMENT ON FUNCTION public.check_rate_limit IS
  'K-1/K-2: Zentrales Rate-Limit. Fixed-Window. Aufruf vor teuren Worker-Endpoints. Nur service_role.';

REVOKE ALL ON FUNCTION public.check_rate_limit(text, int, int) FROM public;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, int, int) FROM anon;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO service_role;

-- ─── Cleanup abgelaufener Buckets (best-effort via pg_cron) ──────────────────
-- Per-IP-Tages-Buckets akkumulieren. Wenn pg_cron verfügbar ist, täglich um
-- 03:00 UTC alte Rows löschen. Ohne pg_cron: no-op (Tabelle bleibt klein genug;
-- manuelles DELETE jederzeit möglich). Defensiv — bricht db push nie ab.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.schedule(
        'cleanup-rate-limit-counters',
        '0 3 * * *',
        'DELETE FROM public.rate_limit_counters WHERE window_start < now() - interval ''2 days'''
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron cleanup not scheduled (%): manuelles DELETE bei Bedarf.', SQLERRM;
    END;
  END IF;
END $$;
