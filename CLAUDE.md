# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Commands

```bash
npm install
npx expo start --web    # web dev server (fastest way to verify changes)
npx expo start          # native (Expo Go / dev build)
npx tsc --noEmit        # typecheck
npx expo lint           # eslint (React Compiler rules enabled)
```

## What this is

"My Pact" — a social habit-tracking Expo app (SDK 56, React 19, RN 0.85,
expo-router, reanimated v4, zustand). The client is fully functional against
an in-memory mock store (`src/store/use-store.ts` + `seed.ts`); there is no
real backend yet.

## Architecture notes

- **Routes** (`src/app/`): root stack only — `index` (the tabbed main
  surface), `create` (modal), `pact/[id]`, `inbox`. Tab switching is NOT done
  with a router tab navigator: expo-router/react-navigation tabs leave
  inactive scenes visible on web in this SDK combo. Instead `src/app/index.tsx`
  mounts all four scenes from `src/screens/` and toggles `display` based on
  the `useTabs` zustand store. Keep it that way.
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

## Verifying changes

Run the web server and check at a mobile viewport (~375×812). The welcome
overlay appears first — the "Sign me up" button dismisses it. Check-ins reset
on reload (mock store is in-memory).
