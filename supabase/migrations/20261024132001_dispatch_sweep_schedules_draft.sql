-- ============================================================================
-- DRAFT ONLY / NOT APPLIED
-- Optional recurring-job activation for Last-Milex dispatch operations.
-- Applying this file creates persistent pg_cron jobs that mutate dispatch rows.
-- Review the target project, job owner, cadence, and test results separately
-- before applying. Do not apply to the current live/shared project without a new
-- explicit authorization.
-- Requires 20261024132000_dispatch_operations_draft.sql and pg_cron.
-- ============================================================================

BEGIN;

DO $cron$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
     WHERE jobname = 'lastmilex-dead-man-sweep'
       AND database = pg_catalog.current_database()
  ) THEN
    PERFORM cron.schedule(
      'lastmilex-dead-man-sweep',
      '30 seconds',
      'SELECT public.dead_man_sweep();'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cron.job
     WHERE jobname = 'lastmilex-expiry-sweep'
       AND database = pg_catalog.current_database()
  ) THEN
    PERFORM cron.schedule(
      'lastmilex-expiry-sweep',
      '* * * * *',
      'SELECT public.expiry_sweep();'
    );
  END IF;
END;
$cron$;

COMMIT;
