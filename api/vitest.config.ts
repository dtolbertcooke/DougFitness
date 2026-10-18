// api/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    hookTimeout: 60_000, // mongodb-memory-server downloads a binary on first run
    // The first request in each test file pays cold-start costs (model init, index builds). With several
    // files running in parallel on a busy machine or a slow CI runner, the 5s default is too tight.
    testTimeout: 30_000,
    env: {
      // The setup file connects mongoose straight to the in-memory replset; this placeholder
      // only needs to satisfy env.ts's zod schema.
      MONGODB_URI: 'mongodb://localhost:27017/test',
      JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long',
      LOG_LEVEL: 'error', // quiets pino-http's per-request info logs; 'silent' isn't a valid Env value
    },
  },
});
