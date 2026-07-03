import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { db } from '../db';
import { friendships, pacts, user } from '../db/schema';
import { addDaysToKey, todayInTimezone } from '../lib/dates';
import { api, asAnon, asUser, cleanupCreated, seedUser, trackFriendship, trackPact } from '../test/harness';

type UserRow = typeof user.$inferSelect;
type WirePact = {
  id: string;
  creatorUserId: string;
  keeperUserId: string;
  title: string;
  description: string | null;
  type: 'frequency' | 'goal';
  status: string;
  startDate: string;
  endDate: string;
  daysOfWeek: number[] | null;
  goalTarget: number | null;
  goalUnit: string | null;
  isMutual: boolean;
  mutualPactId: string | null;
  tintIndex: number;
};
type Profile = { id: string; username: string; email: string; timezone: string };
type ListBody = { pacts: WirePact[]; counterparts: Profile[] };

// ── Seed helpers ─────────────────────────────────────────────────────────────

/** Creator + keeper joined by a live accepted friendship. */
async function seedWitnesses(creatorOverrides: Partial<typeof user.$inferInsert> = {}) {
  const creator = await seedUser({ name: 'Creator', ...creatorOverrides });
  const keeper = await seedUser({ name: 'Keeper' });
  const [bond] = await db
    .insert(friendships)
    .values({ requesterId: creator.id, addresseeId: keeper.id, status: 'accepted' })
    .returning();
  trackFriendship(bond.id);
  return { creator, keeper, bond };
}

/** Insert a pact row directly (for preconditions the API refuses to author). */
async function seedPact(overrides: Partial<typeof pacts.$inferInsert> & { creatorUserId: string; keeperUserId: string }) {
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

const soloBody = (keeperUserId: string, extra: Record<string, unknown> = {}) => ({
  title: 'Morning run before work',
  type: 'frequency',
  daysOfWeek: [1, 2, 3, 4, 5],
  keeperUserId,
  durationDays: 30,
  tintIndex: 2,
  ...extra,
});

async function listAs(u: UserRow): Promise<ListBody> {
  asUser(u);
  const { status, json } = await api('/pacts');
  expect(status).toBe(200);
  return json<ListBody>();
}

/** Propose a mutual pact via the API (asserts 201) and track the pending row. */
async function propose(proposer: UserRow, partnerId: string, extra: Record<string, unknown> = {}): Promise<WirePact> {
  asUser(proposer);
  const { status, json } = await api('/pacts', {
    method: 'POST',
    body: soloBody(partnerId, { isMutual: true, ...extra }),
  });
  expect(status).toBe(201);
  const { pact } = await json<{ pact: WirePact }>();
  trackPact(pact.id);
  return pact;
}

/**
 * Accept a proposal as its Partner (asserts 200) and track the twin the
 * server materialized so cleanup can remove it.
 */
async function acceptAs(partner: UserRow, proposal: WirePact): Promise<WirePact> {
  asUser(partner);
  expect((await api(`/pacts/${proposal.id}/accept`, { method: 'POST' })).status).toBe(200);
  const twin = (await listAs(partner)).pacts.find(
    (p) => p.mutualPactId === proposal.mutualPactId && p.id !== proposal.id
  );
  expect(twin).toBeDefined();
  trackPact(twin!.id);
  return twin!;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('pact routes', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupCreated();
  });

  describe('POST /pacts — create guards', () => {
    it('creates a solo frequency pact with server-authored dates spanning exactly N due days', async () => {
      const { creator, keeper } = await seedWitnesses();
      asUser(creator);

      const { status, json } = await api('/pacts', { method: 'POST', body: soloBody(keeper.id) });
      expect(status).toBe(201);
      const { pact } = await json<{ pact: WirePact }>();
      trackPact(pact.id);

      expect(pact.creatorUserId).toBe(creator.id);
      expect(pact.keeperUserId).toBe(keeper.id);
      expect(pact.title).toBe('Morning run before work');
      expect(pact.type).toBe('frequency');
      expect(pact.status).toBe('active');
      expect(pact.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
      expect(pact.isMutual).toBe(false);
      expect(pact.mutualPactId).toBeNull();
      expect(pact.tintIndex).toBe(2);
      // Consistency, not exact dates (determinism lives in the lib/dates unit
      // tests): start is the creator's-timezone today, end = start + 30 − 1.
      expect(pact.startDate).toBe(todayInTimezone(creator.timezone ?? 'UTC'));
      expect(pact.endDate).toBe(addDaysToKey(pact.startDate, 29));
    });

    it('anchors the start date to the CREATOR’s stored IANA timezone', async () => {
      const { creator, keeper } = await seedWitnesses({ timezone: 'Pacific/Auckland' });
      asUser(creator);

      const { status, json } = await api('/pacts', { method: 'POST', body: soloBody(keeper.id) });
      expect(status).toBe(201);
      const { pact } = await json<{ pact: WirePact }>();
      trackPact(pact.id);
      expect(pact.startDate).toBe(todayInTimezone('Pacific/Auckland'));
    });

    it('creates a goal pact carrying target + unit and no weekdays', async () => {
      const { creator, keeper } = await seedWitnesses();
      asUser(creator);

      const { status, json } = await api('/pacts', {
        method: 'POST',
        body: {
          title: 'Read stack of books',
          type: 'goal',
          goalTarget: 12,
          goalUnit: 'books',
          keeperUserId: keeper.id,
          durationDays: 90,
        },
      });
      expect(status).toBe(201);
      const { pact } = await json<{ pact: WirePact }>();
      trackPact(pact.id);
      expect(pact.type).toBe('goal');
      expect(pact.goalTarget).toBe(12);
      expect(pact.goalUnit).toBe('books');
      expect(pact.daysOfWeek).toBeNull();
      expect(pact.endDate).toBe(addDaysToKey(pact.startDate, 89));
    });

    it('rejects a keeper who is not a live accepted friend (none, pending, removed, blocked)', async () => {
      const creator = await seedUser({ name: 'Creator' });
      const stranger = await seedUser({ name: 'Stranger' });
      asUser(creator);

      // no friendship at all
      expect((await api('/pacts', { method: 'POST', body: soloBody(stranger.id) })).status).toBe(400);

      // pending — asked but not yet accepted
      const pendingPal = await seedUser({ name: 'PendingPal' });
      const [pending] = await db
        .insert(friendships)
        .values({ requesterId: creator.id, addresseeId: pendingPal.id, status: 'pending' })
        .returning();
      trackFriendship(pending.id);
      expect((await api('/pacts', { method: 'POST', body: soloBody(pendingPal.id) })).status).toBe(400);

      // removed — the bond is a soft-deleted tombstone
      const removedPal = await seedUser({ name: 'RemovedPal' });
      const [removed] = await db
        .insert(friendships)
        .values({ requesterId: creator.id, addresseeId: removedPal.id, status: 'accepted', deletedAt: new Date() })
        .returning();
      trackFriendship(removed.id);
      expect((await api('/pacts', { method: 'POST', body: soloBody(removedPal.id) })).status).toBe(400);

      // blocked
      const blockedPal = await seedUser({ name: 'BlockedPal' });
      const [blocked] = await db
        .insert(friendships)
        .values({ requesterId: blockedPal.id, addresseeId: creator.id, status: 'blocked' })
        .returning();
      trackFriendship(blocked.id);
      expect((await api('/pacts', { method: 'POST', body: soloBody(blockedPal.id) })).status).toBe(400);

      expect((await listAs(creator)).pacts).toHaveLength(0);
    });

    it('rejects naming yourself keeper', async () => {
      const { creator } = await seedWitnesses();
      asUser(creator);
      const { status } = await api('/pacts', { method: 'POST', body: soloBody(creator.id) });
      expect(status).toBe(400);
    });

    it('mirrors the client validation: title, weekdays, goal fields, duration', async () => {
      const { creator, keeper } = await seedWitnesses();
      asUser(creator);

      const cases: Record<string, unknown>[] = [
        { title: 'Run' }, // < 5 chars
        { title: 'x'.repeat(101) },
        { daysOfWeek: [] }, // frequency with no days
        { daysOfWeek: [7] }, // out of range
        { type: 'goal', goalTarget: 0, goalUnit: 'km' },
        { type: 'goal', goalTarget: 12, goalUnit: '' },
        { type: 'goal', goalTarget: 12, goalUnit: 'x'.repeat(21) },
        { type: 'sprint' }, // unknown shape
        { durationDays: 0 },
        { durationDays: 366 },
        { durationDays: 30.5 },
        { isMutual: 'yes' }, // must be an actual boolean, never coerced
      ];
      for (const patch of cases) {
        const { status } = await api('/pacts', { method: 'POST', body: soloBody(keeper.id, patch) });
        expect(status, JSON.stringify(patch)).toBe(400);
      }
      expect((await listAs(creator)).pacts).toHaveLength(0);
    });

    it('returns 401 without a session', async () => {
      asAnon();
      expect((await api('/pacts', { method: 'POST', body: soloBody(randomUUID()) })).status).toBe(401);
    });
  });

  describe('GET /pacts — created + kept rows, profile sidecar', () => {
    it('returns pacts I created AND pacts I keep, with the counterpart profile for each', async () => {
      const { creator: me, keeper: anna } = await seedWitnesses();
      const bob = await seedUser({ name: 'Bob' });

      const mine = await seedPact({ creatorUserId: me.id, keeperUserId: anna.id, title: 'Mine, kept by Anna' });
      const kept = await seedPact({ creatorUserId: bob.id, keeperUserId: me.id, title: 'Bob’s, kept by me' });
      // unrelated pact — neither created by nor kept by me
      await seedPact({ creatorUserId: bob.id, keeperUserId: anna.id, title: 'None of my business' });

      const body = await listAs(me);
      const ids = body.pacts.map((p) => p.id);
      expect(ids).toContain(mine.id);
      expect(ids).toContain(kept.id);
      expect(ids).toHaveLength(2);

      // Flat rows carry real user ids — the client partitions by comparing them.
      const mineRow = body.pacts.find((p) => p.id === mine.id)!;
      expect(mineRow.creatorUserId).toBe(me.id);
      expect(mineRow.keeperUserId).toBe(anna.id);
      const keptRow = body.pacts.find((p) => p.id === kept.id)!;
      expect(keptRow.creatorUserId).toBe(bob.id);
      expect(keptRow.keeperUserId).toBe(me.id);

      // The sidecar holds each pact's counterpart, never me.
      const counterpartIds = body.counterparts.map((u) => u.id).sort();
      expect(counterpartIds).toEqual([anna.id, bob.id].sort());
      expect(body.counterparts.find((u) => u.id === bob.id)?.username).toBe('Bob');
    });

    it('excludes soft-deleted rows', async () => {
      const { creator: me, keeper } = await seedWitnesses();
      await seedPact({
        creatorUserId: me.id,
        keeperUserId: keeper.id,
        deletedAt: new Date(),
      });
      const body = await listAs(me);
      expect(body.pacts).toHaveLength(0);
      expect(body.counterparts).toHaveLength(0);
    });

    it('excludes declined tombstones for BOTH roles — a dead proposal reaches no client', async () => {
      const { creator: proposer, keeper: partner } = await seedWitnesses();
      await seedPact({
        creatorUserId: proposer.id,
        keeperUserId: partner.id,
        status: 'declined',
        isMutual: true,
        mutualPactId: randomUUID(),
      });
      expect((await listAs(proposer)).pacts).toHaveLength(0);
      expect((await listAs(partner)).pacts).toHaveLength(0);
    });

    it('shows an outsider nothing', async () => {
      const { creator, keeper } = await seedWitnesses();
      await seedPact({ creatorUserId: creator.id, keeperUserId: keeper.id });
      const outsider = await seedUser({ name: 'Outsider' });
      expect((await listAs(outsider)).pacts).toHaveLength(0);
    });

    it('returns 401 without a session', async () => {
      asAnon();
      expect((await api('/pacts')).status).toBe(401);
    });
  });

  describe('POST /pacts — proposing a mutual pact (ADR-0006)', () => {
    it('creates a Proposal: ONE pending row owned by the proposer, mutual link minted, provisional dates', async () => {
      const { creator: proposer, keeper: partner } = await seedWitnesses();
      const proposal = await propose(proposer, partner.id);

      expect(proposal.status).toBe('pending');
      expect(proposal.isMutual).toBe(true);
      expect(proposal.mutualPactId).not.toBeNull();
      expect(proposal.creatorUserId).toBe(proposer.id);
      expect(proposal.keeperUserId).toBe(partner.id);
      // Provisional dates, server-authored like any create: the proposer's
      // today + duration − 1. Acceptance re-anchors them.
      expect(proposal.startDate).toBe(todayInTimezone(proposer.timezone ?? 'UTC'));
      expect(proposal.endDate).toBe(addDaysToKey(proposal.startDate, 29));

      // The Partner's twin does NOT exist yet: each side sees exactly the one
      // pending row — the partner's list read IS the discovery mechanism.
      const mine = await listAs(proposer);
      expect(mine.pacts).toHaveLength(1);
      expect(mine.pacts[0].status).toBe('pending');
      const theirs = await listAs(partner);
      expect(theirs.pacts).toHaveLength(1);
      expect(theirs.pacts[0].id).toBe(proposal.id);
      expect(theirs.counterparts.map((u) => u.id)).toEqual([proposer.id]);
    });

    it('guards proposing like naming a keeper: a non-friend partner is rejected (400)', async () => {
      const proposer = await seedUser({ name: 'Proposer' });
      const stranger = await seedUser({ name: 'Stranger' });
      asUser(proposer);
      const { status } = await api('/pacts', {
        method: 'POST',
        body: soloBody(stranger.id, { isMutual: true }),
      });
      expect(status).toBe(400);
      expect((await listAs(proposer)).pacts).toHaveLength(0);
    });
  });

  describe('POST /pacts/:id/accept — consent materializes the twin', () => {
    it('transactionally inserts the Partner’s twin and flips both rows active: shared link, swapped roles, same terms', async () => {
      const { creator: proposer, keeper: partner } = await seedWitnesses();
      const proposal = await propose(proposer, partner.id, { description: 'Rain or shine' });
      const twin = await acceptAs(partner, proposal);

      expect(twin.creatorUserId).toBe(partner.id);
      expect(twin.keeperUserId).toBe(proposer.id);
      expect(twin.status).toBe('active');
      expect(twin.isMutual).toBe(true);
      expect(twin.mutualPactId).toBe(proposal.mutualPactId);
      expect(twin.title).toBe(proposal.title);
      expect(twin.description).toBe('Rain or shine');
      expect(twin.type).toBe(proposal.type);
      expect(twin.daysOfWeek).toEqual(proposal.daysOfWeek);
      expect(twin.tintIndex).toBe(proposal.tintIndex);

      // Both parties now see BOTH twins (creator of one, keeper of the other),
      // and the once-pending row is active for everyone.
      for (const party of [proposer, partner]) {
        const body = await listAs(party);
        expect(body.pacts).toHaveLength(2);
        expect(body.pacts.every((p) => p.status === 'active')).toBe(true);
        expect(new Set(body.pacts.map((p) => p.mutualPactId))).toEqual(
          new Set([proposal.mutualPactId])
        );
      }
    });

    it('re-anchors the dates to the ACCEPTER’s-timezone today, preserving the span from the provisional dates', async () => {
      const { creator: proposer, keeper: partner } = await seedWitnesses();
      // Make the partner's calendar day observably theirs, and age the
      // proposal so re-anchoring is distinguishable from "same today".
      await db.update(user).set({ timezone: 'Pacific/Auckland' }).where(eq(user.id, partner.id));
      const accepter = { ...partner, timezone: 'Pacific/Auckland' };

      const proposal = await propose(proposer, partner.id);
      const staleStart = addDaysToKey(proposal.startDate, -10);
      const staleEnd = addDaysToKey(staleStart, 29); // span preserved below: 30 due days
      await db
        .update(pacts)
        .set({ startDate: staleStart, endDate: staleEnd })
        .where(eq(pacts.id, proposal.id));

      const twin = await acceptAs(accepter, { ...proposal, startDate: staleStart, endDate: staleEnd });

      // The Partner never wakes up mid-pact: start = their today, end keeps
      // the 30-due-day span — and BOTH twins carry the re-anchored keys, so
      // the proposer starts fresh too (nothing accrued while pending).
      const expectedStart = todayInTimezone('Pacific/Auckland');
      expect(twin.startDate).toBe(expectedStart);
      expect(twin.endDate).toBe(addDaysToKey(expectedStart, 29));
      const reanchored = (await listAs(proposer)).pacts.find((p) => p.id === proposal.id)!;
      expect(reanchored.startDate).toBe(expectedStart);
      expect(reanchored.endDate).toBe(addDaysToKey(expectedStart, 29));
    });

    it('rejects an outsider and the PROPOSER alike (403): only the keeper of the pending row answers', async () => {
      const { creator: proposer, keeper: partner } = await seedWitnesses();
      const outsider = await seedUser({ name: 'Outsider' });
      const proposal = await propose(proposer, partner.id);

      asUser(proposer);
      expect((await api(`/pacts/${proposal.id}/accept`, { method: 'POST' })).status).toBe(403);
      asUser(outsider);
      expect((await api(`/pacts/${proposal.id}/accept`, { method: 'POST' })).status).toBe(403);

      expect((await listAs(partner)).pacts.find((p) => p.id === proposal.id)?.status).toBe('pending');
    });

    it('rejects a non-pending row (409), unknown or soft-deleted ids (404), anon (401)', async () => {
      const { creator, keeper } = await seedWitnesses();
      const active = await seedPact({ creatorUserId: creator.id, keeperUserId: keeper.id });

      asUser(keeper);
      expect((await api(`/pacts/${active.id}/accept`, { method: 'POST' })).status).toBe(409);
      expect((await api(`/pacts/${randomUUID()}/accept`, { method: 'POST' })).status).toBe(404);
      asAnon();
      expect((await api(`/pacts/${active.id}/accept`, { method: 'POST' })).status).toBe(401);
    });

    it('is refused while the pair is unfriended (409) and revives on re-add — no sweep, just the guard', async () => {
      const { creator: proposer, keeper: partner, bond } = await seedWitnesses();
      const proposal = await propose(proposer, partner.id);

      // Unfriend: the bond becomes a soft-deleted tombstone (ADR-0007 —
      // contracts stand, but consent needs a live bond at that moment).
      await db.update(friendships).set({ deletedAt: new Date() }).where(eq(friendships.id, bond.id));
      asUser(partner);
      expect((await api(`/pacts/${proposal.id}/accept`, { method: 'POST' })).status).toBe(409);
      // Still pending for both sides — refusal did not consume the proposal.
      expect((await listAs(partner)).pacts.find((p) => p.id === proposal.id)?.status).toBe('pending');

      // Re-add: a fresh live bond revives the same proposal.
      const [rebond] = await db
        .insert(friendships)
        .values({ requesterId: partner.id, addresseeId: proposer.id, status: 'accepted' })
        .returning();
      trackFriendship(rebond.id);
      await acceptAs(partner, proposal);
      expect((await listAs(proposer)).pacts.every((p) => p.status === 'active')).toBe(true);
    });
  });

  describe('POST /pacts/:id/decline — the invisible tombstone', () => {
    it('vanishes from both lists (no Archive holds it) yet stays on the books, and re-proposing is allowed', async () => {
      const { creator: proposer, keeper: partner } = await seedWitnesses();
      const proposal = await propose(proposer, partner.id);

      asUser(partner);
      expect((await api(`/pacts/${proposal.id}/decline`, { method: 'POST' })).status).toBe(200);

      expect((await listAs(proposer)).pacts).toHaveLength(0);
      expect((await listAs(partner)).pacts).toHaveLength(0);

      // The tombstone itself is invisible BY DESIGN, so its storage contract
      // (kept, not deleted — future re-proposal throttling reads it) is the
      // one assertion with no external surface: check the row directly.
      const [tombstone] = await db.select().from(pacts).where(eq(pacts.id, proposal.id));
      expect(tombstone.status).toBe('declined');
      expect(tombstone.deletedAt).toBeNull();

      // One "no" isn't forever: a fresh proposal for the same pair succeeds.
      const again = await propose(proposer, partner.id);
      expect(again.status).toBe('pending');
      expect(again.mutualPactId).not.toBe(proposal.mutualPactId);
      expect((await listAs(partner)).pacts.map((p) => p.id)).toEqual([again.id]);
    });

    it('rejects an outsider and the proposer (403), non-pending rows (409), unknown ids (404), anon (401)', async () => {
      const { creator: proposer, keeper: partner } = await seedWitnesses();
      const outsider = await seedUser({ name: 'Outsider' });
      const proposal = await propose(proposer, partner.id);
      const active = await seedPact({ creatorUserId: proposer.id, keeperUserId: partner.id });

      asUser(proposer);
      expect((await api(`/pacts/${proposal.id}/decline`, { method: 'POST' })).status).toBe(403);
      asUser(outsider);
      expect((await api(`/pacts/${proposal.id}/decline`, { method: 'POST' })).status).toBe(403);
      asUser(partner);
      expect((await api(`/pacts/${active.id}/decline`, { method: 'POST' })).status).toBe(409);
      expect((await api(`/pacts/${randomUUID()}/decline`, { method: 'POST' })).status).toBe(404);
      asAnon();
      expect((await api(`/pacts/${proposal.id}/decline`, { method: 'POST' })).status).toBe(401);

      expect((await listAs(partner)).pacts.find((p) => p.id === proposal.id)?.status).toBe('pending');
    });
  });

  describe('POST /pacts/:id/cancel — withdrawing a pending proposal', () => {
    it('the proposer withdraws: the proposal vanishes for both sides, leaving no visible record', async () => {
      const { creator: proposer, keeper: partner } = await seedWitnesses();
      const proposal = await propose(proposer, partner.id);

      asUser(proposer);
      expect((await api(`/pacts/${proposal.id}/cancel`, { method: 'POST' })).status).toBe(200);

      // Not "cancelled" in an Archive — GONE, for both parties: a contract
      // that never bound anyone leaves no record (soft-delete, not status).
      expect((await listAs(proposer)).pacts).toHaveLength(0);
      expect((await listAs(partner)).pacts).toHaveLength(0);

      // Withdrawn means answerable no more (a soft-deleted row 404s).
      asUser(partner);
      expect((await api(`/pacts/${proposal.id}/accept`, { method: 'POST' })).status).toBe(404);
    });

    it('the Partner (keeper of the pending row) cannot cancel someone else’s proposal (403)', async () => {
      const { creator: proposer, keeper: partner } = await seedWitnesses();
      const proposal = await propose(proposer, partner.id);

      asUser(partner);
      expect((await api(`/pacts/${proposal.id}/cancel`, { method: 'POST' })).status).toBe(403);
      expect((await listAs(proposer)).pacts.find((p) => p.id === proposal.id)?.status).toBe('pending');
    });
  });

  describe('cancel cascade — a mutual pact dies as one contract (ADR-0006)', () => {
    it('cancelling one active twin voids the other, for either partner', async () => {
      const { creator: proposer, keeper: partner } = await seedWitnesses();
      const proposal = await propose(proposer, partner.id);
      const twin = await acceptAs(partner, proposal);

      // The ACCEPTER cancels their twin: the proposer's twin voids with it.
      asUser(partner);
      expect((await api(`/pacts/${twin.id}/cancel`, { method: 'POST' })).status).toBe(200);

      for (const party of [proposer, partner]) {
        const body = await listAs(party);
        expect(body.pacts).toHaveLength(2);
        expect(body.pacts.every((p) => p.status === 'cancelled')).toBe(true);
      }
    });

    it('a twin that already completed survives its partner’s cancel', async () => {
      const { creator: anna, keeper: bo } = await seedWitnesses();
      const mutualPactId = randomUUID();
      const annas = await seedPact({
        creatorUserId: anna.id,
        keeperUserId: bo.id,
        isMutual: true,
        mutualPactId,
      });
      const bos = await seedPact({
        creatorUserId: bo.id,
        keeperUserId: anna.id,
        isMutual: true,
        mutualPactId,
        status: 'completed',
      });

      asUser(anna);
      expect((await api(`/pacts/${annas.id}/cancel`, { method: 'POST' })).status).toBe(200);

      const body = await listAs(anna);
      expect(body.pacts.find((p) => p.id === annas.id)?.status).toBe('cancelled');
      // A finished contract cannot be retroactively voided.
      expect(body.pacts.find((p) => p.id === bos.id)?.status).toBe('completed');
    });

    it('leaves unrelated pacts and solo pacts untouched by the cascade', async () => {
      const { creator, keeper } = await seedWitnesses();
      const solo = await seedPact({ creatorUserId: creator.id, keeperUserId: keeper.id });
      const bystander = await seedPact({ creatorUserId: creator.id, keeperUserId: keeper.id });

      asUser(creator);
      expect((await api(`/pacts/${solo.id}/cancel`, { method: 'POST' })).status).toBe(200);

      const body = await listAs(creator);
      expect(body.pacts.find((p) => p.id === solo.id)?.status).toBe('cancelled');
      expect(body.pacts.find((p) => p.id === bystander.id)?.status).toBe('active');
    });
  });

  describe('POST /pacts/:id/cancel — creator-only, irreversible', () => {
    it('cancels an active pact and the list reflects it for both parties', async () => {
      const { creator, keeper } = await seedWitnesses();
      const pact = await seedPact({ creatorUserId: creator.id, keeperUserId: keeper.id });

      asUser(creator);
      expect((await api(`/pacts/${pact.id}/cancel`, { method: 'POST' })).status).toBe(200);

      expect((await listAs(creator)).pacts.find((p) => p.id === pact.id)?.status).toBe('cancelled');
      expect((await listAs(keeper)).pacts.find((p) => p.id === pact.id)?.status).toBe('cancelled');
    });

    it('rejects the keeper and an outsider (403), leaving the pact active', async () => {
      const { creator, keeper } = await seedWitnesses();
      const outsider = await seedUser({ name: 'Outsider' });
      const pact = await seedPact({ creatorUserId: creator.id, keeperUserId: keeper.id });

      asUser(keeper);
      expect((await api(`/pacts/${pact.id}/cancel`, { method: 'POST' })).status).toBe(403);
      asUser(outsider);
      expect((await api(`/pacts/${pact.id}/cancel`, { method: 'POST' })).status).toBe(403);

      expect((await listAs(creator)).pacts.find((p) => p.id === pact.id)?.status).toBe('active');
    });

    it('is irreversible: a second cancel (or cancelling any settled pact) is 409', async () => {
      const { creator, keeper } = await seedWitnesses();
      const pact = await seedPact({ creatorUserId: creator.id, keeperUserId: keeper.id });

      asUser(creator);
      expect((await api(`/pacts/${pact.id}/cancel`, { method: 'POST' })).status).toBe(200);
      expect((await api(`/pacts/${pact.id}/cancel`, { method: 'POST' })).status).toBe(409);

      const completed = await seedPact({ creatorUserId: creator.id, keeperUserId: keeper.id, status: 'completed' });
      expect((await api(`/pacts/${completed.id}/cancel`, { method: 'POST' })).status).toBe(409);
    });

    it('returns 404 for an unknown or soft-deleted pact, 401 without a session', async () => {
      const { creator, keeper } = await seedWitnesses();
      asUser(creator);
      expect((await api(`/pacts/${randomUUID()}/cancel`, { method: 'POST' })).status).toBe(404);

      const gone = await seedPact({ creatorUserId: creator.id, keeperUserId: keeper.id, deletedAt: new Date() });
      expect((await api(`/pacts/${gone.id}/cancel`, { method: 'POST' })).status).toBe(404);

      asAnon();
      expect((await api(`/pacts/${gone.id}/cancel`, { method: 'POST' })).status).toBe(401);
    });
  });

  describe('POST /pacts/:id/complete — interim goal completion', () => {
    it('completes an active goal pact durably (a later list read still shows it)', async () => {
      const { creator, keeper } = await seedWitnesses();
      const pact = await seedPact({
        creatorUserId: creator.id,
        keeperUserId: keeper.id,
        type: 'goal',
        daysOfWeek: null,
        goalTarget: 12,
        goalUnit: 'books',
      });

      asUser(creator);
      expect((await api(`/pacts/${pact.id}/complete`, { method: 'POST' })).status).toBe(200);
      expect((await listAs(creator)).pacts.find((p) => p.id === pact.id)?.status).toBe('completed');
      expect((await listAs(keeper)).pacts.find((p) => p.id === pact.id)?.status).toBe('completed');
    });

    it('rejects the wrong caller (403 keeper/outsider) and the wrong shape (400 frequency)', async () => {
      const { creator, keeper } = await seedWitnesses();
      const goal = await seedPact({
        creatorUserId: creator.id,
        keeperUserId: keeper.id,
        type: 'goal',
        daysOfWeek: null,
        goalTarget: 5,
        goalUnit: 'km',
      });
      const frequency = await seedPact({ creatorUserId: creator.id, keeperUserId: keeper.id });

      asUser(keeper);
      expect((await api(`/pacts/${goal.id}/complete`, { method: 'POST' })).status).toBe(403);
      asUser(creator);
      expect((await api(`/pacts/${frequency.id}/complete`, { method: 'POST' })).status).toBe(400);

      expect((await listAs(creator)).pacts.every((p) => p.status === 'active')).toBe(true);
    });

    it('rejects the wrong status (409 once no longer active) and unknown ids (404)', async () => {
      const { creator, keeper } = await seedWitnesses();
      const done = await seedPact({
        creatorUserId: creator.id,
        keeperUserId: keeper.id,
        type: 'goal',
        daysOfWeek: null,
        goalTarget: 5,
        goalUnit: 'km',
        status: 'completed',
      });
      asUser(creator);
      expect((await api(`/pacts/${done.id}/complete`, { method: 'POST' })).status).toBe(409);
      expect((await api(`/pacts/${randomUUID()}/complete`, { method: 'POST' })).status).toBe(404);
      asAnon();
      expect((await api(`/pacts/${done.id}/complete`, { method: 'POST' })).status).toBe(401);
    });
  });

  describe('POST /pacts/:id/settle — interim end-of-term settlement', () => {
    const past = (daysBack: number) => addDaysToKey(todayInTimezone('UTC'), -daysBack);

    async function seedExpiredFrequency(creatorId: string, keeperId: string) {
      return seedPact({
        creatorUserId: creatorId,
        keeperUserId: keeperId,
        startDate: past(31),
        endDate: past(2),
      });
    }

    it('settles an expired frequency pact to the supplied verdict, durably', async () => {
      const { creator, keeper } = await seedWitnesses();
      const kept = await seedExpiredFrequency(creator.id, keeper.id);
      const broken = await seedExpiredFrequency(creator.id, keeper.id);

      asUser(creator);
      expect(
        (await api(`/pacts/${kept.id}/settle`, { method: 'POST', body: { verdict: 'completed' } })).status
      ).toBe(200);
      expect(
        (await api(`/pacts/${broken.id}/settle`, { method: 'POST', body: { verdict: 'incomplete' } })).status
      ).toBe(200);

      const body = await listAs(creator);
      expect(body.pacts.find((p) => p.id === kept.id)?.status).toBe('completed');
      expect(body.pacts.find((p) => p.id === broken.id)?.status).toBe('incomplete');
    });

    it('rejects a premature settle while the pact still has due days (409)', async () => {
      const { creator, keeper } = await seedWitnesses();
      // ends today: today is still a due day, so settling now is premature
      const endsToday = await seedPact({
        creatorUserId: creator.id,
        keeperUserId: keeper.id,
        startDate: past(29),
        endDate: todayInTimezone('UTC'),
      });
      const stillRunning = await seedPact({ creatorUserId: creator.id, keeperUserId: keeper.id });

      asUser(creator);
      for (const id of [endsToday.id, stillRunning.id]) {
        const { status } = await api(`/pacts/${id}/settle`, { method: 'POST', body: { verdict: 'completed' } });
        expect(status).toBe(409);
      }
      expect((await listAs(creator)).pacts.every((p) => p.status === 'active')).toBe(true);
    });

    it('rejects the wrong caller (403), wrong shape (400 goal), wrong status (409), bad verdict (400)', async () => {
      const { creator, keeper } = await seedWitnesses();
      const expired = await seedExpiredFrequency(creator.id, keeper.id);

      asUser(keeper);
      expect(
        (await api(`/pacts/${expired.id}/settle`, { method: 'POST', body: { verdict: 'completed' } })).status
      ).toBe(403);

      asUser(creator);
      const goal = await seedPact({
        creatorUserId: creator.id,
        keeperUserId: keeper.id,
        type: 'goal',
        daysOfWeek: null,
        goalTarget: 5,
        goalUnit: 'km',
        startDate: past(31),
        endDate: past(2),
      });
      expect(
        (await api(`/pacts/${goal.id}/settle`, { method: 'POST', body: { verdict: 'completed' } })).status
      ).toBe(400);

      expect(
        (await api(`/pacts/${expired.id}/settle`, { method: 'POST', body: { verdict: 'flawless' } })).status
      ).toBe(400);

      const cancelled = await seedPact({
        creatorUserId: creator.id,
        keeperUserId: keeper.id,
        startDate: past(31),
        endDate: past(2),
        status: 'cancelled',
      });
      expect(
        (await api(`/pacts/${cancelled.id}/settle`, { method: 'POST', body: { verdict: 'completed' } })).status
      ).toBe(409);

      expect(
        (await api(`/pacts/${randomUUID()}/settle`, { method: 'POST', body: { verdict: 'completed' } })).status
      ).toBe(404);

      asAnon();
      expect(
        (await api(`/pacts/${expired.id}/settle`, { method: 'POST', body: { verdict: 'completed' } })).status
      ).toBe(401);
    });
  });
});
