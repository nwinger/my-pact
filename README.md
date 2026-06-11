# My Pact

**Habits stick when witnessed.**

My Pact is a social habit-tracking app built with Expo (iOS + Android + web).
Users commit to habits through accountability contracts — *pacts* — witnessed
by a friend (the *keeper*). The app drives the loop with daily check-ins
("seals"), streaks, and breach notifications.

The client is feature-complete against an on-device data layer; the
API/backend described in the product spec plugs in behind the zustand stores
without touching the screens.

## Features

- **Auth flow** — welcome → register/login (email+password, Google/Apple
  buttons), session persisted with expo-secure-store on device. Sign-out and
  the auth guard (`Stack.Protected`) route accordingly. Auth is mocked
  locally; swapping in Better Auth changes only the store actions.
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
- **Settings** — username, notification time, timezone, reminder toggle,
  demo-data reset, sign out.
- **Persistence** — domain data in AsyncStorage, auth in secure storage;
  check-ins and streaks survive restarts. "Reset demo data" reseeds.

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

```bash
npm install
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
  store/          zustand stores (domain + auth + tab) with persistence, seed data
  lib/            date helpers, streak math, scheduler engine, reminders, hydration
  theme/          design tokens (colors, fonts, radii, shadows)
scripts/          app-icon generator
```

Tab navigation is owned by a small zustand store (`use-tabs.ts`) rather than a
router tab navigator — all four scenes stay mounted with their scroll state,
and inactive ones are `display: none`. This sidesteps an expo-router web issue
where inactive tab scenes stay visible, and behaves identically on native.

## What the real backend replaces

The spec's NestJS/Vercel + Drizzle/Supabase + Better Auth + FCM stack slots in
behind the stores: auth actions call the API instead of minting mock tokens,
store actions become React Query mutations, and `src/lib/engine.ts` retires in
favor of the server-side cron schedulers it mirrors.
