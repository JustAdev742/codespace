import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/*
 * End-to-end tests against the production build, served by the real server on
 * its own port with its own database (reset at start). Run with
 * `npm run test:e2e`, which builds first.
 */

export const E2E_PORT = Number(process.env.E2E_PORT ?? 8899);
export const E2E_BASE = `http://127.0.0.1:${E2E_PORT}`;
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/ludora_e2e';
// This development image ships a Chromium build; CI installs Playwright's own.
const localChromium = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: E2E_BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(existsSync(localChromium) ? { launchOptions: { executablePath: localChromium } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node e2e/reset-db.mjs && node --enable-source-maps server/dist/index.js',
    url: `${E2E_BASE}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      APP_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: String(E2E_PORT),
      PUBLIC_ORIGIN: E2E_BASE,
      EXTRA_ORIGINS: '',
      WEB_DIST: resolve('web/dist'),
      LOG_LEVEL: 'warn',
    },
  },
});
