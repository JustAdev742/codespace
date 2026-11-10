import AxeBuilder from '@axe-core/playwright';
import { existsSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { CSRF, account, watchErrors } from './helpers.ts';

/*
 * Lantern Rally from join code to results: a host and two players on phones race a one-lap
 * race, once with 3D on (WebGL through SwiftShader, Chromium only) and once with 3D off, where
 * the circuit drawn from above stands in (every browser). Everything is played through the
 * ordinary buttons and keys, as a keyboard or screen reader user would: answering, boosting,
 * steering with the arrow keys and turning auto-steer on. axe checks the player's and the
 * host's screens mid-race.
 */

const chromium = (process.env.E2E_BROWSER ?? 'chromium') === 'chromium';
const localChromium = '/opt/pw-browsers/chromium';
if (chromium) test.use({ launchOptions: { ...(existsSync(localChromium) ? { executablePath: localChromium } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

async function join(browser: Browser, code: string, name: string, graphics: string, theme: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(([g, t]) => (localStorage.setItem('ludora.graphics', g!), localStorage.setItem('ludora.theme', t!)), [graphics, theme]);
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(`/join/${code}`);
  await page.getByLabel('Your name').fill(name);
  // On a school's copy guests pick their year, and drive in that year's uniform.
  if (process.env.E2E_SCHOOL_THEME === 'hills-grammar') await page.getByLabel('School year').selectOption({ label: name.startsWith('Ana') ? 'Year 9' : 'Kindergarten' });
  await page.getByRole('button', { name: 'Join game' }).click();
  await expect(page.getByText('You are in', { exact: true })).toBeVisible();
  return { context, page, errors };
}

/** One turn: answer the question on screen (every statement is true), then boost if there is a charge. */
async function turn(page: Page) {
  const main = page.locator('main');
  const yes = main.getByRole('button', { name: /^[A-F]? ?True$/ });
  // Buttons come and go as the race moves on: a click that misses is simply tried again next turn.
  if (await yes.count()) await yes.first().click({ timeout: 500 }).catch(() => {});
  const boost = main.getByRole('button', { name: /^Boost/ });
  if ((await boost.count()) && (await boost.isEnabled().catch(() => false))) await boost.click({ timeout: 500 }).catch(() => {});
}

async function play(browser: Browser, threeD: boolean) {
  const graphics = threeD ? 'high' : 'off';
  // The night theme with 3D on, the day theme with 3D off: both get an axe check.
  const theme = threeD ? 'dark' : 'light';
  const host = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera' });
  await host.context.addInitScript(([g, t]) => (localStorage.setItem('ludora.graphics', g!), localStorage.setItem('ludora.theme', t!)), [graphics, theme]);
  const hostErrors = watchErrors(host.page);
  const set = await host.page.request.post('/api/sets', {
    headers: CSRF,
    data: { title: 'Rally facts', description: 'All true', subject: 'science', visibility: 'private', questions: Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, type: 'truefalse', prompt: `Rally fact number ${i + 1} is true.`, correct: true })) },
  });
  expect(set.ok(), await set.text()).toBe(true);
  const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId: (await set.json()).set.id, modeId: 'lantern-rally', common: { timeLimitSec: 60 }, settings: { laps: 1, circuit: 'forest' } } });
  expect(room.ok(), await room.text()).toBe(true);
  const { code } = await room.json();
  await host.page.setViewportSize({ width: 1366, height: 768 });
  await host.page.goto(`/room/${code}`);
  await expect(host.page.getByRole('button', { name: 'Start game' })).toBeVisible();

  const ana = await join(browser, code, 'Ana Lightfoot', graphics, theme);
  const ben = await join(browser, code, 'Ben Quickwheel', graphics, theme);
  await host.page.getByRole('button', { name: 'Start game' }).click();

  // The race: a picture of it (3D or drawn from above), and the buttons that drive.
  const picture = (page: Page) => (threeD ? page.locator('canvas.s3-canvas') : page.getByRole('img', { name: /^(On the grid|You are)/ }));
  await expect(picture(ana.page)).toBeVisible({ timeout: 45_000 });
  const words = picture(ana.page);
  await expect(words).toHaveAttribute('aria-label', /^(On the grid at Lantern Wood, 1 lap\.|You are \d(st|nd) of 2, lap 1 of 1)/);
  await expect(ana.page.getByRole('button', { name: /^Boost ?0/ })).toBeDisabled();
  await expect(ana.page.getByRole('button', { name: 'Steer left' })).toBeVisible();
  await expect(ana.page.getByRole('button', { name: 'Steer right' })).toBeVisible();
  if (threeD) await expect(host.page.locator('canvas.s3-canvas').first()).toBeVisible();
  else await expect(host.page.getByRole('img', { name: /^Lantern Wood: 2 karts, 1 lap\./ })).toBeVisible();

  // A right answer gives a boost charge; once the lights are out a boost spends it, and the words say so.
  await ana.page.getByRole('button', { name: /^[A-F]? ?True$/ }).first().click();
  await expect(ana.page.getByText('+1 boost charge (+10 points)', { exact: true })).toBeVisible();
  await expect(words).toHaveAttribute('aria-label', /^You are \d(st|nd) of 2, lap 1 of 1, in the (left|middle|right) lane\./, { timeout: 10_000 });
  await ana.page.getByRole('button', { name: /^Boost ?1/ }).click();
  await expect(ana.page.getByRole('region', { name: 'Your race' }).getByText('Boost!')).toBeVisible();
  // Screen readers hear it too.
  await expect(ana.page.locator('.sr-only[role="status"][aria-live="polite"]')).toContainText(/Boost!|Up to|Down to|Lantern|Splash|cones/);
  // The arrow keys steer (the question's buttons are not focused).
  await ana.page.keyboard.press('ArrowRight');
  await ana.page.waitForTimeout(500);
  await ana.page.keyboard.press('ArrowRight');
  await expect(words).toHaveAttribute('aria-label', /in the right lane\./, { timeout: 5000 });
  // Auto-steer is a switch.
  await ben.page.getByRole('button', { name: /^Auto-steer: off/ }).click();
  await expect(ben.page.getByRole('button', { name: /^Auto-steer: on/ })).toHaveAttribute('aria-pressed', 'true');

  const look = `${process.env.E2E_SCHOOL_THEME || 'ludora'}-${threeD ? '3d-night' : '2d-day'}`;
  await ana.page.waitForTimeout(1500);
  // Give the big screen time to cut to the trackside, where the drivers face the camera.
  if (threeD) await host.page.waitForTimeout(5000);
  await ana.page.screenshot({ path: `test-results/rally-player-${look}.png` });
  await host.page.screenshot({ path: `test-results/rally-host-${look}.png` });
  expect(await axe(ana.page), 'player screen accessibility').toEqual([]);
  expect(await axe(host.page), 'host screen accessibility').toEqual([]);

  // Both race to the line (or the whistle).
  const over = (page: Page) => page.getByRole('heading', { level: 1, name: 'Game over' });
  for (let i = 0; i < 300 && !(await over(ana.page).isVisible()) && !(await over(host.page).isVisible()); i++) {
    await turn(ana.page);
    if (!(await over(ben.page).isVisible())) await turn(ben.page);
  }
  await expect(over(ana.page)).toBeVisible({ timeout: 40_000 });
  await expect(over(ben.page)).toBeVisible();
  await expect(host.page.getByText(/Game over|Results/).first()).toBeVisible();
  await expect(host.page.getByText(/won the race round Lantern Wood|was in front at the whistle/).first()).toBeVisible();

  expect(hostErrors).toEqual([]);
  expect(ana.errors).toEqual([]);
  expect(ben.errors).toEqual([]);
  await ana.context.close();
  await ben.context.close();
  await host.context.close();
}

test('a host and two players race Lantern Rally to the results with 3D on', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Headless Firefox and WebKit have no WebGL; the 3D picture is checked in Chromium.');
  test.setTimeout(300_000);
  await play(browser, true);
});

test('the same race plays with 3D off, on the circuit drawn from above', async ({ browser }) => {
  test.setTimeout(300_000);
  await play(browser, false);
});
