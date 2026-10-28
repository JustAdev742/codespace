import { expect, test, type Page } from '@playwright/test';
import { COLLECTIONS, GLIMS } from '@ludora/content';
import { CSRF, account, watchErrors } from './helpers.ts';

/*
 * The secret chaos menu, end to end in real browsers: a player finds the
 * lantern on the About panel, knocks its rhythm, answers its riddle, sends
 * the ritual reactions in a running game, lights the lantern, opens the menu
 * (fetched from the server, not the public app) and casts on another player,
 * whose screen changes. Screenshots go to test-results for a look by eye.
 */

/** Solve the riddle from its text, as a player would with the collection book open. */
function solve(text: string): string {
  const collection = COLLECTIONS.find((c) => text.includes(c.name))!;
  const n = Number(/the (\d+)(st|nd|rd|th) Glim/.exec(text)![1]);
  return GLIMS.filter((g) => g.collectionId === collection.id).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))[n - 1]!.name;
}

async function joinAs(page: Page, code: string, name: string) {
  await page.goto(`/join/${code}`);
  const field = page.getByLabel('Your name');
  if (await field.isVisible().catch(() => false)) await field.fill(name);
  await page.getByRole('button', { name: 'Join game' }).click();
  await expect(page.getByText('You are in', { exact: true })).toBeVisible();
}

test('a player finds the lantern, unlocks chaos and casts on another player', async ({ browser }) => {
  test.setTimeout(150_000);
  const host = await account(browser, { accountType: 'teacher', displayName: 'Mr Lake' });
  const finder = await account(browser, { displayName: 'Finder Fox' });
  const victim = await account(browser, { displayName: 'Victim Vole' });
  const finderErrors = watchErrors(finder.page);
  const victimErrors = watchErrors(victim.page);

  // Before anything, the menu and catalogue do not exist for this account.
  expect((await finder.page.request.get('/api/lantern/book')).status()).toBe(404);
  expect((await finder.page.request.get('/api/lantern/book.js')).status()).toBe(404);

  // 1. Knock the lantern's rhythm on the About panel.
  const { beats } = (await (await finder.page.request.get('/api/lantern/flicker')).json()) as { beats: number[] };
  await finder.page.goto('/settings');
  const lantern = finder.page.getByRole('button', { name: 'Ludora lantern' });
  await expect(lantern).toBeVisible();
  await lantern.click();
  for (const b of beats) {
    await finder.page.waitForTimeout(b * 280);
    await lantern.click();
  }
  const riddle = finder.page.getByRole('dialog', { name: 'The lantern whispers' });
  await expect(riddle).toBeVisible({ timeout: 10_000 });
  const riddleText = (await riddle.textContent()) ?? '';

  // 2. Answer the riddle.
  const answered = finder.page.waitForResponse((r) => r.url().endsWith('/api/lantern/riddle'));
  await riddle.getByLabel('Your answer').fill(solve(riddleText));
  await riddle.getByRole('button', { name: 'Whisper back' }).click();
  const { ritual } = (await (await answered).json()) as { ritual: string[] };
  expect(ritual).toHaveLength(4);
  await expect(finder.page.getByRole('dialog', { name: 'The lantern glows' })).toBeVisible();
  await finder.page.screenshot({ path: 'test-results/chaos-ritual.png' });
  await finder.page.getByRole('button', { name: 'I will remember' }).click();

  // A running game.
  const set = await host.page.request.post('/api/sets', {
    headers: CSRF,
    data: {
      title: 'Lantern facts',
      subject: 'science',
      visibility: 'private',
      questions: Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, type: 'mcq', prompt: `Question ${i + 1}: which is a lantern?`, choices: [{ id: 'a', text: 'A lantern' }, { id: 'b', text: 'A teapot' }, { id: 'c', text: 'A spoon' }, { id: 'd', text: 'A boot' }], correct: 'a' })),
    },
  });
  expect(set.ok(), await set.text()).toBe(true);
  const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId: (await set.json()).set.id, modeId: 'classic', common: { questionTimeSec: 120, shuffleQuestions: false }, options: { chaos: true } } });
  const { code } = await room.json();
  await host.page.goto(`/room/${code}`);
  await joinAs(finder.page, code, 'Finder Fox');
  await joinAs(victim.page, code, 'Victim Vole');
  await host.page.getByRole('button', { name: 'Start game' }).click();
  await host.page.getByRole('button', { name: /Next|Skip ahead/ }).click();
  await expect(finder.page.getByRole('group', { name: 'Answers' })).toBeVisible();

  // 3. The ritual: the four reactions in order.
  for (const r of ritual) {
    await finder.page.getByRole('button', { name: `React: ${r}` }).click();
    await finder.page.waitForTimeout(1700);
  }

  // 4. Hold the lantern that appears.
  const glow = finder.page.getByRole('button', { name: /glowing lantern/ });
  await expect(glow).toBeVisible();
  await glow.hover();
  await finder.page.mouse.down();
  await finder.page.waitForTimeout(3300);
  await finder.page.mouse.up();
  await expect(finder.page.getByText(/The lantern is lit/)).toBeVisible();

  // The menu: loaded from the server, with the catalogue fetched after.
  const open = finder.page.getByRole('button', { name: 'Open the lantern' });
  await expect(open).toBeVisible();
  await open.click();
  const menu = finder.page.getByRole('dialog', { name: 'The lantern' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('searchbox', { name: 'Search cheats' })).toBeVisible();
  await finder.page.screenshot({ path: 'test-results/chaos-menu.png' });
  await menu.getByRole('searchbox', { name: 'Search cheats' }).fill('upside down');
  await menu.getByRole('button', { name: /Upside Down/ }).first().click();
  await menu.getByLabel('Target').selectOption({ label: 'Victim Vole' });
  await menu.getByRole('button', { name: /^Cast/ }).click();
  await expect(menu.getByRole('status')).toContainText('Upside Down');
  await finder.page.screenshot({ path: 'test-results/chaos-menu-cast.png' });

  // The victim's screen turns upside down and says who did it.
  await expect(victim.page.locator('[data-chaos-root].chaos-look-upside-down')).toBeVisible();
  await expect(victim.page.getByText(/Finder Fox: Upside Down/)).toBeVisible();
  await victim.page.screenshot({ path: 'test-results/chaos-victim.png' });

  // The host can calm the room.
  await host.page.getByRole('button', { name: 'Calm the room' }).click();
  await expect(victim.page.locator('[data-chaos-root].chaos-look-upside-down')).toHaveCount(0);

  expect(finderErrors.filter((e) => !/favicon/.test(e))).toEqual([]);
  expect(victimErrors).toEqual([]);
});
