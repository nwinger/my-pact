import { and, eq, isNull, ne, or } from 'drizzle-orm';

import type { db } from '../db';
import { pacts } from '../db/schema';

/**
 * Voiding contracts — the one place the mutual-pact cancel cascade lives.
 *
 * ADR-0006: a mutual pact dies as one contract. Either partner cancelling
 * their active twin voids the other's twin too — UNLESS that twin already
 * completed (a finished contract cannot be retroactively voided; incomplete
 * and cancelled twins are equally settled and equally untouchable). The
 * cascade belongs to the server, not the client: the old client-side healing
 * shim is gone, and every caller that breaks an active pact routes through
 * here — the creator's cancel (routes/pacts.ts) and the friends block
 * mutation (routes/friends.ts), which severs every live contract between
 * the pair inside its own transaction (ADR-0007, issue #13).
 */

/** A drizzle handle the cascade can write through: the db or a transaction. */
export type DbHandle = typeof db | Parameters<Parameters<(typeof db)['transaction']>[0]>[0];

/**
 * Cancel an ACTIVE pact and cascade to its mutual twin. The caller has
 * already authorized the break and verified `row` is a live (non-deleted)
 * active pact; run it inside a transaction so the pair can never end up half
 * voided. Both updates are conditional writes, not read-then-checks: only a
 * live *active* row flips to cancelled, so a status that raced in between
 * the caller's read and this write (and, for the twin, a completed / settled
 * / already-cancelled state) stands untouched. Solo pacts — no
 * `mutualPactId` — skip the cascade entirely.
 */
export async function voidActivePact(
  handle: DbHandle,
  row: { id: string; mutualPactId: string | null }
): Promise<void> {
  const now = new Date();
  await handle
    .update(pacts)
    .set({ status: 'cancelled', updatedAt: now })
    .where(and(eq(pacts.id, row.id), eq(pacts.status, 'active'), isNull(pacts.deletedAt)));

  if (row.mutualPactId) {
    await handle
      .update(pacts)
      .set({ status: 'cancelled', updatedAt: now })
      .where(
        and(
          eq(pacts.mutualPactId, row.mutualPactId),
          ne(pacts.id, row.id),
          eq(pacts.status, 'active'),
          isNull(pacts.deletedAt)
        )
      );
  }
}

/**
 * Sever every live contract between a pair of users — the block cascade
 * (ADR-0007: a live accountability contract IS contact, which block exists
 * to end). Run it inside the block mutation's transaction so the severance
 * and the block itself land together or not at all.
 *
 * - Every PENDING Proposal between the pair, in both directions, declines:
 *   the terminal tombstone of routes/pacts.ts's decline — kept on the books,
 *   excluded from list reads, so it reaches no client (ADR-0006).
 * - Every ACTIVE pact between the pair — solo pacts in either direction and
 *   both mutual twins — cancels through voidActivePact, so the
 *   completed-twin guard holds: a twin that already completed stays
 *   completed. Iterating twins is safe — the conditional writes make the
 *   second twin a no-op once the first's cascade cancelled it.
 *
 * Accepted collateral (ADR-0007): the blocked user's solo pact dies when the
 * blocker was merely its keeper. Pacts with third parties never match the
 * pair predicate and stand untouched.
 */
export async function severPactsBetween(handle: DbHandle, a: string, b: string): Promise<void> {
  const betweenPair = or(
    and(eq(pacts.creatorUserId, a), eq(pacts.keeperUserId, b)),
    and(eq(pacts.creatorUserId, b), eq(pacts.keeperUserId, a))
  );

  await handle
    .update(pacts)
    .set({ status: 'declined', updatedAt: new Date() })
    .where(and(betweenPair, eq(pacts.status, 'pending'), isNull(pacts.deletedAt)));

  const active = await handle
    .select({ id: pacts.id, mutualPactId: pacts.mutualPactId })
    .from(pacts)
    .where(and(betweenPair, eq(pacts.status, 'active'), isNull(pacts.deletedAt)));
  for (const row of active) {
    await voidActivePact(handle, row);
  }
}
