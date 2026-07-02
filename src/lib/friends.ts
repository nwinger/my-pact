/**
 * Pure normalization of the `GET /friends` wire payload into domain rows
 * (ADR-0005): server payload plus my real server id in, Friendship rows plus
 * counterpart profiles out.
 *
 * Deliberately React-Native-free — imports from the API client are type-only
 * (erased at compile time) so the node test runner can execute this module
 * outside the Expo tree.
 */

import type { ApiFriendItem, ApiProfile } from '@/lib/api';
import type { Friendship, User } from '@/store/types';

/** Wire shape of `GET /friends` — the caller's graph, partitioned server-side. */
export type FriendsPayload = {
  friends: ApiFriendItem[];
  incoming: ApiFriendItem[];
  outgoing: ApiFriendItem[];
};

/** Project a server profile onto the client's `User` shape. */
export function profileToUser(p: ApiProfile): User {
  return {
    id: p.id,
    username: p.username,
    email: p.email,
    timezone: p.timezone,
    notificationTime: p.notificationTime,
    tintIndex: p.tintIndex,
  };
}

export function normalizeFriends(
  payload: FriendsPayload,
  meId: string
): { friendships: Friendship[]; counterparts: User[] } {
  const friendships: Friendship[] = [];
  const counterparts: User[] = [];

  // One cached profile per user, however many partitions they appear in.
  const seen = new Set<string>();
  const cacheCounterpart = (p: ApiProfile) => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    counterparts.push(profileToUser(p));
  };

  // Accepted Witnesses: the wire carries no orientation (ADR-0002 — the bond
  // is an unordered pair) and nothing client-side reads it; both sides are
  // real ids, requester-side me by convention.
  for (const { friendshipId, user, createdAt } of payload.friends) {
    friendships.push({
      id: friendshipId,
      requesterId: meId,
      addresseeId: user.id,
      status: 'accepted',
      createdAt,
    });
    cacheCounterpart(user);
  }

  // Incoming requests: the counterpart asked me — counterpart is the
  // Requester, I am the Addressee.
  for (const { friendshipId, user, createdAt } of payload.incoming) {
    friendships.push({
      id: friendshipId,
      requesterId: user.id,
      addresseeId: meId,
      status: 'pending',
      createdAt,
    });
    cacheCounterpart(user);
  }

  // Outgoing requests: I asked the counterpart — the inverse orientation.
  for (const { friendshipId, user, createdAt } of payload.outgoing) {
    friendships.push({
      id: friendshipId,
      requesterId: meId,
      addresseeId: user.id,
      status: 'pending',
      createdAt,
    });
    cacheCounterpart(user);
  }

  return { friendships, counterparts };
}
