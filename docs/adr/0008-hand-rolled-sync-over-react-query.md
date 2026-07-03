# ADR 0008: Domain sync stays hand-rolled zustand (the friends idiom); React Query declined

Date: 2026-07-03
Status: accepted

## Context

The README promised "store actions become React Query mutations", but React
Query was never installed, and the friends slice meanwhile established a
complete idiom: zustand as the persisted domain cache, async store actions
that await the API then refresh, an in-flight guard, tab-focus refetch, and
pure normalization in `src/lib/` under unit tests. Pacts, check-ins and
notifications will copy whichever pattern the pacts slice picks.

## Decision

Formalize the friends idiom as the pattern for all domain sync and withdraw
the React Query promise. Deciding constraints: the zustand-persist store *is*
the offline read cache (RQ would need persistQueryClient or a two-cache sync);
the scheduler engine reads and writes domain state synchronously via
`getState()` until the cron slice; and screens read via selectors — slices
plug in behind the stores without touching screens. RQ's headline features
solve invalidation/dedupe problems a seven-endpoint app doesn't have, and
optimistic sealing (its one tempting win, needed for check-ins) is ~30 lines
in-idiom with the `(pact, user, date)` unique index making retries idempotent.

Revisit only if a future slice's cache-coordination pain outgrows the idiom —
and adopt wholesale (friends included) if so, never as a second coexisting
pattern.
