# Last-Mile Spoilage Trap — Milestone Task List

**Status:** In progress. The frontend scaffold has passed six utility tests, TypeScript checking, and a production build. Core schema and RLS SQL are local drafts only; no Supabase migration has been applied. The user has directed a push to the specified GitHub repository; repository push evidence will be recorded after verification.

## Milestone 0 — Supabase project and scaffold

- [x] **0.1 Provision/configure Supabase.** Use the selected `Last-Milex` project; configure its project URL and publishable key for the client. Keep any service-role key out of browser code and Git. `.env.local` contains only the browser-safe project values and is ignored; `.env.example` contains placeholders. Commit message: `chore: add Supabase project config`.
- [x] **0.2 Scaffold the client.** Build a React + Vite SPA with Tailwind, GSAP + `MotionPathPlugin`, and Supabase JS. The React choice is proposed because this product is a static-hostable realtime SPA with no SSR requirement. `pnpm test` passes 6/6; `pnpm run typecheck` and `pnpm run build` pass. Commit message: `chore: scaffold frontend`.
- [ ] **0.3 Connect repository workflow.** Use `https://github.com/vedantbbhoi-bot/Last-Milex`. The Antigravity GitHub MCP is not exposed in this session; the user has now authorized use of the authenticated GitHub integration via `gh` API. Do not use the local `git` executable or a deployment dashboard. This differs from the original MCP-only clause and will be reported as such. Commit message: `chore: initialize repository`.

## Milestone 1 — Database schema, RLS, and triggers

- [x] **1.1 Create `001_schema.sql`.** Define `profiles`, `riders`, `shelters`, `batches`, `sub_batches`, and `claim_audit`; enable required PostGIS/pg_cron capabilities; add rider location and timestamp; add shelter-to-profile membership; indexes and constraints; preserve per-sub-batch expiry; and ensure each sub-batch quantity is at most 40. Draft is `supabase/migrations/20261023160000_core_schema.sql`; it is not yet applied. Commit message: `feat: add core schema with sub_batches`.
- [ ] **1.2 Present and then apply RLS.** Show the policy table and SQL definitions for approval before applying. Enforce least privilege: donors cannot claim; riders cannot edit shelter demand; users cannot change their roles; only assigned shelter members can manage that shelter; coordination state changes use ownership-checked RPCs; audit inserts come from trusted functions. Commit message: `feat: add row-level security`.
- [ ] **1.3 Add secure triggers.** Add dependency enforcement and the server-side shelter-shock rerouter. On a positive-to-zero demand transition, attempt rerouting in the database; set `at_risk` only when no qualifying alternative exists; write a `rerouted` audit row either way. Commit message: `feat: add coordination triggers`.
- [ ] **1.4 Apply migrations only to the authorized development/test Supabase project first.** Do not run destructive or fixture-writing tests against shared production data. Commit message: `deploy: apply schema migrations`.

## Milestone 2 — Dynamic batch splitter

- [ ] **2.1 Implement atomic `split_batch(p_batch_id)`.** Lock the batch and shelters, coalesce no-idle-rider capacity to 40, cap chunks at 40, subtract existing active allocations from shelter demand, skip dependency-incompatible shelters, preserve each child expiry, prevent concurrent over-allocation, and create leftover quantity as unassigned `at_risk` chunks (each no larger than 40). Commit message: `feat: add dynamic batch splitter RPC`.
- [ ] **2.2 Build the donor create-and-split flow.** Create a parent batch, call the RPC, and render the committed parent/child state. Commit message: `feat: donor split flow`.
- [ ] **2.3 Animate sub-batch entry.** Use a 40 ms stagger and 6 px Y-offset, with transform/opacity only and the approved non-bounce motion curve. Commit message: `style: sub-batch stagger entrance`.

## Milestone 3 — Auth and realtime panels

- [ ] **3.1 Add Supabase Auth magic links and role gating.** Display role-specific controls for donor, rider, shelter, and admin; never trust a client-supplied role. Commit message: `feat: add auth and role gating`.
- [ ] **3.2 Subscribe to `batches`, `sub_batches`, `riders`, and `shelters`.** Use Realtime events to refresh rendered state; server rows remain authoritative. Commit message: `feat: add realtime subscriptions`.
- [ ] **3.3 Build the shelter board.** Show remaining demand, capacity, water/fuel resource badges, and accessible status labels. Commit message: `feat: shelter board`.
- [ ] **3.4 Build animated live metrics.** Show percent spoiled, ghost revokes, split sub-batches, deliveries, and reroutes. Counters use the approved non-generic motion curve. Commit message: `feat: animated metrics bar`.

## Milestone 4 — Claim, heartbeat, and dead-man sweep

- [ ] **4.1 Add atomic claim and pickup RPCs.** Claim sets `claimed_at`, `confirmation_deadline = NOW() + 5 minutes`, and `heartbeat_at = NOW()`; pickup confirmation invokes `validate_dispatch()` before state change. Commit message: `feat: add claim RPC with deadlines`.
- [ ] **4.2 Send rider heartbeats every 60 seconds.** Call `heartbeat` while the rider holds a claim, and stop on release/revoke/delivery. Commit message: `feat: rider heartbeat sender`.
- [ ] **4.3 Implement idempotent `dead_man_sweep()`.** Detect an unconfirmed claim past its 5-minute deadline or heartbeat stale beyond 90 seconds; clear stale rider, claim, deadline, and heartbeat fields; preserve or release shelter reservation according to approved state rules; insert a `dead_man_revoked` audit row for every revoke. Commit message: `feat: dead-man sweep RPC`.
- [ ] **4.4 Schedule the sweep every 30 seconds.** Use Supabase `pg_cron` interval syntax, with the approved backup scheduler if available; measure and report scheduler latency separately from the 90-second stale threshold. Commit message: `feat: schedule dead-man sweep`.
- [ ] **4.5 Build the rider cockpit.** Show active claim, pickup action, remaining expiry, and heartbeat pulse color: green under 30 s, amber at 30–60 s, red over 60 s. Pulse rate reflects live time remaining, not decoration. Commit message: `feat: rider cockpit heartbeat UI`.
- [ ] **4.6 Animate claim return.** Use the specified 240 ms `power2.in` transform/opacity return animation; do not animate width or height. Commit message: `style: revocation return animation`.

## Milestone 5 — Mid-route rerouter

- [ ] **5.1 Implement `find_alternative_shelter()`.** Use rider location, PostGIS distance, positive remaining demand, dependency compatibility, and a feasible ETA before expiry with the 300-second safety buffer. Commit message: `feat: rerouter RPC`.
- [ ] **5.2 Implement the `shelter_shock` trigger path.** On demand reaching zero, reroute in the server transaction; mark `at_risk` only when no alternative qualifies; write `claim_audit.event = 'rerouted'` in either case. Commit message: `feat: shelter shock trigger`.
- [ ] **5.3 Render the committed destination change.** Do not require a rider app callback to perform rerouting. Realtime updates the map after the server transaction. Commit message: `feat: client reroute handler`.
- [ ] **5.4 Animate reroute morph.** MotionPath curviness 0.45, `autoRotate`, duration 700 ms, `overwrite: 'auto'`; fade the old path; interrupt/replace an in-progress path if another reroute arrives. Commit message: `feat: animate reroute deflection`.
- [ ] **5.5 Add the persistent at-risk banner.** Show only while an at-risk sub-batch exists and provide a clear human intervention message. Commit message: `feat: at-risk fallback banner`.

## Milestone 6 — Expiry and dependency gate

- [ ] **6.1 Add the one-minute expiry sweep.** Mark expired, non-delivered children spoiled; write `spoiled` audit rows; recompute parent status as `partially_spoiled` or `fully_spoiled`. Commit message: `feat: expiry sweep cron`.
- [ ] **6.2 Add `validate_dispatch()`.** Re-check that the assigned shelter still has required water and/or fuel before pickup is confirmed; return a clear, safe rejection when the dependency fails. Commit message: `feat: dispatch validation RPC`.
- [ ] **6.3 Surface dependency failure in the UI.** Disable/deny pickup based on the RPC response and show the inline reason; the database remains the enforcement layer. Commit message: `feat: dependency gate UI`.

## Milestone 7 — Judge failure-injection controls

- [ ] **7.1 Simulate a ghost rider.** Claim a sub-batch, stop that test rider’s heartbeat, and observe automatic revocation and audit. Commit message: `feat: ghost injection`.
- [ ] **7.2 Fill a shelter mid-route.** Set the test shelter demand to zero through an authorized test RPC and verify that the database trigger reroutes or marks at risk. Commit message: `feat: mid-route fill injection`.
- [ ] **7.3 Trigger a dependency violation.** Make a test destination incompatible and call `validate_dispatch`; verify pickup is blocked and the reason is visible. Commit message: `feat: dependency violation injection`.
- [ ] **7.4 Force a 180-unit split.** Create a 180-unit, water-dependent test batch with 75 minutes of shelf-life and call the splitter; verify each child is at most 40, shelter allocations respect demand and resources, and any remainder is at risk. Commit message: `feat: force-split injection`.
- [ ] **7.5 Add button press interaction.** Implement the specified 80 ms press-down effect using only the easing exception approved by the user. Commit message: `style: button micro-interactions`.

## Milestone 8 — Motion audit and anti-slop

- [ ] **8.1 Audit easing and size animation.** Search for `linear`, generic `ease`, `bounce`, and width/height animation; fix every violation except an explicitly approved exception. Commit message: `style: pass anti-slop motion audit`.
- [ ] **8.2 Verify staggered entrances.** Stagger sub-batches, shelters, and riders; avoid moving all important UI elements simultaneously. Commit message: `style: enforce stagger`.
- [ ] **8.3 Tie heartbeat pulse to state.** Update pulse state/rate as the actual heartbeat age and time-to-revoke change. Commit message: `style: heartbeat pulse state-driven`.
- [ ] **8.4 Respect `prefers-reduced-motion`.** Use a real fallback that removes nonessential motion while preserving state information and all actions. Commit message: `style: respect reduced motion`.
- [ ] **8.5 Verify reroute interruption and path state.** Inspect the map behavior for sequential reroutes and ensure the rendered path ends at the server-selected shelter. Commit message: `test: verify reroute morph`.

## Milestone 9 — Hosting and delivery

- [ ] **9.1 Provision the approved host.** Firebase Hosting is proposed for the static React SPA; use the user-approved provider workflow only. This is blocked on deployment credentials/provider access and the Antigravity vs Manus decision. Commit message: `deploy: provision hosting`.
- [ ] **9.2 Build and publish.** Configure the production build, SPA route fallback, environment values, and hosting rules without exposing secrets. Commit message: `deploy: publish frontend`.
- [ ] **9.3 Configure the requested daily Supabase keep-alive** only if the chosen Supabase plan/project requires it and the user approves the operational behavior; do not add an unnecessary ping that masks a dormant or unhealthy service. Commit message: `chore: Supabase keep-alive`.
- [ ] **9.4 Verify the live URL and backend response.** Test authenticated loading, database/RLS behavior, RPC behavior, and Realtime against the authorized target; capture evidence only when the platform supports it. Commit message: `test: verify deployment`.

## Final deliverable checklist (from `Task.txt`)

- [ ] Live URL loads authenticated SPA.
- [ ] Supabase backend live with RLS, triggers, and three RPC primitives.
- [ ] Splitter: 180-unit batch fractures into sub-batches of at most 40 bound to compatible shelters.
- [ ] Heartbeat: rider sends 60-second heartbeats; dead-man sweep automatically revokes after the 90-second silence threshold or at the 5-minute confirmation deadline. The observed execution lag must be reported.
- [ ] Rerouter: shelter demand zero-flip triggers server-side reroute or `at_risk`, MotionPath morph, and audit row.
- [ ] All four failure-injection buttons functional.
- [ ] No linear/generic ease/bounce transitions, except any user-approved exception.
- [ ] Every entrance staggers; no simultaneous motion.
- [ ] Heartbeat pulse is state-driven.
- [ ] `prefers-reduced-motion` fallback works.
- [ ] Every commit goes through the approved Antigravity GitHub MCP with a clear message.
- [ ] Review artifacts (task list, implementation plan, walkthrough/evidence when created) are preserved.

Items remain unchecked until there is implementation and test evidence.
