import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Under test: the server routes, plus exactly one React-Native-free client
// module — the pure friends normalization (ADR-0005). `include` whitelists
// that single file rather than globbing src/** so Vitest never wanders into
// the Expo tree (JSX, native modules, reanimated) which its esbuild-based
// transform is not set up to run.
export default defineConfig({
  resolve: {
    // Mirror tsconfig's `@/*` → `src/*` for the client module under test.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'src/lib/friends.test.ts'],
    // DB-backed tests share one real local Postgres; run files serially so
    // seeded rows from one file never race another (mirrors humanlab's
    // jest --runInBand).
    fileParallelism: false,
    // Integration tests against a live DB can flake on transient errors in CI;
    // locally a failure should fail immediately. Mirrors humanlab's
    // jest.retryTimes(2) under CI.
    retry: process.env.CI ? 2 : 0,
    // Close the postgres-js pool after each test file so the worker can exit.
    setupFiles: ['./server/test/setup.ts'],
  },
});
