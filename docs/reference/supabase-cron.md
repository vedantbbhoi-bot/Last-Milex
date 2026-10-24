# Supabase Cron cadence — implementation reference

Checked against official documentation on 2026-10-24. Supabase Cron uses the `pg_cron` PostgreSQL extension. The official Supabase guide says recurring jobs can run from every second to once a year. The pg_cron project documents interval strings from 1–59 seconds (for example, `30 seconds`) and states that seconds syntax cannot be combined with other cron fields. This supports a 30-second dead-man sweep and a once-per-minute expiry sweep in a migration, subject to confirming the extension/version and job-run permissions in the target project.

The migration should schedule named jobs idempotently and remain unapplied until the user separately approves it. Job-run history can be checked in `cron.job_run_details` or Supabase Cron monitoring. Supabase recommends no more than 8 concurrent jobs and for each job to run no more than 10 minutes.

Sources:

- [Supabase Cron guide](https://supabase.com/docs/guides/cron)
- [Supabase Cron module](https://supabase.com/modules/cron)
- [Citus pg_cron project documentation](https://github.com/citusdata/pg_cron)
