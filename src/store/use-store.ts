import { useMemo } from 'react';
import { create } from 'zustand';

import { todayKey } from '@/lib/dates';
import {
  ME,
  buildSeedCheckIns,
  seedFriendships,
  seedKeeperPacts,
  seedNotifications,
  seedPacts,
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

let idCounter = 1000;
const nextId = (prefix: string) => `${prefix}-${idCounter++}`;

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

type State = {
  meId: string;
  users: User[];
  friendships: Friendship[];
  pacts: Pact[];
  checkIns: CheckIn[];
  notifications: AppNotification[];

  checkIn: (pactId: string, progressValue?: number) => void;
  createPact: (input: CreatePactInput) => Pact;
  cancelPact: (pactId: string) => void;
  acceptFriend: (friendshipId: string) => void;
  declineFriend: (friendshipId: string) => void;
  removeFriend: (friendshipId: string) => void;
  sendFriendRequest: (email: string) => void;
  markRead: (notificationId: string) => void;
  markAllRead: () => void;
};

export const useStore = create<State>((set, get) => ({
  meId: ME,
  users: seedUsers,
  friendships: seedFriendships,
  pacts: [...seedPacts, ...seedKeeperPacts],
  checkIns: buildSeedCheckIns(),
  notifications: seedNotifications,

  checkIn: (pactId, progressValue) => {
    const { checkIns, meId } = get();
    const today = todayKey();
    if (checkIns.some((c) => c.pactId === pactId && c.date === today)) return;
    set({
      checkIns: [
        ...checkIns,
        {
          id: nextId('c'),
          pactId,
          userId: meId,
          date: today,
          status: 'completed',
          progressValue,
        },
      ],
    });
  },

  createPact: (input) => {
    const { pacts, meId } = get();
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + input.durationDays);
    const newPact: Pact = {
      id: nextId('p'),
      creatorUserId: meId,
      keeperUserId: input.keeperUserId,
      title: input.title,
      description: input.description,
      type: input.type,
      status: 'active',
      startDate: todayKey(),
      endDate: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(
        end.getDate()
      ).padStart(2, '0')}`,
      daysOfWeek: input.daysOfWeek,
      goalTarget: input.goalTarget,
      goalUnit: input.goalUnit,
      isMutual: input.isMutual,
      mutualPactId: input.isMutual ? nextId('p-mutual') : undefined,
      tintIndex: pacts.length % 5,
    };
    void start;
    set({ pacts: [newPact, ...pacts] });
    return newPact;
  },

  cancelPact: (pactId) => {
    set({
      pacts: get().pacts.map((p) =>
        p.id === pactId ? { ...p, status: 'cancelled' as const } : p
      ),
    });
  },

  acceptFriend: (friendshipId) => {
    set({
      friendships: get().friendships.map((f) =>
        f.id === friendshipId ? { ...f, status: 'accepted' as const } : f
      ),
    });
  },

  declineFriend: (friendshipId) => {
    set({
      friendships: get().friendships.map((f) =>
        f.id === friendshipId ? { ...f, status: 'declined' as const } : f
      ),
    });
  },

  removeFriend: (friendshipId) => {
    set({ friendships: get().friendships.filter((f) => f.id !== friendshipId) });
  },

  sendFriendRequest: (email) => {
    const { users, friendships, meId } = get();
    const target = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!target || target.id === meId) return;
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
      notifications: get().notifications.map((nf) => ({ ...nf, readAt: nf.readAt ?? 'read' })),
    });
  },
}));

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

export function useUnreadCount(): number {
  return useStore((s) => s.notifications.filter((nf) => !nf.readAt).length);
}
