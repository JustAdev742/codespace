import { execFileSync } from 'node:child_process';
import { expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
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
  // Every browser reports Content-Security-Policy violations as events, but only some log them.
  void page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI} in ${e.sourceFile}`)));
  // WebKit words a same-origin load cut off by a reload or navigation (sound files still
  // arriving, say) as failing "access control checks", sometimes as a console error and
  // sometimes as a page error. A same-origin request has no such checks to fail, so neither
  // is an error in the page.
  const webkit = page.context().browser()?.browserType().name() === 'webkit';
  const cutOff = (text: string) => {
    const cut = webkit ? /^Fetch API cannot load (.+) due to access control checks\.$/.exec(text) : null;
    return Boolean(cut && cut[1]!.includes(new URL(page.url()).host));
  };
  page.on('pageerror', (e) => {
    // The stack's first line holds the whole message; the name and message are split at "http:".
    if (!cutOff((e.stack ?? '').split('\n')[0]!)) errors.push(String(e));
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !cutOff(m.text())) errors.push(m.text());
  });
  return errors;
}

/** Like toBeFocused, but a failure says which element has focus instead. */
export async function expectFocused(target: Locator) {
  await expect
    .poll(() =>
      target.evaluate((el) => {
        const a = document.activeElement;
        return a === el ? 'focused' : `focus is on ${a ? a.outerHTML.slice(0, 160) : 'nothing'}`;
      }),
    )
    .toBe('focused');
}

/**
 * Answers whatever question is on a player's screen, right or wrong: a choice,
 * a typed number or word, select-all (one pick), an order (as shown) or a
 * matching (in the order shown). For games whose questions come in a random order.
 */
export async function answerAnyQuestion(page: Page) {
  const main = page.locator('main');
  const typed = main.getByPlaceholder(/^Type (a number|your answer)$/);
  const choices = main.getByRole('group', { name: 'Answers' });
  const order = main.getByRole('button', { name: 'Lock in this order' });
  const matches = main.getByRole('button', { name: 'Lock in matches' });
  await expect(typed.or(choices).or(order).or(matches).first()).toBeVisible();
  if (await typed.count()) {
    await typed.fill('1');
    await main.getByRole('button', { name: 'Submit answer' }).click();
  } else if (await order.count()) {
    await order.click();
  } else if (await matches.count()) {
    // Left items are toggles; each pick on the right pairs with the next unmatched left item.
    const columns = main.locator('.grid-cols-2 > div');
    await columns.nth(0).getByRole('button').first().click();
    for (const right of await columns.nth(1).getByRole('button').all()) await right.click();
    await matches.click();
  } else {
    await choices.getByRole('button').first().click();
    const submit = main.getByRole('button', { name: /^Submit \d+ answers?$/ });
    if (await submit.count()) await submit.click();
  }
}
