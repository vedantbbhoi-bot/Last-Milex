# Last-Mile Spoilage Trap

A realtime coordination board for moving perishable donations from donors through volunteer riders to shelters before expiry. The UI is a React + Vite single-page app; Supabase Postgres is intended to own operational state and business rules.

## Current status

The frontend scaffold is in the Manus project workspace at `/home/ubuntu/lastmilex`. It has **not** been pushed to `https://github.com/vedantbbhoi-bot/Last-Milex`: the connected GitHub API returned `403 Resource not accessible by integration`, and the remote `main` branch was verified unchanged. The repository currently cannot be used to clone this implementation.

The local workspace includes draft core-schema and RLS migrations, but they have **not** been applied to Supabase; the RLS policy review is still pending. Later database RPCs and triggers are also needed before donor, rider, shelter, and admin flows work end to end. No deployment has been created.

## Local development

Requirements: **Node.js 20 or later** and **pnpm 11.25.0** (pinned in `package.json`). First obtain/copy the project source into a local folder. Then run:

```sh
cd Last-Milex
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
```

On PowerShell, use `Copy-Item .env.example .env.local` for the copy step. Edit `.env.local` and set the **browser-safe** Supabase project URL and publishable key:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Start Vite:

```sh
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The development server listens on port 3000. Never put a Supabase `service_role` or other secret key in `VITE_*` variables, browser code, or Git. Keep `.env.local` private; `.gitignore` excludes it.

If you use magic-link sign-in, add `http://localhost:3000` to the Supabase Auth URL/redirect allow-list. Without the environment values the app cannot connect to Supabase. Even with them, backend-dependent flows remain incomplete until the approved schema, RLS, RPC, and trigger migrations are applied and Auth is configured.

## Checks and production preview

```sh
pnpm test
pnpm run typecheck
pnpm run build
```

The current utility test suite has 6 tests. TypeScript checking and the production build have passed in the project workspace. To preview the built output locally, stop the dev server, then run:

```sh
pnpm exec vite preview --host 127.0.0.1 --port 3000
```

## Architecture

- `src/features/auth`: magic-link session boundary and RLS-scoped dashboard queries.
- `src/features/batches`: donor batch creation and sub-batch rendering; coordination mutations call RPCs.
- `src/features/claims`: rider claim, pickup, delivery, and heartbeat actions.
- `src/features/routing`: SVG dispatch routes and interruptible GSAP MotionPath animation.
- `src/features/judge`: admin-only failure-injection controls.
- `src/components`: live metrics, shelter board, header, and at-risk banner.
- `supabase/migrations`: ordered schema and RLS drafts; future RPC/trigger migrations belong here.
- `docs/source`: the supplied problem, design, pipeline, task, stack, and starter SQL documents.

Database state transitions, dependency checks, expiry, splitting, claims, and rerouting must remain server-side. Do not grant the browser a service-role key or direct writes to operational state tables.

## Database drafts

The local draft migrations are `20261023160000_core_schema.sql` and `20261023160001_rls_policies.sql`. They target PostgreSQL and enable PostGIS and pg_cron. Review the RLS policy matrix in `plan.md` and the policy migration. **Do not apply these migrations until the RLS review is approved.** Local SQL files are not evidence that the remote Supabase project has changed.

See [`plan.md`](plan.md), [`TODO.md`](TODO.md), and [`docs/source/`](docs/source/) for the implementation plan, milestone acceptance criteria, and original source material.
