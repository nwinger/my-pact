import { randomUUID } from 'node:crypto';

import { and, eq, isNull, ne, or } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { auth } from '../auth';
import { db } from '../db';
import { friendships, pacts, user } from '../db/schema';
import { addDaysToKey, todayInTimezone } from '../lib/dates';
import { api, asAnon, asUser, cleanupCreated, seedUser, trackFriendship, trackPact } from '../test/harness';

type UserRow = typeof user.$inferSelect;
type SendBody = { result: 'not_found' | 'self' | 'duplicate' | 'sent' };
type FriendItem = {
  friendshipId: string;
  status: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    email: string;
    timezone: string;
    notificationTime: string;
    tintIndex: number;
  };
};
type Graph = { friends: FriendItem[]; incoming: FriendItem[]; outgoing: FriendItem[] };

// ── Pair helpers ─────────────────────────────────────────────────────────────

/** Live (non-declined, non-soft-deleted) friendship rows for an unordered pair. */
function livePairRows(a: string, b: string) {
  return db
    .select()
    .from(friendships)
    .where(
      and(
        or(
          and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
          and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a))
        ),
        ne(friendships.status, 'declined'),
        isNull(friendships.deletedAt)
      )
    );
}

/** Every friendship row for an unordered pair, regardless of status/soft-delete. */
function allPairRows(a: string, b: string) {
  return db
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
        and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a))
      )
    );
}

/** Read a single friendship row by id (regardless of status/soft-delete). */
async function rowById(id: string) {
  const [row] = await db.select().from(friendships).where(eq(friendships.id, id)).limit(1);
  return row;
}

/**
 * Resolve each request to a different user by its bearer token. The global
 * asUser() mock represents a single identity; concurrent cross-requests
 * (A→B and B→A at once) need the session resolved per request instead.
 */
function asUsersByToken(users: UserRow[]): void {
  const byToken = new Map<string, UserRow>(users.map((u) => [`test-token-${u.id}`, u]));
  vi.spyOn(auth.api, 'getSession').mockImplementation((async (opts: { headers: Headers }) => {
    const token = (opts.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const u = byToken.get(token);
    if (!u) return null;
    return {
      user: u,
      session: {
        id: `test-session-${u.id}`,
        userId: u.id,
        token,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    };
  }) as unknown as typeof auth.api.getSession);
}

const tokenFor = (u: UserRow) => `test-token-${u.id}`;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('friends routes', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupCreated();
  });

  describe('POST /friends/requests — result mapping', () => {
    it('returns not_found for an email that belongs to nobody', async () => {
      const me = await seedUser();
      asUser(me);
      const { status, json } = await api('/friends/requests', {
        method: 'POST',
        body: { email: `nobody-${randomUUID()}@example.test` },
      });
      expect(status).toBe(200);
      await expect(json<SendBody>().then((b) => b.result)).resolves.toBe('not_found');
    });

    it('returns self for the caller’s own email (and a case variant of it)', async () => {
      const me = await seedUser({ email: `Self-${randomUUID().slice(0, 8)}@Example.test` });
      asUser(me);

      const exact = await api('/friends/requests', { method: 'POST', body: { email: me.email } });
      await expect(exact.json<SendBody>().then((b) => b.result)).resolves.toBe('self');

      const variant = await api('/friends/requests', {
        method: 'POST',
        body: { email: me.email.toUpperCase() },
      });
      await expect(variant.json<SendBody>().then((b) => b.result)).resolves.toBe('self');
    });

    it('returns sent for a fresh request and writes exactly one pending row', async () => {
      const me = await seedUser();
      const target = await seedUser();
      asUser(me);

      const { status, json } = await api('/friends/requests', {
        method: 'POST',
        body: { email: target.email },
      });
      expect(status).toBe(200);
      await expect(json<SendBody>().then((b) => b.result)).resolves.toBe('sent');

      const rows = await livePairRows(me.id, target.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].requesterId).toBe(me.id);
      expect(rows[0].addresseeId).toBe(target.id);
      expect(rows[0].status).toBe('pending');
      trackFriendship(rows[0].id);
    });

    it('matches the target case-insensitively (seed Foo@Bar.com, request foo@bar.com)', async () => {
      const me = await seedUser();
      const target = await seedUser({ email: `Foo-${randomUUID().slice(0, 8)}@Bar.com` });
      asUser(me);

      const { json } = await api('/friends/requests', {
        method: 'POST',
        body: { email: target.email.toLowerCase() },
      });
      await expect(json<SendBody>().then((b) => b.result)).resolves.toBe('sent');

      const rows = await livePairRows(me.id, target.id);
      expect(rows).toHaveLength(1);
      trackFriendship(rows[0].id);
    });

    it('returns duplicate for a second request to the same target', async () => {
      const me = await seedUser();
      const target = await seedUser();
      asUser(me);

      const first = await api('/friends/requests', { method: 'POST', body: { email: target.email } });
      await expect(first.json<SendBody>().then((b) => b.result)).resolves.toBe('sent');

      const second = await api('/friends/requests', { method: 'POST', body: { email: target.email } });
      await expect(second.json<SendBody>().then((b) => b.result)).resolves.toBe('duplicate');

      expect(await livePairRows(me.id, target.id)).toHaveLength(1);
    });

    it('returns 400 when the email is missing or the wrong type', async () => {
      const me = await seedUser();
      asUser(me);

      const missing = await api('/friends/requests', { method: 'POST', body: {} });
      expect(missing.status).toBe(400);

      const wrongType = await api('/friends/requests', { method: 'POST', body: { email: 42 } });
      expect(wrongType.status).toBe(400);

      const blank = await api('/friends/requests', { method: 'POST', body: { email: '   ' } });
      expect(blank.status).toBe(400);
    });
  });

  describe('undirected-pair invariant (ADR 0002, against real Postgres)', () => {
    it('collapses a duplicate in EITHER direction to one live friendship', async () => {
      const a = await seedUser();
      const b = await seedUser();

      asUser(a);
      const forward = await api('/friends/requests', { method: 'POST', body: { email: b.email } });
      await expect(forward.json<SendBody>().then((r) => r.result)).resolves.toBe('sent');

      asUser(b);
      const reverse = await api('/friends/requests', { method: 'POST', body: { email: a.email } });
      await expect(reverse.json<SendBody>().then((r) => r.result)).resolves.toBe('duplicate');

      expect(await livePairRows(a.id, b.id)).toHaveLength(1);
    });

    it('allows a re-request after a decline (tombstone coexists with a fresh row)', async () => {
      const a = await seedUser();
      const b = await seedUser();

      asUser(a);
      const first = await api('/friends/requests', { method: 'POST', body: { email: b.email } });
      await expect(first.json<SendBody>().then((r) => r.result)).resolves.toBe('sent');

      const [pending] = await livePairRows(a.id, b.id);
      expect(pending).toBeDefined();
      await db.update(friendships).set({ status: 'declined' }).where(eq(friendships.id, pending.id));
      trackFriendship(pending.id);

      asUser(a);
      const second = await api('/friends/requests', { method: 'POST', body: { email: b.email } });
      await expect(second.json<SendBody>().then((r) => r.result)).resolves.toBe('sent');

      const live = await livePairRows(a.id, b.id);
      expect(live).toHaveLength(1);
      expect(live[0].id).not.toBe(pending.id);
      trackFriendship(live[0].id);

      // The declined tombstone and the new live row coexist.
      expect(await allPairRows(a.id, b.id)).toHaveLength(2);
    });

    it('collapses two CONCURRENT cross-requests to one (23505 → duplicate)', async () => {
      const a = await seedUser();
      const b = await seedUser();
      asUsersByToken([a, b]);

      const [ra, rb] = await Promise.all([
        api('/friends/requests', { method: 'POST', token: tokenFor(a), body: { email: b.email } }),
        api('/friends/requests', { method: 'POST', token: tokenFor(b), body: { email: a.email } }),
      ]);

      // Neither may 500: the unique-violation path must map to `duplicate`.
      expect(ra.status).toBe(200);
      expect(rb.status).toBe(200);

      const results = [
        (await ra.json<SendBody>()).result,
        (await rb.json<SendBody>()).result,
      ].sort();
      expect(results).toEqual(['duplicate', 'sent']);

      expect(await livePairRows(a.id, b.id)).toHaveLength(1);
    });
  });

  describe('GET /friends — orientation from the session user’s side', () => {
    it('partitions accepted/incoming/outgoing, carries the counterpart, excludes soft-deleted', async () => {
      const me = await seedUser({ name: 'Me' });
      const alice = await seedUser({ name: 'Alice' });
      const bob = await seedUser({ name: 'Bob' });
      const carol = await seedUser({ name: 'Carol' });
      const dave = await seedUser({ name: 'Dave' });

      const [accepted] = await db
        .insert(friendships)
        .values({ requesterId: me.id, addresseeId: alice.id, status: 'accepted' })
        .returning();
      const [incoming] = await db
        .insert(friendships)
        .values({ requesterId: bob.id, addresseeId: me.id, status: 'pending' })
        .returning();
      const [outgoing] = await db
        .insert(friendships)
        .values({ requesterId: me.id, addresseeId: carol.id, status: 'pending' })
        .returning();
      const [softDeleted] = await db
        .insert(friendships)
        .values({ requesterId: me.id, addresseeId: dave.id, status: 'accepted', deletedAt: new Date() })
        .returning();
      [accepted, incoming, outgoing, softDeleted].forEach((r) => trackFriendship(r.id));

      asUser(me);
      const { status, json } = await api('/friends');
      expect(status).toBe(200);
      const graph = await json<Graph>();

      expect(graph.friends).toHaveLength(1);
      expect(graph.friends[0].friendshipId).toBe(accepted.id);
      expect(graph.friends[0].status).toBe('accepted');
      expect(graph.friends[0].user.id).toBe(alice.id);
      expect(graph.friends[0].user.username).toBe('Alice');
      expect(graph.friends[0].user.email).toBe(alice.email);

      expect(graph.incoming).toHaveLength(1);
      expect(graph.incoming[0].friendshipId).toBe(incoming.id);
      expect(graph.incoming[0].status).toBe('pending');
      expect(graph.incoming[0].user.id).toBe(bob.id);

      expect(graph.outgoing).toHaveLength(1);
      expect(graph.outgoing[0].friendshipId).toBe(outgoing.id);
      expect(graph.outgoing[0].status).toBe('pending');
      expect(graph.outgoing[0].user.id).toBe(carol.id);

      const everyone = [...graph.friends, ...graph.incoming, ...graph.outgoing];
      // Every item carries the counterpart, never the caller.
      for (const item of everyone) expect(item.user.id).not.toBe(me.id);
      // The soft-deleted row is excluded entirely.
      expect(everyone.map((i) => i.user.id)).not.toContain(dave.id);
    });
  });

  describe('auth guard', () => {
    it('returns 401 for GET /friends without a session', async () => {
      asAnon();
      const { status } = await api('/friends');
      expect(status).toBe(401);
    });

    it('returns 401 for POST /friends/requests without a session', async () => {
      asAnon();
      const { status } = await api('/friends/requests', {
        method: 'POST',
        body: { email: 'someone@example.test' },
      });
      expect(status).toBe(401);
    });
  });

  // ── Issue #4: accept or decline an incoming request (become Witnesses) ──────
  describe('POST /friends/:id/accept & /decline — addressee-only', () => {
    /** Seed requester A + addressee B with a fresh pending A→B row. */
    async function seedPending() {
      const a = await seedUser({ name: 'Requester' });
      const b = await seedUser({ name: 'Addressee' });
      const [pending] = await db
        .insert(friendships)
        .values({ requesterId: a.id, addresseeId: b.id, status: 'pending' })
        .returning();
      trackFriendship(pending.id);
      return { a, b, pending };
    }

    it('accept turns the pending request into a mutual friendship', async () => {
      const { a, b, pending } = await seedPending();

      asUser(b);
      const accept = await api(`/friends/${pending.id}/accept`, { method: 'POST' });
      expect(accept.status).toBe(200);
      expect((await rowById(pending.id)).status).toBe('accepted');

      // Mutual: each participant sees the OTHER under `friends`, and the
      // request has left the incoming/outgoing buckets for both.
      asUser(a);
      const graphA = await (await api('/friends')).json<Graph>();
      expect(graphA.friends.map((f) => f.user.id)).toContain(b.id);
      expect(graphA.friends.find((f) => f.user.id === b.id)?.status).toBe('accepted');
      expect(graphA.incoming).toHaveLength(0);
      expect(graphA.outgoing).toHaveLength(0);

      asUser(b);
      const graphB = await (await api('/friends')).json<Graph>();
      expect(graphB.friends.map((f) => f.user.id)).toContain(a.id);
      expect(graphB.friends.find((f) => f.user.id === a.id)?.status).toBe('accepted');
      expect(graphB.incoming).toHaveLength(0);
    });

    it('decline lets the requester ask again (tombstone coexists with a fresh row)', async () => {
      const { a, b, pending } = await seedPending();

      asUser(b);
      const decline = await api(`/friends/${pending.id}/decline`, { method: 'POST' });
      expect(decline.status).toBe(200);
      expect((await rowById(pending.id)).status).toBe('declined');
      // A declined request never appears in either side's graph.
      const graphB = await (await api('/friends')).json<Graph>();
      expect(graphB.incoming).toHaveLength(0);

      asUser(a);
      const resend = await api('/friends/requests', { method: 'POST', body: { email: b.email } });
      await expect(resend.json<SendBody>().then((r) => r.result)).resolves.toBe('sent');

      const live = await livePairRows(a.id, b.id);
      expect(live).toHaveLength(1);
      expect(live[0].id).not.toBe(pending.id);
      trackFriendship(live[0].id);
      // Declined tombstone + fresh live row coexist.
      expect(await allPairRows(a.id, b.id)).toHaveLength(2);
    });

    it('rejects the requester answering their own request (403)', async () => {
      const { a, pending } = await seedPending();
      asUser(a);
      expect((await api(`/friends/${pending.id}/accept`, { method: 'POST' })).status).toBe(403);
      expect((await api(`/friends/${pending.id}/decline`, { method: 'POST' })).status).toBe(403);
      // The row is untouched.
      expect((await rowById(pending.id)).status).toBe('pending');
    });

    it('rejects an outsider (403)', async () => {
      const { pending } = await seedPending();
      const outsider = await seedUser({ name: 'Outsider' });
      asUser(outsider);
      expect((await api(`/friends/${pending.id}/accept`, { method: 'POST' })).status).toBe(403);
      expect((await api(`/friends/${pending.id}/decline`, { method: 'POST' })).status).toBe(403);
      expect((await rowById(pending.id)).status).toBe('pending');
    });

    it('returns 404 for an unknown or soft-deleted friendship', async () => {
      const a = await seedUser();
      const b = await seedUser();
      asUser(b);

      const unknown = randomUUID();
      expect((await api(`/friends/${unknown}/accept`, { method: 'POST' })).status).toBe(404);
      expect((await api(`/friends/${unknown}/decline`, { method: 'POST' })).status).toBe(404);

      const [gone] = await db
        .insert(friendships)
        .values({ requesterId: a.id, addresseeId: b.id, status: 'pending', deletedAt: new Date() })
        .returning();
      trackFriendship(gone.id);
      expect((await api(`/friends/${gone.id}/accept`, { method: 'POST' })).status).toBe(404);
      expect((await api(`/friends/${gone.id}/decline`, { method: 'POST' })).status).toBe(404);
    });

    it('returns 404 once the request is no longer pending (already answered)', async () => {
      const { b, pending } = await seedPending();
      asUser(b);
      // The addressee answers it once…
      expect((await api(`/friends/${pending.id}/accept`, { method: 'POST' })).status).toBe(200);
      // …so there is no longer a pending request to accept or decline. This also
      // stops a declined tombstone from being resurrected into a duplicate bond.
      expect((await api(`/friends/${pending.id}/accept`, { method: 'POST' })).status).toBe(404);
      expect((await api(`/friends/${pending.id}/decline`, { method: 'POST' })).status).toBe(404);
      // The already-accepted bond is untouched by the rejected calls.
      expect((await rowById(pending.id)).status).toBe('accepted');
    });

    it('returns 401 without a session', async () => {
      asAnon();
      const id = randomUUID();
      expect((await api(`/friends/${id}/accept`, { method: 'POST' })).status).toBe(401);
      expect((await api(`/friends/${id}/decline`, { method: 'POST' })).status).toBe(401);
    });
  });

  // ── Issue #5: block or remove a bond, and re-add later ──────────────────────
  describe('POST /friends/:id/block & DELETE /friends/:id — participant-only', () => {
    /** Seed an accepted A↔B bond (requester A, addressee B). */
    async function seedAccepted() {
      const a = await seedUser({ name: 'A' });
      const b = await seedUser({ name: 'B' });
      const [bond] = await db
        .insert(friendships)
        .values({ requesterId: a.id, addresseeId: b.id, status: 'accepted' })
        .returning();
      trackFriendship(bond.id);
      return { a, b, bond };
    }

    it('remove soft-deletes the bond and hides it from both sides', async () => {
      const { a, b, bond } = await seedAccepted();

      asUser(a);
      const del = await api(`/friends/${bond.id}`, { method: 'DELETE' });
      expect(del.status).toBe(200);

      const row = await rowById(bond.id);
      expect(row.deletedAt).not.toBeNull();

      asUser(a);
      const graphA = await (await api('/friends')).json<Graph>();
      expect(graphA.friends.map((f) => f.user.id)).not.toContain(b.id);

      asUser(b);
      const graphB = await (await api('/friends')).json<Graph>();
      expect(graphB.friends.map((f) => f.user.id)).not.toContain(a.id);
    });

    it('a removed friend can be re-added — a new live row joins the tombstone', async () => {
      const { a, b, bond } = await seedAccepted();

      asUser(a);
      expect((await api(`/friends/${bond.id}`, { method: 'DELETE' })).status).toBe(200);

      const resend = await api('/friends/requests', { method: 'POST', body: { email: b.email } });
      await expect(resend.json<SendBody>().then((r) => r.result)).resolves.toBe('sent');

      const live = await livePairRows(a.id, b.id);
      expect(live).toHaveLength(1);
      expect(live[0].id).not.toBe(bond.id);
      trackFriendship(live[0].id);

      // Two rows for the pair: the soft-deleted tombstone and the fresh live one.
      const all = await allPairRows(a.id, b.id);
      expect(all).toHaveLength(2);
      expect(all.filter((r) => r.deletedAt !== null)).toHaveLength(1);
      expect(all.filter((r) => r.deletedAt === null)).toHaveLength(1);
    });

    it('block hides the bond and prevents further requests for the pair', async () => {
      const { a, b, bond } = await seedAccepted();

      asUser(b);
      const blocked = await api(`/friends/${bond.id}/block`, { method: 'POST' });
      expect(blocked.status).toBe(200);
      expect((await rowById(bond.id)).status).toBe('blocked');

      asUser(a);
      const graphA = await (await api('/friends')).json<Graph>();
      expect(graphA.friends.map((f) => f.user.id)).not.toContain(b.id);

      // A blocked row is live + non-declined, so the pair index rejects a re-request.
      const resend = await api('/friends/requests', { method: 'POST', body: { email: b.email } });
      await expect(resend.json<SendBody>().then((r) => r.result)).resolves.toBe('duplicate');
    });

    it('rejects block and remove by an outsider (403), leaving the bond intact', async () => {
      const { bond } = await seedAccepted();
      const outsider = await seedUser({ name: 'Outsider' });
      asUser(outsider);
      expect((await api(`/friends/${bond.id}/block`, { method: 'POST' })).status).toBe(403);
      expect((await api(`/friends/${bond.id}`, { method: 'DELETE' })).status).toBe(403);

      const row = await rowById(bond.id);
      expect(row.status).toBe('accepted');
      expect(row.deletedAt).toBeNull();
    });

    it('returns 404 for an unknown id, and for removing an already-removed bond', async () => {
      const { a, bond } = await seedAccepted();
      asUser(a);

      const unknown = randomUUID();
      expect((await api(`/friends/${unknown}/block`, { method: 'POST' })).status).toBe(404);
      expect((await api(`/friends/${unknown}`, { method: 'DELETE' })).status).toBe(404);

      expect((await api(`/friends/${bond.id}`, { method: 'DELETE' })).status).toBe(200);
      // The tombstone is no longer actionable.
      expect((await api(`/friends/${bond.id}`, { method: 'DELETE' })).status).toBe(404);
      expect((await api(`/friends/${bond.id}/block`, { method: 'POST' })).status).toBe(404);
    });

    it('returns 401 without a session', async () => {
      asAnon();
      const id = randomUUID();
      expect((await api(`/friends/${id}/block`, { method: 'POST' })).status).toBe(401);
      expect((await api(`/friends/${id}`, { method: 'DELETE' })).status).toBe(401);
    });
  });

  // ── Issue #13: block severs contracts between the pair, remove leaves them ──
  describe('block severance & remove neutrality — pacts between the pair (ADR-0007)', () => {
    /** Anna and Bo, joined by a live accepted bond, ready to carry pacts. */
    async function seedBondedPair() {
      const a = await seedUser({ name: 'Anna' });
      const b = await seedUser({ name: 'Bo' });
      const [bond] = await db
        .insert(friendships)
        .values({ requesterId: a.id, addresseeId: b.id, status: 'accepted' })
        .returning();
      trackFriendship(bond.id);
      return { a, b, bond };
    }

    /** Insert a pact row directly (for preconditions the API refuses to author). */
    async function seedPact(
      overrides: Partial<typeof pacts.$inferInsert> & { creatorUserId: string; keeperUserId: string }
    ) {
      const today = todayInTimezone('UTC');
      const [row] = await db
        .insert(pacts)
        .values({
          title: 'Seeded pact for tests',
          type: 'frequency',
          status: 'active',
          startDate: today,
          endDate: addDaysToKey(today, 29),
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          isMutual: false,
          tintIndex: 0,
          ...overrides,
        })
        .returning();
      trackPact(row.id);
      return row;
    }

    /** Two linked twins of one mutual pact between the pair (a creates one, b the other). */
    async function seedTwins(a: UserRow, b: UserRow, statusOfBs: 'active' | 'completed' = 'active') {
      const mutualPactId = randomUUID();
      const twinA = await seedPact({ creatorUserId: a.id, keeperUserId: b.id, isMutual: true, mutualPactId });
      const twinB = await seedPact({
        creatorUserId: b.id,
        keeperUserId: a.id,
        isMutual: true,
        mutualPactId,
        status: statusOfBs,
      });
      return { twinA, twinB };
    }

    /** A pending Proposal from `proposer` to `partner` (ADR-0006: one pending mutual row). */
    function seedProposal(proposerId: string, partnerId: string) {
      return seedPact({
        creatorUserId: proposerId,
        keeperUserId: partnerId,
        status: 'pending',
        isMutual: true,
        mutualPactId: randomUUID(),
      });
    }

    type PactItem = { id: string; creatorUserId: string; keeperUserId: string; status: string };

    /** GET /pacts as `u` (asserts 200) — the list read both users' shelves derive from. */
    async function pactsAs(u: UserRow): Promise<PactItem[]> {
      asUser(u);
      const { status, json } = await api('/pacts');
      expect(status).toBe(200);
      return (await json<{ pacts: PactItem[] }>()).pacts;
    }

    const statusOf = (list: PactItem[], id: string) => list.find((p) => p.id === id)?.status;

    it('block cancels the blocker’s solo pact kept by the blocked user', async () => {
      const { a, b, bond } = await seedBondedPair();
      const solo = await seedPact({ creatorUserId: a.id, keeperUserId: b.id });

      asUser(a);
      expect((await api(`/friends/${bond.id}/block`, { method: 'POST' })).status).toBe(200);

      // Cancelled for both parties: off the shelf, into the creator's Archive.
      expect(statusOf(await pactsAs(a), solo.id)).toBe('cancelled');
      expect(statusOf(await pactsAs(b), solo.id)).toBe('cancelled');
    });

    it('block cancels the blocked user’s solo pact when the blocker was merely its keeper (accepted collateral)', async () => {
      const { a, b, bond } = await seedBondedPair();
      const bosSolo = await seedPact({ creatorUserId: b.id, keeperUserId: a.id });

      asUser(a);
      expect((await api(`/friends/${bond.id}/block`, { method: 'POST' })).status).toBe(200);

      // Deliberate per ADR-0007, not a bug: Bo's pact dies through no act of
      // Bo's — a live accountability contract is contact, and Anna ended it.
      expect(statusOf(await pactsAs(b), bosSolo.id)).toBe('cancelled');
    });

    it('block voids both active mutual twins, whichever participant blocks', async () => {
      const { a, b, bond } = await seedBondedPair();
      const { twinA, twinB } = await seedTwins(a, b);

      asUser(b); // the addressee blocks — severance is pair-based, not role-based
      expect((await api(`/friends/${bond.id}/block`, { method: 'POST' })).status).toBe(200);

      for (const party of [a, b]) {
        const list = await pactsAs(party);
        expect(statusOf(list, twinA.id)).toBe('cancelled');
        expect(statusOf(list, twinB.id)).toBe('cancelled');
      }
    });

    it('a twin that already completed stays completed through its partner’s block-driven cancel', async () => {
      const { a, b, bond } = await seedBondedPair();
      const { twinA, twinB } = await seedTwins(a, b, 'completed');

      asUser(a);
      expect((await api(`/friends/${bond.id}/block`, { method: 'POST' })).status).toBe(200);

      const list = await pactsAs(b);
      expect(statusOf(list, twinA.id)).toBe('cancelled');
      // A finished contract cannot be retroactively voided — not even by a block.
      expect(statusOf(list, twinB.id)).toBe('completed');
    });

    it('block declines pending Proposals in BOTH directions — invisible to both sides, kept on the books', async () => {
      const { a, b, bond } = await seedBondedPair();
      const annasProposal = await seedProposal(a.id, b.id);
      const bosProposal = await seedProposal(b.id, a.id);

      asUser(a);
      expect((await api(`/friends/${bond.id}/block`, { method: 'POST' })).status).toBe(200);

      // Declined tombstones reach no client: gone from both lists entirely.
      for (const party of [a, b]) {
        const ids = (await pactsAs(party)).map((p) => p.id);
        expect(ids).not.toContain(annasProposal.id);
        expect(ids).not.toContain(bosProposal.id);
      }
      // The storage contract has no external surface (invisible BY DESIGN):
      // declined, not deleted — future re-proposal throttling reads it.
      for (const id of [annasProposal.id, bosProposal.id]) {
        const [tombstone] = await db.select().from(pacts).where(eq(pacts.id, id));
        expect(tombstone.status).toBe('declined');
        expect(tombstone.deletedAt).toBeNull();
      }
    });

    it('block leaves both users’ contracts with third parties untouched', async () => {
      const { a, b, bond } = await seedBondedPair();
      const clara = await seedUser({ name: 'Clara' });
      const annasWithClara = await seedPact({ creatorUserId: a.id, keeperUserId: clara.id });
      const bosKeptByClara = await seedPact({ creatorUserId: clara.id, keeperUserId: b.id });
      const bosProposalToClara = await seedProposal(b.id, clara.id);

      asUser(a);
      expect((await api(`/friends/${bond.id}/block`, { method: 'POST' })).status).toBe(200);

      expect(statusOf(await pactsAs(a), annasWithClara.id)).toBe('active');
      const bosList = await pactsAs(b);
      expect(statusOf(bosList, bosKeptByClara.id)).toBe('active');
      expect(statusOf(bosList, bosProposalToClara.id)).toBe('pending');
    });

    it('severance is atomic with the block itself: a failed block leaves nothing half-severed', async () => {
      // A declined tombstone AND a fresh live bond coexist for the pair
      // (the pair index excludes declined rows). Blocking the TOMBSTONE
      // flips it non-declined, colliding with the live bond — the one
      // constructible failure, raised by the LAST statement of the block
      // transaction, after the severance writes. 409 must roll them back.
      const { a, b } = await seedBondedPair();
      const [tombstone] = await db
        .insert(friendships)
        .values({ requesterId: b.id, addresseeId: a.id, status: 'declined' })
        .returning();
      trackFriendship(tombstone.id);
      const solo = await seedPact({ creatorUserId: a.id, keeperUserId: b.id });
      const proposal = await seedProposal(a.id, b.id);

      asUser(a);
      expect((await api(`/friends/${tombstone.id}/block`, { method: 'POST' })).status).toBe(409);

      const list = await pactsAs(a);
      expect(statusOf(list, solo.id)).toBe('active');
      expect(statusOf(list, proposal.id)).toBe('pending');
      expect((await rowById(tombstone.id)).status).toBe('declined');
    });

    it('after a block, neither side’s next list read holds any live contract between the pair', async () => {
      const { a, b, bond } = await seedBondedPair();
      // The full severance matrix at once: solo each way, twins, proposals each way.
      await seedPact({ creatorUserId: a.id, keeperUserId: b.id });
      await seedPact({ creatorUserId: b.id, keeperUserId: a.id });
      await seedTwins(a, b);
      await seedProposal(a.id, b.id);
      await seedProposal(b.id, a.id);

      asUser(a);
      expect((await api(`/friends/${bond.id}/block`, { method: 'POST' })).status).toBe(200);

      for (const [party, counterpart] of [
        [a, b],
        [b, a],
      ] as const) {
        const betweenPair = (await pactsAs(party)).filter(
          (p) => p.creatorUserId === counterpart.id || p.keeperUserId === counterpart.id
        );
        // The four once-active contracts survive as Archive rows; nothing is
        // live (active or pending), and the declined proposals are gone.
        expect(betweenPair).toHaveLength(4);
        expect(betweenPair.every((p) => p.status === 'cancelled')).toBe(true);
      }
    });

    it('remove (unfriend) leaves active pacts, keeper read access, and pending Proposals untouched', async () => {
      const { a, b, bond } = await seedBondedPair();
      const solo = await seedPact({ creatorUserId: a.id, keeperUserId: b.id });
      const { twinA, twinB } = await seedTwins(a, b);
      const proposal = await seedProposal(a.id, b.id);

      asUser(a);
      expect((await api(`/friends/${bond.id}`, { method: 'DELETE' })).status).toBe(200);

      // Housekeeping, not severance: every contract stands, at its own status —
      // including for Bo, whose keeper read access outlives the friendship.
      for (const party of [a, b]) {
        const list = await pactsAs(party);
        expect(statusOf(list, solo.id)).toBe('active');
        expect(statusOf(list, twinA.id)).toBe('active');
        expect(statusOf(list, twinB.id)).toBe('active');
        expect(statusOf(list, proposal.id)).toBe('pending');
      }

      // The pending Proposal survives but is unacceptable while unfriended —
      // the accept route's commitment-time guard is the whole mechanism (no
      // sweep code); re-adding revives it (covered by the pacts route tests).
      asUser(b);
      expect((await api(`/pacts/${proposal.id}/accept`, { method: 'POST' })).status).toBe(409);
    });
  });
});
