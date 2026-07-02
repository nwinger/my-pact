# My Pact

**Habits stick when witnessed.**

My Pact is a social habit-tracking app built with Expo (iOS + Android + web).
Users commit to habits through accountability contracts — *pacts* — witnessed
by a friend (the *keeper*). The app drives the loop with daily check-ins
("seals"), streaks, and breach notifications.

The app is server-authoritative and online-only for writes (ADR-0004): auth
and the friends graph run against the backend, and the remaining domain
slices (pacts, check-ins, notifications) plug in behind the zustand stores
without touching the screens.

## Features

- **Auth flow** — welcome → register/login (email+password, Google/Apple
  buttons), session persisted with expo-secure-store on device. Sign-out and
  the auth guard (`Stack.Protected`) route accordingly. Email+password runs
  against the backend (Better Auth, bearer sessions; Google/Apple are
  scaffolded behind OAuth credentials). `EXPO_PUBLIC_API_URL` is required —
  the app fails fast at startup without it.
- **Pacts** — frequency (daily / chosen weekdays) and goal (target + unit)
  pacts, mutual pacts that create a linked twin where both sides check in,
  keeper selection from accepted friends, 21/30/60/90-day durations,
  irreversible cancellation.
- **Check-ins** — wax-seal stamping with particle burst + haptics, goal
  progress logging via bottom sheet, one check-in per pact per day, a
  00:00–00:30 grace window to seal yesterday, no backfill beyond 7 days.
- **Accountability engine** — a local stand-in for the backend schedulers
  runs on every launch: missed required days are recorded as failed
  check-ins, breach notifications escalate at 3+ consecutive misses, goal
  pacts complete on reaching target, expired pacts settle as
  completed/incomplete.
- **Streaks & stats** — streak math respects each pact's required weekdays;
  profile shows streak, success rate, seals pressed, pacts made, keeper
  count, witnesses.
- **Friends** — invite by email, accept/decline incoming, outgoing-pending
  list, remove, and a one-tap "Pact" shortcut that opens creation with that
  friend preselected as keeper.
- **Notifications** — all five spec types in the inbox with unread badges and
  deep links; a daily local reminder fires at the user's notification time
  (expo-notifications; remote push via FCM arrives with the real backend).
- **Settings** — username, notification time, reminder toggle, sign out.
  The timezone follows the device automatically and is kept in sync with
  the server.
- **Persistence** — domain data in AsyncStorage (account-scoped, cleared on
  sign-out), auth in secure storage; check-ins and streaks survive restarts.

## Design

An "ink on paper" contract aesthetic:

- **Typography** — Fraunces (editorial serif, 600–900 incl. italics) for
  display, Quicksand (rounded sans) for body and UI.
- **Surfaces** — warm cream paper with soft tinted glows and a printed dot
  grain; cards are ink-bordered "tickets" with pastel header bands (butter,
  periwinkle, blush, mint, clay).
- **The seal** — checking in presses a scalloped wax seal onto the day, with
  a spring stamp animation, particle burst, and haptics. Streak flames,
  keeper "signatures" in italic serif, and confetti when every seal of the
  day is pressed carry the metaphor through every screen.
- **Motion** — react-native-reanimated v4 throughout: staggered entrances,
  springy pressables, animated progress rings.
- **App icon** — the wax seal on paper, generated from code
  (`node scripts/generate-icons.mjs`).

## Running it

The backend is required — the app fails fast at startup without
`EXPO_PUBLIC_API_URL` (see `docs/backend-setup.md`):

```bash
npm install
cp .env.example .env    # sets EXPO_PUBLIC_API_URL=http://localhost:8787

supabase start          # local Postgres — needs Docker/OrbStack
npm run db:migrate
npm run api             # Hono API on http://localhost:8787/api

npx expo start          # iOS / Android via Expo Go or dev build
npx expo start --web    # web preview
```

## Structure

```
src/
  app/            expo-router routes (auth-guarded stack: main, create modal,
                  pact/[id], inbox, settings + welcome/login/register)
  screens/        the four tab scenes (home, pacts, friends, profile)
  components/     pact cards, tab bar, seal button, sheet, auth bits, ui/
  store/          zustand stores (domain + auth + tab) with persistence
  lib/            date helpers, streak math, scheduler engine, reminders,
                  hydration, api client (api.ts)
  theme/          design tokens (colors, fonts, radii, shadows)
server/           Hono backend: Better Auth, drizzle schema, /users + /friends routes
api/              Vercel Functions entry (catch-all → the Hono app)
drizzle/          generated SQL migrations
supabase/         local Supabase config (`supabase start`, ports 553xx)
docs/             ADRs + backend setup guide (OAuth checklist, deploy)
scripts/          app-icon generator
```

Tab navigation is owned by a small zustand store (`use-tabs.ts`) rather than a
router tab navigator — all four scenes stay mounted with their scroll state,
and inactive ones are `display: none`. This sidesteps an expo-router web issue
where inactive tab scenes stay visible, and behaves identically on native.

## Backend status

The backend (Hono + Drizzle/Supabase + Better Auth on Vercel — see
`docs/adr/0001-backend-stack.md`) now handles auth and the friends graph
for real: registration, login, bearer sessions, `GET/PATCH /users/me`,
witness lookup and the friendship request lifecycle. The remaining domain
tables (pacts, check-ins, notifications) exist in the schema with the
client's hardened rules; their endpoints are the next step, after which
store actions become React Query mutations and `src/lib/engine.ts` retires
in favor of server-side cron schedulers.

An earlier version of this section promised that offline demo mode would
keep working throughout the backend build-out. That promise is withdrawn —
deliberately, not as doc rot: demo mode is removed (ADR-0004), the app is
API-only, and booting without `EXPO_PUBLIC_API_URL` fails fast instead of
falling back to mock auth and seeded data.
