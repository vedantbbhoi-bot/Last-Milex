# Last-Milex — Implementation Plan

**Status:** Local integration in progress. Password sign-in/setup, connectivity reporting, static-shell PWA behavior, online-only dispatch controls, and retry-key plumbing are implemented in the working copy. The coordination migration is a local review draft with scheduled sweeps; it has not been applied. No demo accounts, commits, pushes, or new deployments were made.

## Goal and scope

Complete the dispatch application while preserving its React/Vite + Supabase architecture and current Vercel host. The requested work covers idempotent donor batch creation/splitting; rider presence, claims, heartbeat, pickup, delivery, expiry, rerouting, and judge/testing flows; email/password login; and usable behavior during intermittent or weak flood connectivity. Prepare 4–5 role-specific demo accounts only in an isolated test project after the project and identities are confirmed.

The user's prior instruction is **draft SQL only; do not apply it live**. Preserve that gate. Do not push to the production branch or publish a Vercel deployment until separately authorized.

## Stack and current implementation

Keep React 19, TypeScript, Vite, Supabase JS/Postgres/Realtime, the existing visual system, GSAP, and Vercel. A small custom service worker caches the static shell and same-origin hashed Vite assets only. It falls back to the cached root page after a short navigation timeout. The service worker never caches Supabase/Auth/API responses or operational data. Static app status and Supabase/Realtime status are separate.

`README.md` and `TODO.md` track the current applied baseline and remaining work. The core schema and RLS migrations were applied to the current live/shared Supabase project on the user's explicit instruction; this was an exception to the original development-first plan. The live project has no coordination RPCs from this local draft.

## Architecture and safety decisions

1. **Authentication:** Use Supabase `signInWithPassword`; signing in does not send a sign-in email. Do not add public self-registration. Profile roles remain trusted-admin assigned. A user with an active legacy magic-link session can set a password on the same Auth identity through `updateUser({ password })`. If that session is gone, recovery may still use email. The separately requested project-level email-send limit of 30 messages/hour remains pending; the connected Supabase tools expose no Auth-settings write operation, and SQL is not appropriate for changing it. Do not change confirmation or SMTP settings as part of the UI task. See [`docs/reference/supabase-password-auth.md`](docs/reference/supabase-password-auth.md).
2. **Trusted dispatch state:** Keep state transitions behind narrow SECURITY DEFINER RPCs/triggers with fixed empty search paths, actor-role/ownership checks, least-privilege grants, and audit rows. The browser does not optimistically claim, pick up, deliver, reroute, or mutate shelter state.
3. **Low connectivity:** The custom worker caches only the static shell/assets. Dashboard rows are retained in memory while the tab remains open, with a last-sync timestamp and explicit offline/stale text. There is no IndexedDB/localStorage snapshot of operational rows. The worker's navigation fallback is time-bounded, and dashboard refresh uses bounded exponential backoff with jitter, single-flight reads, coalesced Realtime refreshes, and resume-on-reconnect/visibility.
4. **Offline action safety:** Do not queue or replay claims, pickup, delivery, heartbeat, or shelter mutations. Actions are disabled until the browser is online, a fresh dashboard read has succeeded, and Realtime reports a subscribed channel. Donor create uses a temporary session-scoped request ID plus the exact payload to reconcile uncertain online responses; it is not an offline batch draft and is removed after create and split are confirmed.
5. **Rider presence:** Rider rows default to `offline`. The draft therefore includes a rider-owned `rider_presence()` RPC, called immediately and every 60 seconds while the rider cockpit is online and idle. Active claims use `heartbeat(p_sub_batch_id)` every 60 seconds. Heartbeats older than 90 seconds are not revived; pre-pickup claims are reoffered only if shelter demand/resources still support them, and stale in-transit cargo becomes `at_risk` for human verification.
6. **Sweeps:** The RPC migration defines `dead_man_sweep()` and `expiry_sweep()` but does not activate jobs. A separate opt-in draft, `supabase/migrations/20261024132001_dispatch_sweep_schedules_draft.sql`, creates a named 30-second dead-man schedule and a one-minute expiry schedule through `pg_cron`; applying that file creates persistent data-mutating jobs and requires separate review/authorization. Neither schedule is active now. The 90-second heartbeat threshold and 5-minute pickup deadline remain enforced by RPC checks, but delayed sweeps can delay state reconciliation. Official scheduling details are in [`docs/reference/supabase-cron.md`](docs/reference/supabase-cron.md).
7. **Demo identities:** Use a separate development/demo Supabase project, not the current live/shared project. Create users only through Auth Admin API/Dashboard or a trusted server-side seed script; never insert into `auth.users` directly, expose a service-role key to the browser, or allow client self-promotion. Assign rider rows, shelter membership, and admin access through trusted tooling. Provisioning is blocked pending target project and identity confirmation.

## Security and data model

The installed roles are `donor`, `rider`, `shelter`, and `admin`. RLS permits scoped authenticated reads and denies direct browser writes to operational tables. Preserve exact enums (`batch_status`, `sub_batch_status`, `rider_status`, and `dependency_type`) and audit event labels from the core migration. Never treat audit event strings such as `picked_up` or `dead_man_revoked` as status values.

| Data/action | Donor | Rider | Shelter member | Admin/demo judge |
|---|---|---|---|---|
| Profile | Read own; edit permitted display fields | Same | Same | Role changes only through trusted provisioning |
| Batch | Create/read own through checked RPCs | Read eligible/assigned rows | Read mapped rows | Read/manage only through checked operations |
| Claims and dispatch | No claim permission | Own presence/claim/heartbeat/pickup/delivery RPCs only | Read mapped rows | Read all; test-only operations only in isolated data |
| Shelter demand/resources | Read board | Read board | Any changes need a scoped, reviewed RPC | Admin-only management/test RPCs |
| Audit | Read related rows | Read own related rows | Read mapped rows | Read all; write only through functions/triggers |
| Offline copy | Stale in-memory, read-only display | Same | Same | Same |

## Current draft RPC coverage and limits

The local migration defines `create_batch`, `split_batch`, `claim_sub_batch`, `rider_presence`, `heartbeat`, `validate_dispatch`, `confirm_pickup`, `deliver_sub_batch`, parent-status refresh, shelter shock/reroute handling, `dead_man_sweep()`, and `expiry_sweep()`. It includes an idempotency ledger for parent creation, an idempotent split, fixed search paths, role checks, and least-privilege grants. The donor UI now stores/reuses the exact request key for uncertain create responses.

All six shelter-demand reservation checks include shelter-assigned `at_risk` cargo so unresolved loads cannot be double-allocated. Same-rider claim retries fail closed when their assignment is expired, the pickup deadline has elapsed, or the heartbeat is stale; pickup retries likewise reject expired or stale in-transit loads. The expiry sweep also marks expired open parents with no children as `fully_spoiled` and writes a batch-level audit row. The recurring Cron jobs live in a separate opt-in draft and are not activated by the RPC migration.

The SQL has **not** been executed against PostgreSQL or a test database. Static parsing is not evidence that PL/pgSQL compiles or that lock behavior, RLS bypass, triggers, scheduling, and concurrency work at runtime. Before applying the RPC migration, test it against a disposable Supabase-compatible database and review function ownership and grants. Review and approve the separate schedule draft independently before activating recurring jobs.

Known functional limitations remain: shelter selection/rerouting uses straight-line PostGIS distance, not road routing or verified ETA; a positive-demand reduction by trusted SQL may cause delivery to fail closed until manual reconciliation; no trusted shelter-demand mutation API or at-risk recovery RPC exists; and judge failure-injection RPCs are omitted because the shared project lacks demo-row isolation. Do not claim those workflows are production-ready.

## Project structure

```text
src/
  app/                    authentication boundary and dispatch shell
  components/             header, metrics, shelter board, at-risk banner
  features/auth/          password sign-in, password setup, session, dashboard
  features/batches/        retry-safe donor create/split flow
  features/claims/         rider presence, claim, heartbeat, pickup, delivery UI
  features/judge/          admin-only controls; backend test RPCs remain blocked
  features/routing/        SVG routes and MotionPath animation
  lib/                    Supabase client, connectivity hook, domain types
  styles/                 existing visual system and motion/accessibility rules
public/                   static PWA manifest, favicon, and service worker
supabase/migrations/      applied core/RLS plus local draft-only coordination SQL
scripts/                  trusted demo provisioning only after an isolated project is confirmed
docs/reference/           Auth and Cron implementation references
```

## Design and interaction direction

Retain the industrial field-notebook visual system, operational clarity, asymmetrical dispatch-board layout, split-box/route motifs, signal-coral for intervention, timer/quantity typography, and the existing motion language. Offline, stale, at-risk, and human-verification states need explicit text and keyboard-accessible controls, not color alone. Respect `prefers-reduced-motion`.

## Milestone sequence

1. Keep plan/task/README status accurate and record the live schema/RLS exception.
2. Finish and runtime-test the draft coordination migration and idempotent donor create/split integration.
3. Complete rider liveness, claim/pickup/dead-man, delivery, expiry, shelter-shock, and reroute workflows with tests; resolve the limits above.
4. Complete password migration and role-scoped UI tests without changing live Auth settings.
5. Browser-test low-connectivity behavior and decide whether any persistent operational-data cache is acceptable; default remains no persistent snapshot.
6. Confirm a separate demo project and identities; provision only synthetic fixtures there.
7. Run local/static validation, then request separate release approval before pushing or deploying through Vercel.

## Dependencies, risks, and gates

- The core schema/RLS baseline is live, but the coordination migration is local and unapplied. No RPC behavior from that draft is currently live.
- The current Supabase project is live/shared. The latest audit found one profile and no operational fixture data. No isolated demo project has been verified; project/branch creation may have cost implications.
- Actual demo accounts are blocked on the target project, exact identities/roles/shelter assignments, and safe credential handoff. No accounts or secrets have been created.
- Existing-user password setup needs an active authenticated session; without it, recovery can require an email reset or trusted Auth Admin action.
- Persistent offline data caching remains unapproved. The current design caches static assets only and retains operational rows only in memory.
- The authenticated GitHub CLI can access `vedantbbhoi-bot/Last-Milex`; the local checkout is `main` at `d24bc0f`. This task's changes have not been committed, pushed, or deployed. A push to the production branch may trigger Vercel; do not push or deploy without explicit release approval.
