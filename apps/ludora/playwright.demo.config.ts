import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

/*
 * End-to-end tests for the playable demo: the static build, served under a
 * sub-path like a GitHub Pages project site, with no server behind it. Run
 * with `npm run test:demo`, which builds the demo first.
 */

const PORT = Number(process.env.DEMO_PORT ?? 8898);
const localChromium = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'demo.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-demo' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/ludora-demo/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(existsSync(localChromium) ? { launchOptions: { executablePath: localChromium } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node e2e/demo-server.mjs web/dist-demo ${PORT}`,
    url: `http://127.0.0.1:${PORT}/ludora-demo/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
