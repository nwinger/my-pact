import { describe, expect, it } from 'vitest';

import { addDaysToKey, daySpanOfKeys, todayInTimezone } from './dates';

describe('todayInTimezone', () => {
  // 2026-07-03 11:30 UTC: Auckland (UTC+12) is at 23:30 the same calendar day.
  it('returns the local calendar day of the zone, not the UTC day', () => {
    const now = new Date('2026-07-03T11:30:00Z');
    expect(todayInTimezone('Pacific/Auckland', now)).toBe('2026-07-03');
    expect(todayInTimezone('UTC', now)).toBe('2026-07-03');
  });

  // One hour later Auckland has rolled into tomorrow while UTC has not:
  // drafting at 00:30 in Auckland must anchor to Auckland's today.
  it('rolls forward past midnight in a UTC+ zone before UTC does', () => {
    const now = new Date('2026-07-03T12:30:00Z');
    expect(todayInTimezone('Pacific/Auckland', now)).toBe('2026-07-04');
    expect(todayInTimezone('UTC', now)).toBe('2026-07-03');
  });

  // 02:00 UTC is still 19:00 *yesterday* in Los Angeles (UTC-7 in July):
  // a UTC- zone must not be pushed into a day it hasn't reached.
  it('stays on yesterday in a UTC- zone after UTC midnight', () => {
    const now = new Date('2026-07-03T02:00:00Z');
    expect(todayInTimezone('America/Los_Angeles', now)).toBe('2026-07-02');
    expect(todayInTimezone('UTC', now)).toBe('2026-07-03');
  });

  it('gives two zones different days at the same instant when they straddle midnight', () => {
    const now = new Date('2026-07-03T12:30:00Z');
    expect(todayInTimezone('Pacific/Auckland', now)).toBe('2026-07-04');
    expect(todayInTimezone('America/Los_Angeles', now)).toBe('2026-07-03');
  });

  it('falls back to UTC for a garbage timezone instead of throwing', () => {
    const now = new Date('2026-07-03T02:00:00Z');
    expect(todayInTimezone('Not/AZone', now)).toBe('2026-07-03');
    expect(todayInTimezone('', now)).toBe('2026-07-03');
  });

  it('zero-pads single-digit months and days', () => {
    expect(todayInTimezone('UTC', new Date('2026-01-05T10:00:00Z'))).toBe('2026-01-05');
  });
});

describe('addDaysToKey', () => {
  it('adds within a month and is identity at zero', () => {
    expect(addDaysToKey('2026-07-03', 4)).toBe('2026-07-07');
    expect(addDaysToKey('2026-07-03', 0)).toBe('2026-07-03');
  });

  it('rolls over months, years, and leap days', () => {
    expect(addDaysToKey('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDaysToKey('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDaysToKey('2024-02-28', 1)).toBe('2024-02-29'); // leap year
    expect(addDaysToKey('2026-02-28', 1)).toBe('2026-03-01'); // non-leap
  });

  it('makes an n-day pact span exactly n due days (end = start + n − 1)', () => {
    // start..end inclusive: 2026-07-03 … 2026-08-01 is 30 calendar days.
    expect(addDaysToKey('2026-07-03', 30 - 1)).toBe('2026-08-01');
    expect(addDaysToKey('2026-07-03', 21 - 1)).toBe('2026-07-23');
    // the old client bug: end = start + 30 was a 31-due-day "30-day" pact
    expect(addDaysToKey('2026-07-03', 30)).not.toBe('2026-08-01');
  });
});

describe('daySpanOfKeys', () => {
  it('is the inverse of addDaysToKey: span of an n-day pact is n − 1', () => {
    expect(daySpanOfKeys('2026-07-03', addDaysToKey('2026-07-03', 29))).toBe(29);
    expect(daySpanOfKeys('2026-07-03', '2026-07-03')).toBe(0);
  });

  it('crosses months, years, and leap days without drift', () => {
    expect(daySpanOfKeys('2026-07-31', '2026-08-01')).toBe(1);
    expect(daySpanOfKeys('2025-12-31', '2026-01-01')).toBe(1);
    expect(daySpanOfKeys('2024-02-28', '2024-03-01')).toBe(2); // leap year
    expect(daySpanOfKeys('2026-02-28', '2026-03-01')).toBe(1); // non-leap
  });

  it('is negative when the end precedes the start', () => {
    expect(daySpanOfKeys('2026-07-03', '2026-07-01')).toBe(-2);
  });

  it('re-anchoring a proposal preserves its due-day count: start′ + span spans the same n days', () => {
    // A 30-day proposal drafted 2026-07-03 (end 2026-08-01), accepted on
    // 2026-07-10: the re-anchored end is 2026-08-08 — still 30 due days.
    const span = daySpanOfKeys('2026-07-03', '2026-08-01');
    expect(addDaysToKey('2026-07-10', span)).toBe('2026-08-08');
  });
});
