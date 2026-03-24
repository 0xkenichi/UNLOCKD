// vitest.config.ts
// Place at packages/backend root alongside package.json

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
      thresholds: {
        lines:     80,
        functions: 80,
        branches:  75,
        statements:80,
      },
    },
    // Longer timeout for integration-style tests that await BullMQ/Redis
    testTimeout: 15_000,
    // Run each test file in its own worker to avoid mock bleed
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: false },
    },
  },
});

// ─── package.json additions ──────────────────────────────────────────────────
// Add these to packages/backend/package.json:
//
// "scripts": {
//   "test":          "vitest run",
//   "test:watch":    "vitest",
//   "test:coverage": "vitest run --coverage"
// },
// "devDependencies": {
//   "vitest":          "^1.6.0",
//   "@vitest/coverage-v8": "^1.6.0"
// }
