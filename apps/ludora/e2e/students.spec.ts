import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { account, answerAnyQuestion, CSRF, settled, watchErrors } from './helpers.ts';

/*
 * What a player gets outside a live game (docs/features/students.md): the daily challenge
 * and its streak, My mistakes and a round to fix them, the weekly goal, favourites, recently
 * played, notifications, search, the Glim page and nickname, outfits, the wishlist and try-on,
 * the quest swap and level track, the study calendar and the profile card.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const SHOTS = process.env.STUDENTS_SHOTS;

async function axe(page: Page, label: string) {
  await settled(page);
  const r = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(r.violations.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

/** Checks a page at phone and laptop sizes, in the night and day themes: axe, no sideways scroll, and a screenshot when asked. */
async function check(page: Page, name: string) {
  // Toasts fade in and out over the page; the page itself is what is being checked.
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    for (const size of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${name} scrolls sideways at ${size.width}`).toBeLessThanOrEqual(0);
      await axe(page, `${name} ${theme} ${size.width}`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${theme}-${size.width}.png`, fullPage: true });
    }
  }
}

/** Play whatever solo game is on screen to its results. */
async function playToResults(page: Page) {
  await expect(page).toHaveURL(/\/room\/\d{6}/);
  const over = page.getByText(/You earned|Rewards could not|earns no rewards|added to My mistakes|Daily challenge done|mistakes list/).first();
  const results = page.getByRole('heading', { name: /results|you finished|game over/i }).first();
  const start = page.getByRole('button', { name: /^(Start game|Start)$/ });
  // A click aimed at a question that has just ended must give up and look again, not wait for
  // the rest of the test: actions have no time limit of their own.
  page.setDefaultTimeout(6_000);
  try {
    for (let i = 0; i < 80; i++) {
      if ((await over.isVisible().catch(() => false)) || (await results.isVisible().catch(() => false))) return;
      if (await start.isVisible().catch(() => false)) await start.click().catch(() => {});
      // Between questions this finds nothing to answer and comes round again.
      await answerAnyQuestion(page).catch(() => {});
    }
  } finally {
    page.setDefaultTimeout(0);
  }
}

test('a new student: first steps, daily challenge, mistakes, goal, favourites and recently played', async ({ browser }) => {
  test.setTimeout(300_000);
  const s = await account(browser, { accountType: 'student' });
  const page = s.page;
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Get started' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Daily challenge' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My mistakes' })).toBeVisible();
  await check(page, 'home-new');

  // A weekly goal, set in its dialog, shows as a ring.
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Set a goal' }).click();
  await page.getByLabel('How many each week').fill('3');
  await page.getByRole('button', { name: 'Save goal' }).click();
  await expect(page.getByRole('img', { name: '0 of 3 games this week' })).toBeVisible();

  // Today's challenge: a real solo game to its results, which say the streak has begun.
  await page.getByRole('button', { name: "Play today's challenge" }).click();
  await playToResults(page);
  await expect(page.getByText(/Daily challenge done/)).toBeVisible({ timeout: 30_000 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play it again' })).toBeVisible();
  await expect(page.getByRole('img', { name: '1 of 3 games this week' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recently played' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Play again: / })).toBeVisible();

  // Star a mode in the catalogue: it shows in Favourites on home.
  await page.goto('/modes');
  await page.getByRole('button', { name: 'Favourite: Classic' }).click();
  await expect(page.getByRole('button', { name: 'Favourite: Classic' })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Favourites' }).getByRole('link', { name: /Classic/ })).toBeVisible();
  await check(page, 'home-played');

  // The mistakes from that game, if any were wrong, and a round to fix them.
  await page.goto('/mistakes');
  await check(page, 'mistakes');
  if (await page.getByRole('button', { name: 'Fix my mistakes' }).count()) {
    await page.getByRole('button', { name: 'Fix my mistakes' }).click();
    await expect(page).toHaveURL(/\/room\/\d{6}/);
  }

  // The stats page: calendar with today filled in, personal bests, accuracy by type.
  await page.goto('/me');
  await expect(page.getByRole('heading', { name: 'Study calendar' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /today: 1 game/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Personal bests' })).toBeVisible();
  await check(page, 'stats');
  expect(errors).toEqual([]);
});

test('notifications, search, Glim page and nickname, outfits, wishlist and try-on, quests and the profile card', async ({ browser }) => {
  test.setTimeout(300_000);
  const a = await account(browser);
  const b = await account(browser);
  const page = a.page;
  const errors = watchErrors(page);
  // B asks A to be friends: A's bell counts it and the page lists it.
  const code = (await (await page.request.get('/api/friends')).json()).friendCode;
  expect((await b.page.request.post('/api/friends/request', { headers: CSRF, data: { friendCode: code } })).ok()).toBe(true);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Notifications, 1 new' })).toBeVisible();
  await page.getByRole('link', { name: 'Notifications, 1 new' }).click();
  await expect(page.getByRole('link', { name: /wants to be friends/ })).toBeVisible();
  await check(page, 'notifications');
  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();

  // Search everything with the keyboard.
  await page.keyboard.press('Control+k');
  const box = page.getByRole('combobox', { name: /Search pages/ });
  await expect(box).toBeFocused();
  await box.fill('locker');
  await expect(page.getByRole('option', { name: /Locker/ })).toBeVisible();
  await axe(page, 'search');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/search.png` });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/locker$/);

  // Outfits: save the current look, surprise me, then wear the outfit again.
  await page.getByLabel('Save this look as').fill('Monday');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Wear Monday' })).toBeVisible();
  await page.getByRole('button', { name: 'Surprise me' }).click();
  await expect(page.getByText('Surprise! Here is your new look.')).toBeVisible();
  await page.getByRole('button', { name: 'Wear Monday' }).click();
  await expect(page.getByText('Wearing Monday')).toBeVisible();
  await check(page, 'locker');

  // A Glim's page: story, nickname (only for you), where it comes from.
  await page.goto('/collection');
  const found = page.locator('main ul li button').filter({ hasNotText: 'Not found yet' }).first();
  await found.click();
  await page.getByRole('link', { name: /Its story, nickname/ }).click();
  await expect(page.getByRole('heading', { name: 'Its story' })).toBeVisible();
  await page.getByRole('button', { name: 'Give it a nickname' }).click();
  await page.getByLabel(/^Nickname for/).fill('Captain Pebble');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Captain Pebble', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Where it comes from' })).toBeVisible();
  await check(page, 'glim-page');

  // Shop: wishlist a Lantern, see it in My wishlist; try an accessory on.
  await page.goto('/shop?tab=lanterns');
  const heart = page.getByRole('button', { name: /^Wishlist: / }).first();
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('radio', { name: /My wishlist/ }).or(page.getByRole('button', { name: /My wishlist/ })).first().click();
  await expect(page.getByRole('heading', { name: 'Your wishlist' })).toBeVisible();
  await check(page, 'shop-wishlist');
  await page.goto('/shop?tab=accessories');
  const tryOn = page.getByRole('button', { name: /^Try on: / }).first();
  if (await tryOn.count()) {
    await tryOn.click();
    await expect(page.getByRole('dialog', { name: /^Try on / })).toBeVisible();
    await axe(page, 'try-on');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/try-on.png` });
    await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  }

  // Quests: swap one daily quest; the level track shows the next five.
  await page.goto('/quests');
  await page.getByRole('button', { name: /^Swap .* for another quest$/ }).first().click();
  await expect(page.getByText(/^Swapped for /)).toBeVisible();
  await expect(page.getByRole('button', { name: /for another quest$/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Level track' })).toBeVisible();
  await check(page, 'quests');

  // The profile card: a pose, then download it as a picture.
  await page.goto(`/profile/${a.userId}`);
  await page.getByRole('radio', { name: 'Cheering' }).click();
  await expect(page.getByRole('radio', { name: 'Cheering' })).toHaveAttribute('aria-checked', 'true');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my card' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/ludora-card\.png$/);
  if (SHOTS) await file.saveAs(`${SHOTS}/card.png`);
  await check(page, 'profile');
  expect(errors).toEqual([]);
});
