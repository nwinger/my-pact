import { randomUUID } from 'node:crypto';

import { and, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { Hono } from 'hono';

import type { AppEnv } from '../context';
import { db } from '../db';
import { friendships, pacts, user } from '../db/schema';
import { addDaysToKey, daySpanOfKeys, todayInTimezone } from '../lib/dates';
import { voidActivePact } from '../lib/severance';
import { profile } from './shared';

export const pactRoutes = new Hono<AppEnv>();

type PactRow = typeof pacts.$inferSelect;

/**
 * One pact on the wire: the flat row with real user ids (ADR-0005). The
 * client's normalizer (src/lib/pacts.ts) owns the projection onto the domain
 * `Pact` shape, so keep this in lockstep with its `ApiPact` type.
 */
function wirePact(p: PactRow) {
  return {
    id: p.id,
    creatorUserId: p.creatorUserId,
    keeperUserId: p.keeperUserId,
    title: p.title,
    description: p.description,
    type: p.type,
    status: p.status,
    startDate: p.startDate,
    endDate: p.endDate,
    daysOfWeek: p.daysOfWeek,
    goalTarget: p.goalTarget,
    goalUnit: p.goalUnit,
    isMutual: p.isMutual,
    mutualPactId: p.mutualPactId,
    tintIndex: p.tintIndex,
  };
}

/**
 * GET /pacts — every pact the caller is a party to: pacts they created AND
 * pacts they keep, as flat rows (the client partitions by comparing ids).
 * Two exclusions, applied to both roles alike: soft-deleted rows (removed
 * solo pacts, withdrawn proposals) and `declined` tombstones — a declined
 * proposal stays on the books for future re-proposal throttling but never
 * reaches any client, so it appears in no Archive (ADR-0006). Pending
 * proposals DO travel: the partner discovers incoming ones here on tab
 * focus, and the proposer sees theirs as outgoing.
 *
 * `counterparts` is the profile sidecar: the *other* party of each pact
 * (keeper of mine, creator of kept), deduped, for the client's user cache —
 * a keeper is not necessarily still a friend (ADR-0007: contracts stand
 * after removal), so the friends graph alone cannot supply these profiles.
 * No single-pact GET exists — the detail screen reads the client cache.
 */
pactRoutes.get('/', async (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);

  const rows = await db
    .select()
    .from(pacts)
    .where(
      and(
        or(eq(pacts.creatorUserId, me.id), eq(pacts.keeperUserId, me.id)),
        ne(pacts.status, 'declined'),
        isNull(pacts.deletedAt)
      )
    )
    .orderBy(desc(pacts.createdAt));

  const counterpartIds = [
    ...new Set(rows.map((p) => (p.creatorUserId === me.id ? p.keeperUserId : p.creatorUserId))),
  ].filter((id) => id !== me.id);
  const counterpartRows = counterpartIds.length
    ? await db.select().from(user).where(inArray(user.id, counterpartIds))
    : [];

  return c.json({ pacts: rows.map(wirePact), counterparts: counterpartRows.map(profile) });
});

const DAY_RANGE = [0, 1, 2, 3, 4, 5, 6];

/**
 * The commitment-time friendship test (ADR-0007): a live (non-soft-deleted)
 * *accepted* bond between the two users, either direction. Naming a keeper,
 * proposing a mutual pact, and accepting a proposal all require it at the
 * moment of commitment — pending, declined, blocked and removed bonds all
 * fail.
 */
async function hasLiveAcceptedFriendship(a: string, b: string): Promise<boolean> {
  const [bond] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      and(
        or(
          and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
          and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a))
        ),
        eq(friendships.status, 'accepted'),
        isNull(friendships.deletedAt)
      )
    )
    .limit(1);
  return bond !== undefined;
}

/**
 * POST /pacts — create a SOLO pact, or propose a MUTUAL one (ADR-0006).
 *
 * Solo (`isMutual` unset): the accepted friendship is the keeper's standing
 * consent to witness, so the pact is born `active`.
 *
 * Mutual (`isMutual: true`): consent to be BOUND cannot be presumed, so the
 * create becomes a Proposal — one `pending` row owned by the proposer
 * (creator = proposer, keeper = Partner, `mutualPactId` minted here). The
 * Partner's twin does not exist until they accept, and nothing accrues while
 * pending. The dates below are provisional for a proposal: acceptance
 * re-anchors them to the accepter's today, preserving the span.
 *
 * Guards mirror the client's create-form validation (title ≥ 5 chars,
 * frequency needs days, goal needs target + unit) plus the commitment-time
 * rule (ADR-0007): the named keeper — witness or Partner — must be a live
 * accepted friend right now.
 *
 * The server authors all dates: the client sends only `durationDays`;
 * startDate = today in the *creator's* stored IANA timezone and
 * endDate = start + duration − 1, so an n-day pact spans exactly n due days.
 */
pactRoutes.post('/', async (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);

  let body: {
    title?: unknown;
    description?: unknown;
    type?: unknown;
    daysOfWeek?: unknown;
    goalTarget?: unknown;
    goalUnit?: unknown;
    keeperUserId?: unknown;
    isMutual?: unknown;
    durationDays?: unknown;
    tintIndex?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'A valid JSON body is required.' }, 400);
  }

  if (body.isMutual !== undefined && typeof body.isMutual !== 'boolean') {
    return c.json({ error: 'isMutual must be a boolean.' }, 400);
  }
  const isMutual = body.isMutual === true;

  if (typeof body.title !== 'string' || body.title.trim().length < 5 || body.title.trim().length > 100) {
    return c.json({ error: 'A pact deserves a title of 5–100 characters.' }, 400);
  }
  const title = body.title.trim();

  let description: string | null = null;
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string' || body.description.length > 500) {
      return c.json({ error: 'Descriptions are at most 500 characters.' }, 400);
    }
    description = body.description.trim() || null;
  }

  if (body.type !== 'frequency' && body.type !== 'goal') {
    return c.json({ error: 'A pact is either a frequency or a goal pact.' }, 400);
  }
  const type = body.type;

  // Shape-specific terms; the other shape's fields are ignored, not stored.
  let daysOfWeek: number[] | null = null;
  let goalTarget: number | null = null;
  let goalUnit: string | null = null;
  if (type === 'frequency') {
    const days = body.daysOfWeek;
    if (
      !Array.isArray(days) ||
      days.length === 0 ||
      !days.every((d) => typeof d === 'number' && DAY_RANGE.includes(d))
    ) {
      return c.json({ error: 'A frequency pact needs at least one weekday (0 = Sunday … 6 = Saturday).' }, 400);
    }
    daysOfWeek = [...new Set(days as number[])].sort((a, b) => a - b);
  } else {
    if (typeof body.goalTarget !== 'number' || !Number.isInteger(body.goalTarget) || body.goalTarget < 1) {
      return c.json({ error: 'A goal pact needs a whole-number target of at least 1.' }, 400);
    }
    if (typeof body.goalUnit !== 'string' || body.goalUnit.trim().length === 0 || body.goalUnit.trim().length > 20) {
      return c.json({ error: 'A goal pact needs a unit of 1–20 characters.' }, 400);
    }
    goalTarget = body.goalTarget;
    goalUnit = body.goalUnit.trim();
  }

  if (
    typeof body.durationDays !== 'number' ||
    !Number.isInteger(body.durationDays) ||
    body.durationDays < 1 ||
    body.durationDays > 365
  ) {
    return c.json({ error: 'Pacts run 1–365 days.' }, 400);
  }

  // Tint is client-chosen at creation; renderers apply their own modulo.
  let tintIndex = 0;
  if (body.tintIndex !== undefined) {
    if (typeof body.tintIndex !== 'number' || !Number.isInteger(body.tintIndex) || body.tintIndex < 0) {
      return c.json({ error: 'tintIndex must be a non-negative integer.' }, 400);
    }
    tintIndex = body.tintIndex;
  }

  if (typeof body.keeperUserId !== 'string' || body.keeperUserId.length === 0) {
    return c.json({ error: 'A pact needs a keeper.' }, 400);
  }
  const keeperUserId = body.keeperUserId;
  if (keeperUserId === me.id) {
    return c.json({ error: 'You can’t witness yourself — that’s the whole point.' }, 400);
  }

  // Commitment-time guard (ADR-0007): the keeper must be a live accepted
  // friend at this moment. Pending, declined, blocked and soft-deleted bonds
  // all fail — "every keeper is a friend" holds at every point of commitment.
  if (!(await hasLiveAcceptedFriendship(me.id, keeperUserId))) {
    return c.json({ error: 'Your keeper must be an accepted friend.' }, 400);
  }

  const startDate = todayInTimezone(me.timezone ?? 'UTC');
  const endDate = addDaysToKey(startDate, body.durationDays - 1);

  const [row] = await db
    .insert(pacts)
    .values({
      creatorUserId: me.id,
      keeperUserId,
      title,
      description,
      type,
      // A mutual pact begins as a Proposal: pending until the Partner
      // accepts. Only mutual pacts ever carry the pending status.
      status: isMutual ? 'pending' : 'active',
      startDate,
      endDate,
      daysOfWeek,
      goalTarget,
      goalUnit,
      isMutual,
      mutualPactId: isMutual ? randomUUID() : null,
      tintIndex,
    })
    .returning();

  return c.json({ pact: wirePact(row) }, 201);
});

/** Load a pact by id, or null when missing or soft-deleted (both 404). */
async function loadLivePact(id: string): Promise<PactRow | null> {
  const [row] = await db.select().from(pacts).where(eq(pacts.id, id)).limit(1);
  if (!row || row.deletedAt) return null;
  return row;
}

/**
 * POST /pacts/:id/accept — KEEPER of the pending row only: the authorization
 * falls out of the row shape (creator = proposer, keeper = Partner), so the
 * proposer and any outsider are 403 alike. Only a pending Proposal can be
 * answered (409 otherwise), and consent must rest on a live bond: an
 * accepted friendship is required AT THIS MOMENT (ADR-0007) — a proposal
 * between an unfriended pair is unacceptable (409) and simply revives when
 * the pair re-adds; no sweep code, the guard is the whole mechanism.
 *
 * The transaction materializes the mutual pact: it inserts the Partner's
 * twin (same terms, same `mutualPactId`, roles swapped) and flips the
 * pending row active — one commit, so the pair can never end up half born.
 * Dates re-anchor to the moment of consent: start = today in the ACCEPTER's
 * stored IANA timezone, end preserves the span inferred from the provisional
 * dates. Both twins carry the same re-anchored keys (each partner meets
 * deadlines in their own local day) — the Partner never wakes up already on
 * day 3 of 30, and the proposer accrued nothing while it hung pending.
 */
pactRoutes.post('/:id/accept', async (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);

  const row = await loadLivePact(c.req.param('id'));
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (row.keeperUserId !== me.id) return c.json({ error: 'Forbidden' }, 403);
  if (row.status !== 'pending') {
    return c.json({ error: 'Only a pending proposal can be accepted.' }, 409);
  }
  // 409, not 403: the caller is the right person — the *bond* is in the
  // wrong state, and re-adding the friend makes this very call succeed.
  if (!(await hasLiveAcceptedFriendship(row.creatorUserId, me.id))) {
    return c.json({ error: 'You can only accept a proposal from a current friend.' }, 409);
  }

  const startDate = todayInTimezone(me.timezone ?? 'UTC');
  const endDate = addDaysToKey(startDate, daySpanOfKeys(row.startDate, row.endDate));
  const now = new Date();

  // The flip is conditional on the row STILL being pending, so a concurrent
  // answer (double-tap accept, or a decline racing in) can never materialize
  // a second twin: whoever loses the race updates zero rows and inserts
  // nothing. The read-then-guard above already reported friendlier errors
  // for the common paths.
  let materialized = false;
  await db.transaction(async (tx) => {
    const flipped = await tx
      .update(pacts)
      .set({ status: 'active', startDate, endDate, updatedAt: now })
      .where(and(eq(pacts.id, row.id), eq(pacts.status, 'pending')))
      .returning({ id: pacts.id });
    if (flipped.length === 0) return;
    await tx.insert(pacts).values({
      creatorUserId: me.id,
      keeperUserId: row.creatorUserId,
      title: row.title,
      description: row.description,
      type: row.type,
      status: 'active',
      startDate,
      endDate,
      daysOfWeek: row.daysOfWeek,
      goalTarget: row.goalTarget,
      goalUnit: row.goalUnit,
      isMutual: true,
      mutualPactId: row.mutualPactId,
      tintIndex: row.tintIndex,
    });
    materialized = true;
  });
  if (!materialized) {
    return c.json({ error: 'Only a pending proposal can be accepted.' }, 409);
  }
  return c.json({ ok: true });
});

/**
 * POST /pacts/:id/decline — KEEPER of the pending row only (same row-shape
 * authorization as accept; proposer and outsiders are 403), pending rows
 * only (409 otherwise). No friendship requirement: refusing never needs a
 * live bond.
 *
 * `declined` is terminal and invisible: the tombstone stays on the books —
 * future re-proposal throttling needs it — but GET /pacts excludes it for
 * both sides, so it never reaches any client and appears in no Archive. A
 * fresh proposal for the same pair afterwards is allowed (ADR-0006).
 */
pactRoutes.post('/:id/decline', async (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);

  const row = await loadLivePact(c.req.param('id'));
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (row.keeperUserId !== me.id) return c.json({ error: 'Forbidden' }, 403);
  if (row.status !== 'pending') {
    return c.json({ error: 'Only a pending proposal can be declined.' }, 409);
  }

  // Conditional on STILL pending, like accept's flip: a decline racing a
  // just-committed accept must not tombstone one half of a now-live pact.
  const declined = await db
    .update(pacts)
    .set({ status: 'declined', updatedAt: new Date() })
    .where(and(eq(pacts.id, row.id), eq(pacts.status, 'pending')))
    .returning({ id: pacts.id });
  if (declined.length === 0) {
    return c.json({ error: 'Only a pending proposal can be declined.' }, 409);
  }
  return c.json({ ok: true });
});

/**
 * POST /pacts/:id/cancel — CREATOR-ONLY, two meanings by status (the keeper
 * or Partner witnesses but holds no power over the row either way — 403):
 *
 * - pending → WITHDRAW: soft-delete. A proposal never bound anyone, so it
 *   leaves no visible record for either side — `cancelled` keeps meaning
 *   "a once-active contract, broken", and the Archive holds contracts that
 *   existed (ADR-0006).
 * - active → irreversible break: active → cancelled, and for a mutual twin
 *   the void CASCADES to the partner's active twin (a completed twin
 *   stands) — see lib/severance.ts, shared with the block mutation (#13).
 *
 * Anything else is terminal already (409 — cancelled/completed/incomplete).
 */
pactRoutes.post('/:id/cancel', async (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);

  const row = await loadLivePact(c.req.param('id'));
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (row.creatorUserId !== me.id) return c.json({ error: 'Forbidden' }, 403);

  if (row.status === 'pending') {
    // Conditional on STILL pending: a withdraw racing a just-committed
    // accept must not soft-delete one half of a now-live mutual pact.
    const now = new Date();
    const withdrawn = await db
      .update(pacts)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(pacts.id, row.id), eq(pacts.status, 'pending'), isNull(pacts.deletedAt)))
      .returning({ id: pacts.id });
    if (withdrawn.length === 0) {
      return c.json({ error: 'This proposal was already answered.' }, 409);
    }
    return c.json({ ok: true });
  }

  if (row.status !== 'active') {
    return c.json({ error: 'Only an active pact can be broken.' }, 409);
  }

  await db.transaction((tx) => voidActivePact(tx, row));
  return c.json({ ok: true });
});

/**
 * POST /pacts/:id/complete — CREATOR-ONLY, goal pacts only: active →
 * completed, durably (the status must not un-happen on refresh).
 *
 * EXPLICITLY INTERIM (issue #11): check-ins are still on-device, so the
 * server cannot verify the target was reached — the trust is bounded to a
 * creator lying about their own pact, the power they already hold. The cron
 * slice re-authors or retires this endpoint.
 */
pactRoutes.post('/:id/complete', async (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);

  const row = await loadLivePact(c.req.param('id'));
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (row.creatorUserId !== me.id) return c.json({ error: 'Forbidden' }, 403);
  if (row.type !== 'goal') {
    return c.json({ error: 'Only goal pacts complete on reaching their target.' }, 400);
  }
  if (row.status !== 'active') {
    return c.json({ error: 'Only an active pact can complete.' }, 409);
  }

  await db
    .update(pacts)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(pacts.id, row.id));
  return c.json({ ok: true });
});

/**
 * POST /pacts/:id/settle — CREATOR-ONLY, frequency pacts only, and only once
 * the pact is past its end date *in the creator's timezone*: active → the
 * client-supplied verdict (completed | incomplete). Settling early is 409 —
 * the contract still has due days.
 *
 * EXPLICITLY INTERIM, same trust bound as /complete: without synced check-ins
 * the server cannot compute the 80%-kept rule itself. The cron slice
 * re-authors or retires this endpoint.
 */
pactRoutes.post('/:id/settle', async (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);

  let body: { verdict?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'A valid JSON body with a verdict is required.' }, 400);
  }
  if (body.verdict !== 'completed' && body.verdict !== 'incomplete') {
    return c.json({ error: 'The verdict is either completed or incomplete.' }, 400);
  }

  const row = await loadLivePact(c.req.param('id'));
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (row.creatorUserId !== me.id) return c.json({ error: 'Forbidden' }, 403);
  if (row.type !== 'frequency') {
    return c.json({ error: 'Only frequency pacts settle by verdict.' }, 400);
  }
  if (row.status !== 'active') {
    return c.json({ error: 'Only an active pact can settle.' }, 409);
  }
  const today = todayInTimezone(me.timezone ?? 'UTC');
  if (row.endDate >= today) {
    return c.json({ error: 'This pact hasn’t run its course yet.' }, 409);
  }

  await db
    .update(pacts)
    .set({ status: body.verdict, updatedAt: new Date() })
    .where(eq(pacts.id, row.id));
  return c.json({ ok: true });
});
