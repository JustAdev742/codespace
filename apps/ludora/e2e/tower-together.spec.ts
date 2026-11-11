import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { CSRF, account, watchErrors } from './helpers.ts';

/*
 * Tower Together: a host and two players build one tower to the results,
 * once with 3D on and once with 3D off. Players answer (every statement is
 * true), then place pieces with the ordinary buttons beside the picture, one
 * by keyboard and one by tapping; what each piece did is said in words, the
 * sway gauge and the next gust are on screen, and a gust lands during the
 * night. axe checks both screens mid-game.
 *
 * TOWER_SHOTS=<dir> also saves screenshots of both screens there.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const shots = process.env.TOWER_SHOTS;

async function setUp(browser: Browser, graphics: 'auto' | 'off') {
  const host = await account(browser, { accountType: 'teacher', displayName: 'Ms Adeyemi' });
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
  const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId: (await set.json()).set.id, modeId: 'tower-together', common: { timeLimitSec: 70 } } });
  expect(room.ok(), await room.text()).toBe(true);
  const { code } = await room.json();
  const graphicsChoice = (page: Page) => page.addInitScript((g) => localStorage.setItem('ludora.graphics', g), graphics);
  await graphicsChoice(host.page);
  await host.page.setViewportSize({ width: 1366, height: 768 });
  await host.page.goto(`/room/${code}`);
  await expect(host.page.getByRole('button', { name: 'Start game' })).toBeVisible();

  const players: { page: Page; errors: string[]; close: () => Promise<void> }[] = [];
  for (const name of ['Sunny Otter', 'Bartholomew Featherstone']) {
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

/** Let any news toasts clear before an axe check (they fade in and out over the page). */
async function noToasts(page: Page) {
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 12_000 }).catch(() => {});
}

/** Answer the question on screen right (every statement is true). */
async function answerTrue(page: Page) {
  const choice = page.locator('main').getByRole('group', { name: 'Answers' }).getByRole('button', { name: /True$/ });
  if (await choice.count()) await choice.first().click({ timeout: 2000 }).catch(() => {});
}

/** Place a piece if one is in hand: by keyboard for the first player, by tapping for the second. */
async function placeIfReady(page: Page, kind: RegExp, keyboard: boolean): Promise<boolean> {
  const button = page.getByRole('group', { name: 'Place a piece' }).getByRole('button', { name: kind });
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
  // The page title and the stage title can both carry the mode's name.
  await expect(host.page.getByRole('heading', { name: 'Tower Together', exact: true }).first()).toBeVisible();
  const [a, b] = players;

  // The three pieces, each saying what it would do to the height and the sway.
  const timber = /^Place\s*Timber\s*:\s*\+2 floors\s*,\s*sway \+[\d.]+\s+to [\d.]+\./;
  const stone = /^Place\s*Stone\s*:\s*\+1 floor\s*,\s*sway [+−±][\d.]+\s+to [\d.]+\./;
  const brace = /^Place\s*Brace\s*:\s*locks below\s*,\s*nothing below it can fall/;
  await expect(a!.page.getByRole('button', { name: timber })).toBeVisible();
  await expect(a!.page.getByRole('button', { name: stone })).toBeVisible();
  await expect(a!.page.getByRole('button', { name: brace })).toBeVisible();
  // Nothing in hand yet: the pieces wait for a right answer.
  await expect(a!.page.getByRole('button', { name: timber })).toBeDisabled();
  // The gauge and the next gust, with the odds of each strength.
  await expect(a!.page.getByRole('meter', { name: 'Sway' })).toHaveAttribute('aria-valuetext', /^Sway 0 of 100\./);
  await expect(a!.page.getByRole('list', { name: 'Chance of each strength' })).toContainText(/Breeze 50%.*Strong gust 35%.*Gale 15%/);
  if (graphics === 'auto') await expect(a!.page.locator('canvas.s3-canvas')).toHaveCount(1);
  else await expect(a!.page.getByRole('img', { name: /^The class tower is 0 floors tall/ })).toBeVisible();

  let placedA = 0;
  let placedB = 0;
  let checked = false;
  let sawGust = false;
  const announcer = (p: Page) => p.locator('.sr-only[role="status"][aria-live="polite"]');
  const over = (p: Page) => p.getByRole('heading', { level: 1, name: /Victory|Defeat|Game over/ });
  for (const p of [a!.page, b!.page, host.page]) p.setDefaultTimeout(6_000);
  for (let round = 0; round < 160 && !(await over(a!.page).isVisible()); round++) {
    await answerTrue(a!.page);
    await answerTrue(b!.page);
    // A sensible pair: stone when the gauge is high, timber when it is low.
    const sway = Number((await a!.page.getByRole('meter', { name: 'Sway' }).getAttribute('aria-valuenow', { timeout: 2000 }).catch(() => '0')) ?? 0);
    if (await placeIfReady(a!.page, sway > 20 ? stone : timber, true)) placedA++;
    if (await placeIfReady(b!.page, brace, false) || (await placeIfReady(b!.page, sway > 20 ? stone : timber, false))) placedB++;
    if (!checked && placedA > 0) {
      // What the piece did, in words, once the picture has shown it.
      await expect(announcer(a!.page)).toContainText(/You placed (timber|stone|a lantern brace)\. The tower is \d+ floors? tall/, { timeout: 8000 });
      await expect(a!.page.getByRole('meter', { name: 'Height' })).toHaveAttribute('aria-valuetext', /^[1-9]\d* floors? of a \d+-floor target/);
      await a!.page.evaluate(() => window.scrollTo(0, 0));
      await noToasts(a!.page);
      const playerAxe = await new AxeBuilder({ page: a!.page }).include('main').withTags(AXE_TAGS).analyze();
      expect(playerAxe.violations).toEqual([]);
      await expect(host.page.getByRole('meter', { name: 'Sway' })).toBeVisible();
      await noToasts(host.page);
      const hostAxe = await new AxeBuilder({ page: host.page }).include('main').withTags(AXE_TAGS).analyze();
      expect(hostAxe.violations).toEqual([]);
      if (shots) {
        await a!.page.screenshot({ path: `${shots}/player-${graphics}.png`, fullPage: true });
        await host.page.screenshot({ path: `${shots}/host-${graphics}.png` });
      }
      checked = true;
    }
    if (!sawGust && (await host.page.getByRole('status').filter({ hasText: /in \d:\d\d: holds at sway \d+ or less/ }).count())) {
      // A gust is announced on the big screen and on the phones, with its strength.
      await expect(a!.page.getByRole('region', { name: 'Next gust' })).toContainText(/(Breeze|Strong gust|Gale) in \d:\d\d: holds at sway \d+ or less/);
      sawGust = true;
      if (shots) {
        await a!.page.screenshot({ path: `${shots}/player-gust-${graphics}.png` });
        await host.page.screenshot({ path: `${shots}/host-gust-${graphics}.png` });
      }
    }
    await a!.page.waitForTimeout(250);
  }
  expect(placedA).toBeGreaterThan(0);
  expect(placedB).toBeGreaterThan(0);
  expect(checked).toBe(true);
  expect(sawGust).toBe(true);

  for (const p of players) await expect(over(p.page)).toBeVisible({ timeout: 60_000 });
  await expect(host.page.getByText(/Victory|Defeat|Results/).first()).toBeVisible();
  await expect(host.page.getByText(/Dawn came with the tower at|past the target/).first()).toBeVisible();
  expect(hostErrors).toEqual([]);
  for (const p of players) {
    expect(p.errors).toEqual([]);
    await p.close();
  }
}

test('a host and two players build Tower Together to the results with 3D on', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Headless Firefox and WebKit have no WebGL; the 3D picture is checked in Chromium.');
  test.setTimeout(170_000);
  await play(browser, 'auto');
});

test('a host and two players build Tower Together to the results with 3D off', async ({ browser }) => {
  test.setTimeout(170_000);
  await play(browser, 'off');
});
