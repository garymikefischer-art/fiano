-- Audit M-1 + M-2 (2026-06-05): subscriptions-UNIQUE-Constraint versionieren +
-- RevenueCat-Webhook-Replay-Dedupe-Tabelle.

-- ── M-1: UNIQUE(user_id) auf subscriptions idempotent absichern ──────────────
-- Die subscriptions-Tabelle wurde vor dem Migrations-Setup manuell angelegt;
-- es gibt keine versionierte Definition des UNIQUE-Constraints, auf den alle
-- Webhook-Upserts (onConflict: 'user_id') angewiesen sind. Dieser DO-Block
-- fügt ihn NUR hinzu, wenn nicht bereits ein UNIQUE/PK auf user_id existiert
-- (sonst No-op) — reproduzierbar + DR-sicher, ohne Duplikat-Index.
DO $$
DECLARE
  v_attnum smallint;
  v_exists boolean;
BEGIN
  SELECT attnum INTO v_attnum
    FROM pg_attribute
   WHERE attrelid = 'public.subscriptions'::regclass
     AND attname = 'user_id'
     AND NOT attisdropped;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.subscriptions'::regclass
       AND contype IN ('u', 'p')
       AND conkey = ARRAY[v_attnum]
  ) INTO v_exists;

  IF NOT v_exists THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
    RAISE NOTICE 'M-1: UNIQUE(user_id) auf subscriptions hinzugefügt';
  ELSE
    RAISE NOTICE 'M-1: UNIQUE/PK auf subscriptions.user_id existiert bereits — skip';
  END IF;
END $$;

-- ── M-2: rc_events_processed (RevenueCat-Webhook-Replay-Dedupe) ──────────────
-- Analog stripe_events_processed (005). Der RevenueCat-Webhook insertet die
-- event.id vor dem Verarbeiten; bei Duplikat → skip. Nur service_role.
CREATE TABLE IF NOT EXISTS public.rc_events_processed (
  event_id text PRIMARY KEY,
  event_type text,
  processed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rc_events_processed IS
  'M-2: RevenueCat-Webhook-Replay-Schutz. event_id-Dedupe analog stripe_events_processed.';

ALTER TABLE public.rc_events_processed ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rc_events_processed FROM anon;
REVOKE ALL ON public.rc_events_processed FROM authenticated;
GRANT ALL ON public.rc_events_processed TO service_role;
