import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { account, answerAnyQuestion, CSRF, settled, watchErrors } from './helpers.ts';

/*
 * Practice bots with minds (docs/features/bots.md): the solo setup shows the levels and the
 * personalities a level brings; a solo race against a mixed class plays to the end with the
 * bots moving at their own moments; bots a host adds to a lobby show their personality.
 */

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
  const res = await page.request.post('/api/sets', { headers: CSRF, data: { title, description: 'Some facts', subject: 'science', visibility: 'private', questions: QUESTIONS } });
  expect(res.ok(), await res.text()).toBe(true);
  const body = await res.json();
  return (body.set?.id ?? body.id) as string;
}

/** Finds every `lanes` list in a socket frame (Comet Dash's racers and where they are). */
function lanesIn(value: unknown, out: { playerId: string; pos: number }[][] = []): { playerId: string; pos: number }[][] {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const v of value) lanesIn(v, out);
    return out;
  }
  for (const [k, v] of Object.entries(value)) {
    if (k === 'lanes' && Array.isArray(v)) out.push(v as { playerId: string; pos: number }[]);
    else lanesIn(v, out);
  }
  return out;
}

test('solo setup shows the levels and personalities, and a race against a mixed class plays to the end with bots moving at their own moments', async ({ browser }) => {
  test.setTimeout(300_000);
  const player = await account(browser, { accountType: 'student' });
  const page = player.page;
  const errors = watchErrors(page);
  await makeSet(page, 'Bot facts');
  await page.goto('/host?solo=1');
  await page.getByRole('button', { name: /Bot facts/ }).first().click();
  await page.getByRole('radio', { name: /^Comet Dash/ }).first().click({ timeout: 10_000 });
  await page.getByLabel('How many').selectOption('3');

  // Five levels, Mixed class chosen to start with, and the personalities each brings in words.
  const levels = page.getByRole('radiogroup', { name: 'How good' });
  for (const name of ['Easy', 'Medium', 'Hard', 'Mixed class', 'My level']) await expect(levels.getByRole('radio', { name, exact: true })).toBeVisible();
  await expect(levels.getByRole('radio', { name: 'Mixed class', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Who you might meet')).toBeVisible();
  for (const persona of ['Careful', 'Quick', 'Daydreamer']) await expect(page.getByText(persona, { exact: true })).toBeVisible();
  await levels.getByRole('radio', { name: 'Hard', exact: true }).click();
  await expect(page.getByText('Daydreamer', { exact: true })).toHaveCount(0);
  await levels.getByRole('radio', { name: 'Mixed class', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(levels.getByRole('radio', { name: 'Mixed class', exact: true })).toHaveAttribute('aria-checked', 'true');
  await check(page, 'bots-solo-setup');

  // A short race that ends when the first racer crosses the line.
  await page.getByLabel('Track length').fill('8');
  await page.getByLabel('Podium places before the race ends').fill('1');

  // Watch every view the server sends, to see when each bot moves.
  const moves = new Map<string, number[]>();
  const last = new Map<string, number>();
  page.on('websocket', (ws) =>
    ws.on('framereceived', (f) => {
      const text = typeof f.payload === 'string' ? f.payload : '';
      const at = text.indexOf('[');
      if (!text.startsWith('42') || at < 0) return;
      let data: unknown;
      try {
        data = JSON.parse(text.slice(at));
      } catch {
        return;
      }
      for (const lanes of lanesIn(data)) {
        for (const l of lanes) {
          if (!l.playerId.startsWith('b')) continue;
          if ((last.get(l.playerId) ?? 0) < l.pos) moves.set(l.playerId, [...(moves.get(l.playerId) ?? []), Date.now()]);
          last.set(l.playerId, l.pos);
        }
      }
    }),
  );

  const made = page.waitForRequest((r) => r.url().endsWith('/api/rooms') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Start playing' }).click();
  expect((await made).postDataJSON()).toMatchObject({ solo: true, practiceBots: { count: 3, level: 'mixed' } });
  await expect(page).toHaveURL(/\/room\/\d{6}/);

  // Play: answer whatever is on screen until the results come.
  const results = page.getByRole('heading', { name: 'Game over' });
  page.setDefaultTimeout(6_000);
  for (let i = 0; i < 120; i++) {
    if (await results.count()) break;
    await answerAnyQuestion(page).catch(() => {});
    await page.waitForTimeout(1500);
  }
  page.setDefaultTimeout(30_000);
  await expect(page.getByText(/^Bot /).first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => moves.size, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);

  // The bots moved on their own clocks: not in step with each other.
  const firsts = [...moves.values()].map((t) => t[0]!);
  expect(Math.max(...firsts) - Math.min(...firsts)).toBeGreaterThan(400);
  const every = [...moves.values()].flat().sort((a, b) => a - b);
  const together = every.filter((t, i) => i > 0 && t - every[i - 1]! < 100).length;
  expect(together).toBeLessThan(every.length / 2);
  expect(errors).toEqual([]);
});

test('bots a host adds to the lobby show their personalities', async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await account(browser, { accountType: 'teacher' });
  const setId = await makeSet(host.page, 'Lobby facts');
  const res = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId, modeId: 'classic' } });
  expect(res.ok(), await res.text()).toBe(true);
  const { code } = await res.json();
  await host.page.goto(`/room/${code}`);
  await host.page.getByRole('button', { name: 'Add 3 practice bots' }).click();
  const personas = ['Careful', 'Quick', 'Steady', 'Strong finisher', 'Nervous starter', 'Guesser', 'Daydreamer'];
  const seats = host.page.locator('li').filter({ has: host.page.getByText('Bot', { exact: true }) });
  await expect(seats).toHaveCount(3, { timeout: 10_000 });
  for (const seat of await seats.all()) {
    const text = await seat.innerText();
    expect(personas.some((p) => text.includes(p)), text).toBe(true);
  }
  await check(host.page, 'bots-lobby');
});
