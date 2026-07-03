# ADR 0007: Remove is housekeeping, block is severance

Date: 2026-07-03
Status: accepted

## Context

Once pacts are server rows referencing real friends, every friendship
transition needs a defined effect on contracts between the pair. Blocking is
only *reachable* from the incoming-request decline sheet today, but the server
allows blocking accepted friends, and remove → re-request → block reaches a
pair with live pacts precisely because remove preserves them — so the rules
are written to the server's capability, not the UI's current reachability.

## Decision

- **Commitment-time guards**: naming a keeper, proposing a mutual pact, and
  *accepting* a proposal each require a live accepted friendship at that
  moment — "every keeper is a friend" holds at every point of commitment.
- **Remove → contracts stand.** Unfriending is casual and reversible; active
  pacts and keeper read access continue (the contract has its own term).
  Pending proposals stay pending but are unacceptable while unfriended (the
  accept-guard enforces it — no sweep code), reviving if the pair re-adds.
- **Block → severance, atomically in the block mutation.** All active pacts
  between the pair cancel (ADR-0006 cascade: active twins void, completed
  twins stand) and pending proposals between them decline. A live
  accountability contract *is* contact, which block exists to sever.

## Considered options

- **Remove cancels pacts.** Rejected: friend-list housekeeping becomes
  destructive.
- **Keeper-blind surviving pacts on block** (pact continues, keeper loses
  sight). Rejected: invents a permanent new domain state plus access-gating
  machinery for a rare edge.

## Consequences

- Known, accepted cost: collateral damage — if the blocker was merely keeper
  of the blocked user's solo pact, that pact dies through no act of its
  creator (seals and history survive; re-drafting is one tap). Revisit if
  block-griefing turns out to be real.
- The block-cascade is cold-path code (rarely exercised manually) — it exists
  only with its route tests.
- There is still no unblock; since cancellation is irreversible anyway,
  adding one later does not resurrect contracts.
