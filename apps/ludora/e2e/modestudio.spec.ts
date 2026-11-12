import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { account, answerAnyQuestion, CSRF, operator, settled, watchErrors } from './helpers.ts';

/*
 * Mode Studio (docs/features/modestudio.md): build a game from a starting point, change three
 * things and see the live test and the rules react, save it, host it with two players to the end,
 * and find its own name on the results and in the report; copy someone's public game; the 3D
 * scene draws in Chromium. Every screen is checked with axe at phone and laptop widths.
 */

// The 3D case needs WebGL: Chromium gets it from SwiftShader; headless Firefox and WebKit have none.
const chromiumRun = (process.env.E2E_BROWSER ?? 'chromium') === 'chromium';
const localChromium = '/opt/pw-browsers/chromium';
if (chromiumRun) test.use({ launchOptions: { ...(existsSync(localChromium) ? { executablePath: localChromium } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const SHOTS = process.env.SHOTS_DIR;

const QUESTIONS = [
  { id: 'q1', type: 'truefalse', prompt: 'Water boils at 100 C at sea level.', correct: true },
  { id: 'q2', type: 'truefalse', prompt: 'The Moon is a planet.', correct: false },
  { id: 'q3', type: 'truefalse', prompt: 'Bats are mammals.', correct: true },
  { id: 'q4', type: 'truefalse', prompt: 'Spiders have six legs.', correct: false },
  { id: 'q5', type: 'mcq', prompt: 'How many sides does a hexagon have?', choices: [{ id: 'a', text: '5' }, { id: 'b', text: '6' }, { id: 'c', text: '7' }, { id: 'd', text: '8' }], correct: 'b' },
  { id: 'q6', type: 'mcq', prompt: 'Which planet is closest to the Sun?', choices: [{ id: 'a', text: 'Mercury' }, { id: 'b', text: 'Venus' }, { id: 'c', text: 'Mars' }, { id: 'd', text: 'Earth' }], correct: 'a' },
];

async function check(page: Page, name: string, widths = [390, 1366]) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await settled(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${name} scrolls sideways at ${width}`).toBeLessThanOrEqual(0);
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), `${name} at ${width}`).toEqual([]);
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: `${SHOTS}/${name}-${width}.png`, fullPage: true });
    }
  }
}

async function makeSet(page: Page, title: string) {
  const res = await page.request.post('/api/sets', { headers: CSRF, data: { title, description: 'Some facts', subject: 'science', visibility: 'private', questions: QUESTIONS } });
  expect(res.ok(), await res.text()).toBe(true);
  const body = await res.json();
  return (body.set?.id ?? body.id) as string;
}

test('build a game from a starting point, change it, save it, host it to the end with two players, and see its name in the report', async ({ browser }) => {
  test.setTimeout(300_000);
  const host = await account(browser, { accountType: 'teacher' });
  const page = host.page;
  const errors = watchErrors(page);
  const setId = await makeSet(page, 'Facts for a made game');

  await page.goto('/mode-studio');
  await expect(page.getByRole('heading', { name: 'Mode Studio', level: 1 })).toBeVisible();
  await check(page, 'studio-home');

  await page.getByRole('link', { name: /Three lives/ }).click();
  await expect(page.getByRole('heading', { name: 'Three lives', level: 1 })).toBeVisible();
  const rules = page.getByRole('region', { name: 'The rules' });
  await expect(rules).toContainText('Everyone starts with 3 lives. The last player still in wins.');
  // The live test is running: the bots are in, and a question comes up on your phone.
  const test1 = page.getByRole('region', { name: 'Live test' });
  await expect(test1.getByText(/Get ready|Question 1 of/).first()).toBeVisible({ timeout: 20_000 });
  await check(page, 'studio-builder');

  // Change three things: the name, the lives, and what points are called.
  await page.getByLabel('Name', { exact: true }).fill('Lives of the class');
  await page.getByLabel('Lives', { exact: true }).fill('2');
  await page.getByLabel('What points are called').fill('stars');
  await expect(rules).toContainText('Everyone starts with 2 lives.');
  await expect(rules).toContainText('A right answer scores 3 stars');
  await expect(page.getByRole('heading', { name: 'Lives of the class', level: 1 })).toBeVisible();
  // The live test restarts with the new game: the test player's screen counts lives in the new rules.
  await expect(test1.getByText('2 lives', { exact: true })).toBeVisible({ timeout: 20_000 });

  // A broken value is caught by the check, in words, before saving.
  await page.getByLabel('Lives', { exact: true }).fill('9');
  const checkPanel = page.getByRole('region', { name: /thing to fix|things to fix/ });
  await expect(checkPanel).toContainText('Lives must be at most 5.');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('region', { name: 'Ready to play' })).toBeVisible();

  // A long question time, so slow browsers cannot run a question out while its screens are checked.
  await page.getByLabel('Seconds per question').fill('60');
  await expect(rules).toContainText('60 seconds each');
  await page.getByRole('button', { name: 'Save game' }).click();
  await expect(page).toHaveURL(/\/mode-studio\/[0-9a-f-]{36}$/);
  const blueprintId = page.url().split('/').pop()!;

  // Host it: the host page opens with this game, and the set is picked in step 1.
  await page.goto(`/host?blueprint=${blueprintId}&set=${setId}`);
  const section = page.getByRole('region', { name: 'Games made in Mode Studio' });
  await expect(section.getByRole('heading', { name: 'Lives of the class' })).toBeVisible();
  await check(page, 'host-made-game');
  await section.getByRole('button', { name: 'Host with these questions: Lives of the class' }).click();
  await expect(page).toHaveURL(/\/room\/\d+/);
  const code = page.url().split('/').pop()!;

  // Two players join.
  const players = await Promise.all([0, 1].map(() => browser.newContext().then((c) => c.newPage())));
  for (const [i, p] of players.entries()) {
    await p.goto(`/join/${code}`);
    await p.getByLabel('Your name').fill(`Player ${i + 1}`);
    await p.getByRole('button', { name: 'Join game' }).click();
    await expect(p.getByText('You are in', { exact: true })).toBeVisible();
  }
  await expect(page.getByText('Player 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByText('Get ready')).toBeVisible();

  // The player's screen and the big screen while a question is open.
  await expect(players[0]!.getByRole('group', { name: 'Answers' }).or(players[0]!.getByPlaceholder(/^Type/)).first()).toBeVisible({ timeout: 30_000 });
  await expect(players[0]!.getByText('2 lives', { exact: true })).toBeVisible();
  await check(players[0]!, 'play-player');
  await check(page, 'play-host', [1366]);

  // Play: each player answers whatever is on screen until the results.
  for (const p of players) p.setDefaultTimeout(6_000);
  const over = players[0]!.getByRole('heading', { level: 1, name: 'Game over' });
  for (let turn = 0; turn < 80; turn++) {
    if (await over.isVisible().catch(() => false)) break;
    for (const p of players) {
      if (await p.getByRole('group', { name: 'Answers' }).or(p.getByPlaceholder(/^Type/)).first().isVisible().catch(() => false)) await answerAnyQuestion(p).catch(() => {});
    }
    await page.waitForTimeout(1500);
  }
  for (const p of players) p.setDefaultTimeout(30_000);
  await expect(over).toBeVisible({ timeout: 60_000 });
  await expect(players[0]!.getByText('Lives of the class').first()).toBeVisible();
  await expect(page.getByText(/Game over|Results/).first()).toBeVisible();
  await check(players[0]!, 'results-player');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/results.png`, fullPage: true });

  // The report names the game.
  await expect.poll(async () => (await (await page.request.get('/api/me/hosted')).json()).games[0]?.mode, { timeout: 20_000 }).toBe('Lives of the class');
  expect(errors).toEqual([]);
});

test('copy someone’s public game to change it', async ({ browser }) => {
  test.setTimeout(180_000);
  const maker = await account(browser);
  expect(operator('grant', maker.username, 'trusted', '--reason', 'e2e')).toContain('Granted');
  const starter = await (await maker.page.request.get('/api/blueprints?scope=public')).json();
  expect(Array.isArray(starter.games)).toBe(true);
  // The maker builds from the island starting point and lists it for everyone.
  await maker.page.goto('/mode-studio/new?from=island-claim');
  await maker.page.getByLabel('Name', { exact: true }).fill('Island of the week');
  await maker.page.getByLabel('Who can see it').selectOption('public');
  await maker.page.getByRole('button', { name: 'Save game' }).click();
  await expect(maker.page).toHaveURL(/\/mode-studio\/[0-9a-f-]{36}$/);

  const other = await account(browser);
  const errors = watchErrors(other.page);
  await other.page.goto('/mode-studio');
  await other.page.getByRole('searchbox', { name: 'Search made games' }).fill('Island of the week');
  const card = other.page.getByRole('listitem').filter({ has: other.page.getByRole('heading', { name: 'Island of the week' }) });
  // The card says plainly what acts on other players, and who made it.
  await expect(card).toContainText('Acts on other players');
  await expect(card).toContainText('Gust power-up');
  await expect(card).toContainText(`Made by ${maker.username}`);
  await check(other.page, 'studio-community');
  await card.getByRole('link', { name: 'See how it works' }).click();
  await expect(other.page.getByRole('heading', { name: 'Island of the week', level: 1 })).toBeVisible();
  await other.page.getByRole('button', { name: 'Copy to change it' }).click();
  await expect(other.page.getByRole('heading', { name: 'Island of the week (copy)', level: 1 })).toBeVisible();
  // The copy is theirs: they can change and save it.
  await other.page.getByLabel('Name', { exact: true }).fill('My island');
  await other.page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(other.page.getByText('My island saved')).toBeVisible();
  const mine = await (await other.page.request.get('/api/blueprints?scope=mine')).json();
  expect(mine.games.map((g: { name: string }) => g.name)).toEqual(['My island']);
  expect(errors).toEqual([]);
});

test('a 3D race draws its scene in the live test, with you and 20 bots on the big screen', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Headless Firefox and WebKit have no WebGL; the 3D picture is checked in Chromium.');
  test.setTimeout(240_000);
  const host = await account(browser, { accountType: 'teacher' });
  const page = host.page;
  await host.context.addInitScript(() => localStorage.setItem('ludora.graphics', 'high'));
  const errors = watchErrors(page);
  await page.goto('/mode-studio/new?from=meadow-dash');
  await expect(page.getByRole('heading', { name: 'Meadow dash', level: 1 })).toBeVisible();
  const live = page.getByRole('region', { name: 'Live test' });
  const canvas = live.locator('canvas.s3-canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toHaveAttribute('aria-label', /Meadow dash/);
  await check(page, 'studio-3d');
  // The most the test room takes: you and 20 bots, seen on the big screen. (40 players are measured on /dev/three.html?scene=made-host.)
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByLabel('Practice bots').selectOption('20');
  await live.getByRole('radio', { name: 'Big screen' }).click();
  await expect(canvas).toHaveAttribute('data-glims', '21', { timeout: 30_000 });
  await page.waitForTimeout(3000);
  const calls = Number(await canvas.getAttribute('data-calls'));
  const triangles = Number(await canvas.getAttribute('data-triangles'));
  console.log(`made 3D race, big screen, 21 players, high tier: ${calls} draw calls, ${triangles} triangles`);
  expect(calls).toBeGreaterThan(10);
  expect(calls).toBeLessThan(600);
  if (SHOTS) await canvas.screenshot({ path: `${SHOTS}/scene-40.png` });
  expect(errors).toEqual([]);
});
