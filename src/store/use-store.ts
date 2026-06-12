import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { apiEnabled } from '@/lib/api';
import { gracePeriodKey, todayKey } from '@/lib/dates';
import { reconcile } from '@/lib/engine';
import { goalProgress } from '@/lib/streaks';
import {
  ME,
  buildBareState,
  buildSeedCheckIns,
  buildSeedFriendships,
  buildSeedKeeperPacts,
  buildSeedNotifications,
  buildSeedPacts,
  seedUsers,
} from '@/store/seed';
import type {
  AppNotification,
  CheckIn,
  Friendship,
  Pact,
  PactType,
  User,
} from '@/store/types';

// Unique across launches: persisted entities keep their ids, so a plain
// counter would collide after rehydration.
let idCounter = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

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
  acceptFriend: (friendshipId: string) => void;
  declineFriend: (friendshipId: string) => void;
  blockFriend: (friendshipId: string) => void;
  removeFriend: (friendshipId: string) => void;
  sendFriendRequest: (email: string) => FriendRequestResult;
  markRead: (notificationId: string) => void;
  markAllRead: () => void;
  updateProfile: (update: ProfileUpdate) => void;
  setRemindersEnabled: (on: boolean) => void;
  runReconcile: () => void;
  resetLocal: () => void;
};

// Persisted alongside the data so a build that switches between demo and
// API mode never inherits the other mode's dataset (see `merge` below).
const DATA_MODE = apiEnabled ? 'api' : 'demo';

// Demo mode seeds the full showcase dataset. API mode starts bare — the
// server profile fills `me` on sign-in and the domain stays empty until its
// endpoints land.
function freshState() {
  if (apiEnabled) {
    return { ...buildBareState(), remindersEnabled: true };
  }
  return {
    users: seedUsers,
    friendships: buildSeedFriendships(),
    pacts: [...buildSeedPacts(), ...buildSeedKeeperPacts()],
    checkIns: buildSeedCheckIns(),
    notifications: buildSeedNotifications(),
    remindersEnabled: true,
  };
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
          pacts: pacts.map((p) =>
            p.id === pactId ? { ...p, status: 'cancelled' as const } : p
          ),
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

      acceptFriend: (friendshipId) => {
        const { friendships, users, notifications } = get();
        const f = friendships.find((x) => x.id === friendshipId);
        const requester = users.find((u) => u.id === f?.requesterId)?.username ?? 'A friend';
        set({
          friendships: friendships.map((x) =>
            x.id === friendshipId ? { ...x, status: 'accepted' as const } : x
          ),
          notifications: f
            ? [
                {
                  id: nextId('n'),
                  type: 'friend_accepted',
                  title: `You and ${requester} are bound`,
                  body: 'You can now witness each other’s pacts.',
                  sentAt: 'Just now',
                  friendId: f.requesterId,
                },
                ...notifications,
              ]
            : notifications,
        });
      },

      declineFriend: (friendshipId) => {
        set({
          friendships: get().friendships.map((f) =>
            f.id === friendshipId ? { ...f, status: 'declined' as const } : f
          ),
        });
      },

      blockFriend: (friendshipId) => {
        // pending, accepted and declined can all transition to blocked
        set({
          friendships: get().friendships.map((f) =>
            f.id === friendshipId ? { ...f, status: 'blocked' as const } : f
          ),
        });
      },

      removeFriend: (friendshipId) => {
        set({ friendships: get().friendships.filter((f) => f.id !== friendshipId) });
      },

      sendFriendRequest: (email) => {
        const { users, friendships, meId } = get();
        const me = users.find((u) => u.id === meId);
        if (me && me.email.toLowerCase() === email.toLowerCase()) return 'self';
        const target = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (!target) return 'not_found';
        if (target.id === meId) return 'self';
        const existing = friendships.some(
          (f) =>
            ((f.requesterId === meId && f.addresseeId === target.id) ||
              (f.requesterId === target.id && f.addresseeId === meId)) &&
            f.status !== 'declined'
        );
        if (existing) return 'duplicate';
        set({
          friendships: [
            ...friendships,
            {
              id: nextId('f'),
              requesterId: meId,
              addresseeId: target.id,
              status: 'pending',
              createdAt: todayKey(),
            },
          ],
        });
        return 'sent';
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
      // v3: API mode starts bare instead of demo-seeded
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        dataMode: DATA_MODE,
        meId: s.meId,
        users: s.users,
        friendships: s.friendships,
        pacts: s.pacts,
        checkIns: s.checkIns,
        notifications: s.notifications,
        remindersEnabled: s.remindersEnabled,
      }),
      // Same persist version, different mode: discard the other mode's data
      // (pre-v3 stores carried no marker and were always demo-seeded).
      merge: (persisted, current) => {
        const p = persisted as (Partial<State> & { dataMode?: string }) | null;
        if (p && (p.dataMode ?? 'demo') !== DATA_MODE) {
          return { ...current, ...freshState(), meId: ME };
        }
        return { ...current, ...p };
      },
      migrate: (persisted, version) => {
        // API mode always restarts bare and account-scoped
        if (apiEnabled) return { ...freshState(), meId: ME } as never;
        // demo: the v2 shape is identical to v3 — keep the user's data
        if (version === 2 && persisted) return persisted as never;
        return { ...freshState(), meId: ME } as never;
      },
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
