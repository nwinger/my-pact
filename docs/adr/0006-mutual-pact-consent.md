# ADR 0006: Mutual pacts bind only by consent; a Proposal is a single pending pact

Date: 2026-07-03
Status: accepted

## Context

Client-side, "Make it mutual" fabricates the friend's twin locally — the
friend never learns of it. Moving pacts server-side would turn that into
unilaterally committing another user to a habit: from the cron slice onward,
failed check-ins would be recorded against them and breach notifications
escalated about them, for a contract they never agreed to. The `pact_status`
enum had no consent state, so unilateral-active is what the schema assumed.

## Decision

Consent is required to be **bound to act**, never to **observe**:

- **Solo pacts stay unilateral.** The keeper's standing consent to witness is
  the accepted friendship itself; naming a keeper notifies, it does not ask.
- **A mutual pact begins as a Proposal: one `pending` row owned by the
  proposer** (creator = proposer, keeper = partner, `mutualPactId` minted).
  The partner's twin does not exist yet.
- **Accept** (keeper of the pending row only — authorization falls out of the
  row shape) transactionally inserts the partner's twin (same `mutualPactId`)
  and flips both rows `active`. Dates re-anchor at acceptance: `startDate` =
  today in the *accepter's* stored IANA timezone, `endDate` = start + span,
  span inferred from the provisional dates — the partner never wakes up on
  day 3 of 30, and nothing accrues while pending.
- **Decline** (keeper only) → new terminal status `declined`: kept on the
  books (future throttling of re-proposals needs it) but excluded from
  `GET /pacts`, mirroring how the friends route drops declined rows.
  Re-proposing after a decline is allowed.
- **Withdraw** (creator of a pending row) → soft-delete. A contract that
  never bound anyone leaves no visible record; the Archive holds contracts
  that existed. `cancelled` keeps meaning "a once-active contract, broken".
- **Voiding an active mutual pact cascades**: either partner cancelling their
  twin voids the other's twin too — unless that twin already `completed`
  (mutual goal twins complete independently). Irreversible, partner notified.
- No proposal expiry in v1; the cron slice can add it if clutter proves real.

## Considered options

- **Unilateral-active (schema as-is).** Rejected: commits another user; their
  first contact with the pact would be a breach notice.
- **Both twins created at proposal time, both pending.** Rejected: symmetric
  twins record no proposer, so "only the partner may accept" cannot be
  authorized without an extra column — and the partner's row would assert
  them as *creator* of a commitment they haven't agreed to, the exact lie the
  consent rule exists to prevent.
- **Dissolution requires both signatures.** Rejected: a commitment device
  only works while both parties are willing; withholding a signature to force
  a habit is coercion. The remaining partner can re-draft solo in one tap.

## Consequences

- `pact_status` gains `pending` and `declined` in one migration; only mutual
  pacts ever use them. Engine and cron skip both for free (they act on
  `active` only).
- Proposals are invisible to the current Pacts-tab filters — the tab needs
  incoming/outgoing Proposals sections (accept/decline lives there), mirroring
  the Friends screen. Discovery is passive tab-focus refetch until the
  notifications slice, the same contract friend requests live with.
- The domain glossary (CONTEXT.md) gains Pact, Creator, Solo pact, Mutual
  pact, Twin, Proposal, Partner.
