import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // local `supabase start` instance (ports shifted to 553xx)
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres',
  },
});
