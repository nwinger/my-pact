/**
 * Typed client for the Hono backend (server/). EXPO_PUBLIC_API_URL is
 * required — there is no offline mode (ADR-0004); an unset URL fails fast
 * at module load instead of silently becoming a different app.
 */

import { Platform } from 'react-native';

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
if (!API_URL) {
  throw new Error(
    'EXPO_PUBLIC_API_URL is not set — My Pact needs its backend API to run. ' +
      'Fix: copy .env.example to .env (it points the app at http://localhost:8787) ' +
      'and restart the dev server. Full backend setup: docs/backend-setup.md'
  );
}

// Native fetch sends `Origin: null`, which Better Auth's CSRF check rejects.
// Its expo() server plugin trusts this header instead (must match app.json's
// scheme and the server's APP_SCHEME).
const ORIGIN_HEADERS: Record<string, string> =
  Platform.OS === 'web' ? {} : { 'expo-origin': 'mypact://' };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 0) {
    return 'Can’t reach the server — is the API running?';
  }
  if (e instanceof Error && e.message) return e.message;
  return 'Something went wrong. Try again.';
}

/** Server profile, shaped like the client's `User` (sans local-only fields). */
export type ApiProfile = {
  id: string;
  username: string;
  email: string;
  timezone: string;
  notificationTime: string;
  tintIndex: number;
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  timezone?: string | null;
  notificationTime?: string | null;
  tintIndex?: number | null;
};

function toProfile(u: AuthUser): ApiProfile {
  return {
    id: u.id,
    username: u.name,
    email: u.email,
    timezone: u.timezone ?? 'UTC',
    notificationTime: u.notificationTime ?? '08:00',
    tintIndex: u.tintIndex ?? 0,
  };
}

async function call<T>(
  path: string,
  opts: { method?: string; token?: string | null; body?: unknown } = {}
): Promise<{ data: T; headers: Headers }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        ...ORIGIN_HEADERS,
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError('Network request failed.', 0);
  }
  let json: { message?: string; error?: string; code?: string } | null = null;
  try {
    const text = await res.text();
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new ApiError(
      json?.message ?? json?.error ?? `Request failed (${res.status}).`,
      res.status,
      json?.code
    );
  }
  return { data: json as T, headers: res.headers };
}

/** Reads the bearer session token Better Auth puts in `set-auth-token`. */
function sessionToken(headers: Headers): string {
  const token = headers.get('set-auth-token');
  if (!token) throw new ApiError('No session token in response.', 500);
  return token;
}

export async function signUpEmail(input: {
  username: string;
  email: string;
  password: string;
  timezone: string;
}): Promise<{ token: string; profile: ApiProfile }> {
  const { data, headers } = await call<{ user: AuthUser }>('/auth/sign-up/email', {
    method: 'POST',
    body: {
      name: input.username,
      email: input.email,
      password: input.password,
      timezone: input.timezone,
    },
  });
  return { token: sessionToken(headers), profile: toProfile(data.user) };
}

export async function signInEmail(input: {
  email: string;
  password: string;
}): Promise<{ token: string; profile: ApiProfile }> {
  const { data, headers } = await call<{ user: AuthUser }>('/auth/sign-in/email', {
    method: 'POST',
    body: input,
  });
  return { token: sessionToken(headers), profile: toProfile(data.user) };
}

export async function signOutSession(token: string): Promise<void> {
  await call('/auth/sign-out', { method: 'POST', token, body: {} });
}

export async function fetchMe(token: string): Promise<ApiProfile> {
  const { data } = await call<ApiProfile>('/users/me', { token });
  return data;
}

export async function updateMe(
  token: string,
  patch: Partial<Pick<ApiProfile, 'username' | 'timezone' | 'notificationTime'>>
): Promise<ApiProfile> {
  const { data } = await call<ApiProfile>('/users/me', { method: 'PATCH', token, body: patch });
  return data;
}

/** One friendship oriented from the caller's side: the `user` is the counterpart. */
export type ApiFriendItem = {
  friendshipId: string;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  createdAt: string;
  user: ApiProfile;
};

/** GET /friends — the caller's social graph, partitioned server-side. */
export async function listFriends(
  token: string
): Promise<{ friends: ApiFriendItem[]; incoming: ApiFriendItem[]; outgoing: ApiFriendItem[] }> {
  const { data } = await call<{
    friends: ApiFriendItem[];
    incoming: ApiFriendItem[];
    outgoing: ApiFriendItem[];
  }>('/friends', { token });
  return data;
}

/** POST /friends/requests — send a request by email; the server resolves the target. */
export async function sendFriendRequestApi(
  token: string,
  email: string
): Promise<{ result: 'not_found' | 'self' | 'duplicate' | 'sent' }> {
  const { data } = await call<{ result: 'not_found' | 'self' | 'duplicate' | 'sent' }>(
    '/friends/requests',
    { method: 'POST', token, body: { email } }
  );
  return data;
}

/** POST /friends/:id/accept — the addressee accepts an incoming request. */
export async function acceptFriendApi(token: string, friendshipId: string): Promise<void> {
  await call(`/friends/${friendshipId}/accept`, { method: 'POST', token });
}

/** POST /friends/:id/decline — the addressee declines an incoming request. */
export async function declineFriendApi(token: string, friendshipId: string): Promise<void> {
  await call(`/friends/${friendshipId}/decline`, { method: 'POST', token });
}

/** POST /friends/:id/block — either participant blocks the bond. */
export async function blockFriendApi(token: string, friendshipId: string): Promise<void> {
  await call(`/friends/${friendshipId}/block`, { method: 'POST', token });
}

/** DELETE /friends/:id — either participant removes (soft-deletes) the bond. */
export async function removeFriendApi(token: string, friendshipId: string): Promise<void> {
  await call(`/friends/${friendshipId}`, { method: 'DELETE', token });
}
