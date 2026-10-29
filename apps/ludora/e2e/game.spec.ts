import { expect, test } from '@playwright/test';
import { CSRF, account, expectFocused, watchErrors } from './helpers.ts';

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
  // The host moves the game on, so each click below lands on the screen the test expects.
  const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId: (await set.json()).set.id, modeId: 'classic', common: { questionLimit: 3, shuffleQuestions: false }, settings: { autoAdvance: false } } });
  expect(room.ok(), await room.text()).toBe(true);
  const { code } = await room.json();
  await host.page.goto(`/room/${code}`);
  await expect(host.page.getByRole('button', { name: 'Start game' })).toBeVisible();

  // The speaker button mutes every sound on this device, and the choice outlasts a reload.
  const mute = host.page.getByRole('button', { name: 'Mute sound' });
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await host.page.reload();
  await expect(host.page.getByRole('button', { name: 'Mute sound' })).toHaveAttribute('aria-pressed', 'true');
  await host.page.getByRole('button', { name: 'Mute sound' }).click();
  await expect(host.page.getByRole('button', { name: 'Mute sound' })).toHaveAttribute('aria-pressed', 'false');

  // The player is a guest: a code and a name are enough.
  const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const player = await playerContext.newPage();
  const playerErrors = watchErrors(player);
  await player.goto(`/join/${code}`);
  await player.getByLabel('Your name').fill('Sunny Otter');
  await player.getByRole('button', { name: 'Join game' }).click();
  // Exact: the screen reader announcer also says these words, inside a longer sentence.
  await expect(player.getByText('You are in', { exact: true })).toBeVisible();
  await expect(host.page.getByText('Sunny Otter', { exact: true })).toBeVisible();

  const next = host.page.getByRole('button', { name: /Next|Skip ahead/ });
  await host.page.getByRole('button', { name: 'Start game' }).click();
  // "Get ready" moves on by itself after four seconds. A skip click could land after that and skip the first question, so wait.
  await expect(host.page.getByText('Get ready')).toBeVisible();
  const rounds = [
    ['The Sun is a star.', 'True'],
    ['Spiders are insects.', 'False'],
    ['Water boils at 100 °C at sea level.', 'True'],
  ] as const;
  const announcer = player.locator('.sr-only[role="status"][aria-live="polite"]');
  for (const [i, [prompt, answer]] of rounds.entries()) {
    await expect(player.getByRole('heading', { name: prompt })).toBeVisible();
    // The answer button that had focus went with the last question, so focus moves to the new one.
    await expectFocused(player.getByRole('heading', { name: prompt }));
    await expect(announcer).toContainText(`Question ${i + 1} of 3.`);
    // By keyboard, as a screen reader user would. The answer buttons give way to the result,
    // and focus stays on the question rather than falling back to the top of the page.
    await player.getByRole('button', { name: new RegExp(`^[A-F]? ?${answer}$`) }).first().focus();
    await player.keyboard.press('Enter');
    // Everyone has answered, so the round closes and shows the answer.
    await expect(player.getByText('Correct', { exact: true })).toBeVisible();
    await expect(announcer).toContainText(`Correct. Plus`);
    await expect(announcer).toContainText(`The answer was ${answer}.`);
    await expectFocused(player.getByRole('heading', { name: prompt }));
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
