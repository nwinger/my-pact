import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { auth } from './auth';
import type { AppEnv } from './context';
import { env } from './env';
import { friends } from './routes/friends';
import { users } from './routes/users';

// Everything lives under /api: Vercel routes only api/ functions, so the
// catch-all api/[[...route]].ts serves the same paths in production that
// @hono/node-server serves locally.
export const app = new Hono<AppEnv>().basePath('/api');

if (env.dev) app.use(logger());

app.use(
  '*',
  cors({
    origin: env.corsOrigins,
    allowHeaders: ['Content-Type', 'Authorization'],
    // the bearer plugin returns the session token in this header on sign-in
    exposeHeaders: ['set-auth-token'],
    maxAge: 600,
  })
);

app.get('/health', (c) => c.json({ ok: true }));

// Better Auth owns /api/auth/* (its default basePath).
app.on(['POST', 'GET'], '/auth/*', (c) => {
  // Expo's native fetch sends the literal `Origin: null`, which Better Auth
  // rejects before its expo plugin can substitute the `expo-origin` scheme.
  // Drop it — a null origin carries no CSRF signal (native apps don't have
  // one), and browser clients always send a real origin that stays checked.
  const headers = c.req.raw.headers;
  if (headers.get('origin') === 'null') headers.delete('origin');
  return auth.handler(c.req.raw);
});

// Resolve the session (cookie or bearer) for everything else.
app.use('*', async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set('user', session?.user ?? null);
  c.set('session', session?.session ?? null);
  await next();
});

app.route('/users', users);
app.route('/friends', friends);
