import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  acceptFriendApi,
  acceptPactApi,
  blockFriendApi,
  cancelPactApi,
  completePactApi,
  createPactApi,
  declineFriendApi,
  declinePactApi,
  listFriends,
  listPacts,
  removeFriendApi,
  sendFriendRequestApi,
  settlePactApi,
  type ApiProfile,
} from '@/lib/api';
import { gracePeriodKey, todayKey } from '@/lib/dates';
import { reconcile, type ReconcileResult } from '@/lib/engine';
import { normalizeFriends, profileToUser } from '@/lib/friends';
import { apiPactToPact, normalizePacts } from '@/lib/pacts';
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
 * The pre-auth placeholder id (ADR-0005). It exists only so `useMe()` stays
 * total while signed out; `adoptIdentity` replaces it with the real server
 * id at session establishment. Domain rows never reference it: the refresh
 * actions refuse to write rows until adoption, and pact creation requires a
 * cached Witness as keeper, which only exists post-adoption.
 */
const ME = 'u-me';

// Unique across launches: persisted entities keep their ids, so a plain
// counter would collide after rehydration. Pact ids are no longer minted
// here — they are server uuids (issue #11).
let idCounter = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

// In-flight guards for the refresh actions (ADR-0008): a mount effect and a
// post-mutation refresh can fire close together; the second call no-ops
// until the first settles.
let refreshingFriends = false;
let refreshingPacts = false;

export type CreatePactInput = {
  title: string;
  description?: string;
  type: PactType;
  daysOfWeek?: number[];
  goalTarget?: number;
  goalUnit?: string;
  keeperUserId: string;
  /** true = propose a mutual pact: the server creates a pending Proposal (ADR-0006) */
  isMutual?: boolean;
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

  adoptIdentity: (profile: ApiProfile) => void;
  checkIn: (pactId: string, opts?: { progressValue?: number; date?: string }) => void;
  createPact: (input: CreatePactInput) => Promise<Pact>;
  cancelPact: (pactId: string) => Promise<void>;
  acceptPact: (pactId: string) => Promise<void>;
  declinePact: (pactId: string) => Promise<void>;
  acceptFriend: (friendshipId: string) => Promise<void>;
  declineFriend: (friendshipId: string) => Promise<void>;
  blockFriend: (friendshipId: string) => Promise<void>;
  removeFriend: (friendshipId: string) => Promise<void>;
  sendFriendRequest: (email: string) => Promise<FriendRequestResult>;
  refreshFriends: () => Promise<void>;
  refreshPacts: () => Promise<void>;
  markRead: (notificationId: string) => void;
  markAllRead: () => void;
  updateProfile: (update: ProfileUpdate) => void;
  setRemindersEnabled: (on: boolean) => void;
  runReconcile: () => void;
  resetLocal: () => void;
};

// A fresh account starts bare: just the pre-auth placeholder (adoptIdentity
// swaps it for the real server profile at sign-in), no pacts/friends/
// notifications. Pacts and the friends graph re-sync from the server;
// check-ins and notifications stay local until their endpoints land.
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

// Every domain mutation needs a live session before it may touch the server.
function requireToken(): string {
  const token = useAuth.getState().token;
  if (!token) throw new Error('You appear to be signed out. Sign in and try again.');
  return token;
}

/**
 * Upsert profiles into the user cache: fresh rows win by id, everyone else
 * stays put. Both refresh actions use this instead of replacing the cache
 * outright — a pact counterpart is not necessarily a current friend
 * (ADR-0007: contracts stand after removal), so the friends refresh must
 * not evict profiles only the pacts sidecar supplies, and vice versa. My
 * own row is never touched here; adoptIdentity owns it.
 */
function upsertUsers(current: User[], incoming: User[], meId: string): User[] {
  const fresh = new Map(incoming.filter((u) => u.id !== meId).map((u) => [u.id, u]));
  const merged = current.map((u) => {
    if (u.id === meId) return u;
    const update = fresh.get(u.id);
    if (update) fresh.delete(u.id);
    return update ?? u;
  });
  return [...merged, ...fresh.values()];
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      meId: ME,
      ...freshState(),
      lastReconcileStamp: null,

      // Session establishment (ADR-0005): adopt the real server id as my
      // identity — meId becomes the server id and the me-row is keyed by it.
      // Idempotent; on first adoption it replaces the pre-auth placeholder.
      adoptIdentity: (profile) => {
        const { meId, users } = get();
        set({
          meId: profile.id,
          users: [
            profileToUser(profile),
            ...users.filter((u) => u.id !== meId && u.id !== profile.id),
          ],
        });
      },

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

        // Goal pacts complete the moment the target is reached. The flip is
        // optimistic for instant feedback; the durable fact is the interim
        // complete endpoint + refresh (a failed call is retried by the next
        // reconcile pass, which sees an active pact at target).
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
                body: `“${pact.title}” hit ${pact.goalTarget} ${pact.goalUnit}. ${keeper} can see it sealed.`,
                sentAt: 'Just now',
                pactId: pact.id,
              },
              ...notifications,
            ];
            const token = useAuth.getState().token;
            if (token) {
              void completePactApi(token, pact.id)
                .then(() => get().refreshPacts())
                .catch(() => {});
            }
          }
        }

        set({ checkIns: nextCheckIns, pacts: nextPacts, notifications: nextNotifications });
      },

      // Solo pacts seal instantly; with isMutual the same call PROPOSES — the
      // server returns a single pending row and the Partner's twin only
      // materializes when they accept (ADR-0006). The server authors the
      // dates — we send only the duration. Throws ApiError to the create form.
      createPact: async (input) => {
        const token = requireToken();
        const created = await createPactApi(token, {
          title: input.title,
          description: input.description,
          type: input.type,
          daysOfWeek: input.daysOfWeek,
          goalTarget: input.goalTarget,
          goalUnit: input.goalUnit,
          keeperUserId: input.keeperUserId,
          isMutual: input.isMutual,
          durationDays: input.durationDays,
          // Tint stays client-chosen at creation.
          tintIndex: get().pacts.length % 5,
        });
        const pact = apiPactToPact(created);
        await get().refreshPacts();
        // The refresh normally carries the new row; if a concurrent
        // in-flight refresh made ours a no-op, insert it so the detail
        // screen the caller navigates to can find it.
        if (!get().pacts.some((p) => p.id === pact.id)) {
          set({ pacts: [pact, ...get().pacts] });
        }
        return pact;
      },

      // Creator-only, enforced server-side. On an active pact this is the
      // irreversible break (a mutual twin's void cascades to the partner's
      // active twin on the server — the refresh brings both statuses back);
      // on a pending proposal it is the WITHDRAW: the row soft-deletes and
      // simply vanishes from the next refresh. Only a broken once-active
      // contract earns the local note — a withdrawn proposal never bound
      // anyone and leaves no record, and proposal events write no
      // notifications at all (issue #12). Throws ApiError.
      cancelPact: async (pactId) => {
        const token = requireToken();
        const pact = get().pacts.find((p) => p.id === pactId);
        await cancelPactApi(token, pactId);
        await get().refreshPacts();
        if (pact && pact.status === 'active') {
          set({
            notifications: [
              {
                id: nextId('n'),
                type: 'pact_breach',
                title: 'Pact broken',
                body: `You voided “${pact.title}”. The broken contract stays on the record.`,
                sentAt: 'Just now',
                pactId,
              },
              ...get().notifications,
            ],
          });
        }
      },

      // The Partner consents: the server transactionally materializes my twin
      // and re-anchors the dates to MY today (ADR-0006) — the refresh pulls
      // both active twins. No local notification: proposal events write none.
      // Throws ApiError (e.g. 409 while the pair is unfriended).
      acceptPact: async (pactId) => {
        await acceptPactApi(requireToken(), pactId);
        await get().refreshPacts();
      },

      // The Partner refuses. The declined tombstone is excluded from list
      // reads for both sides, so the refresh makes it vanish — it appears in
      // no Archive. Throws ApiError.
      declinePact: async (pactId) => {
        await declinePactApi(requireToken(), pactId);
        await get().refreshPacts();
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
        if (refreshingFriends) return;
        const token = useAuth.getState().token;
        if (!token) return;
        refreshingFriends = true;
        try {
          const payload = await listFriends(token);

          // Re-read identity after the await: adoption may have landed
          // mid-flight, and a mid-flight sign-out resets it to the
          // placeholder. Rows are only ever written under a real server id.
          const { meId, users } = get();
          if (meId === ME) return;

          const { friendships, counterparts } = normalizeFriends(payload, meId);
          set({ friendships, users: upsertUsers(users, counterparts, meId) });
        } catch (e) {
          // Best-effort background sync: a failed refresh (e.g. an expired
          // session returning 401) must never reject into its callers — the
          // tab-focus / pull-to-refresh effects and the post-action refresh
          // that runs after an action has already succeeded server-side.
          if (__DEV__) console.warn('refreshFriends failed:', e);
        } finally {
          refreshingFriends = false;
        }
      },

      // The pacts shelf, replaced wholesale from the server (the persisted
      // copy is the offline read cache, ADR-0004/0008). Counterpart profiles
      // from the sidecar merge into the user cache.
      refreshPacts: async () => {
        if (refreshingPacts) return;
        const token = useAuth.getState().token;
        if (!token) return;
        refreshingPacts = true;
        try {
          const payload = await listPacts(token);
          const { meId, users } = get();
          if (meId === ME) return;

          const { pacts, counterparts } = normalizePacts(payload);
          set({ pacts, users: upsertUsers(users, counterparts, meId) });
        } catch (e) {
          if (__DEV__) console.warn('refreshPacts failed:', e);
        } finally {
          refreshingPacts = false;
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
        // Misses and their breach notices stay device-local this slice.
        set({
          lastReconcileStamp: stamp,
          checkIns: result.newCheckIns.length
            ? [...state.checkIns, ...result.newCheckIns]
            : state.checkIns,
          notifications: result.newNotifications.length
            ? [...result.newNotifications, ...state.notifications]
            : state.notifications,
        });
        // Durable status transitions (goal completions, end-of-term
        // settlements) go through the interim endpoints, then one refresh —
        // a locally-flipped status would just un-happen on the next refresh.
        if (result.completions.length > 0 || result.settlements.length > 0) {
          void pushDurableTransitions(result.completions, result.settlements);
        }
      },

      // Back to the bare pre-auth state — including meId, so the previous
      // account's identity never lingers on a shared device.
      resetLocal: () => set({ meId: ME, ...freshState(), lastReconcileStamp: null }),
    }),
    {
      name: 'mypact-data',
      // v6: pacts are server rows (issue #11) — ids are server uuids and the
      // shelf re-syncs on sign-in
      version: 6,
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
      // Every pre-v6 store restarts bare, unconditionally. v4 dropped demo
      // data (ADR-0004 authorized discarding local data over carrying
      // migration paths); v5 extended the same reset to rows keyed by the
      // 'u-me' sentinel (ADR-0005); v6 drops device-minted pacts — uploading
      // locally-fabricated twins would violate the consent rule (ADR-0006),
      // and the server-side shelf re-syncs on the next launch. A signed-in
      // session re-adopts its identity via fetchMe.
      migrate: () => ({ ...freshState(), meId: ME }) as never,
    }
  )
);

/**
 * Apply reconcile's durable transitions through the interim endpoints, then
 * refresh once and only then write their notifications — so "completed" is
 * never announced unless the server holds it. Failures are swallowed: the
 * next reconcile pass recomputes and retries. Runs outside the store actions
 * because it is fire-and-forget follow-up work, not a screen-awaited
 * mutation.
 */
async function pushDurableTransitions(
  completions: ReconcileResult['completions'],
  settlements: ReconcileResult['settlements']
): Promise<void> {
  const token = useAuth.getState().token;
  if (!token) return;

  const landed: AppNotification[] = [];
  for (const { pactId, notification } of completions) {
    try {
      await completePactApi(token, pactId);
      landed.push(notification);
    } catch {
      // offline or rejected — reconcile retries on a later pass
    }
  }
  for (const { pactId, verdict, notification } of settlements) {
    try {
      await settlePactApi(token, pactId, verdict);
      landed.push(notification);
    } catch {
      // ditto
    }
  }
  if (landed.length === 0) return;

  await useStore.getState().refreshPacts();

  const { notifications } = useStore.getState();
  // A goal completion may already have been announced by the optimistic
  // checkIn path (its server call failed and reconcile retried) — don't
  // announce the same completion twice.
  const fresh = landed.filter(
    (n) =>
      !(
        n.type === 'pact_completed' &&
        notifications.some((e) => e.type === 'pact_completed' && e.pactId === n.pactId)
      )
  );
  if (fresh.length > 0) {
    useStore.setState({ notifications: [...fresh, ...notifications] });
  }
}

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

/**
 * Proposals awaiting MY answer: pending mutual pacts naming me keeper
 * (someone proposes *to* their pact's keeper — the Partner). Mirrors
 * usePendingRequests; the counterpart is the proposer.
 */
export function useIncomingProposals(): { pact: Pact; user: User }[] {
  const pacts = useStore((s) => s.pacts);
  const users = useStore((s) => s.users);
  const meId = useStore((s) => s.meId);
  return useMemo(
    () =>
      pacts
        .filter((p) => p.status === 'pending' && p.keeperUserId === meId)
        .map((p) => ({
          pact: p,
          user: users.find((u) => u.id === p.creatorUserId)!,
        })),
    [pacts, users, meId]
  );
}

/**
 * Proposals I sent that still await the Partner: pending mutual pacts I
 * created. Nothing binds yet — no seal is due on these. Mirrors
 * useOutgoingRequests; the counterpart is the Partner.
 */
export function useOutgoingProposals(): { pact: Pact; user: User }[] {
  const pacts = useStore((s) => s.pacts);
  const users = useStore((s) => s.users);
  const meId = useStore((s) => s.meId);
  return useMemo(
    () =>
      pacts
        .filter((p) => p.status === 'pending' && p.creatorUserId === meId)
        .map((p) => ({
          pact: p,
          user: users.find((u) => u.id === p.keeperUserId)!,
        })),
    [pacts, users, meId]
  );
}

export function useUnreadCount(): number {
  return useStore((s) => s.notifications.filter((nf) => !nf.readAt).length);
}
