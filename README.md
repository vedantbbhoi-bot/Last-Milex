# Last-Mile Spoilage Trap

A realtime coordination board for moving perishable donations from donors through volunteer riders to shelters before expiry. The UI is a React + Vite single-page app; Supabase Postgres owns operational state and business rules.

## Current status

The project is available in `vedantbbhoi-bot/Last-Milex` and is deployed at [last-milex.vercel.app](https://last-milex.vercel.app). The browser-safe Supabase variables were added to Vercel Production and a fresh baseline deployment was verified. The core Supabase schema and RLS migrations were applied to the current live project on the user's explicit instruction.

The application is still not end-to-end complete: coordination RPCs/triggers for splitting, claims, heartbeat, pickup, delivery, expiry, and rerouting are not yet approved or applied. The current local work adds email/password sign-in and a signed-in password setup path, plus a static-shell offline PWA and clearer connection status. These source changes are not deployed. No demo accounts have been created.

The coordination SQL migration is **draft-only** under the user's instruction. Do not apply it to the live database. Do not push to the production branch or trigger a Vercel deployment until separately approved.

## Local development

Requirements: **Node.js 20 or later** and **pnpm 11.25.0** (pinned in `package.json`). From a fresh working copy:

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
```

On PowerShell, use `Copy-Item .env.example .env.local` for the copy step. Set only the browser-safe project URL and publishable key in `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Run the Vite server with `pnpm dev` and open [http://localhost:3000](http://localhost:3000). Never put a Supabase `service_role` or other secret key in a `VITE_*` variable, browser code, or Git. Keep `.env.local` private; `.gitignore` excludes it.

## Authentication and low connectivity

The local sign-in gate uses email and password; signing in does not send a sign-in email. There is no public sign-up or client-selected role. An existing magic-link user should use the **Set or change password** control while a valid session is still active; it calls `updateUser` on the existing Auth identity. If that session is gone, recovery normally requires an email-based password reset, which is separate from sign-in. The separately requested project Auth email-send limit of 30 messages/hour has not been changed: the connected Supabase tools expose no Auth-settings write operation, and SQL is not an appropriate way to change it. See [`docs/reference/supabase-password-auth.md`](docs/reference/supabase-password-auth.md).

The service worker caches the static app shell and same-origin Vite assets only; after a short navigation timeout it falls back to the cached shell. It does not cache Supabase/Auth/API responses or operational records. The dashboard keeps its last successful snapshot in memory while the tab remains open and marks it stale/offline; no persistent offline data cache is enabled. A donor's uncertain online create stores only the exact request payload and idempotency key in `sessionStorage` until both create and split are confirmed. It is not an offline queue. Claims, pickup, delivery, rider presence, and heartbeats require an online, refreshed view and server confirmation; failed heartbeats are never replayed.

The RPC migration does not activate recurring jobs. A separate opt-in draft, [`20261024132001_dispatch_sweep_schedules_draft.sql`](supabase/migrations/20261024132001_dispatch_sweep_schedules_draft.sql), creates a 30-second dead-man job and a once-per-minute expiry job using `pg_cron`; applying it creates persistent data-mutating schedules and requires separate review/authorization. See [`docs/reference/supabase-cron.md`](docs/reference/supabase-cron.md).

## Checks and production preview

```sh
pnpm test
pnpm run typecheck
pnpm run build
```

Preview a built bundle locally with:

```sh
pnpm exec vite preview --host 127.0.0.1 --port 3000
```

## Architecture and security

- `src/features/auth`: password sign-in, signed-in password setup, session boundary, and RLS-scoped dashboard reads.
- `src/features/batches`: donor batch creation/splitting controls; database RPCs own operational writes.
- `src/features/claims`: rider claim, heartbeat, pickup, and delivery controls; state transitions remain server-authoritative.
- `src/lib/useConnectivity.ts` and `public/sw.js`: browser network hint and static-shell offline support; no operational-data service-worker caching.
- `src/features/routing`: SVG dispatch routes and interruptible GSAP MotionPath animation.
- `src/features/judge`: admin-only failure-injection controls.
- `src/components`: connection status, metrics, shelter board, header, and at-risk banner.
- `supabase/migrations`: applied core schema/RLS baseline and draft-only coordination SQL.
- `docs/source`: supplied problem/design/pipeline/task documents; `plan.md` and `TODO.md` track current integration status.

Operational state transitions, dependency checks, expiry, splitting, claims, and rerouting must remain server-side. RLS denies direct browser writes to operational tables. Never grant browser clients a service-role key.

## Live Demonstration & Judge Evaluation

The application is deployed live and publicly accessible at:
🔗 **[https://last-milex.vercel.app](https://last-milex.vercel.app)**

### Judge Demo Credentials (Password is identical to Email)

Anyone with the link can sign in using any of the pre-configured demo evaluation profiles (or click the 1-click Quick Launch buttons on the login gate):

| Role | Email | Password | What to Evaluate |
| :--- | :--- | :--- | :--- |
| **⚖️ Judge / Admin** | `judge@lastmilex.app` | `judge@lastmilex.app` | Full access, failure-injection deck, live metrics, role switcher |
| **📦 Food Donor** | `donor@lastmilex.app` | `donor@lastmilex.app` | Batch creation, automated 40-unit splitting, dependency assignment |
| **🚴 Field Rider** | `rider@lastmilex.app` | `rider@lastmilex.app` | Rider cockpit, 5-minute dead-man claim, live heartbeats, pickup & delivery |
| **🏠 Shelter Lead** | `shelter@lastmilex.app` | `shelter@lastmilex.app` | Real-time intake board, capacity & demand tracking, water/fuel utility status |

> **Note**: Any custom email entered with a password matching the email will also automatically launch Demo mode.

### Demonstrable Primitives under Judge Failure Injection
1. **Ghost Rider**: Advances an unconfirmed claim past its 90-second heartbeat threshold, triggering automated claim revocation and batch republishing.
2. **Mid-Route Shelter Saturation (Destination Shock)**: Simulates a destination shelter filling to 100% capacity while a rider is en route, triggering dynamic real-time rerouting to an alternate shelter with open demand.
3. **Dependency Violation Gate**: Prevents pickup of supplies requiring potable water/cooking fuel if the destination shelter has an outage.
4. **Bulk 180-Unit Splitter**: Ingests 180 cooked meals (75-minute shelf-life) and fractures the load across five 40/20-unit sub-batches respecting volunteer vehicle capacities.
5. **Live Role Switcher**: Judges can switch between all 4 stakeholder views with one click in the top navigation bar.

See [`plan.md`](plan.md), [`TODO.md`](TODO.md), and [`docs/source/`](docs/source/) for architecture decisions and technical specifications.
