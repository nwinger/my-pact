import { addDays, dayOfWeek, gracePeriodKey, keyToDate, toKey, todayKey } from '@/lib/dates';
import type { CheckIn, Pact } from '@/store/types';

function isRequiredDay(pact: Pact, key: string): boolean {
  if (pact.type === 'goal') return true; // goal pacts: any day counts
  const dow = dayOfWeek(key);
  return (pact.daysOfWeek ?? []).includes(dow);
}

/** Whether the pact requires a check-in on the given date. */
export function isRequiredOn(pact: Pact, key: string): boolean {
  return isRequiredDay(pact, key);
}

function inRange(pact: Pact, key: string): boolean {
  return key >= pact.startDate && key <= pact.endDate;
}

export function isDueToday(pact: Pact): boolean {
  const today = todayKey();
  if (pact.status !== 'active') return false;
  if (!inRange(pact, today)) return false;
  return isRequiredDay(pact, today);
}

export function hasCheckedInOn(checkIns: CheckIn[], pact: Pact, key: string): boolean {
  return checkIns.some(
    (c) => c.pactId === pact.id && c.date === key && c.status === 'completed'
  );
}

/** Any check-in (completed OR failed) exists for the date — mirrors the store's uniqueness guard. */
export function hasAnyCheckInOn(checkIns: CheckIn[], pact: Pact, key: string): boolean {
  return checkIns.some((c) => c.pactId === pact.id && c.date === key);
}

/**
 * Current streak: walk back from today across the pact's required days,
 * counting consecutive completed check-ins. Days that are still open —
 * today, and yesterday during the 00:00–00:30 grace window — don't break
 * the streak when unsealed, but a recorded `failed` always does.
 */
export function currentStreak(pact: Pact, checkIns: CheckIn[]): number {
  const mine = new Map<string, CheckIn>();
  for (const c of checkIns) if (c.pactId === pact.id) mine.set(c.date, c);

  const graceKey = gracePeriodKey();
  let streak = 0;
  let cursor = keyToDate(todayKey());
  let isToday = true;

  for (let i = 0; i < 366; i++) {
    const key = toKey(cursor);
    if (key < pact.startDate) break;
    if (isRequiredDay(pact, key) && inRange(pact, key)) {
      const hit = mine.get(key);
      if (hit?.status === 'completed') {
        streak += 1;
      } else if (hit?.status === 'failed') {
        break;
      } else if (isToday || key === graceKey) {
        // the day is still open — skip without breaking
      } else {
        break;
      }
    }
    isToday = false;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/**
 * Longest run of consecutive completed required days across the pact's
 * whole history. Still-open days (today / the grace day) don't reset it.
 */
export function longestStreak(pact: Pact, checkIns: CheckIn[]): number {
  const mine = new Map<string, CheckIn>();
  for (const c of checkIns) if (c.pactId === pact.id) mine.set(c.date, c);

  const today = todayKey();
  const graceKey = gracePeriodKey();
  const end = pact.endDate < today ? pact.endDate : today;
  let best = 0;
  let run = 0;
  let cursor = keyToDate(pact.startDate);
  const endDate = keyToDate(end);

  while (cursor <= endDate) {
    const key = toKey(cursor);
    if (isRequiredDay(pact, key)) {
      const hit = mine.get(key);
      if (hit?.status === 'completed') {
        run += 1;
        if (run > best) best = run;
      } else if (key === today || key === graceKey) {
        // still open — neither counts nor resets
      } else {
        run = 0;
      }
    }
    cursor = addDays(cursor, 1);
  }
  return best;
}

export function completedCount(pact: Pact, checkIns: CheckIn[]): number {
  return checkIns.filter((c) => c.pactId === pact.id && c.status === 'completed').length;
}

export function goalProgress(pact: Pact, checkIns: CheckIn[]): number {
  return checkIns
    .filter((c) => c.pactId === pact.id && c.status === 'completed')
    .reduce((sum, c) => sum + (c.progressValue ?? 0), 0);
}

/** 0..1 progress for any pact type. */
export function progressRatio(pact: Pact, checkIns: CheckIn[]): number {
  if (pact.type === 'goal' && pact.goalTarget) {
    return Math.min(1, goalProgress(pact, checkIns) / pact.goalTarget);
  }
  // frequency: completed check-ins over total required days in range
  let required = 0;
  let cursor = keyToDate(pact.startDate);
  const end = keyToDate(pact.endDate);
  while (cursor <= end) {
    if (isRequiredDay(pact, toKey(cursor))) required += 1;
    cursor = addDays(cursor, 1);
  }
  if (required === 0) return 0;
  return Math.min(1, completedCount(pact, checkIns) / required);
}

/** Last 7 calendar days as {key, state} for the week strip. */
export type DayCell = {
  key: string;
  state: 'done' | 'missed' | 'rest' | 'future' | 'today-open';
};

export function lastSevenDays(pact: Pact, checkIns: CheckIn[]): DayCell[] {
  const mine = new Map<string, CheckIn>();
  for (const c of checkIns) if (c.pactId === pact.id) mine.set(c.date, c);

  const cells: DayCell[] = [];
  const today = todayKey();
  const graceKey = gracePeriodKey();
  for (let i = 6; i >= 0; i--) {
    const key = toKey(addDays(keyToDate(today), -i));
    if (key < pact.startDate || key > pact.endDate || !isRequiredDay(pact, key)) {
      cells.push({ key, state: 'rest' });
      continue;
    }
    const hit = mine.get(key);
    if (hit?.status === 'completed') cells.push({ key, state: 'done' });
    else if (hit?.status === 'failed') cells.push({ key, state: 'missed' });
    else if (key === today || key === graceKey) cells.push({ key, state: 'today-open' });
    // goal pacts have no required days — an unlogged day is rest, not a miss
    else if (pact.type === 'goal') cells.push({ key, state: 'rest' });
    else cells.push({ key, state: 'missed' });
  }
  return cells;
}
