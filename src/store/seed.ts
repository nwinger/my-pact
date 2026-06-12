import { addDays, daysAgoKey, keyToDate, toKey } from '@/lib/dates';
import type { AppNotification, CheckIn, Friendship, Pact, User } from '@/store/types';

export const ME = 'u-me';

/**
 * API mode starts bare: just me (the server profile overwrites this on
 * sign-in), no demo pacts/friends/notifications. The domain stays local
 * until its server endpoints land, but it's the account's own data.
 */
export function buildBareState(): {
  users: User[];
  friendships: Friendship[];
  pacts: Pact[];
  checkIns: CheckIn[];
  notifications: AppNotification[];
} {
  return {
    users: [
      { id: ME, username: 'you', email: '', timezone: 'UTC', notificationTime: '08:00', tintIndex: 1 },
    ],
    friendships: [],
    pacts: [],
    checkIns: [],
    notifications: [],
  };
}

/**
 * All seed builders are factories: dates are relative to "now", so they
 * must be computed when the seed is actually installed (first launch or
 * demo reset) — never at module load time.
 */

export const seedUsers: User[] = [
  { id: ME, username: 'nicklas', email: 'you@mypact.app', timezone: 'Europe/Oslo', notificationTime: '08:00', tintIndex: 1 },
  { id: 'u-mia', username: 'mia', email: 'mia@mypact.app', timezone: 'Europe/Oslo', notificationTime: '07:30', tintIndex: 2 },
  { id: 'u-jonas', username: 'jonas', email: 'jonas@mypact.app', timezone: 'Europe/Oslo', notificationTime: '09:00', tintIndex: 0 },
  { id: 'u-sofia', username: 'sofia', email: 'sofia@mypact.app', timezone: 'Europe/Stockholm', notificationTime: '06:45', tintIndex: 3 },
  { id: 'u-emil', username: 'emil', email: 'emil@mypact.app', timezone: 'Europe/Oslo', notificationTime: '08:15', tintIndex: 4 },
  { id: 'u-anna', username: 'anna', email: 'anna@mypact.app', timezone: 'Europe/Copenhagen', notificationTime: '07:00', tintIndex: 2 },
];

export function buildSeedFriendships(): Friendship[] {
  return [
    { id: 'f-1', requesterId: ME, addresseeId: 'u-mia', status: 'accepted', createdAt: daysAgoKey(120) },
    { id: 'f-2', requesterId: 'u-jonas', addresseeId: ME, status: 'accepted', createdAt: daysAgoKey(90) },
    { id: 'f-3', requesterId: ME, addresseeId: 'u-sofia', status: 'accepted', createdAt: daysAgoKey(60) },
    { id: 'f-4', requesterId: 'u-emil', addresseeId: ME, status: 'accepted', createdAt: daysAgoKey(30) },
    { id: 'f-5', requesterId: 'u-anna', addresseeId: ME, status: 'pending', createdAt: daysAgoKey(1) },
  ];
}

function pact(p: Omit<Pact, 'status' | 'isMutual'> & Partial<Pick<Pact, 'status' | 'isMutual'>>): Pact {
  return { status: 'active', isMutual: false, ...p };
}

export function buildSeedPacts(): Pact[] {
  return [
    pact({
      id: 'p-run',
      creatorUserId: ME,
      keeperUserId: 'u-mia',
      title: 'Morning run before work',
      description: 'Out the door by 6:45, no snooze.',
      type: 'frequency',
      daysOfWeek: [1, 2, 3, 4, 5],
      startDate: daysAgoKey(24),
      endDate: toKey(addDays(new Date(), 36)),
      tintIndex: 0,
    }),
    pact({
      id: 'p-read',
      creatorUserId: ME,
      keeperUserId: 'u-jonas',
      title: 'Read 12 books this season',
      type: 'goal',
      goalTarget: 12,
      goalUnit: 'books',
      startDate: daysAgoKey(45),
      endDate: toKey(addDays(new Date(), 75)),
      tintIndex: 1,
    }),
    pact({
      id: 'p-meditate',
      creatorUserId: ME,
      keeperUserId: 'u-sofia',
      title: 'Meditate every single day',
      description: 'Ten quiet minutes, anywhere.',
      type: 'frequency',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startDate: daysAgoKey(12),
      endDate: toKey(addDays(new Date(), 48)),
      isMutual: true,
      mutualPactId: 'mp-meditate',
      tintIndex: 2,
    }),
    pact({
      id: 'p-swim',
      creatorUserId: ME,
      keeperUserId: 'u-emil',
      title: 'Swim 40 km before summer',
      type: 'goal',
      goalTarget: 40,
      goalUnit: 'km',
      startDate: daysAgoKey(30),
      endDate: toKey(addDays(new Date(), 60)),
      tintIndex: 3,
    }),
    pact({
      id: 'p-sugar',
      creatorUserId: ME,
      keeperUserId: 'u-mia',
      title: 'No sugar on weekdays',
      type: 'frequency',
      daysOfWeek: [1, 2, 3, 4, 5],
      startDate: daysAgoKey(80),
      endDate: daysAgoKey(10),
      status: 'completed',
      tintIndex: 4,
    }),
  ];
}

/** Pacts where a friend is the creator (I'm the keeper). */
export function buildSeedKeeperPacts(): Pact[] {
  return [
    pact({
      id: 'p-jonas-gym',
      creatorUserId: 'u-jonas',
      keeperUserId: ME,
      title: 'Gym three times a week',
      type: 'frequency',
      daysOfWeek: [1, 3, 5],
      startDate: daysAgoKey(20),
      endDate: toKey(addDays(new Date(), 40)),
      tintIndex: 1,
    }),
    // the linked twin of my mutual meditation pact — sofia's side
    pact({
      id: 'p-meditate-sofia',
      creatorUserId: 'u-sofia',
      keeperUserId: ME,
      title: 'Meditate every single day',
      description: 'Ten quiet minutes, anywhere.',
      type: 'frequency',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startDate: daysAgoKey(12),
      endDate: toKey(addDays(new Date(), 48)),
      isMutual: true,
      mutualPactId: 'mp-meditate',
      tintIndex: 3,
    }),
  ];
}

function isWeekday(key: string): boolean {
  const dow = keyToDate(key).getDay();
  return dow >= 1 && dow <= 5;
}

/**
 * Realistic history:
 *  - run pact: solid weekday streak with one genuine miss ~10 days back
 *    (anchored to the nearest weekday so it never lands on a weekend)
 *  - meditate: perfect since start (12 days), and sofia's twin nearly so
 *  - read: 7 of 12 books logged; swim: 26.5 of 40 km
 *  - jonas's gym pact: partial history, recent misses for the keeper story
 */
export function buildSeedCheckIns(): CheckIn[] {
  const out: CheckIn[] = [];
  let n = 0;
  const push = (c: Omit<CheckIn, 'id'>) => out.push({ id: `c-seed-${n++}`, ...c });

  // Morning run — weekdays, one missed weekday ~10 days back, none today yet
  const missIdx = [10, 9, 11, 12, 13].find((i) => isWeekday(daysAgoKey(i)));
  for (let i = 1; i <= 24; i++) {
    const key = daysAgoKey(i);
    if (!isWeekday(key)) continue;
    push({
      pactId: 'p-run',
      userId: ME,
      date: key,
      status: i === missIdx ? 'failed' : 'completed',
    });
  }

  // Meditate — every day since start (mutual: mine and most of sofia's twin)
  for (let i = 1; i <= 12; i++) {
    push({ pactId: 'p-meditate', userId: ME, date: daysAgoKey(i), status: 'completed' });
    if (i !== 3) {
      push({ pactId: 'p-meditate-sofia', userId: 'u-sofia', date: daysAgoKey(i), status: 'completed' });
    }
  }

  // Books — 7 logged across the window
  for (const d of [44, 38, 31, 24, 17, 9, 3]) {
    push({ pactId: 'p-read', userId: ME, date: daysAgoKey(d), status: 'completed', progressValue: 1 });
  }

  // Swim — sessions of varying distance, 26.5 km total
  const swims: [number, number][] = [
    [28, 2.0], [25, 3.0], [22, 2.5], [19, 3.5], [16, 2.0],
    [13, 3.0], [11, 2.5], [8, 3.0], [5, 2.5], [2, 2.5],
  ];
  for (const [d, km] of swims) {
    push({ pactId: 'p-swim', userId: ME, date: daysAgoKey(d), status: 'completed', progressValue: km });
  }

  // Completed sugar pact — fill its weekdays
  for (let i = 10; i <= 80; i++) {
    const key = daysAgoKey(i);
    if (!isWeekday(key)) continue;
    push({ pactId: 'p-sugar', userId: ME, date: key, status: 'completed' });
  }

  // Jonas's gym — showed up at first, slipped recently (keeper storyline)
  for (let i = 1; i <= 20; i++) {
    const key = daysAgoKey(i);
    const dow = keyToDate(key).getDay();
    if (![1, 3, 5].includes(dow)) continue;
    push({
      pactId: 'p-jonas-gym',
      userId: 'u-jonas',
      date: key,
      status: i <= 5 ? 'failed' : 'completed',
    });
  }

  return out;
}

export function buildSeedNotifications(): AppNotification[] {
  return [
    {
      id: 'n-1',
      type: 'friend_request',
      title: 'New pact request',
      body: 'anna wants to be your friend on My Pact.',
      sentAt: 'Today · 09:12',
      friendId: 'u-anna',
    },
    {
      id: 'n-2',
      type: 'daily_reminder',
      title: 'Pacts due today',
      body: 'Your morning run and meditation are waiting for your seal.',
      sentAt: 'Today · 08:00',
      pactId: 'p-run',
    },
    {
      id: 'n-3',
      type: 'pact_breach',
      title: 'jonas missed the gym',
      body: 'You are the keeper. A gentle nudge goes a long way.',
      sentAt: 'Yesterday · 21:30',
      pactId: 'p-jonas-gym',
    },
    {
      id: 'n-4',
      type: 'pact_completed',
      title: 'Pact sealed & completed',
      body: '“No sugar on weekdays” ran its full course. Mia is proud.',
      sentAt: 'Mon · 10:04',
      pactId: 'p-sugar',
      readAt: 'read',
    },
    {
      id: 'n-5',
      type: 'friend_accepted',
      title: 'emil accepted your request',
      body: 'You can now form pacts together.',
      sentAt: 'Last week',
      friendId: 'u-emil',
      readAt: 'read',
    },
  ];
}
