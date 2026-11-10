import AxeBuilder from '@axe-core/playwright';
import { existsSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { CSRF, account, watchErrors } from './helpers.ts';

/*
 * Summit Scramble from join code to results: a host and two players on phones climb a short
 * game, once with 3D on (WebGL through SwiftShader) and once with 3D off, where the drawn side
 * view of the mountain stands in. Everything is played through the ordinary buttons, as a
 * keyboard or screen reader user would, and axe checks the player's and the host's screens.
 */

const localChromium = '/opt/pw-browsers/chromium';
test.use({ launchOptions: { ...(existsSync(localChromium) ? { executablePath: localChromium } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

async function join(browser: Browser, code: string, name: string, graphics: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript((g) => localStorage.setItem('ludora.graphics', g), graphics);
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(`/join/${code}`);
  await page.getByLabel('Your name').fill(name);
  // On a school's copy guests pick their year, and climb in that year's uniform.
  if (process.env.E2E_SCHOOL_THEME === 'hills-grammar') await page.getByLabel('School year').selectOption({ label: name.startsWith('Ana') ? 'Year 9' : 'Kindergarten' });
  await page.getByRole('button', { name: 'Join game' }).click();
  await expect(page.getByText('You are in', { exact: true })).toBeVisible();
  return { context, page, errors };
}

/** One turn of play: answer the question on screen (every statement is true), then climb or leap with the grip. */
async function turn(page: Page, leap: boolean) {
  const main = page.locator('main');
  const yes = main.getByRole('button', { name: /^[A-F]? ?True$/ });
  // Buttons come and go as the game moves on: a click that misses is simply tried again next turn.
  if (await yes.count()) await yes.first().click({ timeout: 2000 }).catch(() => {});
  const button = main.getByRole('button', { name: leap ? /^Leap ?\d+%/ : /^Climb ?1 grip/ });
  if ((await button.count()) && (await button.isEnabled().catch(() => false))) await button.click({ timeout: 2000 }).catch(() => {});
}

async function play(browser: Browser, threeD: boolean) {
  const graphics = threeD ? 'high' : 'off';
  const host = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera' });
  await host.context.addInitScript((g) => localStorage.setItem('ludora.graphics', g), graphics);
  const hostErrors = watchErrors(host.page);
  const set = await host.page.request.post('/api/sets', {
    headers: CSRF,
    data: { title: 'Mountain facts', description: 'All true', subject: 'science', visibility: 'private', questions: Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, type: 'truefalse', prompt: `Mountain fact number ${i + 1} is true.`, correct: true })) },
  });
  expect(set.ok(), await set.text()).toBe(true);
  const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId: (await set.json()).set.id, modeId: 'summit-scramble', common: { timeLimitSec: 40 }, settings: { wind: false } } });
  expect(room.ok(), await room.text()).toBe(true);
  const { code } = await room.json();
  await host.page.setViewportSize({ width: 1366, height: 768 });
  await host.page.goto(`/room/${code}`);
  await expect(host.page.getByRole('button', { name: 'Start game' })).toBeVisible();

  const ana = await join(browser, code, 'Ana Ridge', graphics);
  const ben = await join(browser, code, 'Ben Crag', graphics);
  await host.page.getByRole('button', { name: 'Start game' }).click();

  // The climb: a picture of the mountain (3D or drawn), and the buttons that move you.
  const picture = (page: Page) => (threeD ? page.locator('canvas.s3-canvas') : page.getByRole('img', { name: /^You are (on|at)/ }));
  // The mode's screens (and three.js, with 3D on) load when the game starts.
  await expect(picture(ana.page)).toBeVisible({ timeout: 45_000 });
  await expect(picture(ana.page)).toHaveAttribute('aria-label', /^You are at the foot of the mountain, 30 ledges below the summit\./);
  await expect(ana.page.getByRole('button', { name: /^Climb ?1 grip/ })).toBeDisabled();
  await expect(ana.page.getByRole('button', { name: /^Leap ?70% ?: up 4 ledges for 2 grip\. Works 7 times in 10/ })).toBeVisible();
  if (threeD) await expect(host.page.locator('canvas.s3-canvas')).toBeVisible();
  else await expect(host.page.getByRole('img', { name: /^The mountain: 2 climbers/ })).toBeVisible();

  // A right answer gives grip; a climb spends it and the picture's words follow.
  await ana.page.getByRole('button', { name: /^[A-F]? ?True$/ }).first().click();
  await expect(ana.page.getByText('+1 grip')).toBeVisible();
  await ana.page.getByRole('button', { name: /^Climb ?1 grip/ }).click();
  await expect(picture(ana.page)).toHaveAttribute('aria-label', /^You are on ledge 1 of 30\./);
  await expect(ana.page.getByRole('region', { name: 'Your climb' }).getByText('You climbed to ledge 1.')).toBeVisible();
  // Screen readers hear it too, once the move has played.
  await expect(ana.page.locator('.sr-only[role="status"][aria-live="polite"]')).toContainText('You climbed to ledge 1.');

  const look = `${process.env.E2E_SCHOOL_THEME || 'ludora'}-${threeD ? '3d' : '2d'}`;
  await ana.page.screenshot({ path: `test-results/summit-player-${look}.png` });
  await host.page.screenshot({ path: `test-results/summit-host-${look}.png` });
  expect(await axe(ana.page), 'player screen accessibility').toEqual([]);
  expect(await axe(host.page), 'host screen accessibility').toEqual([]);

  // Both climb (Ben leaps) until the time runs out.
  const over = (page: Page) => page.getByRole('heading', { level: 1, name: 'Game over' });
  for (let i = 0; i < 120 && !(await over(ana.page).isVisible()); i++) {
    await turn(ana.page, false);
    if (!(await over(ben.page).isVisible())) await turn(ben.page, true);
    await ana.page.waitForTimeout(150);
  }
  await expect(over(ana.page)).toBeVisible({ timeout: 30_000 });
  await expect(over(ben.page)).toBeVisible();
  await expect(host.page.getByText(/Game over|Results/).first()).toBeVisible();
  await expect(host.page.getByText(/climbed highest|reached the summit first/).first()).toBeVisible();

  expect(hostErrors).toEqual([]);
  expect(ana.errors).toEqual([]);
  expect(ben.errors).toEqual([]);
  await ana.context.close();
  await ben.context.close();
  await host.context.close();
}

test('a host and two players climb Summit Scramble to the results with 3D on', async ({ browser }) => {
  test.setTimeout(150_000);
  await play(browser, true);
});

test('the same climb plays with 3D off, on the drawn side view', async ({ browser }) => {
  test.setTimeout(150_000);
  await play(browser, false);
});
