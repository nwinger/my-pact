import { describe, expect, it } from 'vitest';

import type { ApiFriendItem, ApiProfile } from '@/lib/api';
import { normalizeFriends } from '@/lib/friends';

const ME = 'usr_me';

const anna: ApiProfile = {
  id: 'usr_anna',
  username: 'anna',
  email: 'anna@example.com',
  timezone: 'Europe/Stockholm',
  notificationTime: '09:00',
  tintIndex: 3,
};

const item = (
  friendshipId: string,
  user: ApiProfile,
  status: ApiFriendItem['status'],
  createdAt = '2026-07-01'
): ApiFriendItem => ({ friendshipId, status, createdAt, user });

describe('normalizeFriends', () => {
  it('yields no friendships and no counterparts for an empty payload', () => {
    expect(normalizeFriends({ friends: [], incoming: [], outgoing: [] }, ME)).toEqual({
      friendships: [],
      counterparts: [],
    });
  });

  it('caches counterpart profiles under their real server ids, deduped across partitions', () => {
    const bea: ApiProfile = {
      id: 'usr_bea',
      username: 'bea',
      email: 'bea@example.com',
      timezone: 'UTC',
      notificationTime: '08:00',
      tintIndex: 0,
    };
    const { counterparts } = normalizeFriends(
      {
        friends: [item('fs_3', anna, 'accepted')],
        incoming: [item('fs_4', bea, 'pending')],
        // anna again — the cache must hold one row per user, not per partition
        outgoing: [item('fs_5', anna, 'pending')],
      },
      ME
    );
    expect(counterparts).toHaveLength(2);
    expect(counterparts).toEqual(
      expect.arrayContaining([
        {
          id: 'usr_anna',
          username: 'anna',
          email: 'anna@example.com',
          timezone: 'Europe/Stockholm',
          notificationTime: '09:00',
          tintIndex: 3,
        },
        {
          id: 'usr_bea',
          username: 'bea',
          email: 'bea@example.com',
          timezone: 'UTC',
          notificationTime: '08:00',
          tintIndex: 0,
        },
      ])
    );
  });

  it('gives an accepted Witness row both real ids', () => {
    const { friendships } = normalizeFriends(
      { friends: [item('fs_3', anna, 'accepted', '2026-06-01')], incoming: [], outgoing: [] },
      ME
    );
    expect(friendships).toHaveLength(1);
    const row = friendships[0];
    expect(row).toMatchObject({ id: 'fs_3', status: 'accepted', createdAt: '2026-06-01' });
    // The wire carries no orientation for accepted rows and nothing client-side
    // reads it — what matters is that both sides are real server ids.
    expect([row.requesterId, row.addresseeId].sort()).toEqual(['usr_anna', 'usr_me']);
  });

  it('orients an outgoing request me-as-Requester, counterpart-as-Addressee', () => {
    const { friendships } = normalizeFriends(
      { friends: [], incoming: [], outgoing: [item('fs_2', anna, 'pending', '2026-06-28')] },
      ME
    );
    expect(friendships).toEqual([
      {
        id: 'fs_2',
        requesterId: 'usr_me',
        addresseeId: 'usr_anna',
        status: 'pending',
        createdAt: '2026-06-28',
      },
    ]);
  });

  it('orients an incoming request counterpart-as-Requester, me-as-Addressee', () => {
    const { friendships } = normalizeFriends(
      { friends: [], incoming: [item('fs_1', anna, 'pending')], outgoing: [] },
      ME
    );
    expect(friendships).toEqual([
      {
        id: 'fs_1',
        requesterId: 'usr_anna',
        addresseeId: 'usr_me',
        status: 'pending',
        createdAt: '2026-07-01',
      },
    ]);
  });
});
