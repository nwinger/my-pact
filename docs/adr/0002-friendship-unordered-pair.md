# ADR 0002: One friendship per unordered pair, enforced by a partial expression index

Date: 2026-07-01
Status: accepted

## Context

`friendships` stores a direction (requester → addressee) so the UI can show a
pending request as "incoming" vs "outgoing". But the underlying relationship is
*undirected*: there should be at most one friendship between two users,
regardless of who asked. The client store already enforces this in app code —
its duplicate check rejects a new request when a friendship exists in **either**
direction and is not `declined` (`src/store/use-store.ts`). The server needs the
same guarantee, and it needs it to survive races (two users requesting each
other at the same instant) that app-level checks alone cannot close.

Two existing behaviours must be preserved:

- Re-requesting someone who previously **declined** you is allowed — a declined
  row is a tombstone, not a permanent block.
- A **removed** friend (soft-deleted via `deleted_at`) can be re-added later.

The `friendships` table itself already existed (migration `0000`); what was
missing was any uniqueness constraint on the pair.

## Decision

Enforce the invariant with a single partial, undirected unique index:

```sql
UNIQUE (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))
WHERE status <> 'declined' AND deleted_at IS NULL
```

`LEAST/GREATEST` canonicalise the unordered pair; the predicate lets declined
tombstones and soft-deleted rows coexist with a fresh live row. The send route
inserts optimistically and treats a unique violation (SQLSTATE `23505`) as the
`duplicate` result, so concurrent cross-requests collapse to one friendship.
The index ships in a new migration; the table is untouched.

## Considered options

- **Directed unique `(requester_id, addressee_id)`** — the literal reading of
  "unique on the pair". Rejected: it allows `A→B` and `B→A` to coexist and it
  blocks the legitimate re-request-after-decline. It enforces the wrong
  invariant.
- **App-level dedup only** (mirror the store, no DB constraint). Rejected: it
  double-inserts under a race and lets the database hold states the domain
  forbids.

## Consequences

- The index predicate `status <> 'declined'` is intentionally identical to the
  store's dedup rule, so client and server agree on what "duplicate" means.
- The send route must catch `23505` and map it to `duplicate` rather than 500.
- `drizzle-kit`'s diffing of expression/partial indexes is imperfect, so the
  generated migration SQL is hand-verified.
