const dev = process.env.NODE_ENV !== 'production';

/** Local `supabase start` DB (ports shifted to 553xx, see supabase/config.toml). */
const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';

function required(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (dev) return devFallback;
  throw new Error(`Missing required env var ${name}`);
}

const port = Number(process.env.PORT ?? 8787);

export const env = {
  dev,
  port,
  databaseUrl: required('DATABASE_URL', LOCAL_DB_URL),
  authSecret: required('BETTER_AUTH_SECRET', 'mypact-dev-secret-never-use-in-production'),
  /** Public origin this API is served from, e.g. https://my-pact.vercel.app */
  baseUrl: process.env.BETTER_AUTH_URL ?? `http://localhost:${port}`,
  corsOrigins: (
    process.env.CORS_ORIGINS ??
    'http://localhost:8081,http://localhost:8090,http://localhost:19006'
  ).split(','),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  apple: {
    clientId: process.env.APPLE_CLIENT_ID,
    clientSecret: process.env.APPLE_CLIENT_SECRET,
    appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER,
  },
};
