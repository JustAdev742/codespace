import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { account, CSRF, settled, watchErrors } from './helpers.ts';

/*
 * Poll, fill in the blanks and sort into groups, played in Classic on a phone by keyboard and
 * taps, with maths drawn in a prompt, a double points badge and a "why" note at the reveal.
 */

const SHOTS = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const axe = async (page: Page) => {
  await settled(page);
  const r = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
};

test('a class plays a poll, fill in the blanks and sort into groups in Classic', async ({ browser }) => {
  const host = await account(browser, { accountType: 'teacher', displayName: 'Ms Patel' });
  const hostErrors = watchErrors(host.page);
  const set = await host.page.request.post('/api/sets', {
    headers: CSRF,
    data: {
      title: 'New kinds of question',
      subject: 'science',
      visibility: 'private',
      questions: [
        { id: 'poll', type: 'poll', prompt: 'Which planet would you most like to visit?', choices: [{ id: 'a', text: 'Mars' }, { id: 'b', text: 'Saturn' }, { id: 'c', text: 'Neptune' }] },
        { id: 'gap', type: 'blanks', prompt: 'Fill in the blanks.', text: 'Plants need [sunlight|light] and [water] to grow.' },
        { id: 'bank', type: 'blanks', prompt: 'Choose the missing word.', text: 'The Sun is a [star].', bank: true, distractors: ['planet', 'moon'] },
        { id: 'sort', type: 'sort', prompt: 'Sort these animals.', groups: [{ id: 'm', label: 'Mammals' }, { id: 'b', label: 'Birds' }], items: [{ id: 'dog', text: 'Dog', group: 'm' }, { id: 'owl', text: 'Owl', group: 'b' }, { id: 'cat', text: 'Cat', group: 'm' }, { id: 'hen', text: 'Hen', group: 'b' }] },
        { id: 'frac', type: 'mcq', prompt: 'What is $3/4$ of 20?', doublePoints: true, choices: [{ id: 'x', text: '12', why: 'That is 3/5 of 20.' }, { id: 'y', text: '15' }, { id: 'z', text: '16' }], correct: 'y' },
      ],
    },
  });
  expect(set.ok(), await set.text()).toBe(true);
  const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId: (await set.json()).set.id, modeId: 'classic', common: { shuffleQuestions: false, shuffleChoices: false }, settings: { autoAdvance: false } } });
  expect(room.ok(), await room.text()).toBe(true);
  const { code } = await room.json();
  await host.page.setViewportSize({ width: 1366, height: 768 });
  await host.page.goto(`/room/${code}`);

  const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const player = await playerContext.newPage();
  const playerErrors = watchErrors(player);
  await player.goto(`/join/${code}`);
  await player.getByLabel('Your name').fill('Curious Comet');
  await player.getByRole('button', { name: 'Join game' }).click();
  await expect(player.getByText('You are in', { exact: true })).toBeVisible();
  const next = host.page.getByRole('button', { name: /Next|Skip ahead/ });
  await host.page.getByRole('button', { name: 'Start game' }).click();
  await expect(host.page.getByText('Get ready')).toBeVisible();
  const announcer = player.locator('.sr-only[role="status"][aria-live="polite"]');
  const toNext = async () => {
    await next.click();
    await expect(host.page.getByText('Leaderboard')).toBeVisible();
    await next.click();
  };

  // 1. A poll: no right answer, no score; the reveal shows how the room voted.
  await expect(player.getByRole('heading', { name: 'Which planet would you most like to visit?' })).toBeVisible();
  await expect(player.getByText('A poll: there is no right answer. Pick yours.')).toBeVisible();
  await axe(player);
  await shot(player, 'poll-phone');
  await player.getByRole('group', { name: 'Poll choices' }).getByRole('button', { name: /Saturn/ }).click();
  await expect(player.getByText('Thanks for voting. Polls score no points.')).toBeVisible();
  await expect(player.getByText('How the class voted: 1 vote.')).toBeVisible();
  await expect(player.getByText(/^(Correct|Incorrect)$/)).toHaveCount(0);
  await expect(host.page.getByText('How the class voted: 1 vote.')).toBeVisible();
  await shot(host.page, 'poll-reveal-host');
  await shot(player, 'poll-reveal-phone');
  await toNext();

  // 2. Fill in the blanks, typed: one box per gap, read out as "Gap 1 of 2".
  await expect(player.getByRole('heading', { name: 'Fill in the blanks.' })).toBeVisible();
  await expect(host.page.getByText('Plants need')).toBeVisible();
  await axe(player);
  await player.getByLabel('Gap 1 of 2').fill('Sunlihgt');
  await player.getByLabel('Gap 2 of 2').fill('water');
  await shot(player, 'blanks-typed-phone');
  await player.keyboard.press('Enter');
  await expect(player.getByText('Correct', { exact: true })).toBeVisible();
  await expect(announcer).toContainText('The missing words were sunlight, then water.');
  await toNext();

  // 3. Fill in the blanks from a word bank, by keyboard.
  await expect(player.getByRole('heading', { name: 'Choose the missing word.' })).toBeVisible();
  const bank = player.getByRole('group', { name: 'Word bank' });
  await expect(bank.getByRole('button')).toHaveCount(3);
  await axe(player);
  await bank.getByRole('button', { name: 'moon' }).focus();
  await player.keyboard.press('Enter');
  await expect(player.getByRole('button', { name: 'Gap 1 of 1: moon. Take it out' })).toBeVisible();
  await player.getByRole('button', { name: 'Gap 1 of 1: moon. Take it out' }).click();
  await bank.getByRole('button', { name: 'star' }).click();
  await shot(player, 'blanks-bank-phone');
  await player.getByRole('button', { name: 'Submit answer' }).click();
  await expect(player.getByText('Correct', { exact: true })).toBeVisible();
  await toNext();

  // 4. Sort into groups: pick an item, then its group; number keys pick the group too. Part marks for one wrong.
  await expect(player.getByRole('heading', { name: 'Sort these animals.' })).toBeVisible();
  await axe(player);
  const items = player.getByRole('group', { name: 'Items to sort' });
  await expect(items.getByRole('button')).toHaveCount(4);
  await shot(player, 'sort-phone');
  const place = async (item: string, group: 'Mammals' | 'Birds') => {
    await player.getByRole('button', { name: item, exact: true }).click();
    await player.getByRole('button', { name: new RegExp(`^(Put ${item} in )?${group}`) }).click();
  };
  await place('Dog', 'Mammals');
  await place('Owl', 'Birds');
  await place('Cat', 'Mammals');
  // The last one by keyboard: it is picked already, and 1 is the first group.
  await player.keyboard.press('1');
  await expect(player.getByText('Every item has a group. Change any by picking it again.')).toBeVisible();
  await expect(player.getByRole('list', { name: 'In Mammals' }).getByRole('button')).toHaveCount(3);
  await shot(player, 'sort-done-phone');
  await player.getByRole('button', { name: 'Lock in groups' }).click();
  await expect(player.getByText('Partly right (75%)')).toBeVisible();
  await expect(player.getByRole('group', { name: 'The right groups' })).toBeVisible();
  await shot(player, 'sort-reveal-phone');
  await shot(host.page, 'sort-reveal-host');
  await toNext();

  // 5. Maths drawn in the prompt (and said in words), a double points badge, and the "why" note for a wrong pick.
  const prompt = player.getByRole('heading', { name: 'What is 3 over 4 of 20?' });
  await expect(prompt).toBeVisible();
  await expect(prompt.locator('[aria-hidden] .border-t-\\[0\\.09em\\]')).toHaveText('4');
  await expect(player.getByText('Double points', { exact: true })).toBeVisible();
  await expect(host.page.getByText('Double points', { exact: true })).toBeVisible();
  await axe(player);
  await shot(player, 'maths-phone');
  await shot(host.page, 'maths-host');
  await player.getByRole('button', { name: /12/ }).click();
  await expect(player.getByText('Incorrect', { exact: true })).toBeVisible();
  await expect(player.locator('p', { hasText: 'Why not 12?' })).toContainText('That is 3/5 of 20.');
  // It is read out too.
  await expect(announcer).toContainText('That is 3/5 of 20.');
  // The big screen does not single anyone out.
  await expect(host.page.getByText('Why not 12?')).toHaveCount(0);
  await shot(player, 'why-phone');

  expect(hostErrors).toEqual([]);
  expect(playerErrors).toEqual([]);
});
