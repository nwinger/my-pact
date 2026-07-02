# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Commands

```bash
npm install
npx expo start --web    # web dev server (needs the API up — see Verifying changes)
npx expo start          # native (Expo Go / dev build)
npx tsc --noEmit        # typecheck (client + server)
npx expo lint           # eslint (React Compiler rules enabled)
npm test                # vitest — server route tests (needs supabase running)
                        # + the pure client friends-normalization unit tests

supabase start          # local Postgres (ports 553xx — needs Docker/OrbStack)
npm run db:migrate      # apply drizzle/ migrations
npm run api             # Hono backend on http://localhost:8787/api
```

## What this is

"My Pact" — a social habit-tracking Expo app (SDK 56, React 19, RN 0.85,
expo-router, reanimated v4, zustand) plus a Hono + Better Auth + Drizzle
backend in `server/` (see `docs/adr/0001-backend-stack.md` and
`docs/backend-setup.md`). The app is **API-only** (ADR-0004): auth is real
(email+password against Better Auth, bearer token in secure storage), the
client adopts the real server id as `meId` at sign-in (ADR-0005 — domain
rows never carry the `'u-me'` pre-auth placeholder), the friends graph is
server-side, and `EXPO_PUBLIC_API_URL` is required — put
it in `.env` (copy `.env.example`). Booting without it fails fast at module
load; there is no offline or demo fallback. Pacts, check-ins and
notifications are still on-device (account-scoped, cleared on sign-out)
until their endpoints land. The session guard is `Stack.Protected` in
`src/app/_layout.tsx`.

## Architecture notes

- **Routes** (`src/app/`): one auth-guarded stack — signed in: `index` (the
  tabbed main surface), `create` (modal), `pact/[id]`, `inbox`, `settings`;
  signed out: `welcome`, `login`, `register`. Tab switching is NOT done
  with a router tab navigator: expo-router/react-navigation tabs leave
  inactive scenes visible on web in this SDK combo. Instead `src/app/index.tsx`
  mounts all four scenes from `src/screens/` and toggles `display` based on
  the `useTabs` zustand store. Keep it that way.
- **Persistence**: domain store (`use-store.ts`) persists via zustand
  `persist` + AsyncStorage; auth (`use-auth.ts`) via secure storage. Gate UI
  on `useHydrated()` (`src/lib/use-hydrated.ts`). In-memory flags
  (`hydrated`, `reconciled`) are excluded by `partialize`. Entity ids embed
  `Date.now()` — plain counters collide with persisted data after relaunch.
- **Scheduler engine** (`src/lib/engine.ts`): on launch (signed in +
  hydrated), `runReconcile()` records failed check-ins for missed required
  days, emits breach/completion notifications, and settles expired pacts.
  It mirrors the future backend cron jobs — keep its rules in sync with the
  spec in README.
- **Design tokens** live in `src/theme/tokens.ts` — colors (ink/paper/pastel
  tints), Fraunces + Quicksand font families, radii, shadows (as `boxShadow`
  strings, supported cross-platform on the new architecture). No hard-coded
  colors in components.
- **Streak/progress math** is pure and lives in `src/lib/streaks.ts`;
  dates are local "YYYY-MM-DD" keys via `src/lib/dates.ts`. `daysOfWeek` uses
  0 = Sunday … 6 = Saturday.
- **zustand selectors must return stable references** (v5 +
  useSyncExternalStore). Selectors that derive arrays use `useMemo` over raw
  slices — see `useFriends` in `use-store.ts`.
- **React Compiler lint**: writes to reanimated shared values inside event
  handlers trip `react-hooks/immutability`; the existing files disable that
  rule locally with a comment explaining why. Follow the same pattern.
- Every screen wraps itself in `<Paper>` (opaque textured background);
  screens must not rely on a parent background.

## Gotchas

- Metro's file watcher can silently miss edits (changes don't hot-reload AND
  full reloads still serve a stale bundle). If a change doesn't appear in the
  browser, restart the dev server with `--clear`.

## Verifying changes

Verification runs against the real stack — three processes:

```bash
supabase start          # 1. local Postgres (skip if already running)
npm run db:migrate      #    apply migrations (first run / after schema changes)
npm run api             # 2. Hono API on http://localhost:8787/api
npx expo start --web    # 3. web dev server (EXPO_PUBLIC_API_URL from .env)
```

Check at a mobile viewport (~375×812). From the welcome screen, register a
throwaway account through the UI ("Make my first pact" → the register form)
and exercise the change on it. Local Postgres persists across sessions until
you reset it (`supabase db reset` + `npm run db:migrate`), so throwaway
accounts and their data survive dev-server restarts. Two-sided flows (friend
requests, keeper views) take two throwaway accounts — sign out, register the
second, and switch between them.

For the rare deep-history visual check (long streaks, breach escalation),
insert rows with ad-hoc SQL against local Postgres (Studio at
http://127.0.0.1:55323, or `psql` on port 55322) — never a maintained
fixture. The time-dependent rules themselves are pure
(`src/lib/streaks.ts`, `src/lib/engine.ts`) and belong under unit tests,
not seeded data.

## Agent skills

Per-repo configuration for the engineering skills. Details in `docs/agents/`.

### Issue tracker

Issues live in this repo's GitHub Issues, managed with the `gh` CLI. External
PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles map 1:1 to their default label strings
(`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`,
`wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See
`docs/agents/domain.md`.
