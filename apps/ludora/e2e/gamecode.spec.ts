import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { account, answerAnyQuestion, CSRF, settled, watchErrors } from './helpers.ts';

/*
 * Game Maker with game code (docs/features/gamecode.md): write a game from blank in code and watch
 * the live test and the rules follow each line; make a mistake and see the message, its fix and the
 * last good game still running; change a form and see the code change; add rules and numbers in
 * code and see them work in a game played to the end by two players; the old Mode Studio and
 * Saved games links land in Game Maker. Every screen is checked with axe at phone and laptop widths.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const SHOTS = process.env.SHOTS_DIR;

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

const QUESTIONS = [
  { id: 'q1', type: 'truefalse', prompt: 'Water boils at 100 C at sea level.', correct: true },
  { id: 'q2', type: 'truefalse', prompt: 'The Moon is a planet.', correct: false },
  { id: 'q3', type: 'truefalse', prompt: 'Bats are mammals.', correct: true },
  { id: 'q4', type: 'truefalse', prompt: 'Spiders have six legs.', correct: false },
  { id: 'q5', type: 'truefalse', prompt: 'The Sun is a star.', correct: true },
  { id: 'q6', type: 'truefalse', prompt: 'Fish can fly to the Moon.', correct: false },
];

test('old Mode Studio and saved-games links land in Game Maker, which has one menu item and a Saved games tab', async ({ browser }) => {
  const p = await account(browser);
  const page = p.page;
  const errors = watchErrors(page);
  await page.goto('/mode-studio');
  await expect(page).toHaveURL(/\/game-maker$/);
  await expect(page.getByRole('heading', { name: 'Game Maker', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Make a game' })).toHaveAttribute('aria-selected', 'true');
  // The starting points show their code.
  await expect(page.getByRole('link', { name: /Meadow dash/ })).toContainText('race to 30 steps');
  await check(page, 'gm-home');
  await page.setViewportSize({ width: 1366, height: 768 });
  // One item in the side menu, and no Mode Studio.
  const nav = page.getByRole('navigation').first();
  await expect(nav.getByRole('link', { name: 'Game Maker' })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Mode Studio' })).toHaveCount(0);

  await page.goto('/mode-studio/new?from=gem-hunt');
  await expect(page).toHaveURL(/\/game-maker\/new\?from=gem-hunt$/);
  await expect(page.getByRole('heading', { name: 'Gem hunt', level: 1 })).toBeVisible();

  await page.goto('/games?tab=community');
  await expect(page).toHaveURL(/\/game-maker\?tab=saved&saved=community$/);
  await expect(page.getByRole('tab', { name: 'Saved games' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Saved games', level: 2 })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Shared by others' })).toHaveAttribute('aria-checked', 'true');
  await check(page, 'gm-saved');
  expect(errors).toEqual([]);
});

test('write a game in code from blank, fix a mistake, change a form, then play its rules to the end with two players', async ({ browser }) => {
  test.setTimeout(300_000);
  const host = await account(browser, { accountType: 'teacher' });
  const page = host.page;
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/game-maker/new');
  const code = page.getByRole('textbox', { name: 'Game code' });
  await expect(code).toBeVisible();
  const rules = page.getByRole('region', { name: 'The rules' });
  const live = page.getByRole('region', { name: 'Live test' });

  // Line by line from nothing: the heading, the rules in words and the live test follow.
  const lines: string[] = [];
  const write = async (line: string) => {
    lines.push(line);
    await code.fill(`${lines.join('\n')}\n`);
  };
  await write('# My first game');
  await write('game "Code keepers"');
  await expect(page.getByRole('heading', { name: 'Code keepers', level: 1 })).toBeVisible();
  await write('5 lives');
  await expect(rules).toContainText('Everyone starts with 5 lives.');
  await expect(live.getByText('5 lives', { exact: true })).toBeVisible({ timeout: 20_000 });
  await write('questions: own pace, 5 each, 60 seconds each');
  await expect(rules).toContainText('Everyone answers at their own pace, up to 5 questions each.');
  await write('right answer: score 3 points');
  await expect(rules).toContainText('A right answer scores 3 points.');
  await write('wins: most when time runs out');
  await write('each player has 3 keys');
  await expect(rules).toContainText('Each player has keys, starting at 3.');
  await expect(live.getByText('3 keys')).toBeVisible({ timeout: 20_000 });
  await write('when the game starts: everyone gains 5');
  await expect(rules).toContainText('When the game starts: everyone gains 5 points.');
  await write('when a player answers right: add 1 keys');
  await expect(rules).toContainText('When a player answers right: 1 key is added.');

  // A mistake: the line, what is wrong, the nearest thing that works, and the last good game keeps running.
  await write('cover: rockett');
  const problems = page.getByRole('region', { name: 'Problems in the code' });
  await expect(problems).toContainText('Line 10: I do not know “rockett”. Did you mean “rocket”?');
  await expect(problems).toContainText('The test keeps playing your last working game.');
  await expect(live.getByText('3 keys')).toBeVisible();
  await check(page, 'gm-code-mistake');
  await page.setViewportSize({ width: 1366, height: 768 });
  await problems.getByRole('button', { name: 'Use “rocket”' }).click();
  await expect(code).toHaveValue(/cover: rocket\n/);
  await expect(problems).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Ready to play' })).toBeVisible();

  // Ideas for the next word: type the start of a line and press one.
  await code.fill(`${lines.slice(0, -1).join('\n')}\ncover: rocket\nstops after 4 min`);
  await code.press('End');
  await page.getByRole('group', { name: 'Ideas for the next word' }).getByRole('button').first().click();
  await expect(code).toHaveValue(/stops after 4 minutes/);
  await expect(rules).toContainText('The game lasts at most 4 minutes.');

  // A form change rewrites the code, keeping the note on the first line.
  await page.getByLabel('Lives', { exact: true }).fill('4');
  await expect(code).toHaveValue(/^# My first game\n/);
  await expect(code).toHaveValue(/\n4 lives\n/);
  await expect(rules).toContainText('Everyone starts with 4 lives.');
  // Undo covers both views.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(code).toHaveValue(/\n5 lives\n/);

  // The rule builder in the forms adds a line to the code.
  await page.getByRole('group', { name: 'When' }).getByRole('combobox').first().selectOption('lead');
  await page.getByRole('group', { name: 'Do' }).getByRole('combobox').first().selectOption('say');
  await page.getByRole('button', { name: 'Add the rule' }).click();
  await expect(code).toHaveValue(/when a player takes the lead: say "Nice one!"/);
  await check(page, 'gm-builder');

  // The help: every kind of line, and an example that inserts itself.
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'What you can write' }).click();
  const help = page.getByRole('dialog', { name: 'What you can write' });
  await help.getByRole('searchbox', { name: 'Find a line' }).fill('golden');
  await help.getByRole('button', { name: /^events: golden round, rally/ }).click();
  await expect(help).toHaveCount(0);
  await expect(code).toHaveValue(/events: golden round, rally/);

  await page.getByRole('button', { name: 'Save game' }).click();
  await expect(page).toHaveURL(/\/game-maker\/[0-9a-f-]{36}$/);
  const blueprintId = page.url().split('/').pop()!;

  // Host it with two players and play to the end: the rules work in a real room.
  const res = await page.request.post('/api/sets', { headers: CSRF, data: { title: 'Facts for code keepers', description: 'Some facts', subject: 'science', visibility: 'private', questions: QUESTIONS } });
  expect(res.ok(), await res.text()).toBe(true);
  const setBody = await res.json();
  await page.goto(`/host?blueprint=${blueprintId}&set=${setBody.set?.id ?? setBody.id}`);
  const section = page.getByRole('region', { name: 'Games made in Game Maker' });
  await section.getByRole('button', { name: 'Host with these questions: Code keepers' }).click();
  await expect(page).toHaveURL(/\/room\/\d+/);
  const room = page.url().split('/').pop()!;
  const players = await Promise.all([0, 1].map(() => browser.newContext().then((c) => c.newPage())));
  for (const [i, p] of players.entries()) {
    await p.goto(`/join/${room}`);
    await p.getByLabel('Your name').fill(`Keeper ${i + 1}`);
    await p.getByRole('button', { name: 'Join game' }).click();
    await expect(p.getByText('You are in', { exact: true })).toBeVisible();
  }
  await expect(page.getByText('Keeper 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start game' }).click();
  // "When the game starts: everyone gains 5" has worked, and each player sees their keys.
  const first = players[0]!;
  await expect(first.locator('main')).toContainText('points: 5', { timeout: 30_000 });
  await expect(first.getByText('3 keys')).toBeVisible();
  await check(first, 'gm-play-player');

  for (const p of players) p.setDefaultTimeout(6_000);
  const over = first.getByRole('heading', { level: 1, name: 'Game over' });
  for (let turn = 0; turn < 60; turn++) {
    if (await over.isVisible().catch(() => false)) break;
    for (const p of players) {
      if (await p.getByRole('group', { name: 'Answers' }).first().isVisible().catch(() => false)) await answerAnyQuestion(p).catch(() => {});
    }
    await page.waitForTimeout(800);
  }
  for (const p of players) p.setDefaultTimeout(30_000);
  await expect(over).toBeVisible({ timeout: 60_000 });
  // Everyone started with 5 points from the rule, so nobody ends below it.
  const standings = (await (await page.request.get('/api/me/hosted')).json()).games[0];
  expect(standings?.mode).toBe('Code keepers');
  await expect(first.locator('main')).toContainText(/(?:^|\D)(?:[5-9]|[1-9]\d+)\s*points/);
  expect(errors).toEqual([]);
});
