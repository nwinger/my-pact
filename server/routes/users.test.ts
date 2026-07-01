import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, asAnon, asUser, cleanupCreated, seedUser } from '../test/harness';

// Smoke test for the test seam itself: one app.request() flows through routing,
// the session-guard middleware, and the handler against the real local
// Postgres. No new endpoints — it exercises the existing GET /users/me.
describe('GET /users/me (session-guarded profile route)', () => {
  let me: Awaited<ReturnType<typeof seedUser>>;

  beforeEach(async () => {
    me = await seedUser();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupCreated();
  });

  it('returns 401 when the request is anonymous', async () => {
    asAnon();
    const { status } = await api('/users/me');
    expect(status).toBe(401);
  });

  it('returns 200 with the profile shape when authenticated as the seeded user', async () => {
    asUser(me);
    const { status, json } = await api('/users/me');

    expect(status).toBe(200);
    await expect(json()).resolves.toEqual({
      id: me.id,
      username: me.name,
      email: me.email,
      timezone: 'UTC',
      notificationTime: '08:00',
      tintIndex: 0,
    });
  });
});
