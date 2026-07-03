import { randomUUID } from 'node:crypto';

import { inArray } from 'drizzle-orm';
import { vi } from 'vitest';

import { app } from '../app';
import { auth } from '../auth';
import { db } from '../db';
import { friendships, pacts, user } from '../db/schema';

type NewUser = typeof user.$inferInsert;
type UserRow = typeof user.$inferSelect;

// ── Request client ──────────────────────────────────────────────────────────
// One app.request() call exercises routing + the CORS/session middleware +
// the route handler together, against the real Hono app object.

type ApiInit = {
  method?: string;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
};

type ApiResult = {
  res: Response;
  status: number;
  /** Parse the JSON body. Safe to call more than once. */
  json: <T = unknown>() => Promise<T>;
};

export async function api(path: string, init: ApiInit = {}): Promise<ApiResult> {
  const { method = 'GET', body, token, headers = {} } = init;
  const finalHeaders: Record<string, string> = { ...headers };
  const reqInit: RequestInit = { method };
  if (body !== undefined) {
    finalHeaders['Content-Type'] ??= 'application/json';
    reqInit.body = JSON.stringify(body);
  }
  if (token) finalHeaders.Authorization = `Bearer ${token}`;
  reqInit.headers = finalHeaders;

  const res = await app.request('/api' + path, reqInit);
  return {
    res,
    status: res.status,
    json: <T = unknown>() => res.clone().json() as Promise<T>,
  };
}

// ── Session mocks ───────────────────────────────────────────────────────────
// app.ts resolves the caller via auth.api.getSession() on the auth singleton;
// spying on it lets tests drive the guard without real cookies/tokens. Casts
// go through `as any` because better-auth's inferred Session type is stricter
// than the minimal shape the guard reads (session?.user).

/** Authenticate the next request(s) as `u` until mocks are restored. */
export function asUser(u: UserRow): void {
  const session = {
    id: `test-session-${u.id}`,
    userId: u.id,
    token: `test-token-${u.id}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
  vi.spyOn(auth.api, 'getSession').mockResolvedValue({ user: u, session } as any);
}

/** Make the next request(s) anonymous until mocks are restored. */
export function asAnon(): void {
  vi.spyOn(auth.api, 'getSession').mockResolvedValue(null as any);
}

// ── Seeding + FK-safe cleanup ───────────────────────────────────────────────
// Every row this harness creates is tracked by id so cleanup only ever touches
// data the test made — never the pre-existing rows from manual testing.

const createdUserIds: string[] = [];
const createdFriendshipIds: string[] = [];
const createdPactIds: string[] = [];

/** Insert a real user row (unique id + email) and track it for cleanup. */
export async function seedUser(overrides: Partial<NewUser> = {}): Promise<UserRow> {
  const { id: overrideId, ...rest } = overrides;
  const id = overrideId ?? randomUUID();
  const [row] = await db
    .insert(user)
    .values({
      id,
      name: 'Test User',
      email: `test-${id}@example.test`,
      ...rest,
    })
    .returning();
  createdUserIds.push(row.id);
  return row;
}

/** Register a friendship id so cleanupCreated() removes it before its users. */
export function trackFriendship(id: string): void {
  createdFriendshipIds.push(id);
}

/** Register a pact id so cleanupCreated() removes it before its users. */
export function trackPact(id: string): void {
  createdPactIds.push(id);
}

/**
 * Delete everything this harness created, children before parents so foreign
 * keys stay satisfied: tracked pacts and friendships first, then tracked
 * users.
 */
export async function cleanupCreated(): Promise<void> {
  if (createdPactIds.length > 0) {
    await db.delete(pacts).where(inArray(pacts.id, createdPactIds));
    createdPactIds.length = 0;
  }
  if (createdFriendshipIds.length > 0) {
    await db.delete(friendships).where(inArray(friendships.id, createdFriendshipIds));
    createdFriendshipIds.length = 0;
  }
  if (createdUserIds.length > 0) {
    await db.delete(user).where(inArray(user.id, createdUserIds));
    createdUserIds.length = 0;
  }
}
