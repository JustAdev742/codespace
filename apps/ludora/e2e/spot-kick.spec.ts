import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { CSRF, account, watchErrors } from './helpers.ts';

/*
 * Spot Kick: a host and two players play a short game to the results, once
 * with 3D on and once with 3D off. Players answer (every statement is true),
 * then take penalties with the ordinary buttons beside the picture; the
 * result of each shot is said in words. axe checks both screens mid-game.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function setUp(browser: Browser, graphics: 'auto' | 'off') {
  const host = await account(browser, { accountType: 'teacher', displayName: 'Mr Okafor' });
  const set = await host.page.request.post('/api/sets', {
    headers: CSRF,
    data: {
      title: 'Warm-up facts',
      description: 'Every statement is true',
      subject: 'science',
      visibility: 'private',
      questions: Array.from({ length: 8 }, (_, i) => ({ id: `q${i + 1}`, type: 'truefalse', prompt: `Warm-up statement number ${i + 1} is true.`, correct: true })),
    },
  });
  expect(set.ok(), await set.text()).toBe(true);
  const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId: (await set.json()).set.id, modeId: 'spot-kick', common: { timeLimitSec: 75 } } });
  expect(room.ok(), await room.text()).toBe(true);
  const { code } = await room.json();
  const graphicsChoice = (page: Page) => page.addInitScript((g) => localStorage.setItem('ludora.graphics', g), graphics);
  await graphicsChoice(host.page);
  await host.page.goto(`/room/${code}`);
  await expect(host.page.getByRole('button', { name: 'Start game' })).toBeVisible();

  const players: { page: Page; errors: string[]; close: () => Promise<void> }[] = [];
  for (const name of ['Sunny Otter', 'Brave Heron']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = watchErrors(page);
    await graphicsChoice(page);
    await page.goto(`/join/${code}`);
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Join game' }).click();
    await expect(page.getByText('You are in', { exact: true })).toBeVisible();
    players.push({ page, errors, close: () => context.close() });
  }
  return { host, players };
}

/** Answer the question on screen right (every statement is true). */
async function answerTrue(page: Page) {
  const choice = page.locator('main').getByRole('group', { name: 'Answers' }).getByRole('button', { name: /True$/ });
  // The game can end at any moment: never wait long on a control that may have gone.
  if (await choice.count()) await choice.first().click({ timeout: 2000 }).catch(() => {});
}

/** Take a penalty if a football is ready: by keyboard for the first player, by tapping for the second. */
async function shootIfReady(page: Page, aim: RegExp, keyboard: boolean): Promise<boolean> {
  const button = page.getByRole('button', { name: aim });
  if (!(await button.isEnabled({ timeout: 1000 }).catch(() => false))) return false;
  try {
    if (keyboard) {
      await button.focus({ timeout: 1000 });
      await page.keyboard.press('Enter');
    } else await button.click({ timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

async function play(browser: Browser, graphics: 'auto' | 'off') {
  const { host, players } = await setUp(browser, graphics);
  const hostErrors = watchErrors(host.page);
  await host.page.getByRole('button', { name: 'Start game' }).click();
  await expect(host.page.getByRole('heading', { name: 'Spot Kick' })).toBeVisible();
  const [a, b] = players;

  // The places are laid out like a goal, with their chances written on them.
  const shotTopLeft = /^Shoot top left ?, placed: \d+% goal, saved \d+% ?, wide 0% ?\./i;
  await expect(a!.page.getByRole('button', { name: shotTopLeft })).toBeVisible();
  await expect(a!.page.getByRole('button', { name: /^Shoot middle ?, placed:/i })).toBeVisible();
  await expect(a!.page.getByRole('button', { name: /^Shoot bottom right ?, placed:/i })).toBeVisible();
  // No football yet: the shot buttons wait for a right answer.
  await expect(a!.page.getByRole('button', { name: shotTopLeft })).toBeDisabled();
  // Blasted shots show their chance of flying wide.
  await a!.page.getByRole('button', { name: /^Blasted/ }).click();
  await expect(a!.page.getByRole('button', { name: /^Shoot top left ?, blasted: \d+% goal, saved \d+% ?, wide [1-9]\d*% ?\./i })).toBeVisible();
  await a!.page.getByRole('button', { name: /^Placed/ }).click();
  if (graphics === 'auto') await expect(a!.page.locator('canvas.s3-canvas')).toHaveCount(1);
  else await expect(a!.page.getByRole('img', { name: /^The goal mouth/ })).toBeVisible();

  let shotsA = 0;
  let shotsB = 0;
  let checked = false;
  const announcer = (p: Page) => p.locator('.sr-only[role="status"][aria-live="polite"]');
  const over = (p: Page) => p.getByRole('heading', { level: 1, name: 'Game over' });
  for (let round = 0; round < 80 && !(await over(a!.page).isVisible()); round++) {
    await answerTrue(a!.page);
    await answerTrue(b!.page);
    if (await shootIfReady(a!.page, shotsA % 2 ? /^Shoot bottom right ?, placed:/i : /^Shoot top left ?, placed:/i, true)) shotsA++;
    if (await shootIfReady(b!.page, shotsB % 2 ? /^Shoot middle ?, placed:/i : /^Shoot top right ?, placed:/i, false)) shotsB++;
    if (!checked && shotsA > 0) {
      // What happened to the shot, in words, once the picture has shown it.
      await expect(announcer(a!.page)).toContainText(/Goal!|Double goal!|Saved|Over the bar|Wide of the post|Off the (post|crossbar)/, { timeout: 8000 });
      await expect(a!.page.getByText(/^(Goal!|Double goal!|Saved|Over the bar|Wide of the post|Off the (post|crossbar))/).first()).toBeVisible();
      // At the top of the page, as a player sees it: scrolled, the stage slides under the sticky room header.
      await a!.page.evaluate(() => window.scrollTo(0, 0));
      const playerAxe = await new AxeBuilder({ page: a!.page }).include('main').withTags(AXE_TAGS).analyze();
      expect(playerAxe.violations).toEqual([]);
      // The big screen's highlights name the kicker.
      await expect(host.page.getByRole('list', { name: 'Latest shots' })).toContainText('Sunny Otter');
      const hostAxe = await new AxeBuilder({ page: host.page }).include('main').withTags(AXE_TAGS).analyze();
      expect(hostAxe.violations).toEqual([]);
      checked = true;
    }
    await a!.page.waitForTimeout(250);
  }
  expect(shotsA).toBeGreaterThan(0);
  expect(shotsB).toBeGreaterThan(0);
  expect(checked).toBe(true);

  for (const p of players) await expect(over(p.page)).toBeVisible({ timeout: 60_000 });
  await expect(host.page.getByText(/Game over|Results/).first()).toBeVisible();
  expect(hostErrors).toEqual([]);
  for (const p of players) {
    expect(p.errors).toEqual([]);
    await p.close();
  }
}

test('a host and two players play Spot Kick to the results with 3D on', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Headless Firefox and WebKit have no WebGL; the 3D picture is checked in Chromium.');
  test.setTimeout(150_000);
  await play(browser, 'auto');
});

test('a host and two players play Spot Kick to the results with 3D off', async ({ browser }) => {
  test.setTimeout(150_000);
  await play(browser, 'off');
});
