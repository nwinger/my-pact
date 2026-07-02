import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  acceptFriendApi,
  blockFriendApi,
  declineFriendApi,
  listFriends,
  removeFriendApi,
  sendFriendRequestApi,
  type ApiProfile,
} from '@/lib/api';
import { gracePeriodKey, todayKey } from '@/lib/dates';
import { reconcile } from '@/lib/engine';
import { goalProgress } from '@/lib/streaks';
import type {
  AppNotification,
  CheckIn,
  Friendship,
  Pact,
  PactType,
  User,
} from '@/store/types';
import { useAuth } from './use-auth';

/**
 * The local identity sentinel — "me" in the on-device store (ADR-0003,
 * superseded by ADR-0005: the follow-up identity-adoption change replaces
 * this with the real server id).
 */
const ME = 'u-me';

// Unique across launches: persisted entities keep their ids, so a plain
// counter would collide after rehydration.
let idCounter = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

// In-flight guard for refreshFriends(): a mount effect and a post-send refresh
// can fire close together; the second call no-ops until the first settles.
let refreshing = false;

export type CreatePactInput = {
  title: string;
  description?: string;
  type: PactType;
  daysOfWeek?: number[];
  goalTarget?: number;
  goalUnit?: string;
  keeperUserId: string;
  isMutual: boolean;
  durationDays: number;
};

export type ProfileUpdate = {
  username?: string;
  email?: string;
  timezone?: string;
  notificationTime?: string;
};

export type FriendRequestResult = 'sent' | 'not_found' | 'duplicate' | 'self';

type State = {
  meId: string;
  users: User[];
  friendships: Friendship[];
  pacts: Pact[];
  checkIns: CheckIn[];
  notifications: AppNotification[];
  remindersEnabled: boolean;

  /** in-memory only — "todayKey:graceKey" of the last scheduler pass */
  lastReconcileStamp: string | null;

  checkIn: (pactId: string, opts?: { progressValue?: number; date?: string }) => void;
  createPact: (input: CreatePactInput) => Pact;
  cancelPact: (pactId: string) => void;
  acceptFriend: (friendshipId: string) => Promise<void>;
  declineFriend: (friendshipId: string) => Promise<void>;
  blockFriend: (friendshipId: string) => Promise<void>;
  removeFriend: (friendshipId: string) => Promise<void>;
  sendFriendRequest: (email: string) => Promise<FriendRequestResult>;
  refreshFriends: () => Promise<void>;
  markRead: (notificationId: string) => void;
  markAllRead: () => void;
  updateProfile: (update: ProfileUpdate) => void;
  setRemindersEnabled: (on: boolean) => void;
  runReconcile: () => void;
  resetLocal: () => void;
};

// A fresh account starts bare: just me (the server profile overwrites this
// row on sign-in), no pacts/friends/notifications. The domain stays local
// until its server endpoints land, but it's the account's own data.
function freshState(): Pick<
  State,
  'users' | 'friendships' | 'pacts' | 'checkIns' | 'notifications' | 'remindersEnabled'
> {
  return {
    users: [
      { id: ME, username: 'you', email: '', timezone: 'UTC', notificationTime: '08:00', tintIndex: 1 },
    ],
    friendships: [],
    pacts: [],
    checkIns: [],
    notifications: [],
    remindersEnabled: true,
  };
}

// Every friends action needs a live session before it may touch the server.
function requireToken(): string {
  const token = useAuth.getState().token;
  if (!token) throw new Error('You appear to be signed out. Sign in and try again.');
  return token;
}

// A mutual pact is two twins sharing one mutualPactId; voiding it must void
// both. Heal any historical drift (one twin cancelled while the other stayed
// active — from before cancelPact cascaded) on load, so a cancelled mutual
// pact never lingers as active in "Keeping".
function healMutualCancellation(pacts: Pact[]): Pact[] {
  const cancelledPairs = new Set(
    pacts
      .filter((p) => p.status === 'cancelled' && p.isMutual && p.mutualPactId)
      .map((p) => p.mutualPactId)
  );
  if (cancelledPairs.size === 0) return pacts;
  return pacts.map((p) =>
    p.isMutual && p.mutualPactId && p.status === 'active' && cancelledPairs.has(p.mutualPactId)
      ? { ...p, status: 'cancelled' as const }
      : p
  );
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      meId: ME,
      ...freshState(),
      lastReconcileStamp: null,

      checkIn: (pactId, opts) => {
        const { checkIns, pacts, notifications, meId, users } = get();
        const date = opts?.date ?? todayKey();
        // Deadline rule: only today is sealable, plus yesterday while the
        // 00:00–00:30 grace window is open.
        if (date !== todayKey() && date !== gracePeriodKey()) return;
        if (checkIns.some((c) => c.pactId === pactId && c.date === date)) return;

        const pact = pacts.find((p) => p.id === pactId);
        // Only the creator checks in on a pact.
        if (!pact || pact.creatorUserId !== meId || pact.status !== 'active') return;

        const entry: CheckIn = {
          id: nextId('c'),
          pactId,
          userId: meId,
          date,
          status: 'completed',
          progressValue: opts?.progressValue,
        };
        const nextCheckIns = [...checkIns, entry];

        // Goal pacts complete the moment the target is reached.
        let nextPacts = pacts;
        let nextNotifications = notifications;
        if (pact.type === 'goal' && pact.goalTarget) {
          const progress = goalProgress(pact, nextCheckIns);
          if (progress >= pact.goalTarget) {
            nextPacts = pacts.map((p) =>
              p.id === pactId ? { ...p, status: 'completed' as const } : p
            );
            const keeper = users.find((u) => u.id === pact.keeperUserId)?.username ?? 'Your keeper';
            nextNotifications = [
              {
                id: nextId('n'),
                type: 'pact_completed',
                title: 'Goal reached. Pact sealed.',
                body: `“${pact.title}” hit ${pact.goalTarget} ${pact.goalUnit}. ${keeper} is proud.`,
                sentAt: 'Just now',
                pactId: pact.id,
              },
              ...notifications,
            ];
          }
        }

        set({ checkIns: nextCheckIns, pacts: nextPacts, notifications: nextNotifications });
      },

      createPact: (input) => {
        const { pacts, meId } = get();
        const end = new Date();
        end.setDate(end.getDate() + input.durationDays);
        const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(
          end.getDate()
        ).padStart(2, '0')}`;

        const goalTarget =
          input.type === 'goal' && input.goalTarget && input.goalTarget > 0
            ? input.goalTarget
            : undefined;

        const shared = {
          title: input.title,
          description: input.description,
          type: input.type,
          status: 'active' as const,
          startDate: todayKey(),
          endDate,
          daysOfWeek: input.daysOfWeek,
          goalTarget,
          goalUnit: input.type === 'goal' ? input.goalUnit : undefined,
        };

        const mutualPactId = input.isMutual ? nextId('mp') : undefined;
        const mine: Pact = {
          id: nextId('p'),
          creatorUserId: meId,
          keeperUserId: input.keeperUserId,
          isMutual: input.isMutual,
          mutualPactId,
          tintIndex: pacts.length % 5,
          ...shared,
        };

        const newPacts = [mine];
        if (input.isMutual) {
          // the linked twin: the friend commits too, with me as keeper
          newPacts.push({
            id: nextId('p'),
            creatorUserId: input.keeperUserId,
            keeperUserId: meId,
            isMutual: true,
            mutualPactId,
            tintIndex: (pacts.length + 1) % 5,
            ...shared,
          });
        }

        set({ pacts: [...newPacts, ...pacts] });
        return mine;
      },

      cancelPact: (pactId) => {
        const { pacts, users, notifications } = get();
        const pact = pacts.find((p) => p.id === pactId);
        const keeper = users.find((u) => u.id === pact?.keeperUserId)?.username ?? 'Your keeper';
        set({
          // Voiding a mutual pact voids BOTH twins — the friend's linked copy
          // shares the same mutualPactId (different id), so cancelling only the
          // tapped one left its partner lingering as active.
          pacts: pacts.map((p) => {
            const isTarget = p.id === pactId;
            const isActiveTwin =
              !!pact?.isMutual &&
              !!pact.mutualPactId &&
              p.mutualPactId === pact.mutualPactId &&
              p.status === 'active';
            return isTarget || isActiveTwin ? { ...p, status: 'cancelled' as const } : p;
          }),
          notifications: pact
            ? [
                {
                  id: nextId('n'),
                  type: 'pact_breach',
                  title: 'Pact broken',
                  body: `You voided “${pact.title}”. ${keeper} has been told.`,
                  sentAt: 'Just now',
                  pactId,
                },
                ...notifications,
              ]
            : notifications,
        });
      },

      acceptFriend: async (friendshipId) => {
        await acceptFriendApi(requireToken(), friendshipId);
        // Notifications sync is out of scope: this pulls the fresh graph but
        // emits no local notification.
        await get().refreshFriends();
      },

      declineFriend: async (friendshipId) => {
        await declineFriendApi(requireToken(), friendshipId);
        await get().refreshFriends();
      },

      blockFriend: async (friendshipId) => {
        await blockFriendApi(requireToken(), friendshipId);
        await get().refreshFriends();
      },

      removeFriend: async (friendshipId) => {
        await removeFriendApi(requireToken(), friendshipId);
        await get().refreshFriends();
      },

      sendFriendRequest: async (email) => {
        const { result } = await sendFriendRequestApi(requireToken(), email.trim());
        // Pull the new outgoing request into the local cache immediately.
        if (result === 'sent') await get().refreshFriends();
        return result;
      },

      refreshFriends: async () => {
        // A mount-effect load and a post-send refresh can overlap; let the
        // first win and no-op the rest until it settles.
        if (refreshing) return;
        const token = useAuth.getState().token;
        if (!token) return;
        refreshing = true;
        try {
          const { friends, incoming, outgoing } = await listFriends(token);

          const counterparts: User[] = [];
          const seen = new Set<string>();
          const cacheCounterpart = (p: ApiProfile) => {
            if (seen.has(p.id)) return;
            seen.add(p.id);
            counterparts.push({
              id: p.id,
              username: p.username,
              email: p.email,
              timezone: p.timezone,
              notificationTime: p.notificationTime,
              tintIndex: p.tintIndex,
            });
          };

          // ADR 0003: stitch every row's local side to the ME sentinel and cache
          // the counterpart by its real server id, so the existing selectors
          // (which locate "me" by matching ME) partition the graph correctly.
          // requester/addressee here are synthetic — nothing client-side reads
          // the server's real orientation.
          const normalised: Friendship[] = [];
          for (const item of friends) {
            normalised.push({
              id: item.friendshipId,
              requesterId: ME,
              addresseeId: item.user.id,
              status: 'accepted',
              createdAt: item.createdAt,
            });
            cacheCounterpart(item.user);
          }
          for (const item of incoming) {
            normalised.push({
              id: item.friendshipId,
              requesterId: item.user.id,
              addresseeId: ME,
              status: 'pending',
              createdAt: item.createdAt,
            });
            cacheCounterpart(item.user);
          }
          for (const item of outgoing) {
            normalised.push({
              id: item.friendshipId,
              requesterId: ME,
              addresseeId: item.user.id,
              status: 'pending',
              createdAt: item.createdAt,
            });
            cacheCounterpart(item.user);
          }

          // Preserve the local ME user as-is; replace the counterpart cache.
          const meUser = get().users.find((u) => u.id === ME);
          set({
            friendships: normalised,
            users: meUser ? [meUser, ...counterparts] : counterparts,
          });
        } catch (e) {
          // Best-effort background sync: a failed refresh (e.g. an expired
          // session returning 401) must never reject into its callers — the
          // tab-focus / pull-to-refresh effects and the post-action refresh
          // that runs after an action has already succeeded server-side.
          if (__DEV__) console.warn('refreshFriends failed:', e);
        } finally {
          refreshing = false;
        }
      },

      markRead: (notificationId) => {
        set({
          notifications: get().notifications.map((nf) =>
            nf.id === notificationId ? { ...nf, readAt: nf.readAt ?? 'read' } : nf
          ),
        });
      },

      markAllRead: () => {
        set({
          notifications: get().notifications.map((nf) => ({
            ...nf,
            readAt: nf.readAt ?? 'read',
          })),
        });
      },

      updateProfile: (update) => {
        const { users, meId } = get();
        set({
          users: users.map((u) => (u.id === meId ? { ...u, ...update } : u)),
        });
      },

      setRemindersEnabled: (on) => set({ remindersEnabled: on }),

      runReconcile: () => {
        const state = get();
        const stamp = `${todayKey()}:${gracePeriodKey() ?? '-'}`;
        if (state.lastReconcileStamp === stamp) return;
        const usernames = new Map(state.users.map((u) => [u.id, u.username]));
        const result = reconcile(state.meId, state.pacts, state.checkIns, usernames);
        set({
          lastReconcileStamp: stamp,
          checkIns: result.newCheckIns.length
            ? [...state.checkIns, ...result.newCheckIns]
            : state.checkIns,
          notifications: result.newNotifications.length
            ? [...result.newNotifications, ...state.notifications]
            : state.notifications,
          pacts: result.pactUpdates.size
            ? state.pacts.map((p) =>
                result.pactUpdates.has(p.id)
                  ? { ...p, status: result.pactUpdates.get(p.id)! }
                  : p
              )
            : state.pacts,
        });
      },

      resetLocal: () => set({ ...freshState(), lastReconcileStamp: null }),
    }),
    {
      name: 'mypact-data',
      // v4: demo mode removed (ADR-0004) — see `migrate`
      version: 4,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        meId: s.meId,
        users: s.users,
        friendships: s.friendships,
        pacts: s.pacts,
        checkIns: s.checkIns,
        notifications: s.notifications,
        remindersEnabled: s.remindersEnabled,
      }),
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<State> | null) };
        // Repair mutual pacts whose twins drifted (one cancelled, one still
        // active) before cancelPact voided both.
        return { ...merged, pacts: healMutualCancellation(merged.pacts) };
      },
      // Every pre-v4 store restarts bare, unconditionally: demo datasets and
      // the mode marker are gone, and ADR-0004 authorized discarding all
      // prior local data rather than carrying migration paths for it.
      migrate: () => ({ ...freshState(), meId: ME }) as never,
    }
  )
);

/* ---------- selectors ---------- */

export function useMe(): User {
  return useStore((s) => s.users.find((u) => u.id === s.meId)!);
}

export function useUser(id: string | undefined): User | undefined {
  return useStore((s) => s.users.find((u) => u.id === id));
}

/** Accepted friends of me. (Derived with useMemo — zustand selectors must return stable refs.) */
export function useFriends(): { friendship: Friendship; user: User }[] {
  const friendships = useStore((s) => s.friendships);
  const users = useStore((s) => s.users);
  const meId = useStore((s) => s.meId);
  return useMemo(
    () =>
      friendships
        .filter(
          (f) => f.status === 'accepted' && (f.requesterId === meId || f.addresseeId === meId)
        )
        .map((f) => ({
          friendship: f,
          user: users.find(
            (u) => u.id === (f.requesterId === meId ? f.addresseeId : f.requesterId)
          )!,
        })),
    [friendships, users, meId]
  );
}

export function usePendingRequests(): { friendship: Friendship; user: User }[] {
  const friendships = useStore((s) => s.friendships);
  const users = useStore((s) => s.users);
  const meId = useStore((s) => s.meId);
  return useMemo(
    () =>
      friendships
        .filter((f) => f.status === 'pending' && f.addresseeId === meId)
        .map((f) => ({
          friendship: f,
          user: users.find((u) => u.id === f.requesterId)!,
        })),
    [friendships, users, meId]
  );
}

/** Requests I have sent that are still pending. */
export function useOutgoingRequests(): { friendship: Friendship; user: User }[] {
  const friendships = useStore((s) => s.friendships);
  const users = useStore((s) => s.users);
  const meId = useStore((s) => s.meId);
  return useMemo(
    () =>
      friendships
        .filter((f) => f.status === 'pending' && f.requesterId === meId)
        .map((f) => ({
          friendship: f,
          user: users.find((u) => u.id === f.addresseeId)!,
        })),
    [friendships, users, meId]
  );
}

export function useUnreadCount(): number {
  return useStore((s) => s.notifications.filter((nf) => !nf.readAt).length);
}
