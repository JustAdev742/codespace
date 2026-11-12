import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { STARTER_BLUEPRINTS } from '@ludora/shared';
import { account, CSRF, settled, watchErrors } from './helpers.ts';

/*
 * Playing solo in stages (docs/features/solo.md): the set, the game, then "Your settings", then
 * Start playing. The settings a player chooses reach the game the server makes, are remembered on
 * the device for that game, and a game made in Game Maker has a settings stage too.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const SHOTS = process.env.SHOTS_DIR;

const word = (id: string, prompt: string, answer: string, difficulty: 'easy' | 'hard') => ({ id, type: 'short', prompt, accepted: [answer], difficulty });
const QUESTIONS = [
  word('h1', 'The largest planet', 'Jupiter', 'hard'),
  word('h2', 'The red planet', 'Mars', 'hard'),
  word('h3', 'The ringed planet', 'Saturn', 'hard'),
  word('h4', 'The planet nearest the Sun', 'Mercury', 'hard'),
  word('h5', 'The planet we live on', 'Earth', 'hard'),
  word('e1', 'A young cat', 'Kitten', 'easy'),
  word('e2', 'A young dog', 'Puppy', 'easy'),
  word('e3', 'A baby frog', 'Tadpole', 'easy'),
];

async function check(page: Page, name: string) {
  for (const width of [390, 1366]) {
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
  const res = await page.request.post('/api/sets', { headers: CSRF, data: { title, description: 'Planets and animals', subject: 'science', visibility: 'private', questions: QUESTIONS } });
  expect(res.ok(), await res.text()).toBe(true);
  const body = await res.json();
  return (body.set?.id ?? body.id) as string;
}

type SeenRoom = { common: Record<string, unknown>; settings: Record<string, unknown>; questionCount: number; solo: boolean };
type SeenPlayer = { isBot: boolean };

/** The room as the server sends it to the player: the last full view seen on the socket. */
function watchRoom(page: Page) {
  const seen: { room: SeenRoom | null; players: SeenPlayer[] } = { room: null, players: [] };
  const look = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(look);
    const o = v as Record<string, unknown>;
    const room = o.room as SeenRoom | undefined;
    if (room && typeof room === 'object' && 'common' in room && 'settings' in room) {
      seen.room = room;
      if (Array.isArray(o.players)) seen.players = o.players as SeenPlayer[];
      return;
    }
    Object.values(o).forEach(look);
  };
  page.on('websocket', (ws) =>
    ws.on('framereceived', (f) => {
      const text = typeof f.payload === 'string' ? f.payload : '';
      const at = text.indexOf('[');
      if (!text.startsWith('42') || at < 0) return;
      try {
        look(JSON.parse(text.slice(at)));
      } catch {
        /* not a JSON frame */
      }
    }),
  );
  return seen;
}

test('a solo player chooses their settings as a stage, the game honours them, and they are remembered', async ({ browser }) => {
  test.setTimeout(300_000);
  const player = await account(browser, { accountType: 'student' });
  const page = player.page;
  const errors = watchErrors(page);
  await makeSet(page, 'Planet words');
  await page.goto('/host?solo=1');
  await expect(page.getByRole('heading', { name: /Your settings/ })).toBeVisible();
  await expect(page.getByText('Choose a game in step 2, then set it up here')).toBeVisible();
  await page.getByRole('button', { name: /Planet words/ }).first().click();
  await page.getByRole('radio', { name: /^Word Scramble/ }).first().click({ timeout: 10_000 });

  // The bar offers the settings stage beside Start, and says what Start will start.
  const bar = page.locator('[data-summary]');
  await expect(bar).toContainText('Word Scramble with “Planet words”');
  await expect(bar).toContainText('no bots');
  await page.getByRole('button', { name: 'Your settings' }).click();
  await expect(page.getByRole('heading', { name: /Your settings/ })).toBeFocused();

  await page.getByLabel('How many questions').fill('4');
  await page.getByLabel('Timer on every word').click();
  await page.getByLabel('Seconds per question').fill('30');
  await page.getByLabel('Which questions').selectOption('hard');
  await page.getByLabel('How many', { exact: true }).selectOption('2');
  await page.getByRole('radiogroup', { name: 'How good' }).getByRole('radio', { name: 'Hard', exact: true }).click();
  await expect(bar).toContainText('4 questions, only the hard ones, 30 seconds each');
  await expect(bar).toContainText('2 bots (Hard)');
  await check(page, 'solo-settings');

  const room = watchRoom(page);
  const made = page.waitForRequest((r) => r.url().endsWith('/api/rooms') && r.method() === 'POST');
  // Start stays reachable from the bar wherever the page is scrolled.
  await page.getByRole('button', { name: 'Start playing' }).click();
  expect((await made).postDataJSON()).toMatchObject({ solo: true, modeId: 'word-scramble', difficulty: 'hard', common: { questionLimit: 4, questionTimeSec: 30 }, settings: { wordTimer: true }, practiceBots: { count: 2, level: 'hard' } });
  await expect(page).toHaveURL(/\/room\/\d{6}/);
  // The game the server made has those settings, only the hard questions, and two bots.
  await expect.poll(() => room.room?.common.questionLimit, { timeout: 20_000 }).toBe(4);
  expect(room.room!.common.questionTimeSec).toBe(30);
  expect(room.room!.settings.wordTimer).toBe(true);
  expect(room.room!.solo).toBe(true);
  expect(room.room!.questionCount).toBeLessThanOrEqual(5);
  expect(room.players.filter((p) => p.isBot)).toHaveLength(2);

  // Next time, the same game starts from what was chosen, on this device.
  await page.goto('/host?solo=1');
  await page.getByRole('button', { name: /Planet words/ }).first().click();
  await page.getByRole('radio', { name: /^Word Scramble/ }).first().click({ timeout: 10_000 });
  await expect(page.locator('[data-remembered]')).toBeVisible();
  await expect(page.getByLabel('How many questions')).toHaveValue('4');
  await expect(page.getByLabel('Seconds per question')).toHaveValue('30');
  await expect(page.getByLabel('Timer on every word')).toBeChecked();
  await expect(page.getByLabel('How many', { exact: true })).toHaveValue('2');
  await expect(page.getByRole('radiogroup', { name: 'How good' }).getByRole('radio', { name: 'Hard', exact: true })).toHaveAttribute('aria-checked', 'true');
  // Another game keeps its own defaults.
  await page.getByRole('radio', { name: /^Gold Rush/ }).first().click();
  await expect(page.getByLabel('How many', { exact: true })).toHaveValue('0');
  expect(errors).toEqual([]);
});

test('arriving with a set or a game already chosen goes straight to what is left', async ({ browser }) => {
  test.setTimeout(180_000);
  const player = await account(browser, { accountType: 'student' });
  const page = player.page;
  const setId = await makeSet(page, 'Chosen words');
  // From a set's page: the set is chosen, the game is asked for.
  await page.goto(`/host?solo=1&set=${setId}`);
  await expect(page.getByRole('button', { name: /Change the question set, Chosen words/ })).toBeVisible();
  await expect(page.locator('[data-summary]')).toHaveText('Choose a game mode.');
  // From a mode's page (or a suggested game): the game is chosen with its settings stage ready, the set is asked for.
  await page.goto('/host?solo=1&mode=word-scramble');
  await expect(page.getByRole('radio', { name: /^Word Scramble/ }).first()).toBeChecked();
  await expect(page.getByLabel('How many questions')).toBeVisible();
  await expect(page.locator('[data-summary]')).toHaveText('Choose a question set.');
  await page.getByRole('button', { name: /Chosen words/ }).first().click();
  await expect(page.getByRole('button', { name: 'Start playing' })).toBeEnabled();
});

test('a game made in Game Maker is chosen in step 2 and has its own settings stage', async ({ browser }) => {
  test.setTimeout(180_000);
  const player = await account(browser, { accountType: 'student' });
  const page = player.page;
  const errors = watchErrors(page);
  await makeSet(page, 'Made words');
  const saved = await page.request.post('/api/blueprints', { headers: CSRF, data: { blueprint: { ...STARTER_BLUEPRINTS[0]!.blueprint, name: 'My solo island' }, visibility: 'private' } });
  expect(saved.ok(), await saved.text()).toBe(true);
  const id = (await saved.json()).game.id as string;
  // Game Maker's Play solo link: the made game is chosen, and only the set is left.
  await page.goto(`/host?solo=1&blueprint=${id}`);
  await expect(page.getByRole('radio', { name: /^My solo island/ })).toBeChecked({ timeout: 15_000 });
  await page.getByRole('button', { name: /Made words/ }).first().click();
  // Made games used to start at once with three bots; now the player chooses.
  await expect(page.getByLabel('How many', { exact: true })).toHaveValue('3');
  await page.getByLabel('How many', { exact: true }).selectOption('1');
  await page.getByRole('radiogroup', { name: 'How good' }).getByRole('radio', { name: 'Easy', exact: true }).click();
  await page.getByLabel('Which questions').selectOption('hard');
  await expect(page.locator('[data-summary]')).toContainText('My solo island with “Made words”: only the hard ones, 1 bot (Easy)');
  await check(page, 'solo-made-game');
  const room = watchRoom(page);
  const made = page.waitForRequest((r) => r.url().endsWith('/api/rooms') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Start playing' }).click();
  expect((await made).postDataJSON()).toMatchObject({ solo: true, modeId: 'made-game', blueprintId: id, difficulty: 'hard', practiceBots: { count: 1, level: 'easy' } });
  await expect(page).toHaveURL(/\/room\/\d{6}/);
  await expect.poll(() => room.players.filter((p) => p.isBot).length, { timeout: 20_000 }).toBe(1);
  expect(room.room!.questionCount).toBeLessThanOrEqual(5);
  expect(errors).toEqual([]);
});
