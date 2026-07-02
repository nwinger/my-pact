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
 * INTERIM LOCAL IMPLEMENTATION, not demo scaffolding (ADR-0004): pacts,
 * check-ins and notifications are account-local until their server endpoints
 * land, and this engine keeps breach/completion behavior working over that
 * data. It retires slice-by-slice as those endpoints arrive, ending with
 * engine-to-cron — at which point the scheduler rules live exactly once,
 * server-side, and the cron's test suite is the executable spec. Until then,
 * keep its rules in sync with the spec in README.
 *
 * Rules applied:
 *  - Frequency pacts (any creator in the local store): every required day
 *    before today without a check-in gets a `failed` check-in recorded.
 *    The notification speaks from my perspective — creator or keeper —
 *    and escalates to urgent at 3+ consecutive misses.
 *  - The grace window is honored: during 00:00–00:30, yesterday is still
 *    sealable and is never auto-failed; end-of-pact settlement is also
 *    deferred while the final day is graceable.
 *  - Goal pacts: completed the moment progress reaches the target.
 *  - Pacts past their end date: goal pacts complete only if the target was
 *    met; frequency pacts complete when at least 80% of required days were
 *    sealed — otherwise they are marked incomplete.
 */

export type ReconcileResult = {
  newCheckIns: CheckIn[];
  newNotifications: AppNotification[];
  pactUpdates: Map<string, Pact['status']>;
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
    pactUpdates: new Map(),
  };
  const today = todayKey();
  const graceKey = gracePeriodKey();

  for (const pact of pacts) {
    if (pact.status !== 'active') continue;

    const mine = new Map<string, CheckIn>();
    for (const c of checkIns) if (c.pactId === pact.id) mine.set(c.date, c);

    const iAmCreator = pact.creatorUserId === meId;
    const keeperName = usernames.get(pact.keeperUserId) ?? 'your keeper';
    const creatorName = usernames.get(pact.creatorUserId) ?? 'your friend';

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
        result.newNotifications.push({
          id: autoId('n-auto'),
          type: 'pact_breach',
          title: iAmCreator
            ? urgent
              ? `${trailing} misses in a row — ${keeperName} is stepping in`
              : `You missed “${pact.title}”`
            : urgent
              ? `${creatorName} is slipping — ${trailing} misses in a row`
              : `${creatorName} missed “${pact.title}”`,
          body: iAmCreator
            ? urgent
              ? `“${pact.title}” is slipping. Your keeper has been escalated to urgent.`
              : `${missCount} went unsealed. ${keeperName} has been told.`
            : `You are the keeper. A gentle nudge goes a long way.`,
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
        result.pactUpdates.set(pact.id, 'completed');
        result.newNotifications.push({
          id: autoId('n-auto'),
          type: 'pact_completed',
          title: 'Goal reached. Pact sealed.',
          body: iAmCreator
            ? `“${pact.title}” hit ${pact.goalTarget} ${pact.goalUnit}. ${keeperName} is proud.`
            : `${creatorName} hit ${pact.goalTarget} ${pact.goalUnit} on “${pact.title}”. You witnessed it.`,
          sentAt: 'Just now',
          pactId: pact.id,
        });
        continue;
      }
    }

    // past the end date → settle the contract (deferred while the final
    // day is still inside the grace window)
    if (pact.endDate < today && pact.endDate !== graceKey && !result.pactUpdates.has(pact.id)) {
      let done = false;
      if (pact.type === 'goal' && pact.goalTarget) {
        const progress = checkIns
          .filter((c) => c.pactId === pact.id && c.status === 'completed')
          .reduce((s, c) => s + (c.progressValue ?? 0), 0);
        done = progress >= pact.goalTarget;
      } else {
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
        done = required > 0 && sealed / required >= 0.8;
      }
      result.pactUpdates.set(pact.id, done ? 'completed' : 'incomplete');
      result.newNotifications.push({
        id: autoId('n-auto'),
        type: done ? 'pact_completed' : 'pact_breach',
        title: done ? 'Pact completed in full' : 'A pact ran out of days',
        body: done
          ? iAmCreator
            ? `“${pact.title}” ran its course. ${keeperName} witnessed it all.`
            : `${creatorName} carried “${pact.title}” all the way. Well witnessed.`
          : iAmCreator
            ? `“${pact.title}” ended before the habit stuck. There is always a next pact.`
            : `${creatorName}’s “${pact.title}” ended unfinished.`,
        sentAt: 'Just now',
        pactId: pact.id,
      });
    }
  }

  return result;
}

/** Spec rule: cannot back-fill a check-in more than 7 days in the past. */
export function canBackfill(dateKey: string): boolean {
  return dateKey >= daysAgoKey(7) && dateKey <= todayKey();
}
