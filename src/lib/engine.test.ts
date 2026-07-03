import { describe, expect, it } from 'vitest';

import { daysAgoKey, todayKey, toKey, addDays, keyToDate } from '@/lib/dates';
import { reconcile } from '@/lib/engine';
import { isDueToday } from '@/lib/streaks';
import type { CheckIn, Pact } from '@/store/types';

const ME = 'usr_me';
const FRIEND = 'usr_friend';
const NAMES = new Map([
  [ME, 'me'],
  [FRIEND, 'anna'],
]);

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function pact(overrides: Partial<Pact>): Pact {
  return {
    id: 'pct_1',
    creatorUserId: ME,
    keeperUserId: FRIEND,
    title: 'Morning run',
    type: 'frequency',
    status: 'active',
    startDate: daysAgoKey(10),
    endDate: toKey(addDays(keyToDate(todayKey()), 20)),
    daysOfWeek: ALL_DAYS,
    isMutual: false,
    tintIndex: 0,
    ...overrides,
  };
}

function seal(pactId: string, date: string, progressValue?: number): CheckIn {
  return { id: `c-${pactId}-${date}`, pactId, userId: ME, date, status: 'completed', progressValue };
}

describe('reconcile — creator-only scoping', () => {
  it('fabricates NO misses (and no other consequence) for a kept pact with no local check-ins', () => {
    // I keep anna's pact; her check-ins live on her device, so mine holds none.
    const kept = pact({ creatorUserId: FRIEND, keeperUserId: ME });
    const result = reconcile(ME, [kept], [], NAMES);
    expect(result.newCheckIns).toEqual([]);
    expect(result.newNotifications).toEqual([]);
    expect(result.completions).toEqual([]);
    expect(result.settlements).toEqual([]);
  });

  it('stays silent for a kept goal pact at target and a kept expired frequency pact', () => {
    const keptGoal = pact({
      id: 'pct_g',
      creatorUserId: FRIEND,
      keeperUserId: ME,
      type: 'goal',
      daysOfWeek: undefined,
      goalTarget: 10,
      goalUnit: 'km',
    });
    const keptExpired = pact({
      id: 'pct_e',
      creatorUserId: FRIEND,
      keeperUserId: ME,
      startDate: daysAgoKey(30),
      endDate: daysAgoKey(2),
    });
    const result = reconcile(ME, [keptGoal, keptExpired], [seal('pct_g', daysAgoKey(1), 10)], NAMES);
    expect(result.completions).toEqual([]);
    expect(result.settlements).toEqual([]);
    expect(result.newCheckIns).toEqual([]);
    expect(result.newNotifications).toEqual([]);
  });

  it('still records misses for a pact I CREATED (the narrowing is a filter, not a kill switch)', () => {
    const mine = pact({ startDate: daysAgoKey(5) });
    const result = reconcile(ME, [mine], [], NAMES);
    expect(result.newCheckIns.length).toBeGreaterThan(0);
    for (const c of result.newCheckIns) {
      expect(c.status).toBe('failed');
      expect(c.userId).toBe(ME);
      expect(c.pactId).toBe('pct_1');
    }
    expect(result.newNotifications).toHaveLength(1);
    expect(result.newNotifications[0].type).toBe('pact_breach');
    // honest copy: no delivery promises
    expect(result.newNotifications[0].body).not.toMatch(/has been told|is stepping in/);
  });
});

describe('reconcile — durable transitions route to the interim endpoints', () => {
  it('reports a completion (not a local flip) when my goal pact reaches its target', () => {
    const goal = pact({ type: 'goal', daysOfWeek: undefined, goalTarget: 10, goalUnit: 'km' });
    const result = reconcile(ME, [goal], [seal('pct_1', daysAgoKey(1), 6), seal('pct_1', todayKey(), 4)], NAMES);
    expect(result.completions).toHaveLength(1);
    expect(result.completions[0].pactId).toBe('pct_1');
    expect(result.completions[0].notification.type).toBe('pact_completed');
    expect(result.settlements).toEqual([]);
  });

  it('reports no completion while the target is unmet', () => {
    const goal = pact({ type: 'goal', daysOfWeek: undefined, goalTarget: 10, goalUnit: 'km' });
    const result = reconcile(ME, [goal], [seal('pct_1', daysAgoKey(1), 6)], NAMES);
    expect(result.completions).toEqual([]);
  });

  it('settles my expired frequency pact: completed at ≥80% kept, incomplete below', () => {
    // 5-day pact that ended 2 days ago (outside any grace window), every day required.
    const start = daysAgoKey(6);
    const end = daysAgoKey(2);
    const expired = pact({ startDate: start, endDate: end });

    const allSealed = [2, 3, 4, 5, 6].map((n) => seal('pct_1', daysAgoKey(n)));
    const done = reconcile(ME, [expired], allSealed, NAMES);
    expect(done.settlements).toHaveLength(1);
    expect(done.settlements[0]).toMatchObject({ pactId: 'pct_1', verdict: 'completed' });
    expect(done.settlements[0].notification.type).toBe('pact_completed');

    const barelyAny = [seal('pct_1', daysAgoKey(6))];
    const failed = reconcile(ME, [expired], barelyAny, NAMES);
    expect(failed.settlements).toHaveLength(1);
    expect(failed.settlements[0].verdict).toBe('incomplete');
  });

  it('leaves an expired goal pact below target alone (no interim endpoint — cron slice)', () => {
    const expiredGoal = pact({
      type: 'goal',
      daysOfWeek: undefined,
      goalTarget: 10,
      goalUnit: 'km',
      startDate: daysAgoKey(30),
      endDate: daysAgoKey(2),
    });
    const result = reconcile(ME, [expiredGoal], [seal('pct_1', daysAgoKey(5), 3)], NAMES);
    expect(result.completions).toEqual([]);
    expect(result.settlements).toEqual([]);
  });

  it('skips non-active pacts entirely', () => {
    const cancelled = pact({ status: 'cancelled', startDate: daysAgoKey(10), endDate: daysAgoKey(2) });
    const result = reconcile(ME, [cancelled], [], NAMES);
    expect(result.newCheckIns).toEqual([]);
    expect(result.settlements).toEqual([]);
  });
});

describe('reconcile — Proposals accrue NOTHING while pending (ADR-0006)', () => {
  // The status filter guarantees it: pending is not active, so a proposal —
  // even one whose provisional dates lie days in the past by the time it is
  // answered — produces no misses, no breach notices, no settlement, and no
  // completion. Dates only start to matter once acceptance re-anchors them.

  it('records no misses and no settlement for my outgoing pending proposal with stale provisional dates', () => {
    const proposal = pact({
      status: 'pending',
      isMutual: true,
      mutualPactId: 'mut_1',
      startDate: daysAgoKey(20),
      endDate: daysAgoKey(2), // even "expired" provisional dates settle nothing
    });
    const result = reconcile(ME, [proposal], [], NAMES);
    expect(result.newCheckIns).toEqual([]);
    expect(result.newNotifications).toEqual([]);
    expect(result.completions).toEqual([]);
    expect(result.settlements).toEqual([]);
  });

  it('reports no completion for a pending goal proposal even at target', () => {
    const proposal = pact({
      status: 'pending',
      isMutual: true,
      mutualPactId: 'mut_1',
      type: 'goal',
      daysOfWeek: undefined,
      goalTarget: 5,
      goalUnit: 'km',
    });
    const result = reconcile(ME, [proposal], [seal('pct_1', daysAgoKey(1), 5)], NAMES);
    expect(result.completions).toEqual([]);
  });

  it('stays silent for an incoming pending proposal too (creator-only AND status filters both hold)', () => {
    const incoming = pact({
      status: 'pending',
      isMutual: true,
      mutualPactId: 'mut_1',
      creatorUserId: FRIEND,
      keeperUserId: ME,
      startDate: daysAgoKey(20),
    });
    const result = reconcile(ME, [incoming], [], NAMES);
    expect(result.newCheckIns).toEqual([]);
    expect(result.newNotifications).toEqual([]);
    expect(result.completions).toEqual([]);
    expect(result.settlements).toEqual([]);
  });

  it('is never due today: no seal is asked for while a proposal hangs pending', () => {
    // due-today requires an ACTIVE pact whose range covers today — a pending
    // row fails the status gate even when its provisional range covers today.
    const proposal = pact({ status: 'pending', isMutual: true, mutualPactId: 'mut_1' });
    expect(isDueToday(proposal)).toBe(false);
    expect(isDueToday(pact({}))).toBe(true); // the same terms, active, ARE due
  });
});
