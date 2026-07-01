import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '../env';
import * as schema from './schema';

// prepare: false — required for Supabase's transaction-mode pooler in production.
// Exported so tests can close the connection pool after the suite (otherwise
// the open postgres-js handle keeps Vitest's worker alive and the run hangs).
export const client = postgres(env.databaseUrl, { prepare: false });

export const db = drizzle(client, { schema });
