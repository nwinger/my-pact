import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import type { AppEnv } from '../context';
import { db } from '../db';
import { friendships, user } from '../db/schema';
import { profile } from './shared';

export const friends = new Hono<AppEnv>();

/** Result of a send-request attempt, mirrored by the client's FriendRequestResult. */
type SendResult = 'not_found' | 'self' | 'duplicate' | 'sent';

/**
 * postgres-js raises a unique-violation as an error with SQLSTATE 23505, but
 * drizzle wraps it in a DrizzleQueryError whose `.cause` is the original — so
 * walk the cause chain rather than reading `.code` off the top-level error.
 */
function isUniqueViolation(e: unknown): boolean {
  let err: unknown = e;
  for (let depth = 0; depth < 5 && err != null; depth++) {
    if (typeof err === 'object' && (err as { code?: unknown }).code === '23505') return true;
    err = (err as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * GET /friends — the caller's social graph, oriented from their point of view.
 * Every live (non-soft-deleted) friendship touching the caller is loaded, then
 * partitioned by status and the caller's side of the row:
 *   accepted                     -> friends
 *   pending, caller is addressee -> incoming
 *   pending, caller is requester -> outgoing
 *   declined / blocked           -> excluded
 * Each item carries the *counterpart* profile (never the caller's own).
 */
friends.get('/', async (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);

  const rows = await db
    .select()
    .from(friendships)
    .where(
      and(
        or(eq(friendships.requesterId, me.id), eq(friendships.addresseeId, me.id)),
        isNull(friendships.deletedAt)
      )
    );

  // Fetch the counterpart profiles in one round-trip.
  const counterpartIds = [
    ...new Set(rows.map((f) => (f.requesterId === me.id ? f.addresseeId : f.requesterId))),
  ];
  const counterpartRows = counterpartIds.length
    ? await db.select().from(user).where(inArray(user.id, counterpartIds))
    : [];
  const byId = new Map(counterpartRows.map((u) => [u.id, u]));

  type Item = {
    friendshipId: string;
    status: (typeof rows)[number]['status'];
    createdAt: Date;
    user: ReturnType<typeof profile>;
  };
  const friendsList: Item[] = [];
  const incoming: Item[] = [];
  const outgoing: Item[] = [];

  for (const f of rows) {
    const counterpartId = f.requesterId === me.id ? f.addresseeId : f.requesterId;
    const counterpart = byId.get(counterpartId);
    // FK guarantees the row exists; skip defensively rather than 500.
    if (!counterpart) continue;
    const item: Item = {
      friendshipId: f.id,
      status: f.status,
      createdAt: f.createdAt,
      user: profile(counterpart),
    };
    if (f.status === 'accepted') friendsList.push(item);
    else if (f.status === 'pending' && f.addresseeId === me.id) incoming.push(item);
    else if (f.status === 'pending' && f.requesterId === me.id) outgoing.push(item);
    // declined / blocked are intentionally dropped
  }

  return c.json({ friends: friendsList, incoming, outgoing });
});

/**
 * POST /friends/requests — send a friend request to a user by email.
 * Returns `{ result }`, one of not_found | self | duplicate | sent. The
 * unordered-pair unique index (ADR 0002) is the source of truth for duplicates:
 * the app-level pre-check is an optimisation, and a concurrent insert that slips
 * past it is caught as a 23505 and mapped to `duplicate` rather than a 500.
 */
friends.post('/requests', async (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);

  let body: { email?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'A valid JSON body with an email is required.' }, 400);
  }

  const raw = body.email;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return c.json({ error: 'An email is required.' }, 400);
  }
  const email = raw.trim();

  // Guard self before touching the DB (case-insensitive).
  if (email.toLowerCase() === me.email.toLowerCase()) {
    return c.json({ result: 'self' satisfies SendResult });
  }

  const [target] = await db
    .select()
    .from(user)
    .where(sql`lower(${user.email}) = ${email.toLowerCase()}`)
    .limit(1);

  if (!target) return c.json({ result: 'not_found' satisfies SendResult });
  if (target.id === me.id) return c.json({ result: 'self' satisfies SendResult });

  // Pre-check: any live friendship for the unordered pair, either direction.
  const [existing] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      and(
        or(
          and(eq(friendships.requesterId, me.id), eq(friendships.addresseeId, target.id)),
          and(eq(friendships.requesterId, target.id), eq(friendships.addresseeId, me.id))
        ),
        ne(friendships.status, 'declined'),
        isNull(friendships.deletedAt)
      )
    )
    .limit(1);

  if (existing) return c.json({ result: 'duplicate' satisfies SendResult });

  try {
    await db.insert(friendships).values({
      requesterId: me.id,
      addresseeId: target.id,
      status: 'pending',
    });
  } catch (e) {
    // Lost the race: the pair index rejected the second insert.
    if (isUniqueViolation(e)) return c.json({ result: 'duplicate' satisfies SendResult });
    throw e;
  }

  return c.json({ result: 'sent' satisfies SendResult });
});

/**
 * Load a single friendship by id, or null when it is missing or has been
 * soft-deleted (`deletedAt` set). Both cases map to 404 on the mutation routes:
 * a removed bond is a tombstone the caller can no longer act on.
 */
async function loadLiveFriendship(id: string) {
  const [row] = await db.select().from(friendships).where(eq(friendships.id, id)).limit(1);
  if (!row || row.deletedAt) return null;
  return row;
}

/** True when the caller is one of the two users the friendship connects. */
function isParticipant(row: { requesterId: string; addresseeId: string }, meId: string): boolean {
  return row.requesterId === meId || row.addresseeId === meId;
}

/**
 * POST /friends/:id/accept — ADDRESSEE-ONLY. Only the user who *received* a
 * pending request can answer it: the requester answering their own request, or
 * an outsider, is 403; a missing or soft-deleted row is 404. Marks the bond
 * accepted so both sides become mutual Witnesses (GET /friends surfaces the
 * counterpart for each participant).
 */
friends.post('/:id/accept', async (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);

  const row = await loadLiveFriendship(c.req.param('id'));
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (row.addresseeId !== me.id) return c.json({ error: 'Forbidden' }, 403);
  // Only a *pending* request can be answered (the spec transition is
  // pending -> accepted). Refusing other states also stops a declined tombstone
  // from being resurrected into a second live bond, which would collide with the
  // ADR-0002 pair index.
  if (row.status !== 'pending') return c.json({ error: 'Not found' }, 404);

  await db
    .update(friendships)
    .set({ status: 'accepted', updatedAt: new Date() })
    .where(eq(friendships.id, row.id));
  return c.json({ ok: true });
});

/**
 * POST /friends/:id/decline — ADDRESSEE-ONLY (same guard as accept). Marks the
 * bond declined. The ADR-0002 pair index excludes declined rows, so the
 * requester may send a fresh request later (the declined row stays as a
 * tombstone alongside the new live one).
 */
friends.post('/:id/decline', async (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);

  const row = await loadLiveFriendship(c.req.param('id'));
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (row.addresseeId !== me.id) return c.json({ error: 'Forbidden' }, 403);
  // Same as accept: only a pending request can be declined.
  if (row.status !== 'pending') return c.json({ error: 'Not found' }, 404);

  await db
    .update(friendships)
    .set({ status: 'declined', updatedAt: new Date() })
    .where(eq(friendships.id, row.id));
  return c.json({ ok: true });
});

/**
 * POST /friends/:id/block — PARTICIPANT-ONLY. Either side may block the bond
 * (an outsider is 403, missing/soft-deleted is 404). A blocked row stays live
 * and non-declined, so it is still covered by the pair index: it hides the bond
 * from GET /friends and blocks any further request for the pair.
 */
friends.post('/:id/block', async (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);

  const row = await loadLiveFriendship(c.req.param('id'));
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!isParticipant(row, me.id)) return c.json({ error: 'Forbidden' }, 403);

  try {
    await db
      .update(friendships)
      .set({ status: 'blocked', updatedAt: new Date() })
      .where(eq(friendships.id, row.id));
  } catch (e) {
    // Blocking a declined tombstone while a fresh live bond already exists for
    // the pair would make two rows collide on the ADR-0002 pair index; report
    // the conflict rather than surfacing a 500.
    if (isUniqueViolation(e)) return c.json({ error: 'A live bond already exists for this pair.' }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

/**
 * DELETE /friends/:id — PARTICIPANT-ONLY. Soft-delete: stamp `deletedAt` so the
 * bond vanishes from GET /friends for both sides. An outsider is 403; a missing
 * or already soft-deleted row is 404. Because the pair index ignores
 * soft-deleted rows, either user may re-add the other afterwards — a fresh live
 * row is created next to this tombstone (ADR-0002).
 */
friends.delete('/:id', async (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);

  const row = await loadLiveFriendship(c.req.param('id'));
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!isParticipant(row, me.id)) return c.json({ error: 'Forbidden' }, 403);

  const now = new Date();
  await db
    .update(friendships)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(friendships.id, row.id));
  return c.json({ ok: true });
});
