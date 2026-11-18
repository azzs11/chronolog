import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    testTimeout: 10_000,
    // dotenv must not override these; app reads CORS_ORIGIN at import time.
    env: { NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost:3000' },
  },
});
