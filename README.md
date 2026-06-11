# My Pact

**Habits stick when witnessed.**

My Pact is a social habit-tracking app built with Expo (iOS + Android + web).
Users commit to habits through accountability contracts — *pacts* — witnessed
by a friend (the *keeper*). The app drives the loop with daily check-ins
("seals"), streaks, and breach notifications.

This repository contains the mobile client with a fully interactive mock data
layer; the API/backend described in the product spec plugs in behind the
zustand store.

## Design

An "ink on paper" contract aesthetic:

- **Typography** — Fraunces (editorial serif, 600–900 incl. italics) for
  display, Quicksand (rounded sans) for body and UI.
- **Surfaces** — warm cream paper with soft tinted glows and a printed dot
  grain; cards are ink-bordered "tickets" with pastel header bands (butter,
  periwinkle, blush, mint, clay).
- **The seal** — checking in presses a scalloped wax seal onto the day, with a
  spring stamp animation, particle burst, and haptics. Missed days, streak
  flames, and keeper "signatures" (italic serif) carry the contract metaphor
  through every screen.
- **Motion** — react-native-reanimated v4 throughout: staggered entrances,
  springy pressables, animated progress rings, a paper-lift welcome overlay.

## Running it

```bash
npm install
npx expo start          # iOS / Android via Expo Go or dev build
npx expo start --web    # web preview
```

## Structure

```
src/
  app/            expo-router routes (stack: main, create modal, pact/[id], inbox)
  screens/        the four tab scenes (home, pacts, friends, profile)
  components/     pact cards, tab bar, seal button, sheet, primitives in ui/
  store/          zustand mock store + seed data + tab state
  lib/            date helpers, streak/progress math
  theme/          design tokens (colors, fonts, radii, shadows)
```

Tab navigation is owned by a small zustand store (`use-tabs.ts`) rather than a
router tab navigator — all four scenes stay mounted with their scroll state,
and inactive ones are `display: none`. This sidesteps an expo-router web issue
where inactive tab scenes stay visible, and behaves identically on native.

## Domain rules (mirrored from the product spec)

- Pacts are frequency-based (daily / chosen weekdays) or goal-based
  (target + unit, e.g. 40 km).
- Mutual pacts link two commitments; both sides check in.
- Check-ins close at end-of-day in the user's timezone + 30 min grace.
- Check-ins are immutable; streak math respects required days of week.
- Keepers are notified of misses, breaches, and completions.
