import AxeBuilder from '@axe-core/playwright';
import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { CSRF, account, operator, settled, watchErrors } from './helpers.ts';

/*
 * My designs (studio2): a plain player designs a Glim with the painter, wears it, and others see it
 * in a lobby and on their profile; a design code moves a design to another account; a designer still
 * publishes to the shop from the Creator Studio. Axe at phone and laptop widths. The 3D turntable
 * is checked in Chromium only (headless Firefox and WebKit have no WebGL).
 */

const chromium = (process.env.E2E_BROWSER ?? 'chromium') === 'chromium';
const localChromium = '/opt/pw-browsers/chromium';
if (chromium) test.use({ launchOptions: { ...(existsSync(localChromium) ? { executablePath: localChromium } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const axe = (page: Page, include = 'main') => new AxeBuilder({ page }).include(include).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();

/** The painted markings of the Glim in a scope, as path data (the same in every size, as it is drawn in one 120 box). */
const paintOf = (page: Page, scope: string) => page.locator(`${scope} g[data-paint] path`).evaluateAll((els) => els.map((e) => e.getAttribute('d')).join('|'));

test('a player paints a Glim, wears it, and another player sees it in the lobby and on their profile', async ({ browser }) => {
  test.setTimeout(240_000);
  const maker = await account(browser, { displayName: 'Robin Park' });
  const errors = watchErrors(maker.page);
  await maker.page.setViewportSize({ width: 390, height: 844 });
  await maker.page.goto('/designs');
  await expect(maker.page.getByRole('heading', { name: 'My designs' })).toBeVisible();
  await expect(maker.page.getByText('0 of 3 slots used.')).toBeVisible();
  await maker.page.getByRole('button', { name: 'New Glim' }).click();

  // Shape it and clear any random markings, then paint with the keyboard and with a tap.
  await maker.page.getByLabel('Body', { exact: true }).selectOption('blob');
  await maker.page.getByLabel('Feet').selectOption('boots');
  const painter = maker.page.getByRole('grid', { name: /Markings painter/ });
  const clear = maker.page.getByRole('button', { name: 'Clear the grid' });
  if (await clear.isEnabled()) await clear.click();
  await maker.page.getByRole('radio', { name: 'Four ways' }).click();
  const start = painter.getByRole('gridcell', { name: 'Row 6, column 6: empty' });
  await start.focus();
  await maker.page.keyboard.press('3');
  await maker.page.keyboard.press('Space');
  await expect(painter.getByRole('gridcell', { name: 'Row 6, column 6: Third colour' })).toBeVisible();
  // Mirrored four ways: the opposite corner of the quarter is painted too.
  await expect(painter.getByRole('gridcell', { name: 'Row 7, column 7: Third colour' })).toBeVisible();
  await maker.page.keyboard.press('ArrowLeft');
  await maker.page.keyboard.press('ArrowLeft');
  await maker.page.keyboard.press('Enter');
  await expect(painter.getByRole('gridcell', { name: 'Row 6, column 4: Third colour' })).toBeVisible();
  await maker.page.getByRole('radio', { name: 'Fill' }).click();
  await maker.page.getByRole('radio', { name: /^Second colour/ }).click();
  await painter.getByRole('gridcell', { name: 'Row 1, column 1: empty' }).click();
  await expect(painter.getByRole('gridcell', { name: 'Row 1, column 1: Second colour' })).toBeVisible();
  // Undo takes the fill away, redo brings it back.
  await maker.page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(painter.getByRole('gridcell', { name: 'Row 1, column 1: empty' })).toBeVisible();
  await maker.page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(painter.getByRole('gridcell', { name: 'Row 1, column 1: Second colour' })).toBeVisible();

  await maker.page.getByLabel('Name', { exact: true }).fill('Puddle Pal');
  await maker.page.evaluate(() => window.scrollTo(0, 0));
  await settled(maker.page);
  expect((await axe(maker.page)).violations).toEqual([]);
  const painted = await paintOf(maker.page, 'main svg[aria-label="Puddle Pal"]');
  expect(painted.length).toBeGreaterThan(20);
  await maker.page.getByRole('button', { name: 'Save design' }).click();
  await expect(maker.page.getByText('1 of 3 slots used.')).toBeVisible();
  await maker.page.getByRole('button', { name: 'Wear Puddle Pal' }).click();
  await expect(maker.page.getByText('Wearing', { exact: true })).toBeVisible();
  await maker.page.evaluate(() => window.scrollTo(0, 0));
  await settled(maker.page);
  expect((await axe(maker.page)).violations).toEqual([]);

  // A teacher hosts; the player joins; the big screen shows the painted Glim.
  const host = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera' });
  const set = await host.page.request.post('/api/sets', { headers: CSRF, data: { title: 'Quick ones', description: 'Three', subject: 'science', visibility: 'private', questions: [{ id: 'q1', type: 'truefalse', prompt: 'The Sun is a star.', correct: true }, { id: 'q2', type: 'truefalse', prompt: 'Spiders are insects.', correct: false }, { id: 'q3', type: 'truefalse', prompt: 'Ice is frozen water.', correct: true }] } });
  expect(set.ok(), await set.text()).toBe(true);
  const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId: (await set.json()).set.id, modeId: 'classic' } });
  expect(room.ok(), await room.text()).toBe(true);
  const { code } = await room.json();
  await host.page.goto(`/room/${code}`);
  await expect(host.page.getByRole('button', { name: 'Start game' })).toBeVisible();
  await maker.page.goto(`/join/${code}`);
  await maker.page.getByRole('button', { name: 'Join game' }).click();
  await expect(maker.page.getByText('You are in', { exact: true })).toBeVisible();
  const seat = host.page.locator('li').filter({ has: host.page.getByText('Robin Park', { exact: true }) });
  await expect(seat.locator('g[data-paint]')).toHaveCount(1);
  expect(await seat.locator('g[data-paint] path').evaluateAll((els) => els.map((e) => e.getAttribute('d')).join('|'))).toBe(painted);

  // Another player opens their profile: the design's name, and a way to report it.
  await host.page.goto(`/profile/${maker.userId}`);
  await expect(host.page.getByText('Wearing their own design,')).toBeVisible();
  await expect(host.page.getByText('Puddle Pal', { exact: true })).toBeVisible();
  await host.page.getByRole('button', { name: 'Report the design Puddle Pal' }).click();
  await host.page.getByLabel('What is wrong').selectOption({ label: 'Inappropriate design' });
  await host.page.getByRole('button', { name: 'Send report' }).click();
  await expect(host.page.getByText('Thanks. A moderator will look at it.')).toBeVisible();
  expect(errors).toEqual([]);
  await maker.context.close();
  await host.context.close();
});

test('a design code moves a design to a friend, who names it and wears it', async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await account(browser);
  const b = await account(browser);
  const made = await a.page.request.post('/api/designs', { headers: CSRF, data: { kind: 'accessory', name: 'Lucky hat', art: { kind: 'accessory', slot: 'hat', shape: 'beanie', hue: 123, accentHue: 301, emblem: '0Z0Z0K'.replace('0K', '0J2') } } });
  expect(made.ok(), await made.text()).toBe(true);
  await a.page.setViewportSize({ width: 1366, height: 768 });
  await a.page.goto('/designs');
  await a.page.getByRole('button', { name: 'Design code for Lucky hat' }).click();
  const code = await a.page.getByRole('textbox', { name: 'Design code' }).inputValue();
  expect(code).toMatch(/^A/);
  await settled(a.page);
  expect((await axe(a.page, '[role="dialog"]')).violations).toEqual([]);

  await b.page.goto('/designs');
  await b.page.getByRole('button', { name: 'Use a design code' }).click();
  await b.page.getByRole('textbox', { name: 'Design code' }).fill(code.slice(0, -2));
  await b.page.getByLabel('Name for it').fill('Gift hat');
  await b.page.getByRole('button', { name: 'Add to my designs' }).click();
  await expect(b.page.getByText('That design code is not right. Check it was copied in full.').or(b.page.getByText('Not a design code.')).first()).toBeVisible();
  await b.page.getByRole('textbox', { name: 'Design code' }).fill(code);
  await b.page.getByRole('button', { name: 'Add to my designs' }).click();
  await b.page.getByRole('button', { name: 'Wear Gift hat' }).click();
  await expect(b.page.getByText('Wearing', { exact: true })).toBeVisible();
  await a.context.close();
  await b.context.close();
});

test('a designer still publishes an item to the shop from the Creator Studio', async ({ browser }) => {
  test.setTimeout(180_000);
  const designer = await account(browser);
  expect(operator('grant', designer.username, 'designer', '--reason', 'e2e')).toContain('Granted');
  const page = designer.page;
  await page.goto('/studio?tab=item');
  await page.getByLabel('Name', { exact: true }).fill(`Comet cap ${Date.now().toString(36).slice(-3).replace(/\d/g, 'x')}`);
  await page.getByLabel('Description').fill('A cap with a comet on the front.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('tab', { name: /Drafts/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Publish' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const reason = dialog.getByLabel(/Reason/);
  await reason.fill('New cap for the shop');
  await dialog.getByRole('button', { name: /^Publish/ }).click();
  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
  await designer.context.close();
});

test('My designs at laptop width: the editor with the painter and Try it on has no accessibility problems', async ({ browser }) => {
  test.setTimeout(120_000);
  const p = await account(browser);
  await p.page.setViewportSize({ width: 1366, height: 768 });
  await p.page.goto('/designs');
  await p.page.getByRole('button', { name: 'New Glim' }).click();
  await p.page.getByRole('button', { name: 'Try it on' }).click();
  await p.page.getByRole('button', { name: 'Compare with this version' }).click();
  await p.page.getByRole('button', { name: 'Randomise' }).click();
  await expect(p.page.getByText('Version A', { exact: true })).toBeVisible();
  await expect(p.page.getByRole('region', { name: 'Try it on' })).toBeVisible();
  await settled(p.page);
  expect((await axe(p.page)).violations).toEqual([]);
  await p.context.close();
});

test('the 3D turntable shows the Glim being designed, and follows changes', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Headless Firefox and WebKit have no WebGL; the 3D picture is checked in Chromium.');
  test.setTimeout(120_000);
  const p = await account(browser);
  await p.context.addInitScript(() => localStorage.setItem('ludora.graphics', 'high'));
  const errors = watchErrors(p.page);
  await p.page.setViewportSize({ width: 1366, height: 768 });
  // Reduced motion stops the turn and the breathing, so the picture changes only when the design does.
  await p.page.emulateMedia({ reducedMotion: 'reduce' });
  await p.page.goto('/designs');
  await p.page.getByRole('button', { name: 'New Glim' }).click();
  const canvas = p.page.locator('canvas[aria-label="Your Glim in 3D"]');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const picture = async () => (await canvas.screenshot()).toString('base64');
  // Wait for the picture to settle (the body built, the greeting wave over).
  let before = '';
  await expect
    .poll(async () => {
      const a = await picture();
      await p.page.waitForTimeout(400);
      const b = await picture();
      before = b;
      return a === b;
    }, { timeout: 30_000 })
    .toBe(true);
  await p.page.getByLabel('Body', { exact: true }).selectOption('box');
  await p.page.getByLabel('Feet').selectOption('flippers');
  await expect.poll(picture, { timeout: 20_000 }).not.toBe(before);
  expect(errors).toEqual([]);
  await p.context.close();
});

test('describe a Glim: the helper suggests a design, shown beside yours, and Use this design puts it in the editor', async ({ browser }) => {
  // The end-to-end server has no AI provider: the helper endpoints are answered in the browser (as in ai-helpers.spec.ts).
  test.setTimeout(120_000);
  const p = await account(browser);
  const sent: Record<string, unknown>[] = [];
  const allowance = { limit: 20, remaining: 19, windowHours: 5, nextAt: null };
  await p.page.route('**/api/ai/status', (r) => r.fulfill({ json: { available: true, tasks: ['glim.describe'], models: [{ id: 'groq/llama', label: 'Llama 3.3 70B', provider: 'Groq' }], allowance } }));
  await p.page.route('**/api/ai/tasks/glim.describe', async (r) => {
    sent.push(r.request().postDataJSON());
    await r.fulfill({ json: { output: { art: { kind: 'glim', body: 'mushroom', hue: 20, accentHue: 120, saturation: 60, eyes: 'sleepy', mouth: 'yawn', pattern: 'none', topper: 'leaf', cheeks: false, feet: 'boots' }, name: 'Sleepy Cap' }, model: { id: 'groq/llama', label: 'Llama 3.3 70B', provider: 'Groq' }, removed: 0, dropped: 0, allowance } });
  });
  await p.page.setViewportSize({ width: 390, height: 844 });
  await p.page.goto('/designs');
  await p.page.getByRole('button', { name: 'New Glim' }).click();
  await p.page.getByRole('button', { name: 'Describe a Glim' }).click();
  const panel = p.page.getByRole('region', { name: 'Describe the Glim you want' });
  await panel.getByLabel('What should it look like?').fill('a sleepy mushroom with a leaf and boots');
  await panel.getByRole('button', { name: 'Suggest' }).click();
  await expect(panel.getByRole('img', { name: 'Sleepy Cap' })).toBeVisible();
  expect(sent[0]).toMatchObject({ input: { description: 'a sleepy mushroom with a leaf and boots' } });
  await settled(p.page);
  expect((await axe(p.page)).violations).toEqual([]);
  await panel.getByRole('button', { name: 'Use this design' }).click();
  await expect(p.page.getByLabel('Body', { exact: true })).toHaveValue('mushroom');
  await expect(p.page.getByLabel('Feet')).toHaveValue('boots');
  await expect(p.page.getByLabel('Name', { exact: true })).toHaveValue('Sleepy Cap');
  await p.context.close();
});
