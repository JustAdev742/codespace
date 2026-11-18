import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { CSRF, account, watchErrors } from './helpers.ts';

/*
 * Calm play and the walkthrough before a game (docs/DECISIONS.md, D57). The server's default turns
 * the walkthrough off for the rest of the suite (playwright.config.ts), so these rooms ask for it.
 *
 * 1. Lantern Rally in calm play, 3D off: Start opens the walkthrough on every screen; one player
 *    steps through it with the keyboard alone (and tries a control with its key), the other skips;
 *    the game starts when both are ready. In the race the player is never asked to steer and answer
 *    at once. A second game of the mode on the same device goes straight to the game.
 * 2. Classic with calm play off and less motion asked for: the host skips the walkthrough from the
 *    big screen, nothing on it moves, and nobody sees a calm play tag.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

async function hostRoom(browser: Browser, modeId: string, options: Record<string, unknown>, settings: Record<string, unknown> = {}) {
  const host = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera' });
  await host.context.addInitScript(() => localStorage.setItem('ludora.graphics', 'off'));
  const set = await host.page.request.post('/api/sets', {
    headers: CSRF,
    data: { title: 'Calm facts', description: 'All true', subject: 'science', visibility: 'private', questions: Array.from({ length: 8 }, (_, i) => ({ id: `q${i}`, type: 'truefalse', prompt: `Calm fact number ${i + 1} is true.`, correct: true })) },
  });
  expect(set.ok(), await set.text()).toBe(true);
  const setId = (await set.json()).set.id as string;
  const make = async () => {
    const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId, modeId, common: { timeLimitSec: 90 }, settings, options } });
    expect(room.ok(), await room.text()).toBe(true);
    return (await room.json()).code as string;
  };
  await host.page.setViewportSize({ width: 1366, height: 768 });
  return { host, make };
}

async function joinAs(page: Page, code: string, name: string) {
  await page.goto(`/join/${code}`);
  await page.getByLabel('Your name').fill(name);
  if (process.env.E2E_SCHOOL_THEME === 'hills-grammar') await page.getByLabel('School year').selectOption({ label: 'Year 9' });
  await page.getByRole('button', { name: 'Join game' }).click();
  await expect(page.getByText('You are in', { exact: true })).toBeVisible();
}

async function phone(browser: Browser, opts: { reducedMotion?: 'reduce' } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...(opts.reducedMotion ? { reducedMotion: opts.reducedMotion } : {}) });
  await context.addInitScript(() => localStorage.setItem('ludora.graphics', 'off'));
  const page = await context.newPage();
  return { context, page, errors: watchErrors(page) };
}

test('calm Lantern Rally: how to play first, then one thing at a time', async ({ browser }) => {
  test.setTimeout(240_000);
  const { host, make } = await hostRoom(browser, 'lantern-rally', { calmPlay: true, tutorial: true }, { laps: 2, circuit: 'forest' });
  const hostErrors = watchErrors(host.page);
  const code = await make();
  await host.page.goto(`/room/${code}`);
  await expect(host.page.getByRole('button', { name: 'Start game' })).toBeVisible();
  // The host's switches, and the lobby says calm play is on.
  await host.page.getByRole('button', { name: 'Room settings' }).click();
  const settings = host.page.getByRole('dialog', { name: 'Room settings' });
  await expect(settings.getByRole('switch', { name: 'Calm play' })).toBeChecked();
  await expect(settings.getByRole('switch', { name: 'How to play first' })).toBeChecked();
  await host.page.keyboard.press('Escape');
  await expect(host.page.getByLabel('Game settings').getByText('Calm play')).toBeVisible();

  const ana = await phone(browser);
  const ben = await phone(browser);
  await joinAs(ana.page, code, 'Ana Lightfoot');
  await joinAs(ben.page, code, 'Ben Quickwheel');
  await expect(ana.page.getByText('Your teacher chose calm play.')).toBeVisible();

  await host.page.getByRole('button', { name: 'Start game' }).click();
  const anaWalk = ana.page.getByRole('dialog', { name: 'How to play Lantern Rally' });
  const hostWalk = host.page.getByRole('dialog', { name: 'How to play Lantern Rally' });
  await expect(anaWalk).toBeVisible();
  await expect(hostWalk).toBeVisible();
  await expect(hostWalk.getByText('0 of 2 ready')).toBeVisible();
  // The step's heading takes focus, so a screen reader reads it first.
  await expect(anaWalk.getByRole('heading', { name: /Answer for boosts/ })).toBeFocused();
  expect(await axe(ana.page), 'walkthrough on a phone').toEqual([]);
  expect(await axe(host.page), 'walkthrough on the big screen').toEqual([]);

  // Keyboard only: Tab to Next and press Enter, step by step. On the controls step, B is the boost key.
  for (let i = 0; i < 10 && !(await anaWalk.getByRole('button', { name: 'I’m ready' }).count()); i++) {
    if (await anaWalk.getByRole('heading', { name: 'Try the buttons' }).count()) {
      await ana.page.keyboard.press('KeyB');
      await expect(anaWalk.getByRole('status')).toHaveText('Boost: Spends a charge on 3 seconds of extra speed.');
    }
    if (await anaWalk.getByRole('heading', { name: 'Your teacher chose calm play' }).count()) await expect(anaWalk.getByText(/your kart drives itself/)).toBeVisible();
    await anaWalk.getByRole('button', { name: /^Next/ }).focus();
    await ana.page.keyboard.press('Enter');
  }
  await anaWalk.getByRole('button', { name: 'I’m ready' }).focus();
  await ana.page.keyboard.press('Enter');
  await expect(anaWalk.getByText('Waiting for 1 more player.')).toBeVisible();
  await expect(hostWalk.getByText('1 of 2 ready')).toBeVisible();
  // Ben knows the game.
  await ben.page.getByRole('button', { name: 'Skip: I know how to play' }).click();
  await expect(anaWalk).toHaveCount(0, { timeout: 15_000 });
  await expect(hostWalk).toHaveCount(0);

  // The race, one thing at a time: never a question and the controls at once.
  const main = ana.page.locator('main');
  await expect(main.getByRole('button', { name: /True$/ }).first()).toBeVisible({ timeout: 30_000 });
  let sawQuestion = false;
  let sawGo = false;
  for (let i = 0; i < 60 && !(sawQuestion && sawGo); i++) {
    const question = await main.getByRole('button', { name: /True$/ }).first().isVisible().catch(() => false);
    const steer = await main.getByRole('button', { name: 'Steer left' }).isVisible().catch(() => false);
    expect(question && steer, 'a question and the steering at the same moment').toBe(false);
    if (question) {
      sawQuestion = sawQuestion || (await main.locator('[data-calm-turn="question"]').isVisible());
      await main.getByRole('button', { name: /True$/ }).first().click({ timeout: 500 }).catch(() => {});
    }
    if (steer) {
      sawGo = true;
      await expect(main.locator('[data-calm-turn="go"]')).toBeVisible();
      await ana.page.keyboard.press('ArrowRight');
    }
    await ana.page.waitForTimeout(400);
  }
  expect(sawQuestion, 'answer time was shown').toBe(true);
  expect(sawGo, 'a go was shown').toBe(true);
  await expect(ana.page.locator('[data-calm-tag]')).toBeVisible();

  // Seen: another game of Lantern Rally on Ana's device skips straight to the game.
  const again = await make();
  const ana2 = await ana.context.newPage();
  await joinAs(ana2, again, 'Ana Lightfoot');
  const host2 = await host.context.newPage();
  await host2.setViewportSize({ width: 1366, height: 768 });
  await host2.goto(`/room/${again}`);
  await host2.getByRole('button', { name: 'Start game' }).click();
  await expect(ana2.locator('main').getByRole('button', { name: /True$/ }).first()).toBeVisible({ timeout: 30_000 });
  await expect(ana2.locator('[data-walkthrough]')).toHaveCount(0);
  await expect(host2.locator('[data-walkthrough]')).toHaveCount(0);

  expect(hostErrors).toEqual([]);
  expect(ana.errors).toEqual([]);
  expect(ben.errors).toEqual([]);
  await ana.context.close();
  await ben.context.close();
  await host.context.close();
});

test('the host skips how to play for a class that knows it, and calm play off changes nothing', async ({ browser }) => {
  test.setTimeout(120_000);
  const { host, make } = await hostRoom(browser, 'classic', { calmPlay: false, tutorial: true });
  const code = await make();
  await host.page.goto(`/room/${code}`);
  const sam = await phone(browser, { reducedMotion: 'reduce' });
  await joinAs(sam.page, code, 'Sam Brook');
  await expect(sam.page.locator('[data-calm-tag]')).toHaveCount(0);
  await host.page.getByRole('button', { name: 'Start game' }).click();
  const walk = sam.page.getByRole('dialog', { name: 'How to play Classic' });
  await expect(walk).toBeVisible();
  // Less motion: the steps appear without moving.
  expect(await walk.locator('h2').evaluate((h) => (h.parentElement as HTMLElement).style.animation)).toBe('');
  // No calm play step in a game without it.
  await expect(walk.getByText('Step 1 of 4')).toBeVisible();
  await host.page.getByRole('dialog', { name: 'How to play Classic' }).getByRole('button', { name: 'Start now' }).click();
  await expect(walk).toHaveCount(0);
  await expect(host.page.getByText('Get ready')).toBeVisible();
  expect(sam.errors).toEqual([]);
  await sam.context.close();
  await host.context.close();
});
