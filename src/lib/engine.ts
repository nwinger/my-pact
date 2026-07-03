import {
  addDays,
  daysAgoKey,
  gracePeriodKey,
  keyToDate,
  toKey,
  todayKey,
} from '@/lib/dates';
import type { AppNotification, CheckIn, Pact } from '@/store/types';

export { gracePeriodKey };

/**
 * Local stand-in for the backend schedulers (pact-failure detection,
 * breach notifications, pact completion). Runs on launch and on
 * foregrounding, over the hydrated store, and returns what changed.
 *
 * INTERIM LOCAL IMPLEMENTATION, not demo scaffolding (ADR-0004): check-ins
 * and notifications are still on-device, and this engine keeps miss
 * recording and breach/settlement behavior working over that data. Pacts
 * themselves are server rows now, so the durable status transitions the
 * engine detects are not applied locally — the store pushes them through the
 * interim `/pacts/:id/complete` and `/pacts/:id/settle` endpoints and then
 * refreshes (a locally-flipped status would just un-happen on the next
 * refresh). The engine retires slice-by-slice as endpoints arrive, ending
 * with engine-to-cron — at which point the scheduler rules live exactly
 * once, server-side, and the cron's test suite is the executable spec.
 * Until then, keep its rules in sync with the spec in README.
 *
 * CREATOR-ONLY: the engine acts only on pacts the signed-in user *created*.
 * Check-ins live on-device, so for a kept pact this device holds none — a
 * keeper's engine pass would fabricate the creator's misses out of absent
 * data. Keeper-perspective breach notices stay dormant until the server
 * cron owns them: honest darkness beats fabricated data.
 *
 * ACTIVE-ONLY: the status filter below also keeps Proposals inert — a
 * `pending` mutual pact binds no one (ADR-0006), so it accrues no misses,
 * no settlement and no completion, no matter how stale its provisional
 * dates grow while it awaits the Partner. Acceptance re-anchors the dates
 * server-side before the row ever turns active.
 *
 * Rules applied (to my own active pacts):
 *  - Frequency pacts: every required day before today without a check-in
 *    gets a `failed` check-in recorded, with a breach notification that
 *    escalates at 3+ consecutive misses.
 *  - The grace window is honored: during 00:00–00:30, yesterday is still
 *    sealable and is never auto-failed; end-of-pact settlement is also
 *    deferred while the final day is graceable.
 *  - Goal pacts: a completion is reported the moment progress reaches the
 *    target (→ POST /pacts/:id/complete).
 *  - Frequency pacts past their end date: a settlement is reported with the
 *    verdict `completed` when at least 80% of required days were sealed,
 *    `incomplete` otherwise (→ POST /pacts/:id/settle). An expired goal
 *    pact below target has no interim endpoint and is left to the cron
 *    slice — a local flip would not survive a refresh.
 */

export type ReconcileResult = {
  newCheckIns: CheckIn[];
  newNotifications: AppNotification[];
  /** Goal pacts whose target is met — completed durably via the interim endpoint. */
  completions: { pactId: string; notification: AppNotification }[];
  /** Frequency pacts past their end date — settled via the interim endpoint. */
  settlements: {
    pactId: string;
    verdict: 'completed' | 'incomplete';
    notification: AppNotification;
  }[];
};

// Unique across launches — results are persisted alongside user data.
let reconcileCounter = 0;
const autoId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(reconcileCounter++).toString(36)}`;

export function reconcile(
  meId: string,
  pacts: Pact[],
  checkIns: CheckIn[],
  usernames: Map<string, string>
): ReconcileResult {
  const result: ReconcileResult = {
    newCheckIns: [],
    newNotifications: [],
    completions: [],
    settlements: [],
  };
  const today = todayKey();
  const graceKey = gracePeriodKey();

  for (const pact of pacts) {
    if (pact.status !== 'active') continue;
    // Creator-only: never fabricate misses (or any consequence) for a pact
    // this account merely keeps — its check-ins live on the creator's device.
    if (pact.creatorUserId !== meId) continue;

    const mine = new Map<string, CheckIn>();
    for (const c of checkIns) if (c.pactId === pact.id) mine.set(c.date, c);

    const keeperName = usernames.get(pact.keeperUserId) ?? 'your keeper';

    if (pact.type === 'frequency') {
      // walk required days from start (capped to the last 60) up to
      // yesterday — but never the still-sealable grace day
      const from = pact.startDate > daysAgoKey(60) ? pact.startDate : daysAgoKey(60);
      let cursor = keyToDate(from);
      const yesterday = keyToDate(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const newMisses: CheckIn[] = [];

      while (cursor <= yesterday) {
        const key = toKey(cursor);
        if (
          key !== graceKey &&
          key <= pact.endDate &&
          (pact.daysOfWeek ?? []).includes(cursor.getDay()) &&
          !mine.has(key)
        ) {
          newMisses.push({
            id: autoId('c-auto'),
            pactId: pact.id,
            userId: pact.creatorUserId,
            date: key,
            status: 'failed',
          });
        }
        cursor = addDays(cursor, 1);
      }

      if (newMisses.length > 0) {
        result.newCheckIns.push(...newMisses);

        // trailing consecutive misses (existing + new) determine urgency
        const all = [...mine.values(), ...newMisses].sort((a, b) =>
          a.date < b.date ? -1 : 1
        );
        let trailing = 0;
        for (let i = all.length - 1; i >= 0; i--) {
          if (all[i].status === 'failed') trailing += 1;
          else break;
        }
        const urgent = trailing >= 3;
        const missCount = newMisses.length === 1 ? 'A day' : `${newMisses.length} days`;
        // Honest copy: the keeper sees the pact, not (yet) its seals — no
        // "has been told", no fabricated escalation.
        result.newNotifications.push({
          id: autoId('n-auto'),
          type: 'pact_breach',
          title: urgent
            ? `${trailing} misses in a row on “${pact.title}”`
            : `You missed “${pact.title}”`,
          body: urgent
            ? `“${pact.title}” is slipping. One seal today turns it around.`
            : `${missCount} went unsealed. The record keeps the score.`,
          sentAt: 'While you were away',
          pactId: pact.id,
        });
      }
    }

    if (pact.type === 'goal' && pact.goalTarget) {
      const progress = checkIns
        .filter((c) => c.pactId === pact.id && c.status === 'completed')
        .reduce((s, c) => s + (c.progressValue ?? 0), 0);
      if (progress >= pact.goalTarget) {
        result.completions.push({
          pactId: pact.id,
          notification: {
            id: autoId('n-auto'),
            type: 'pact_completed',
            title: 'Goal reached. Pact sealed.',
            // written only after the server transition lands, so the keeper
            // really can see the completed contract
            body: `“${pact.title}” hit ${pact.goalTarget} ${pact.goalUnit}. ${keeperName} can see it sealed.`,
            sentAt: 'Just now',
            pactId: pact.id,
          },
        });
        continue;
      }
    }

    // Past the end date → settle the contract (deferred while the final day
    // is still inside the grace window). Frequency pacts only: an expired
    // goal pact below its target has no interim endpoint (cron slice).
    if (pact.type === 'frequency' && pact.endDate < today && pact.endDate !== graceKey) {
      let required = 0;
      let cursor = keyToDate(pact.startDate);
      const end = keyToDate(pact.endDate);
      while (cursor <= end) {
        if ((pact.daysOfWeek ?? []).includes(cursor.getDay())) required += 1;
        cursor = addDays(cursor, 1);
      }
      const sealed = checkIns.filter(
        (c) => c.pactId === pact.id && c.status === 'completed'
      ).length;
      const done = required > 0 && sealed / required >= 0.8;
      result.settlements.push({
        pactId: pact.id,
        verdict: done ? 'completed' : 'incomplete',
        notification: {
          id: autoId('n-auto'),
          type: done ? 'pact_completed' : 'pact_breach',
          title: done ? 'Pact completed in full' : 'A pact ran out of days',
          body: done
            ? `“${pact.title}” ran its course. ${keeperName} can see it completed.`
            : `“${pact.title}” ended before the habit stuck. There is always a next pact.`,
          sentAt: 'Just now',
          pactId: pact.id,
        },
      });
    }
  }

  return result;
}

/** Spec rule: cannot back-fill a check-in more than 7 days in the past. */
export function canBackfill(dateKey: string): boolean {
  return dateKey >= daysAgoKey(7) && dateKey <= todayKey();
}
