# ADR 0004: Remove offline demo mode; the app is API-only and server-authoritative

Date: 2026-07-02
Status: accepted

## Context

Offline demo mode (mock auth, the seeded six-user universe in `src/store/seed.ts`,
the `DATA_MODE` persist wall, demo-only reset UI) was kept as a first-class
parallel mode while the backend absorbed the domain — the README promised
"offline demo mode keeps working throughout". Every server slice doubled the
code paths (the friends actions already forked on `apiEnabled`, with
pacts/check-ins/notifications forks coming), and the seeded universe masked the
frontier between implemented and mocked: everything looked done when only
friends had real endpoints.

## Decision

Delete demo mode entirely. One app, one mode: server-authoritative, online
required for writes — no offline support. `EXPO_PUBLIC_API_URL` unset fails
fast at startup with an actionable error instead of silently becoming a
different app; the `apiEnabled` flag ceases to exist. The persist version bumps
to 4 and the migration discards **all** prior local data (two users total,
neither with data worth keeping). No populated fixtures replace the seed.

## Considered options

- **Keep demo mode first-class forever** (App Store review, showcase,
  dev-without-Docker). Rejected: mode is baked at build time, so the submitted
  binary is an API build — client demo mode *cannot* serve App Store review (a
  server-seeded review account at submission time does). The remaining
  audiences were all dev-time, and dev tooling shouldn't cost a fork in every
  store action.
- **Freeze it as a read-only tour.** Rejected: fails the only surviving
  audience (verification needs working write paths).
- **A data-layer seam (one interface, demo + API implementations).** Rejected:
  solves the fork problem but keeps the masking problem.
- **A server-side seed script** recreating the storylines as real rows.
  Rejected knowingly — no populated fixtures at all. Revisit if history-heavy
  UI iteration becomes frequent.

## Consequences

- Verifying changes means running the real stack (`supabase start`,
  `db:migrate`, `npm run api`, `expo start --web`) and registering a throwaway
  account through the UI. CLAUDE.md documents this as the canonical loop.
- Time-dependent states (streaks, breach escalation, settlement) can no longer
  be seen by seeding: the pure rules (`src/lib/streaks.ts`, engine/cron) get
  their verification from unit tests in the Vitest + local-Postgres harness;
  layout checks use shallow live data; the rare deep-history visual check is
  ad-hoc SQL, never a maintained artifact.
- `src/lib/engine.ts` and the local pact/check-in/notification write paths are
  **not** demo code — they are the interim local implementation of the domain,
  replaced in place slice-by-slice as server endpoints land. The engine retires
  when the server cron lands, at which point the scheduler rules live exactly
  once and the cron's test suite is the executable spec.
