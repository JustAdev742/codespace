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

// Chromium by default; CI also runs the suite in WebKit (Safari's engine) and Firefox with E2E_BROWSER.
const BROWSERS = {
  chromium: { ...devices['Desktop Chrome'], ...(existsSync(localChromium) ? { launchOptions: { executablePath: localChromium } } : {}) },
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
} as const;
const browser = (process.env.E2E_BROWSER ?? 'chromium') as keyof typeof BROWSERS;
if (!(browser in BROWSERS)) throw new Error(`E2E_BROWSER must be one of ${Object.keys(BROWSERS).join(', ')}`);

export default defineConfig({
  testDir: 'e2e',
  // The demo has its own config: a static build with no server (playwright.demo.config.ts).
  testIgnore: 'demo.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: E2E_BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: browser, use: BROWSERS[browser] }],
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
      WEB_PRIVATE_DIST: resolve('web/dist-private'),
      // E2E_SCHOOL_THEME=hills-grammar runs the suite in a school's look.
      SCHOOL_THEME: process.env.E2E_SCHOOL_THEME ?? '',
      LOG_LEVEL: 'warn',
    },
  },
});
