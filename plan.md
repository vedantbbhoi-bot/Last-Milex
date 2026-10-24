# Last-Mile Spoilage Trap — Implementation Plan

**Status:** Frontend scaffold implemented; six utility tests, TypeScript checking, and the production build pass. Core schema and RLS migrations are drafted but not applied pending the user's review. The user has now explicitly directed a GitHub push; no remote commits have been made yet. No deployment has been made. This plan is based on the supplied prompt, source documents, schema excerpt, and four starter SQL files.

## Stack choice

I recommend **React + Vite** rather than Next.js. This is an authenticated, realtime SPA with the business rules in Supabase Postgres; it does not need server-side rendering, and a static React build maps directly to Firebase Hosting.

The planned client uses TypeScript, Tailwind, GSAP with `MotionPathPlugin`, and Supabase JS. Supabase is the source of truth for Postgres, PostGIS, Auth magic links, RLS, Realtime, RPCs, triggers, and `pg_cron`. The browser calls narrow RPCs and subscribes to changes; it never decides splits, claim validity, dependency eligibility, expiry, or destination reroutes.

## Material workflow constraint

The requested platform is Google Antigravity, but this task is running in Manus Sandbox. Supabase MCP is connected. A GitHub MCP tool is not exposed in this session. After disclosure of that limitation, the user explicitly directed a push to the supplied GitHub repository; commits will use the authenticated GitHub API via `gh`, not the local `git` executable or a deployment dashboard. This is a recorded deviation from the source requirement that commits be made through Antigravity’s GitHub MCP.

The selected Supabase project is `Last-Milex` (`nqyakgykbwvxfzdjfylf`); it is healthy and had no public tables or migrations when inspected. PostGIS and `pg_cron` are available but not yet installed; the proposed core migration enables them. The target GitHub repository is `vedantbbhoi-bot/Last-Milex` on `main` and was empty apart from its README. Browser configuration uses the project's publishable key, which is designed to be public and remains subject to RLS. The service-role key will never be used in browser code.

## Architecture and data flow

1. A donor authenticates with a Supabase magic link, creates a parent batch, and calls a donor-authorized `split_batch` RPC. One database transaction creates shelter-bound sub-batches and any unsatisfied remainder. Realtime informs the UI after commit.
2. A rider claims an eligible sub-batch through an atomic claim RPC. The database sets `claimed_at`, a five-minute `confirmation_deadline`, and `heartbeat_at`. The browser sends the requested 60-second heartbeat; the database remains authoritative.
3. `dead_man_sweep()` runs every 30 seconds and revokes overdue claims. Supabase Cron supports a sub-minute `pg_cron` interval such as `30 seconds` [Supabase Cron documentation](https://supabase.com/docs/guides/cron) [pg_cron schedule documentation](https://access.crunchydata.com/documentation/pg_cron/latest/). The 90-second stale threshold is the eligibility threshold; a periodic sweep can execute up to one sweep interval later (about 90–120 seconds after the last heartbeat). The implementation keeps the source defaults and reports scheduler delay separately rather than promising a strict 90-second wall-clock bound.
4. `confirm_pickup` calls `validate_dispatch` in the same database transaction before changing the state. The validator re-checks the destination’s current water/fuel resources. Unauthorized direct table writes cannot bypass it.
5. A shelter-demand transition from positive to zero invokes server-side rerouting from the database trigger. The server selects the closest still-demanding, dependency-compatible shelter that passes the shelf-life rule; it updates the destination and writes a `rerouted` audit entry. If none qualifies, it sets `at_risk` and writes the same event with a no-fallback reason. The frontend only animates the committed destination change.
6. An expiry sweep marks expired sub-batches spoiled, writes audit rows, and updates each parent batch to `partially_spoiled` or `fully_spoiled` as appropriate.
7. Shelter routing uses PostGIS distance and the source SQL’s speed assumption of 8.33 m/s with a 300-second safety buffer. This is a deterministic straight-line ETA proxy, not a traffic-aware road-routing service; use of a road-routing provider would require a separate approved dependency.

## Data model changes and database safeguards

The supplied schema is a starting point, not a migration-ready schema. The implementation should add or adjust:

- `riders.location GEOGRAPHY(POINT,4326)` and a location-update timestamp, because the rerouter reads rider location but the supplied `riders` table has no location column. Location writes go through an owner-checked RPC.
- A `shelter_members` mapping between shelter-role profiles and shelters. The supplied schema has a `shelter` profile role but no way to determine which shelter that user may manage.
- Appropriate indexes for batch status, expiry, claims, shelter allocations, geography lookups, audit history, and foreign keys; PostGIS/pg_cron extension checks; explicit `NOT NULL`/status constraints; and safe defaults for missing JSON resource values.
- Narrow, owner-checked RPCs for batch creation, splitting, claim, heartbeat, pickup confirmation, location update, delivery, demand/resource changes, and judge failure injection. `SECURITY DEFINER` functions use a fixed `search_path`, explicit grants, argument validation, and authorization checks.

### Split and reservation rules

`split_batch` locks the parent and eligible shelter rows in a deterministic order, then computes effective open demand as shelter demand minus quantities already reserved by active sub-batches. It uses the minimum idle-rider vehicle capacity, defaults to 40 when there are no idle riders, and caps each chunk at 40. Each shelter-bound chunk is also bounded by its available demand and remaining parent quantity, and the dependency must match. No concurrent split may reserve the same demand twice.

Every remainder is represented by one or more unassigned `at_risk` chunks no larger than 40, rather than silently creating an unassigned pool item. Its expiry stays tied to the parent. The status and allocation lifecycle must distinguish active reservations from available demand; on delivery, demand is reduced exactly once. Revoking a pre-pickup claim clears the rider, claim time, deadline, and heartbeat while retaining the shelter reservation if it is still valid. After pickup confirmation, stale cargo is not returned to the claimable pool: clear the stale assignment, mark the cargo `at_risk`, and require human verification to avoid duplicate assignment.

### Claim, audit, and expiry rules

The 5-minute pickup deadline, 60-second heartbeat, 90-second stale threshold, and 30-second sweep stay as the defaults. All revocations clear stale rider/heartbeat fields and write `dead_man_revoked`. The sweep must be idempotent and safe under overlapping runs. Expiry excludes delivered/spoiled rows, writes `spoiled` audit events, and recomputes parent status in the same transaction. A 90-second stale threshold checked every 30 seconds may take about 90–120 seconds from the last heartbeat to actual revocation; the interface and documentation must not promise a strict 90-second wall-clock bound.

### Server-side shelter shock

A database trigger handles the full shock path without relying on the rider’s app: find candidate, apply dependency/demand/expiry checks, change destination or mark `at_risk`, and insert a `rerouted` audit event either way. Reroute events include old and new shelter IDs, ETA, reason, and timestamp. Concurrent demand changes serialize through shelter locks. The client receives committed state through Realtime and uses an interruptible MotionPath timeline; it never calls the rerouter as a required follow-up.

## Draft RLS policy table (review before any policy is applied)

RLS means **row-level security**: Postgres checks which rows each signed-in user may read or change. This table is a proposal for review; no policies have been applied. Database functions remain the only write path for coordination state.

| Data | Donor | Rider | Shelter member | Admin / demo judge |
|---|---|---|---|---|
| `profiles` | Read own profile; edit own display fields only | Same | Same | Read all; manage roles through a protected admin operation |
| `batches` | Insert/read own batches; no direct status/quantity edits after split | Read batches needed for eligible pool and own claims | Read batches routed to their shelter | Read/manage all through controlled operations |
| `sub_batches` | Read children of own batches; no direct claim/state writes | Read eligible pool and rows assigned to self; claim/heartbeat/confirm/deliver only through checked RPCs | Read rows routed to a mapped shelter; no rider/claim edits | Read all; failure injection only through checked RPCs |
| `riders` | Read only rider details needed for own donation flow | Read/edit own approved fields; location/status via owner-checked RPC | Read riders approaching their mapped shelter | Read all; no direct security-sensitive writes |
| `shelters` | Read operational board | Read operational board; cannot change demand/resources | Read all operational cards; update demand/resources only for mapped shelter via RPC | Read/manage all through checked operations |
| `shelter_members` | No access | No access | Read own membership only | Manage membership through protected admin operation |
| `claim_audit` | Read events for own batches | Read own claim/route events | Read events related to mapped shelters | Read all; inserts only from trusted functions/triggers |

Policy details to retain: no public/anonymous access to operational records; no donor claim permission; no rider ability to edit shelter demand; no user ability to self-promote to admin or change another user’s role; direct inserts/updates to state-transition tables are denied unless explicitly safe; RPC `EXECUTE` grants are role-limited and functions verify ownership. The actual SQL policy definitions and grants will be shown for approval before application.

## UI and interaction design

The dashboard follows the supplied structure: live metrics across the top; donor queue with nested batch/sub-batch chips on the left; SVG flow view in the center; shelter board on the right; rider cockpit with active claim, heartbeat state, pickup control, and expiry; persistent at-risk banner; and four judge controls at the bottom. The controls are proposed as **admin-only** because the defined roles do not include `judge`.

### Visual direction (proposed)

Three deliberately distinct directions were considered: **industrial field notebook** (0.07), **civic transit wayfinding** (0.05), and **quiet operations ledger** (0.03). I propose **industrial field notebook**: a field-operations control surface with clear hierarchy and high-contrast status signals.

- **Core principles:** operational clarity first; urgency through restrained semantic color; dense information with calm spacing; animation explains state rather than decorating it.
- **Color philosophy:** warm paper-like neutral surfaces suggest a working dispatch board; charcoal/navy text keeps dense data readable; a distinctive signal-coral marks spoilage and intervention; green/amber/red convey live claim health.
- **Layout paradigm:** asymmetric three-zone dispatch board with independent donor, map/flow, and shelter regions; the rider cockpit and control deck remain anchored and distinct rather than becoming generic centered cards.
- **Signature elements:** a split-box/pulse brand mark; thin route curves with directional arrows; nested sub-batch chips with dependency glyphs and expiry rings.
- **Interaction philosophy:** every control has an explicit state and consequence; judge actions require confirmation in-app when destructive; live updates remain visible but never silently change the server’s state.
- **Animation:** transform/opacity only; stagger lists (sub-batch chips at 40 ms and 6 px Y offset); no linear, generic `ease`, or bounce easing; no width/height animation. MotionPath reroute uses curviness 0.45, autoRotate, 700 ms, `overwrite: 'auto'`, with the old path fading. Revocation return uses the source’s 240 ms `power2.in`. Heartbeat pulse reflects elapsed time: green under 30 s, amber from 30–60 s, red above 60 s. `prefers-reduced-motion` disables path morphs and nonessential movement while preserving state changes.
- **Typography:** Manrope for controls and labels, paired with DM Mono for timers and quantities; hierarchy is compact headline, clear section labels, and restrained numeric emphasis.
- **Brand essence:** “A live dispatch board that gets perishable help to the right door before the clock runs out.” Personality: precise, humane, decisive.
- **Brand voice:** short, plain operational messages. Examples: “12 meals need a new destination.” “Pickup window closes in 01:42.”
- **Wordmark/logo:** custom split-crate outline crossed by a short heartbeat/route line, with a compact typographic wordmark rather than an off-the-shelf icon.
- **Signature brand color:** signal coral, used sparingly for at-risk actions and spoilage rather than as a general decoration.

The 80 ms button press uses the named `power2.out` curve rather than generic `ease-out`, satisfying the stricter no-generic-ease rule while preserving a quick ease-out feel. Capacity bars use transformed fills or static value updates, never animated width.

## Planned project structure

```text
src/
  app/                 auth/session boundary, role gates, application shell
  components/           metrics, donor queue, flow map, shelter board, rider cockpit, banners, controls
  features/
    auth/               magic-link sign-in and profile role display
    batches/            donor create flow and sub-batch presentation
    claims/             claim/pickup/heartbeat UI that calls RPCs
    routing/            SVG paths and interruptible MotionPath animation
    shelters/           shelter demand/resources board
    judge/              admin-only failure injection controls
  lib/
    supabase/           typed browser client and realtime channel lifecycle
    motion/             GSAP contexts, motion preferences, shared timelines
    types/              database-generated types and domain state
  styles/               Tailwind tokens, responsive layout, reduced-motion styles
supabase/
  migrations/           ordered schema, RLS, primitive, trigger, and schedule migrations
  tests/                isolated SQL/pgTAP tests and fixture setup
public/
  manus-routes.json     route manifest for the preview platform
```

The exact folder layout can adapt to the scaffold, but SQL stays versioned as ordered migrations and all business logic remains server-side.

## Milestone sequence

The build order follows `Task.txt` (M0–M9). Before M1 is applied, the user must review the role matrix and the exact SQL policy file; approval is still pending. The user has explicitly directed the repository push, so the authenticated `gh` API is being used as the available path; the local `git` executable is not used. Native hosting integration remains unavailable, so deployment is not attempted. Each milestone report will state what changed, why it differs from the starter files, and how to test it. No claim of “production-ready” or “passes” will be made without evidence from the target environment.

## Source issues already identified for correction

- Splitter SQL can pass `NULL` capacity when no rider is idle, permits concurrent over-allocation, and creates a remainder without marking it at risk.
- Splitter is not idempotent under all failure/retry paths and assumes resource JSON keys exist and cast cleanly.
- `sub_batches.quantity <= 40` is violated by an unbounded leftover insert.
- A shelter role is not mapped to a shelter in the supplied schema; RLS cannot safely scope shelter managers without a membership relation.
- Rerouter SQL reads nonexistent `riders.location`; ETA is a straight-line proxy rather than road travel time.
- Starter shelter-shock SQL only marks rows at risk and relies on the client for rerouting; it also lacks an audit row either way.
- Starter heartbeat sweep clears some fields but does not handle the in-transit risk distinction; it does not consistently account for already-bound shelter demand.
- Expiry SQL does not audit events or update parent batch status.
- `validate_dispatch()` is absent; an RPC and database-side validation must enforce dependency checks at pickup.
- Role constraints and audit event constraints need explicit grants/policies and safe definer-function settings.
- The UI describes “admin/judge” controls, but the role enum contains no `judge`; proposed resolution is admin-only demo controls.

## Execution decisions and defaults

1. Keep the stated defaults: 60-second heartbeats, a 90-second stale threshold, a 5-minute pickup-confirmation deadline, and a 30-second sweep. The actual revoke can occur up to about 30 seconds after the stale threshold.
2. Before pickup, a timed-out claim returns to the pool and clears stale assignment/heartbeat fields while preserving any valid shelter reservation. After pickup confirmation/in transit, the cargo is not made claimable by another rider; clear the stale assignment, mark it `at_risk`, and require human verification.
3. Resolve the motion conflict in favor of the stricter prompt: implement the 80 ms button press with a named curve such as `power2.out`, not generic `ease-out`; retain the specified 240 ms `power2.in` return and 700 ms interruptible MotionPath morph.
4. Add `shelter_members`; make judge controls admin-only because `judge` is not a schema role; use PostGIS straight-line ETA at 8.33 m/s with the existing 300-second safety buffer; treat current demand as unsatisfied need and account for active reservations, decrementing demand exactly once upon delivery.
