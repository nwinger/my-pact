import { afterAll } from 'vitest';

import { client } from '../db';

// Vitest isolates each test file in its own module registry, so this `client`
// is the same singleton the file's tests use. Closing the postgres-js pool
// once the file's tests finish lets the worker exit instead of hanging on the
// open socket. `timeout` forces any lingering connection shut after 5s.
afterAll(async () => {
  await client.end({ timeout: 5 });
});
