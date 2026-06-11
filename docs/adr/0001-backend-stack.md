# ADR 0001: Backend stack — Hono + Drizzle/Supabase + Better Auth on Vercel

Date: 2026-06-11
Status: accepted

## Context

The client (Expo SDK 56, RN 0.85) is feature-complete against on-device zustand
stores. The product spec calls for a real backend: PostgreSQL via Supabase,
Drizzle ORM, auth supporting email+password plus Google/Apple social login,
and cron schedulers replacing `src/lib/engine.ts`. The one hard requirement
for the framework: **it must run seamlessly on Vercel**.

## Decision

**Hono**, deployed as a single Vercel Function (`api/[[...route]].ts` via
`hono/vercel`'s `handle()`), with:

- **Drizzle ORM** over **Supabase Postgres** (`postgres`-js driver,
  `prepare: false` so the Supabase transaction pooler works in production).
  Local development runs against `supabase start` (ports moved to 553xx —
  54xxx is occupied by another local project).
- **Better Auth** with the Drizzle adapter. Email+password enabled;
  Google/Apple providers are config-gated on env credentials (see
  `docs/backend-setup.md`). The **bearer plugin** issues a session token in
  the `set-auth-token` response header — this maps 1:1 onto the client's
  persisted `token` field and avoids cross-origin/third-party cookie problems
  for native + web clients.
- The whole app lives under a `/api` base path. Vercel only routes `api/`
  files, so `/api/auth/*` (Better Auth's default basePath), `/api/users/me`,
  `/api/pacts`, … all flow through the one catch-all function. Locally the
  same app is served by `@hono/node-server` (`npm run api`) on port 8787.

### Alternatives considered

- **Elysia** — excellent DX but Bun-first; Node/Vercel support is secondary
  and Better Auth's docs target Hono. Rejected on the Vercel requirement.
- **Nitro** — a meta-framework with its own routing/build pipeline; more
  machinery than a five-resource API needs.
- **Express (+ serverless adapter)** — runs on Vercel but isn't
  web-standards based, has weaker TypeScript inference, and no first-class
  Better Auth integration docs.
- **NestJS** (mentioned in the original spec) — heavy DI framework; cold
  starts and complexity are not justified for this API surface.

Hono wins on: web-standard `Request`/`Response` (the same app object runs on
Node, Vercel, Bun, Workers), an official Vercel adapter, first-class Better
Auth + Drizzle documentation, tiny footprint, and typed middleware.

## Consequences

- Backend code lives in `server/` (app, auth, db, routes); `api/` holds only
  the Vercel entry. One `package.json` for client + server — Metro never
  sees server files (nothing under `src/` imports them), and `tsc --noEmit`
  type-checks both sides.
- Drizzle owns schema + migrations (`drizzle/`, `npm run db:generate` /
  `db:migrate`). Supabase's own migration system is unused; the local stack
  is just a Postgres provider (Studio on :55323 is still handy).
- Better Auth owns the `user`, `session`, `account` and `verification`
  tables (generated with its CLI so they match the installed version;
  app-specific profile fields ride on `user` as additionalFields). Domain
  tables (`friendships`, `pacts`, `check_ins`, `notifications`) are
  hand-written and follow the client's hardened rules: soft deletion
  (`deleted_at`) on domain entities, immutable check-ins unique per
  (pact, user, date), `days_of_week` 0=Sunday…6=Saturday, local `YYYY-MM-DD`
  date keys as Postgres `date` columns, server-generated UUIDs, IANA
  timezone per user and captured per check-in. Auth tables are not
  soft-deleted — sessions/verifications are operational data.
- The client keeps an offline demo mode: with no `EXPO_PUBLIC_API_URL` set,
  auth stays mocked and the seeded stores behave exactly as before.
- Scheduler crons (replacing `engine.ts`) will be Vercel cron jobs hitting
  Hono routes — out of scope here, unblocked by this structure.
