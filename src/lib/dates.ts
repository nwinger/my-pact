/** Date helpers. All keys are local-date strings "YYYY-MM-DD". */

export function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return toKey(new Date());
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function daysAgoKey(n: number): string {
  return toKey(addDays(new Date(), -n));
}

export function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 0 = Sunday … 6 = Saturday, matching the domain model. */
export function dayOfWeek(key: string): number {
  return keyToDate(key).getDay();
}

export const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatShort(key: string): string {
  const d = keyToDate(key);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatLong(key: string): string {
  const d = keyToDate(key);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function relativeLabel(key: string): string {
  const today = todayKey();
  if (key === today) return 'Today';
  if (key === daysAgoKey(1)) return 'Yesterday';
  return formatShort(key);
}

export function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Days from today until key (negative if past). */
export function daysUntil(key: string): number {
  const ms = keyToDate(key).getTime() - keyToDate(todayKey()).getTime();
  return Math.round(ms / 86_400_000);
}
