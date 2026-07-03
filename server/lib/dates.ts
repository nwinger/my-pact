/**
 * Server-side date-key helpers. Pact dates are timezone-naive local date keys
 * ("YYYY-MM-DD") that the server authors from the acting user's stored IANA
 * timezone — clients send only a duration. Start = the creator's *own* today,
 * so drafting at 11 pm in Auckland never backdates the contract, and
 * end = start + duration − 1, so a "30-day" pact spans exactly 30 due days.
 *
 * Pure functions (the clock is a parameter) — date determinism is unit-tested
 * here so the route tests only assert consistency, never exact dates.
 */

/** "YYYY-MM-DD" of the instant `now` as seen in `timezone` (UTC on a bad zone). */
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  try {
    return dateKeyIn(timezone, now);
  } catch {
    // An invalid IANA name throws RangeError; a stored-garbage timezone must
    // never take pact creation down with it.
    return dateKeyIn('UTC', now);
  }
}

function dateKeyIn(timeZone: string, now: Date): string {
  // formatToParts instead of a locale-formatted string: the yyyy-mm-dd
  // assembly is explicit rather than riding on any locale's ordering.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Walk a date key forward (or back) by whole calendar days. Keys are plain
 * calendar days, so the walk runs in UTC — no DST edge can stretch or shrink
 * a step. `addDaysToKey(start, n - 1)` is the end date of an n-day pact.
 */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/**
 * Whole calendar days from `start` to `end` (negative when end precedes
 * start). The inverse of `addDaysToKey`, and — like it — computed in UTC so
 * DST never stretches a span. Accepting a Proposal uses this to infer the
 * contract's span from its provisional dates before re-anchoring (ADR-0006):
 * `daySpanOfKeys(start, end)` of an n-day pact is n − 1.
 */
export function daySpanOfKeys(start: string, end: string): number {
  const toUtc = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(end) - toUtc(start)) / 86_400_000);
}
