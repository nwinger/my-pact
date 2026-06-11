import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import type { AppEnv } from '../context';
import { db } from '../db';
import { user } from '../db/schema';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The profile shape the client's `User` type expects (`name` is the username). */
function profile(u: {
  id: string;
  name: string;
  email: string;
  timezone?: string | null;
  notificationTime?: string | null;
  tintIndex?: number | null;
}) {
  return {
    id: u.id,
    username: u.name,
    email: u.email,
    timezone: u.timezone ?? 'UTC',
    notificationTime: u.notificationTime ?? '08:00',
    tintIndex: u.tintIndex ?? 0,
  };
}

export const users = new Hono<AppEnv>();

users.get('/me', (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);
  return c.json(profile(me));
});

users.patch('/me', async (c) => {
  const me = c.get('user');
  if (!me) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json<{
    username?: unknown;
    timezone?: unknown;
    notificationTime?: unknown;
  }>();

  const update: Partial<{ name: string; timezone: string; notificationTime: string }> = {};

  if (body.username !== undefined) {
    if (typeof body.username !== 'string' || body.username.trim().length < 3 || body.username.length > 50) {
      return c.json({ error: 'Usernames are 3–50 characters.' }, 400);
    }
    update.name = body.username.trim();
  }
  if (body.timezone !== undefined) {
    if (typeof body.timezone !== 'string' || !isValidTimezone(body.timezone)) {
      return c.json({ error: 'Invalid IANA timezone.' }, 400);
    }
    update.timezone = body.timezone;
  }
  if (body.notificationTime !== undefined) {
    if (typeof body.notificationTime !== 'string' || !TIME_RE.test(body.notificationTime)) {
      return c.json({ error: 'Notification time must be HH:MM.' }, 400);
    }
    update.notificationTime = body.notificationTime;
  }
  if (Object.keys(update).length === 0) {
    return c.json({ error: 'Nothing to update.' }, 400);
  }

  const [updated] = await db
    .update(user)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(user.id, me.id))
    .returning();

  return c.json(profile(updated));
});
