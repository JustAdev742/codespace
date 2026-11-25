import { expect, test, type Browser, type Page } from '@playwright/test';
import { account, CSRF, watchErrors } from './helpers.ts';

/*
 * The stage's effects (docs/features/stage-effects.md, D62). The other tests run on the automatic
 * graphics setting, which picks the plain game in a headless browser (no graphics chip), so this is
 * the one place the canvas is drawn: with the setting on High a celebration is thrown on a canvas
 * that leaves the page when it is over, a scene change leaves nothing behind, and with less motion
 * nothing is drawn at all, whatever the graphics setting says.
 */

const FX = 'canvas[data-fx]';
const high = (page: Page) => page.addInitScript(() => localStorage.setItem('ludora.graphics', 'high'));

/** A two-question Classic room with one player on a phone and three practice bots, played to its results. */
async function playToTheEnd(browser: Browser, reducedMotion: boolean) {
  const host = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera' });
  await host.page.setViewportSize({ width: 1366, height: 768 });
  if (reducedMotion) await host.page.emulateMedia({ reducedMotion: 'reduce' });
  await high(host.page);
  const hostErrors = watchErrors(host.page);
  const set = await host.page.request.post('/api/sets', {
    headers: CSRF,
    data: {
      title: 'Planets',
      description: 'Three quick ones',
      subject: 'science',
      visibility: 'private',
      questions: [
        { id: 'q1', type: 'truefalse', prompt: 'The Sun is a star.', correct: true },
        { id: 'q2', type: 'truefalse', prompt: 'Spiders are insects.', correct: false },
        { id: 'q3', type: 'truefalse', prompt: 'The Moon orbits the Earth.', correct: true },
      ],
    },
  });
  expect(set.ok(), await set.text()).toBe(true);
  // Not a calm room, by name: calm play leaves celebrations out, and a school's copy is calm unless asked.
  const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId: (await set.json()).set.id, modeId: 'classic', common: { questionLimit: 3, shuffleQuestions: false, questionTimeSec: 10 }, settings: { autoAdvance: false }, options: { calmPlay: false } } });
  expect(room.ok(), await room.text()).toBe(true);
  const { code } = await room.json();
  await host.page.goto(`/room/${code}`);
  await expect(host.page.getByRole('button', { name: 'Start game' })).toBeVisible();

  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, ...(reducedMotion ? { reducedMotion: 'reduce' as const } : {}) });
  const phone = await phoneContext.newPage();
  await high(phone);
  const phoneErrors = watchErrors(phone);
  await phone.goto(`/join/${code}`);
  await phone.getByLabel('Your name').fill('Sunny Otter');
  await phone.getByRole('button', { name: 'Join game' }).click();
  await expect(phone.getByText('You are in', { exact: true })).toBeVisible();
  await host.page.getByRole('button', { name: 'Add 3 practice bots' }).click();
  await expect(host.page.getByText(/1 player and 3 practice bots/)).toBeVisible();
  await host.page.getByRole('button', { name: 'Start game' }).click();

  // Short turns to the end: answer whatever is up, move on whenever the host can.
  const over = host.page.getByRole('heading', { level: 1, name: 'Game over' });
  const next = host.page.getByRole('button', { name: /^Next|Skip ahead/ });
  for (let turn = 0; turn < 160 && !(await over.isVisible()); turn++) {
    const answers = phone.getByRole('group', { name: 'Answers' });
    if (await answers.isVisible()) await answers.getByRole('button').first().click({ timeout: 2_000 }).catch(() => {});
    if (await next.isVisible()) await next.click({ timeout: 2_000 }).catch(() => {});
    await host.page.waitForTimeout(250);
  }
  await expect(over).toBeVisible();
  return { host, phone, hostErrors, phoneErrors, close: () => phoneContext.close() };
}

test('with graphics on High a win is thrown on a canvas, on the board and a phone, and the page is left clean', async ({ browser }) => {
  test.setTimeout(180_000);
  const { host, phone, hostErrors, phoneErrors, close } = await playToTheEnd(browser, false);
  // The winner lands about six seconds into the ceremony: paper falls on both screens.
  await Promise.all([expect(host.page.locator(FX)).toHaveCount(1, { timeout: 20_000 }), expect(phone.locator(FX)).toHaveCount(1, { timeout: 20_000 })]);
  // The canvas is decoration: hidden from screen readers, and a click goes straight through it.
  await expect(host.page.locator(FX)).toHaveAttribute('aria-hidden', 'true');
  expect(await host.page.locator(FX).evaluate((c) => getComputedStyle(c).pointerEvents)).toBe('none');
  // When the last piece has gone, so has the canvas; and no scene change left its copy of an old screen behind.
  await Promise.all([expect(host.page.locator(FX)).toHaveCount(0, { timeout: 20_000 }), expect(phone.locator(FX)).toHaveCount(0, { timeout: 20_000 })]);
  await expect(host.page.locator('.scene-leaving')).toHaveCount(0);
  await expect(phone.locator('.scene-leaving')).toHaveCount(0);
  // The results are all there and usable under where the paper fell.
  await expect(host.page.getByRole('list', { name: 'Final standings' })).toBeVisible();
  await expect(host.page.getByRole('button', { name: 'Play again with the same players' })).toBeEnabled();
  expect(hostErrors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  await close();
});

test('with less motion nothing is drawn, whatever the graphics setting; and Settings keeps the choice', async ({ browser }) => {
  test.setTimeout(180_000);
  const { host, phone, hostErrors, phoneErrors, close } = await playToTheEnd(browser, true);
  // The ceremony's places still appear at their moments; when it is over the shower would be at its thickest.
  await expect(host.page.getByRole('list', { name: 'Final standings' })).toBeVisible({ timeout: 20_000 });
  await expect(host.page.locator(FX)).toHaveCount(0);
  await expect(phone.locator(FX)).toHaveCount(0);
  await expect(host.page.locator('.scene-leaving')).toHaveCount(0);
  expect(hostErrors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  await close();

  // The setting itself, on the Settings page: kept on this device, and Automatic clears it.
  await host.page.goto('/settings');
  const graphics = host.page.getByRole('combobox', { name: 'Graphics and effects' });
  await expect(graphics).toHaveValue('high');
  await graphics.selectOption('low');
  expect(await host.page.evaluate(() => localStorage.getItem('ludora.graphics'))).toBe('low');
  await graphics.selectOption('auto');
  expect(await host.page.evaluate(() => localStorage.getItem('ludora.graphics'))).toBeNull();
  await expect(host.page.getByText(/On this device it has chosen/)).toBeVisible();
});
