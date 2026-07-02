import { defineConfig } from 'vitest/config';

// The server is the only thing under test here. Scoping `include` to server/**
// keeps Vitest away from the React Native / Expo tree (JSX, native modules,
// reanimated) which its esbuild-based transform is not set up to run.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts'],
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
