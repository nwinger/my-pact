import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins/bearer';

import { db } from './db';
import * as schema from './db/schema';
import { env } from './env';

export const auth = betterAuth({
  baseURL: env.baseUrl,
  secret: env.authSecret,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: true,
    // matches the client's "Passwords are at least 6 characters" validation
    minPasswordLength: 6,
  },
  user: {
    additionalFields: {
      timezone: { type: 'string', required: false, defaultValue: 'UTC', input: true },
      notificationTime: { type: 'string', required: false, defaultValue: '08:00', input: false },
      tintIndex: { type: 'number', required: false, defaultValue: 0, input: false },
    },
  },
  // Google/Apple are scaffolded: they activate only when credentials are set.
  // See docs/backend-setup.md for the console setup checklist.
  socialProviders: {
    ...(env.google.clientId && env.google.clientSecret
      ? {
          google: {
            clientId: env.google.clientId,
            clientSecret: env.google.clientSecret,
          },
        }
      : {}),
    ...(env.apple.clientId && env.apple.clientSecret
      ? {
          apple: {
            clientId: env.apple.clientId,
            clientSecret: env.apple.clientSecret,
            appBundleIdentifier: env.apple.appBundleIdentifier,
          },
        }
      : {}),
  },
  trustedOrigins: env.corsOrigins,
  // bearer(): sign-in responses carry a `set-auth-token` header; clients send
  // it back as `Authorization: Bearer …` — no cookies, which suits Expo
  // native + cross-origin web.
  plugins: [bearer()],
});

export type SessionUser = typeof auth.$Infer.Session.user;
export type Session = typeof auth.$Infer.Session.session;
