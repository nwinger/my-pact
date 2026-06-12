/**
 * Typed client for the Hono backend (server/). When EXPO_PUBLIC_API_URL is
 * unset the app runs in offline demo mode and none of this is called.
 */

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '') || null;

/** false = offline demo mode (mock auth, seeded data). */
export const apiEnabled = API_URL !== null;

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
  if (!API_URL) throw new ApiError('API is not configured.', 0);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: opts.method ?? 'GET',
      headers: {
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
