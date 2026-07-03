import { describe, expect, it } from 'vitest';

import type { ApiProfile } from '@/lib/api';
import { apiPactToPact, normalizePacts, type ApiPact } from '@/lib/pacts';

const anna: ApiProfile = {
  id: 'usr_anna',
  username: 'anna',
  email: 'anna@example.com',
  timezone: 'Europe/Stockholm',
  notificationTime: '09:00',
  tintIndex: 3,
};

const wireFrequency: ApiPact = {
  id: 'pct_1',
  creatorUserId: 'usr_me',
  keeperUserId: 'usr_anna',
  title: 'Morning run before work',
  description: null,
  type: 'frequency',
  status: 'active',
  startDate: '2026-07-03',
  endDate: '2026-08-01',
  daysOfWeek: [1, 2, 3, 4, 5],
  goalTarget: null,
  goalUnit: null,
  isMutual: false,
  mutualPactId: null,
  tintIndex: 2,
};

const wireGoal: ApiPact = {
  id: 'pct_2',
  creatorUserId: 'usr_anna',
  keeperUserId: 'usr_me',
  title: 'Read twelve books',
  description: 'One a week-ish',
  type: 'goal',
  status: 'completed',
  startDate: '2026-05-01',
  endDate: '2026-07-29',
  daysOfWeek: null,
  goalTarget: 12,
  goalUnit: 'books',
  isMutual: false,
  mutualPactId: null,
  tintIndex: 0,
};

// A Proposal on the wire: a *pending* mutual pact — the one extra status the
// client ever sees ('declined' never leaves the server, ADR-0006).
const wireProposal: ApiPact = {
  id: 'pct_3',
  creatorUserId: 'usr_anna',
  keeperUserId: 'usr_me',
  title: 'Evening walk together',
  description: null,
  type: 'frequency',
  status: 'pending',
  startDate: '2026-07-03',
  endDate: '2026-08-01',
  daysOfWeek: [0, 6],
  goalTarget: null,
  goalUnit: null,
  isMutual: true,
  mutualPactId: 'mut_1',
  tintIndex: 4,
};

describe('normalizePacts', () => {
  it('yields no pacts and no counterparts for an empty payload', () => {
    expect(normalizePacts({ pacts: [], counterparts: [] })).toEqual({
      pacts: [],
      counterparts: [],
    });
  });

  it('keeps the flat rows’ real user ids and every contract term', () => {
    const { pacts } = normalizePacts({ pacts: [wireFrequency, wireGoal], counterparts: [anna] });
    expect(pacts).toHaveLength(2);
    expect(pacts[0]).toMatchObject({
      id: 'pct_1',
      creatorUserId: 'usr_me',
      keeperUserId: 'usr_anna',
      title: 'Morning run before work',
      type: 'frequency',
      status: 'active',
      startDate: '2026-07-03',
      endDate: '2026-08-01',
      daysOfWeek: [1, 2, 3, 4, 5],
      isMutual: false,
      tintIndex: 2,
    });
    expect(pacts[1]).toMatchObject({
      id: 'pct_2',
      creatorUserId: 'usr_anna',
      keeperUserId: 'usr_me',
      status: 'completed',
      goalTarget: 12,
      goalUnit: 'books',
      description: 'One a week-ish',
    });
  });

  it('carries a pending Proposal through whole: status, mutual link, provisional dates', () => {
    const pact = apiPactToPact(wireProposal);
    expect(pact).toMatchObject({
      id: 'pct_3',
      creatorUserId: 'usr_anna',
      keeperUserId: 'usr_me',
      status: 'pending',
      isMutual: true,
      mutualPactId: 'mut_1',
      startDate: '2026-07-03',
      endDate: '2026-08-01',
      daysOfWeek: [0, 6],
      tintIndex: 4,
    });
  });

  it('turns wire nulls into absent optionals, not null values', () => {
    const pact = apiPactToPact(wireFrequency);
    expect(pact.description).toBeUndefined();
    expect(pact.goalTarget).toBeUndefined();
    expect(pact.goalUnit).toBeUndefined();
    expect(pact.mutualPactId).toBeUndefined();
    expect(apiPactToPact(wireGoal).daysOfWeek).toBeUndefined();
  });

  it('projects the counterpart sidecar onto the client User shape', () => {
    const { counterparts } = normalizePacts({ pacts: [wireFrequency], counterparts: [anna] });
    expect(counterparts).toEqual([
      {
        id: 'usr_anna',
        username: 'anna',
        email: 'anna@example.com',
        timezone: 'Europe/Stockholm',
        notificationTime: '09:00',
        tintIndex: 3,
      },
    ]);
  });
});
