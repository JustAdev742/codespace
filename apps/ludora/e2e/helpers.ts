import { execFileSync } from 'node:child_process';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { containsBlockedLanguage } from '@ludora/shared';

export const CSRF = { 'x-ludora-csrf': '1' };
let n = 0;
/** A fresh username. The name filter reads digits as letters, so the odd random name would be refused: those are skipped. */
export function uniqueName(prefix: string) {
  for (;;) {
    const name = `${prefix}${Date.now().toString(36).slice(-5)}${++n}`;
    if (!containsBlockedLanguage(name)) return name;
  }
}

export interface Player {
  context: BrowserContext;
  page: Page;
  username: string;
  password: string;
  userId: string;
}

/** A signed-in account in its own browser context, registered through the API. */
export async function account(browser: Browser, opts: { accountType?: 'player' | 'student' | 'teacher'; displayName?: string } = {}): Promise<Player> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const username = uniqueName('e2e');
  const password = 'a long e2e passphrase';
  const res = await page.request.post('/api/auth/register', { headers: CSRF, data: { username, password, displayName: opts.displayName ?? username, accountType: opts.accountType ?? 'player' } });
  expect(res.ok(), await res.text()).toBe(true);
  const me = await (await page.request.get('/api/auth/me')).json();
  return { context, page, username, password, userId: me.user.id };
}

/** Runs the operator CLI from the production build against the e2e database. */
export function operator(...args: string[]): string {
  return execFileSync('node', ['server/dist/admin.js', ...args], { env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/ludora_e2e' }, encoding: 'utf8' });
}

/** Collects page errors and console errors, so a test can assert there were none. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}
