import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { account, CSRF, settled, watchErrors } from './helpers.ts';

/*
 * Access and comfort, end to end: Settings (search, back to defaults, the look restored before the
 * account loads), the game's Comfort settings, extra time from the host's seat menu with nobody
 * else told, little hands for the whole room, answering by keyboard with the key hints, captions
 * for sounds, What's new, the app manifest and service worker, and "This is a shared device".
 * Every screen added or changed passes axe (WCAG 2.2 A and AA) with no sideways scrolling.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SHOTS = process.env.ACCESS_SHOTS;
const chromium = (process.env.E2E_BROWSER ?? 'chromium') === 'chromium';

async function check(page: Page, name: string, include?: string) {
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || !Number.isFinite(Number(a.effect?.getComputedTiming().endTime))), undefined, { timeout: 5000 })
    .catch(() => {});
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
  }
  await settled(page);
  let builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
  if (include) builder = builder.include(include);
  const axe = await builder.analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), name).toEqual([]);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways, `${name} scrolls sideways`).toBeLessThanOrEqual(0);
}

const attr = (page: Page, name: string) => page.evaluate((n) => document.documentElement.dataset[n] ?? null, name);

test('settings: search, accessibility choices kept on this device, restored before the first paint, and back to defaults', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByText(/kept in this browser on this device only/)).toBeVisible();
  await check(page, 'settings-signed-out-390');

  // Search: one word finds the settings, including by what people call them.
  const search = page.getByRole('searchbox', { name: 'Search settings' });
  await search.fill('colour blind');
  await expect(page.getByRole('switch', { name: /Colour-safe answer tiles/ })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Theme' })).toHaveCount(0);
  await search.fill('nothing like this');
  await expect(page.getByText(/No settings match/)).toBeVisible();
  await search.fill('');

  // Choices apply at once.
  await page.getByRole('switch', { name: /Easier-to-read typeface/ }).click();
  await page.getByRole('switch', { name: /Colour-safe answer tiles/ }).click();
  await page.getByRole('radiogroup', { name: 'Letter spacing' }).getByRole('radio', { name: 'Wider' }).click();
  await page.getByRole('radiogroup', { name: 'Contrast' }).getByRole('radio', { name: 'Highest' }).click();
  await page.getByRole('radiogroup', { name: 'Question timer' }).getByRole('radio', { name: 'Hidden' }).click();
  await page.getByRole('switch', { name: /Always show the focus ring/ }).click();
  await expect.poll(() => attr(page, 'font')).toBe('easy');
  expect(await attr(page, 'tiles')).toBe('safe');
  expect(await attr(page, 'letters')).toBe('wider');
  expect(await attr(page, 'contrast')).toBe('max');
  expect(await attr(page, 'timer')).toBe('hidden');
  await check(page, 'settings-chosen-390');

  // Before the account check answers (held back here), the look is already on the page: theme.js put it back.
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/api/auth/me', async (route) => {
    await held;
    await route.continue().catch(() => {});
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(await attr(page, 'font')).toBe('easy');
  expect(await attr(page, 'letters')).toBe('wider');
  release();
  await expect(page.getByRole('switch', { name: /Easier-to-read typeface/ })).toHaveAttribute('aria-checked', 'true');

  // Back to defaults, after asking.
  await page.getByRole('button', { name: 'Back to defaults' }).click();
  const dialog = page.getByRole('dialog', { name: 'Put settings back to their defaults?' });
  await check(page, 'settings-reset-dialog', '[role="dialog"]');
  await dialog.getByRole('button', { name: 'Back to defaults' }).click();
  await expect.poll(() => attr(page, 'font')).toBeNull();
  expect(await attr(page, 'tiles')).toBeNull();
  expect(await attr(page, 'contrast')).toBeNull();
  await expect(page.getByRole('switch', { name: /Easier-to-read typeface/ })).toHaveAttribute('aria-checked', 'false');
  expect(errors).toEqual([]);
  await context.close();
});

test('settings for an account follow it, at a laptop size, with What’s new and the installable app', async ({ browser }) => {
  const me = await account(browser);
  await me.page.setViewportSize({ width: 1366, height: 768 });
  const errors = watchErrors(me.page);
  await me.page.goto('/settings');
  await expect(me.page.getByText(/Saved to your account, so they follow you/)).toBeVisible();
  await me.page.getByRole('switch', { name: /Calm mode/ }).click();
  await me.page.getByRole('switch', { name: /Little hands/ }).click();
  await expect.poll(async () => (await (await me.page.request.get('/api/auth/me')).json()).user.preferences.access).toMatchObject({ calm: true, littleHands: true });
  await check(me.page, 'settings-account-1366');

  // What's new: a dot until it has been read.
  const news = me.page.getByRole('button', { name: /^What's new: \d+ new$/ });
  await news.click();
  const panel = me.page.getByRole('dialog', { name: "What's new" });
  await expect(panel.getByRole('heading', { level: 3, name: 'Ludora for everyone' })).toBeVisible();
  await check(me.page, 'whats-new', '[role="dialog"]');
  await panel.getByRole('button', { name: 'Close' }).first().click();
  await expect(me.page.locator('header').getByRole('button', { name: "What's new", exact: true })).toBeVisible();

  // The app can be installed: a manifest with icons, and a service worker that keeps the shell only.
  const manifest = await (await me.page.request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'Ludora', start_url: '/', display: 'standalone' });
  for (const icon of manifest.icons as { src: string }[]) expect((await me.page.request.get(icon.src)).ok()).toBe(true);
  const sw = await (await me.page.request.get('/sw.js')).text();
  expect(sw).toContain("url.pathname.startsWith('/assets/')");
  expect((await me.page.request.get('/offline.html')).ok()).toBe(true);
  if (chromium) {
    const scope = await me.page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toMatch(/\/$/);
    // With the worker in charge, the API is still answered by the server, never a stored copy.
    await me.page.reload();
    const fresh = await me.page.evaluate(async () => (await fetch('/api/auth/me')).headers.get('cache-control'));
    expect(fresh).toBe('no-store');
  }
  expect(errors).toEqual([]);
  await me.context.close();
});

test('in a game: comfort settings, extra time nobody else sees, little hands, keyboard answers and captions', async ({ browser }) => {
  test.setTimeout(150_000);
  const host = await account(browser, { accountType: 'teacher', displayName: 'Mr Okafor' });
  await host.page.setViewportSize({ width: 1366, height: 768 });
  const hostErrors = watchErrors(host.page);
  const set = await host.page.request.post('/api/sets', {
    headers: CSRF,
    data: {
      title: 'Facts',
      subject: 'science',
      visibility: 'private',
      questions: [
        { id: 'q1', type: 'truefalse', prompt: 'The Sun is a star.', correct: true },
        { id: 'q3', type: 'truefalse', prompt: 'Owls hunt at night.', correct: true },
        { id: 'q2', type: 'mcq', prompt: 'Which planet is red?', choices: [{ id: 'a', text: 'Venus' }, { id: 'b', text: 'Mars' }, { id: 'c', text: 'Jupiter' }, { id: 'd', text: 'Saturn' }], correct: 'b' },
      ],
    },
  });
  expect(set.ok(), await set.text()).toBe(true);
  const setId = (await set.json()).set.id as string;
  const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId, modeId: 'classic', common: { questionLimit: 3, shuffleQuestions: false, shuffleChoices: false, questionTimeSec: 30 }, settings: { autoAdvance: false } } });
  expect(room.ok(), await room.text()).toBe(true);
  const { code } = await room.json();
  await host.page.goto(`/room/${code}`);

  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await phoneContext.newPage();
  const phoneErrors = watchErrors(phone);
  await phone.goto(`/join/${code}`);
  await phone.getByLabel('Your name').fill('Rosa Quill');
  await phone.getByRole('button', { name: 'Join game' }).click();
  await expect(phone.getByText('You are in', { exact: true })).toBeVisible();

  // The player's comfort settings, one tap from the game's header: saved on this device (no account).
  await phone.getByRole('button', { name: 'Comfort settings' }).click();
  const comfort = phone.getByRole('dialog', { name: 'Comfort settings' });
  await expect(comfort.getByText('Saved on this device. More in Settings.')).toBeVisible();
  await comfort.getByRole('switch', { name: /Show sounds/ }).click();
  await comfort.getByRole('switch', { name: /Colour-safe answer tiles/ }).click();
  await check(phone, 'comfort-dialog-390', '[role="dialog"]');
  await phone.keyboard.press('Escape');
  await expect(comfort).toHaveCount(0);

  // The host: double time for Rosa from her seat's menu, and little hands for the whole room.
  await host.page.getByRole('button', { name: 'Options for Rosa Quill' }).click();
  await expect(host.page.getByRole('menuitemradio', { name: 'Double time' })).toBeVisible();
  await check(host.page, 'seat-menu-extra-time', '[role="menu"]');
  // axe moves focus about as it runs, which can close the menu.
  if (!(await host.page.getByRole('menu').count())) await host.page.getByRole('button', { name: 'Options for Rosa Quill' }).click();
  await host.page.getByRole('menuitemradio', { name: 'Double time' }).click();
  await expect(host.page.getByText(/Rosa Quill has extra time from the next question/)).toBeVisible();
  await host.page.getByRole('button', { name: 'Room settings' }).click();
  const settings = host.page.getByRole('dialog', { name: 'Room settings' });
  await settings.getByRole('switch', { name: /Little hands/ }).click();
  await expect(settings.getByRole('switch', { name: /Little hands/ })).toHaveAttribute('aria-checked', 'true');
  await check(host.page, 'room-settings-access', '[role="dialog"]');
  await host.page.keyboard.press('Escape');
  await expect.poll(() => attr(phone, 'little')).toBe('on');
  // Nothing about extra time reaches the player.
  await expect(phone.getByText(/extra time/i)).toHaveCount(0);

  await host.page.getByRole('button', { name: 'Start game' }).click();
  await expect(phone.getByRole('heading', { level: 2, name: 'The Sun is a star.' })).toBeVisible({ timeout: 20_000 });
  // Rosa's clock runs to double the time; the big screen keeps the shared one.
  const secs = async (p: Page) => Number(/(\d+) seconds? left/.exec((await p.getByRole('timer').first().getAttribute('aria-label')) ?? '')?.[1] ?? 0);
  expect(await secs(host.page)).toBeLessThanOrEqual(30);
  expect(await secs(phone)).toBeGreaterThan(40);
  await check(phone, 'player-question-little-hands');

  // By keyboard: the key hints appear once a key is pressed, and B picks False.
  await expect(phone.locator('.key-hint').first()).toBeHidden();
  await phone.locator('body').press('Tab');
  await expect(phone.locator('.key-hint').first()).toBeVisible();
  await phone.locator('body').press('b');
  // Rosa is the only player, so the reveal comes at once: B was False, and wrong.
  await expect(phone.getByRole('button', { name: /False.*Your answer/ })).toBeVisible();
  // The answer going in and the result each have a sound, and so a caption.
  await expect(phone.getByTestId('sound-caption')).toHaveText(/Sound: (answer locked in|wrong answer)/);
  await check(phone, 'player-reveal-colour-safe');

  await host.page.getByRole('button', { name: 'End game' }).click();
  await host.page.getByRole('dialog').getByRole('button', { name: 'End game' }).click();
  await expect(phone.getByRole('heading', { level: 1, name: 'Game over' })).toBeVisible();
  expect(hostErrors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  await phoneContext.close();
  await host.context.close();
});

test('this is a shared device: signed out in a new tab', async ({ browser }) => {
  const me = await account(browser);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto('/signin');
  await page.getByLabel('Username').fill(me.username);
  await page.getByLabel('Password').fill(me.password);
  await page.getByRole('checkbox', { name: /This is a shared device/ }).check();
  await check(page, 'signin-shared-390');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(async () => (await (await page.request.get('/api/auth/me')).json()).user?.id ?? null).toBe(me.userId);
  // A fresh tab (the one that signed in has gone): signed out.
  const next = await context.newPage();
  await next.goto('/settings');
  await expect(next.getByText(/signed out because this is a shared device/)).toBeVisible();
  await expect.poll(async () => (await (await next.request.get('/api/auth/me')).json()).user).toBeNull();
  expect(errors).toEqual([]);
  await context.close();
  await me.context.close();
});
