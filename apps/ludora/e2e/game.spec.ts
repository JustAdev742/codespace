import { expect, test } from '@playwright/test';
import { CSRF, account, watchErrors } from './helpers.ts';

test('a host and a player play Classic from join code to results', async ({ browser }) => {
  const host = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera' });
  const hostErrors = watchErrors(host.page);
  const set = await host.page.request.post('/api/sets', {
    headers: CSRF,
    data: {
      title: 'Science starters',
      description: 'Three quick ones',
      subject: 'science',
      visibility: 'private',
      questions: [
        { id: 'q1', type: 'truefalse', prompt: 'The Sun is a star.', correct: true },
        { id: 'q2', type: 'truefalse', prompt: 'Spiders are insects.', correct: false },
        { id: 'q3', type: 'truefalse', prompt: 'Water boils at 100 °C at sea level.', correct: true },
      ],
    },
  });
  expect(set.ok(), await set.text()).toBe(true);
  const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId: (await set.json()).set.id, modeId: 'classic', common: { questionLimit: 3, shuffleQuestions: false } } });
  expect(room.ok(), await room.text()).toBe(true);
  const { code } = await room.json();
  await host.page.goto(`/room/${code}`);
  await expect(host.page.getByRole('button', { name: 'Start game' })).toBeVisible();

  // The player is a guest: a code and a name are enough.
  const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const player = await playerContext.newPage();
  const playerErrors = watchErrors(player);
  await player.goto(`/join/${code}`);
  await player.getByLabel('Your name').fill('Sunny Otter');
  await player.getByRole('button', { name: 'Join game' }).click();
  // Exact: the screen reader announcer also says these words, inside a longer sentence.
  await expect(player.getByText('You are in!', { exact: true })).toBeVisible();
  await expect(host.page.getByText('Sunny Otter', { exact: true })).toBeVisible();

  const next = host.page.getByRole('button', { name: /Next|Skip ahead/ });
  await host.page.getByRole('button', { name: 'Start game' }).click();
  await expect(host.page.getByText('Get ready')).toBeVisible();
  await next.click();
  const rounds = [
    ['The Sun is a star.', 'True'],
    ['Spiders are insects.', 'False'],
    ['Water boils at 100 °C at sea level.', 'True'],
  ] as const;
  const announcer = player.locator('.sr-only[role="status"][aria-live="polite"]');
  for (const [i, [prompt, answer]] of rounds.entries()) {
    await expect(player.getByRole('heading', { name: prompt })).toBeVisible();
    // The answer button that had focus went with the last question, so focus moves to the new one.
    await expect(player.getByRole('heading', { name: prompt })).toBeFocused();
    await expect(announcer).toContainText(`Question ${i + 1} of 3.`);
    await player.getByRole('button', { name: new RegExp(`^[A-F]? ?${answer}$`) }).first().click();
    // Everyone has answered, so the round closes and shows the answer.
    await expect(player.getByText('Correct!', { exact: true })).toBeVisible();
    await expect(announcer).toContainText(`Correct! Plus`);
    await expect(announcer).toContainText(`The answer was ${answer}.`);
    await next.click();
    if (i < rounds.length - 1) {
      await expect(host.page.getByText('Leaderboard')).toBeVisible();
      await next.click();
    }
  }
  await expect(player.getByRole('heading', { level: 1, name: 'Game over' })).toBeVisible();
  await expect(host.page.getByText(/Game over|Results/).first()).toBeVisible();
  // Guests are told how to keep rewards, rather than given any.
  await expect(player.getByText(/Sign in before you join/)).toBeVisible();

  expect(hostErrors).toEqual([]);
  expect(playerErrors).toEqual([]);
});
