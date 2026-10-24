# Last-Milex — Milestone Task List

**Status:** Local integration in progress. The working copy contains password login/setup, offline/static-shell handling, live-vs-stale status, retry-safe donor request keys, and a draft coordination migration. Typecheck, existing unit tests, and production build passed before the latest rider-presence and SQL refinements; they must be rerun. Core schema/RLS are applied to the current live Supabase project by the user's explicit authorization; this was an exception to the original development-first plan. The coordination migration remains draft-only and unapplied. No demo accounts, commits, pushes, or new deployments were made.

## Milestone 0 — Project baseline and configuration

- [x] **0.1 Configure the browser-safe Supabase client.** Vercel Production uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; no service-role key is in browser code. A baseline production deployment after the variables were corrected responded at the live alias. This does not prove dispatch RPC functionality. Commit message: `chore: add Supabase project config`.
- [x] **0.2 Scaffold the client.** React + Vite + TypeScript app and current package scripts are present in the repository. Commit message: `chore: scaffold frontend`.
- [x] **0.3 Connect the repository workflow.** The authorized repository is `https://github.com/vedantbbhoi-bot/Last-Milex`; the authenticated GitHub CLI can read it. The originally requested GitHub MCP is unavailable in this session; previous authorization permits the GitHub API/CLI route. No changes from this task have been pushed. Commit message: `chore: initialize repository`.
- [x] **0.4 Keep project status accurate.** README, plan, and this checklist now distinguish the applied live schema/RLS from unapplied coordination SQL and distinguish local source changes from the deployed app. Commit message: `docs: reconcile project implementation status`.

## Milestone 1 — Core database schema and RLS baseline

- [x] **1.1 Apply the core schema.** `profiles`, `riders`, `shelters`, `shelter_members`, `batches`, `sub_batches`, and `claim_audit` exist with PostGIS and `pg_cron` support; roles are `donor`, `rider`, `shelter`, and `admin`; sub-batches are bounded to 40 units. Applied to the current live project by explicit user instruction. Commit message: `feat: add core schema with sub_batches`.
- [x] **1.2 Apply least-privilege RLS.** Authenticated operational reads are scoped; direct browser state-transition writes are revoked; users cannot self-promote; role/shelter assignment remains trusted-server-only. Applied to the current live project by explicit user instruction. Commit message: `feat: add row-level security`.
- [ ] **1.3 Add and test business triggers.** A local draft contains positive-to-zero shelter-shock handling and rerouting, but it is not applied or runtime-tested. It does not handle every positive-demand/resource reduction or supply road ETA. Commit message: `feat: add coordination triggers`.
- [x] **1.4 Record the applied baseline.** Core schema/RLS are applied to the current project, not a disposable test project. No operational fixture data was used. All new coordination SQL remains draft-only until separately approved. Commit message: `deploy: apply schema migrations`.

## Milestone 2 — Dynamic batch splitter

- [ ] **2.1 Implement `split_batch(p_batch_id)`.** Drafted locally with parent/shelter serialization, reservation subtraction that includes shelter-assigned `at_risk` cargo, dependency compatibility, a recently-present rider capacity bound, a 40-unit ceiling, explicit unassigned at-risk remainder, and idempotent return after a completed split. It still needs disposable-database execution/concurrency tests and approval before application. Commit message: `feat: add dynamic batch splitter RPC`.
- [ ] **2.2 Make donor create/split retry-safe.** The draft adds a per-actor request ledger and `create_batch(..., p_request_id)`; the donor form stores and reuses the exact payload/request UUID in session storage after uncertain online responses, then retries split without creating a duplicate parent. No offline batch submission is queued. Runtime/PostgREST compatibility remains untested. Commit message: `feat: donor split flow`.
- [ ] **2.3 Animate sub-batch entry.** Use the required 40 ms stagger and 6 px Y-offset, transform/opacity only, approved motion curve, and reduced-motion fallback. Commit message: `style: sub-batch stagger entrance`.

## Milestone 3 — Authentication and realtime panels

- [ ] **3.1 Replace sign-in email links with email/password.** Local code now calls Supabase `signInWithPassword` and has a signed-in first-time “Set or change password” path using `updateUser({ password })` to preserve the existing Auth identity. It does not add public sign-up or change Auth confirmation/SMTP settings. Live Auth behavior and the existing user's password setup have not been tested. Password recovery is a separate email-based flow. Commit message: `feat: switch to password authentication`.
- [ ] **3.2 Verify Realtime status.** The dashboard exposes channel state, coalesces updates, single-flights reads, retries with bounded backoff, and refreshes on reconnect/visibility. It remains untested against a live browser session. Commit message: `feat: add realtime subscriptions`.
- [ ] **3.3 Complete the shelter board.** Show remaining demand, capacity, water/fuel resource badges, and accessible text status labels; shelter writes remain limited to mapped shelter members through checked RPCs. Commit message: `feat: shelter board`.
- [ ] **3.4 Complete live metrics.** Show spoiled share, dead-man revokes, split sub-batches, deliveries, and reroutes from committed server state; retain the approved motion curve and reduced-motion fallback. Commit message: `feat: animated metrics bar`.
- [ ] **3.5 Set the project Auth email-send limit to 30 messages/hour.** This is separate from password sign-in, which sends no email. The connected Supabase tools have no Auth-settings write operation, and changing this through SQL is not supported; configure it through Supabase project Auth settings after checking the plan/SMTP limits. **Not changed by this local code work.**

## Milestone 4 — Claim, heartbeat, pickup, delivery, and dead-man sweep

- [ ] **4.1 Add atomic claim and pickup RPCs.** Drafted locally. Claim is rider-only, checks rider presence, capacity, current assignment and destination, sets the five-minute deadline and heartbeat, and audits `claimed`. Same-rider claim retries fail closed after expiry, a closed pickup deadline, or stale heartbeat. Repeated pickup confirmation returns success only while the in-transit load remains unexpired with a fresh heartbeat. Runtime tests are pending. Commit message: `feat: add claim RPC with deadlines`.
- [ ] **4.2 Add rider presence and `heartbeat(p_sub_batch_id)`.** Local UI pings `rider_presence()` when idle and sends active-cargo heartbeat every 60 seconds only while online. Late heartbeats older than 90 seconds are rejected, and failed/offline heartbeats are not replayed. SQL is draft-only; browser behavior is not tested. Commit message: `feat: rider heartbeat sender`.
- [ ] **4.3 Implement idempotent `dead_man_sweep()`.** Draft revokes an unconfirmed/stale pre-pickup claim only after rechecking the shelter reservation/dependency; it reoffers only if still valid and otherwise marks at risk. Stale in-transit cargo is not reoffered and requires human verification. The separate opt-in Cron definition is not active. Commit message: `feat: dead-man sweep RPC`.
- [ ] **4.4 Schedule the sweep every 30 seconds.** The separate opt-in draft `20261024132001_dispatch_sweep_schedules_draft.sql` defines the persistent `pg_cron` jobs; applying the RPC migration alone does not activate them. The schedule draft has not been applied or runtime-verified. Expected sweep delay remains distinct from the 90-second stale threshold. Commit message: `feat: schedule dead-man sweep`.
- [ ] **4.5 Complete the rider cockpit.** Local UI shows active/at-risk assignment, destination, expiry, pickup deadline, online action guards, presence age, and a read-only human-verification state. It needs browser/RPC integration tests. Commit message: `feat: rider cockpit heartbeat UI`.
- [ ] **4.6 Animate claim return.** Use the specified 240 ms `power2.in` transform/opacity return animation; do not animate width or height. Commit message: `style: revocation return animation`.
- [ ] **4.7 Add atomic delivery.** Draft permits only the assigned rider, decrements demand once, writes delivery/audit state, and blocks demand reduction below other active reservations. Runtime, concurrency, and positive-demand-change recovery behavior remain untested. Commit message: `feat: add delivery RPC`.

## Milestone 5 — Mid-route rerouter

- [ ] **5.1 Implement `find_alternative_shelter()`.** Draft ranks compatible shelters with remaining unreserved demand by straight-line PostGIS distance from a fresh rider location and preserves a five-minute expiry buffer. It does not model road route or ETA; do not represent it as route-feasible. Commit message: `feat: rerouter RPC`.
- [ ] **5.2 Implement shelter-shock handling.** Draft serializes writes and handles a positive-to-zero demand transition inside the database; otherwise it marks in-transit cargo at risk. It does not yet handle every positive-demand/resource-loss/deactivation case. Commit message: `feat: shelter shock trigger`.
- [ ] **5.3 Render committed destinations.** The client consumes committed Realtime rows; it does not call the rerouter as a required follow-up or invent destination changes. Live verification pending. Commit message: `feat: client reroute handler`.
- [ ] **5.4 Animate reroute morph.** MotionPath curviness 0.45, `autoRotate`, duration 700 ms, `overwrite: 'auto'`; fade the old path and interrupt/replace an in-progress path when another committed reroute arrives. Commit message: `feat: animate reroute deflection`.
- [ ] **5.5 Add the persistent at-risk banner.** Show only while an `at_risk` sub-batch exists and give a clear human-intervention message. Commit message: `feat: at-risk fallback banner`.

## Milestone 6 — Expiry and dependency gate

- [ ] **6.1 Add the expiry sweep.** The RPC draft marks expired non-delivered children `spoiled`, records audit rows, and recomputes parent state; it also marks expired open parents with no child rows `fully_spoiled` with a batch-level audit. A once-per-minute `pg_cron` job is in the separate opt-in schedule draft; neither file has been applied or runtime-tested. Commit message: `feat: expiry sweep cron`.
- [ ] **6.2 Add `validate_dispatch()`.** Draft rechecks the assigned shelter, demand, resources, dependency, expiry, pickup deadline, and heartbeat immediately before pickup. Runtime tests pending. Commit message: `feat: dispatch validation RPC`.
- [ ] **6.3 Surface dependency failures.** The UI shows the server's inline reason; live role/action behavior remains untested. Commit message: `feat: dependency gate UI`.

## Milestone 7 — Judge failure-injection controls

- [ ] **7.1 Simulate a ghost rider.** In isolated demo data, claim a sub-batch, stop that rider's heartbeat, and observe automatic revocation/audit; never alter a production user's live work. Commit message: `feat: ghost injection`.
- [ ] **7.2 Fill a shelter mid-route.** Set a demo shelter's demand to zero only through an admin-checked test RPC and verify server-side reroute or `at_risk`. Commit message: `feat: mid-route fill injection`.
- [ ] **7.3 Trigger a dependency violation.** Make a demo destination incompatible and call the validator; verify pickup is blocked and the reason is visible. Commit message: `feat: dependency violation injection`.
- [ ] **7.4 Force a 180-unit split.** Create a test-only 180-unit water-dependent batch with 75 minutes of shelf life; verify each child is at most 40, compatible shelter allocations respect demand/resources, and any remainder is `at_risk`. Commit message: `feat: force-split injection`.
- [ ] **7.5 Add button press interaction.** Implement the specified 80 ms press-down effect using only the approved easing exception. Commit message: `style: button micro-interactions`.

**Blocker:** judge/failure-injection RPCs are intentionally omitted because the current shared project has no proven demo-row isolation. Add them only in an isolated project or after safe test-only row isolation is implemented.

## Milestone 8 — Motion and accessibility audit

- [ ] **8.1 Audit easing and size animation.** Search for `linear`, generic `ease`, `bounce`, and width/height animation; fix every violation except an explicitly approved exception. Commit message: `style: pass anti-slop motion audit`.
- [ ] **8.2 Verify staggered entrances.** Stagger sub-batches, shelters, and riders; avoid moving all important UI elements simultaneously. Commit message: `style: enforce stagger`.
- [ ] **8.3 Tie heartbeat pulse to real state.** Update pulse state/rate as actual heartbeat age and time-to-revoke change; do not present animation as proof of connectivity. Commit message: `style: heartbeat pulse state-driven`.
- [ ] **8.4 Respect `prefers-reduced-motion`.** Remove nonessential motion while preserving state information and every action. Commit message: `style: respect reduced motion`.
- [ ] **8.5 Verify reroute interruption and path.** Verify sequential route changes end at the latest server-selected shelter. Commit message: `test: verify reroute morph`.

## Milestone 9 — Low-connectivity and offline mode

- [ ] **9.1 Cache the static PWA shell.** Local code adds a versioned custom service worker, manifest, and SVG icon. It caches only the static shell and same-origin Vite assets, excludes user data/API responses, and falls back to the cached app shell after a short navigation timeout. Browser install/offline/update testing remains pending. Commit message: `feat: cache offline app shell`.
- [ ] **9.2 Show truthful connection and stale state.** Local code distinguishes browser online hint, successful data sync, Realtime channel status, and last sync; it shows text and accessible retry/status announcements. It does not treat an initial failure as an empty authoritative board. Browser testing pending. Commit message: `feat: show connectivity and stale state`.
- [ ] **9.3 Reduce network churn.** Dashboard reads are bounded, single-flight, coalesced, retried with bounded exponential backoff/jitter, and resumed on reconnect/visibility. Verify on throttled network. Commit message: `perf: reduce low-bandwidth sync traffic`.
- [ ] **9.4 Keep dispatch operations online-only.** Local code disables batch submission, claims, pickup, delivery, and heartbeat while offline/unverified; no missed mutation is automatically queued or replayed. Reconnect requires fresh data and a subscribed Realtime channel before actions enable. Browser testing pending. Commit message: `fix: require online state for dispatch actions`.
- [ ] **9.5 Decide on persistent operational-data caching.** No IndexedDB/localStorage snapshot is enabled. Until the user approves a policy, cache static files only and retain dashboard data in memory while the tab remains open. Commit message if later approved: `feat: add scoped offline snapshot`.
- [x] **9.6 Keep retry identity for uncertain online creates.** Donor create stores only the temporary request key and exact payload in session storage until the server confirms both create and split. This is not an offline batch queue/draft; submission still requires online state. Browser storage-failure behavior needs testing. Commit message: `fix: reuse idempotency key on retry`.

## Milestone 10 — Isolated demo accounts and fixtures

- [ ] **10.1 Confirm an isolated development/demo Supabase project.** Do not create demo identities or operational fixtures in the current production/shared project. Resolve project cost/approval before creating a new project or branch. Commit message: `docs: define isolated demo environment`.
- [ ] **10.2 Provision 4–5 role-specific Auth users.** Use Supabase Auth Dashboard/Admin API or a trusted local seed script, never direct SQL inserts into `auth.users`; elevated roles are assigned only by trusted admin tooling. Suggested five-account coverage is donor, two riders, shelter member, and trusted admin; use confirmed addresses and generated temporary passwords, with no credentials in browser code/Git. Commit message: `feat: add demo account provisioning`.
- [ ] **10.3 Seed only synthetic, resettable test fixtures.** Add shelter, resource, rider, and dispatch records only in the isolated demo project; associate shelter role with scoped `shelter_members`; tag demo batches/children `is_demo`; never mix fixtures with production. Commit message: `test: seed isolated dispatch fixtures`.
- [ ] **10.4 Verify account role boundaries.** Donor cannot claim, rider cannot edit shelter resources, shelter member is scoped to mapping, and only trusted admin can invoke test controls. Commit message: `test: verify demo role permissions`.

**Blocked:** no target staging project or test identities/roles were confirmed, and no accounts have been created.

## Milestone 11 — Vercel release and live verification

- [x] **11.1 Retain Vercel as the approved current host.** The deployed alias is `https://last-milex.vercel.app`; do not migrate to Firebase. This confirms only the host choice and existing baseline URL. Commit message: `deploy: retain Vercel hosting`.
- [ ] **11.2 Publish the integrated frontend.** Build and deploy only after source and database migrations are approved. A push to the production branch may trigger deployment. The local changes are not deployed. Commit message: `deploy: publish integrated frontend`.
- [ ] **11.3 Configure daily Supabase keep-alive only if required.** Confirm plan/project need and approve the behavior; do not mask dormancy or health issues with unnecessary pings. Commit message: `chore: Supabase keep-alive`.
- [ ] **11.4 Verify the live release.** Confirm password login, role-scoped reads, RPC permissions/transitions, Realtime, offline/stale UX, and the live URL against the authorized target. Commit message: `test: verify deployment`.

## Final deliverable checklist

- [ ] Live URL loads the requested integrated release. — **Not tested; no new deployment.**
- [ ] Supabase backend has reviewed schema/RLS plus triggers and coordination RPCs. — **Partial:** core schema/RLS applied; coordination migration drafted locally but unapplied and not runtime-tested.
- [ ] Splitter: 180-unit batch becomes compatible sub-batches of at most 40. — **Not tested.**
- [ ] Heartbeat: rider presence/active heartbeat cadence, 90-second stale handling, five-minute pickup timeout, and observed scheduler lag. — **Not tested; Cron jobs exist only in the draft.**
- [ ] Rerouter: positive-to-zero demand change triggers server-side reroute or `at_risk`, committed MotionPath update, and audit. — **Not tested; draft uses straight-line distance, not road ETA.**
- [ ] Admin failure-injection scenarios run only on isolated demo data. — **Not implemented; test RPCs omitted pending safe isolation.**
- [ ] Password sign-in requires no sign-in email; existing magic-link user can set a password without replacing the Auth identity. — **Local code implemented; not tested against live Auth.**
- [ ] Low-connectivity behavior shows last-sync state, cached shell, and never treats offline dispatch actions as committed. — **Local code implemented; browser/throttled-network test pending.**
- [ ] 4–5 demo accounts are role-scoped in an isolated environment with no service-role key or credentials in frontend/Git. — **Blocked pending user confirmation.**
- [ ] Motion/accessibility audit passes. — **Not tested.**
- [ ] Repository push and production deployment use the authorized GitHub/Vercel path and are separately confirmed. — **Not performed.**
- [x] Implementation plan and milestone task list are present and status-accurate for the current local work.
