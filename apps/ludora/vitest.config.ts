import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'shared', include: ['packages/shared/test/**/*.test.ts'] } },
      // Full-game simulations (12 bots through a 4-minute game, with strict state checks) take a few seconds each.
      { test: { name: 'engine', include: ['packages/engine/test/**/*.test.ts'], testTimeout: 20_000 } },
      { test: { name: 'content', include: ['packages/content/test/**/*.test.ts'] } },
      {
        test: {
          name: 'server',
          include: ['server/test/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
          // Each file gets its own database; run files in parallel, tests in order.
          sequence: { concurrent: false },
        },
      },
    ],
  },
});
