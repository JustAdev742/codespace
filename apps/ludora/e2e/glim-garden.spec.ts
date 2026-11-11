import AxeBuilder from '@axe-core/playwright';
import { existsSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { CSRF, account, watchErrors } from './helpers.ts';

/*
 * Glim Garden from join code to results: a host and two players on phones grow
 * the class garden, once with 3D on (WebGL through SwiftShader, Chromium only)
 * and once with 3D off, where the drawn garden stands in (every browser).
 * Everything is played through the ordinary buttons, by keyboard for one
 * player and by tapping for the other: answering, planting, watering and
 * giving a drop to a neighbour. The words for the picture and the live region
 * are checked, axe checks the player's and the host's screens, and the results
 * open on the garden the class grew (with the table hidden in the 3D-off run).
 */

const chromium = (process.env.E2E_BROWSER ?? 'chromium') === 'chromium';
const localChromium = '/opt/pw-browsers/chromium';
if (chromium) test.use({ launchOptions: { ...(existsSync(localChromium) ? { executablePath: localChromium } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = async (page: Page) => (await new AxeBuilder({ page }).include('main').withTags(AXE_TAGS).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
const noToasts = (page: Page) => expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 20_000 });

async function join(browser: Browser, code: string, name: string, graphics: string, theme: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(([g, t]) => (localStorage.setItem('ludora.graphics', g!), localStorage.setItem('ludora.theme', t!)), [graphics, theme]);
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(`/join/${code}`);
  await page.getByLabel('Your name').fill(name);
  // On a school's copy guests pick their year, and garden in that year's uniform.
  if (process.env.E2E_SCHOOL_THEME === 'hills-grammar') await page.getByLabel('School year').selectOption({ label: name.startsWith('Ana') ? 'Year 9' : 'Kindergarten' });
  await page.getByRole('button', { name: 'Join game' }).click();
  await expect(page.getByText('You are in', { exact: true })).toBeVisible();
  return { context, page, errors };
}

const main = (page: Page) => page.locator('main');
const trueButton = (page: Page) => main(page).getByRole('group', { name: 'Answers' }).getByRole('button', { name: /True$/ });

/** Answer the question on screen right (every statement is true). Never waits long: the game can end at any moment. */
async function answer(page: Page) {
  const yes = trueButton(page);
  if (await yes.count()) await yes.first().click({ timeout: 1500 }).catch(() => {});
}

/** Spend a drop if there is one: water, else give to whoever needs it most, else plant. */
async function useDrop(page: Page) {
  const m = main(page);
  for (const name of [/^Water your/, /^Give .+ a drop/, /^Plant a Bush/]) {
    const b = m.getByRole('button', { name }).first();
    if ((await b.count()) && (await b.isEnabled().catch(() => false))) {
      await b.click({ timeout: 1500 }).catch(() => {});
      return;
    }
  }
}

async function play(browser: Browser, threeD: boolean) {
  const graphics = threeD ? 'high' : 'off';
  // The night theme with 3D on, the day theme with 3D off: both get an axe check.
  const theme = threeD ? 'dark' : 'light';
  const host = await account(browser, { accountType: 'teacher', displayName: 'Mrs Okonjo' });
  await host.context.addInitScript(([g, t]) => (localStorage.setItem('ludora.graphics', g!), localStorage.setItem('ludora.theme', t!)), [graphics, theme]);
  const hostErrors = watchErrors(host.page);
  const set = await host.page.request.post('/api/sets', {
    headers: CSRF,
    data: { title: 'Garden facts', description: 'All true', subject: 'science', visibility: 'private', questions: Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, type: 'truefalse', prompt: `Garden fact number ${i + 1} is true.`, correct: true })) },
  });
  expect(set.ok(), await set.text()).toBe(true);
  // With 3D off the host hides the table: the results show only the garden.
  const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId: (await set.json()).set.id, modeId: 'glim-garden', common: { timeLimitSec: 75 }, settings: { showTable: threeD, size: 'small' } } });
  expect(room.ok(), await room.text()).toBe(true);
  const { code } = await room.json();
  await host.page.setViewportSize({ width: 1366, height: 768 });
  await host.page.goto(`/room/${code}`);
  await expect(host.page.getByRole('button', { name: 'Start game' })).toBeVisible();

  const ana = await join(browser, code, 'Ana Greenwood', graphics, theme);
  const ben = await join(browser, code, 'Ben Rainsworth-Longname', graphics, theme);
  await host.page.getByRole('button', { name: 'Start game' }).click();

  // The garden: a picture of it (3D or drawn), and the buttons beside it.
  const picture = (page: Page) => (threeD ? page.locator('canvas.s3-canvas') : page.getByRole('img', { name: /^Your plot:/ }));
  await expect(picture(ana.page)).toBeVisible({ timeout: 45_000 });
  const words = ana.page.locator('[aria-label^="Your plot:"]').first();
  await expect(words).toHaveAttribute('aria-label', /^Your plot: bare earth\. 0 of 4 fireflies\. Next to you: Ben Rainsworth-Longname, bare earth\. The garden: 0 of 2 plots glowing\./);
  if (threeD) await expect(host.page.locator('canvas.s3-canvas').first()).toBeVisible();
  else await expect(host.page.getByRole('img', { name: /^The class garden at night: 2 plots/ })).toBeVisible();
  await expect(host.page.getByRole('progressbar', { name: /glowing plots/ })).toBeVisible();

  // No drops yet: every seed waits for a right answer.
  const plantBush = ana.page.getByRole('button', { name: /^Plant a Bush ?: 4 drops, 3 fireflies ?\./ });
  await expect(plantBush).toBeDisabled();
  await trueButton(ana.page).first().click();
  await expect(ana.page.getByText('+1 drop', { exact: true })).toBeVisible();
  // Ana plants by keyboard.
  await expect(plantBush).toBeEnabled();
  await plantBush.focus();
  await ana.page.keyboard.press('Enter');
  await expect(words).toHaveAttribute('aria-label', /^Your plot: a bush seed, 4 drops to go\./);
  const announcer = (p: Page) => p.locator('.sr-only[role="status"][aria-live="polite"]');
  await expect(announcer(ana.page)).toContainText('You planted a bush seed.');
  // A right answer, then water by keyboard.
  await trueButton(ana.page).first().click();
  const water = ana.page.getByRole('button', { name: /^Water your bush ?: 4 drops to go ?\./ });
  await expect(water).toBeEnabled();
  await water.focus();
  await ana.page.keyboard.press('Enter');
  await expect(words).toHaveAttribute('aria-label', /^Your plot: a bush, 3 drops to go\./);

  // Ben taps: a right answer, then a drop for Ana, the neighbour who needs it most.
  await trueButton(ben.page).first().click();
  const gift = ben.page.getByRole('button', { name: /^Give Ana Greenwood a drop ?: Growing bush: needs it most ?\./ });
  await expect(gift).toBeEnabled();
  await gift.click();
  await expect(announcer(ben.page)).toContainText('You gave Ana Greenwood a drop.');
  await expect(announcer(ana.page)).toContainText('Ben Rainsworth-Longname gave your plant a drop.');
  await expect(words).toHaveAttribute('aria-label', /^Your plot: a bush, 2 drops to go\. 1 of 4 fireflies\./);
  await expect(host.page.getByRole('list', { name: 'Garden news' })).toContainText('Ben Rainsworth-Longname gave Ana Greenwood a drop.');

  const look = `${process.env.E2E_SCHOOL_THEME || 'ludora'}-${threeD ? '3d-night' : '2d-day'}`;
  await noToasts(ana.page);
  await noToasts(host.page);
  await ana.page.evaluate(() => window.scrollTo(0, 0));
  await ana.page.waitForTimeout(threeD ? 2500 : 500);
  await ana.page.screenshot({ path: `test-results/garden-player-${look}.png` });
  await host.page.screenshot({ path: `test-results/garden-host-${look}.png` });
  expect(await axe(ana.page), 'player screen accessibility').toEqual([]);
  // The same player on a school laptop: two columns, nothing wider than the screen.
  await ana.page.setViewportSize({ width: 1366, height: 768 });
  await ana.page.waitForTimeout(threeD ? 2000 : 300);
  await ana.page.screenshot({ path: `test-results/garden-player-laptop-${look}.png` });
  expect(await ana.page.evaluate(() => document.documentElement.scrollWidth)).toBe(1366);
  await ana.page.setViewportSize({ width: 390, height: 844 });
  expect(await axe(host.page), 'host screen accessibility').toEqual([]);
  // The whole big screen fits a school laptop's 1366 x 768 without scrolling.
  expect(await host.page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }))).toEqual({ w: 1366, h: 768 });

  // Both keep gardening until morning.
  const over = (page: Page) => page.getByRole('heading', { level: 1, name: /^(Game over|Victory)$/ });
  page_loop: for (let i = 0; i < 400; i++) {
    for (const p of [ana.page, ben.page]) {
      if (await over(p).isVisible()) break page_loop;
      await answer(p);
      await useDrop(p);
    }
  }
  await expect(over(ana.page)).toBeVisible({ timeout: 60_000 });
  await expect(over(ben.page)).toBeVisible();
  // The results open on the garden the class grew.
  await expect(host.page.getByRole('heading', { name: /^The garden (is full|you grew)$/ })).toBeVisible();
  await expect(host.page.getByRole('img', { name: /^The garden the class grew: 2 plots/ })).toBeVisible();
  await expect(ana.page.getByRole('heading', { name: /^The garden (is full|you grew)$/ })).toBeVisible();
  if (threeD) await expect(host.page.getByRole('list', { name: 'Final standings' })).toContainText('Ana Greenwood');
  else await expect(host.page.getByRole('list', { name: 'Final standings' })).toHaveCount(0);
  await host.page.screenshot({ path: `test-results/garden-results-${look}.png` });

  expect(hostErrors).toEqual([]);
  expect(ana.errors).toEqual([]);
  expect(ben.errors).toEqual([]);
  await ana.context.close();
  await ben.context.close();
  await host.context.close();
}

test('a host and two players grow Glim Garden to the results with 3D on', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Headless Firefox and WebKit have no WebGL; the 3D picture is checked in Chromium.');
  test.setTimeout(300_000);
  await play(browser, true);
});

test('the same garden grows with 3D off, on the drawn garden, with the table hidden', async ({ browser }) => {
  test.setTimeout(300_000);
  await play(browser, false);
});
