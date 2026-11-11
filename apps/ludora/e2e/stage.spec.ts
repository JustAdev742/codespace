import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { account, CSRF, settled, watchErrors } from './helpers.ts';

/*
 * The live game's look (docs/features/stage.md): the big screen's backdrop, chosen in the lobby and
 * remembered for the teacher; every phase on the projector and a phone passing axe (WCAG 2.2 A and
 * AA) with no sideways scrolling; the host skipping the podium reveal; the player's end card; and the
 * class photo download.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function check(page: Page, name: string) {
  await settled(page);
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), name).toEqual([]);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways, `${name} scrolls sideways`).toBeLessThanOrEqual(0);
}

test('the stage: a backdrop the teacher keeps, every phase accessible, podium skip, end card and class photo', async ({ browser }) => {
  // Every phase is checked for accessibility on two screens (about 25 checks); WebKit late in a long run needs
  // close to three minutes for that.
  test.setTimeout(300_000);
  const host = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera' });
  await host.page.setViewportSize({ width: 1366, height: 768 });
  const hostErrors = watchErrors(host.page);
  const set = await host.page.request.post('/api/sets', {
    headers: CSRF,
    data: {
      title: 'Planets',
      description: 'Three quick ones',
      subject: 'science',
      visibility: 'private',
      questions: [
        { id: 'q1', type: 'mcq', prompt: 'Which planet is known as the red planet?', choices: [{ id: 'a', text: 'Mars' }, { id: 'b', text: 'Venus' }, { id: 'c', text: 'Jupiter' }, { id: 'd', text: 'Mercury' }], correct: 'a' },
        { id: 'q2', type: 'truefalse', prompt: 'The Sun is a star.', correct: true },
        { id: 'q3', type: 'truefalse', prompt: 'Spiders are insects.', correct: false },
      ],
    },
  });
  expect(set.ok(), await set.text()).toBe(true);
  const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId: (await set.json()).set.id, modeId: 'classic', common: { questionLimit: 3, shuffleQuestions: false, questionTimeSec: 90 }, settings: { autoAdvance: false } } });
  expect(room.ok(), await room.text()).toBe(true);
  // 90 seconds a question: each screen is checked for accessibility while its question is open, and on a
  // slow browser two of those checks can outlast the usual 20 seconds, closing the question under the test.
  const { code } = await room.json();
  await host.page.goto(`/room/${code}`);
  await expect(host.page.getByRole('button', { name: 'Start game' })).toBeVisible();

  // The backdrop: the floodlights by default, Harbour once chosen, and still Harbour after a reload (saved to the account).
  await expect(host.page.locator('[data-backdrop="floodlights"]')).toHaveCount(1);
  await host.page.getByRole('button', { name: 'Backdrop', exact: true }).click();
  await expect(host.page.getByRole('radio', { name: 'Floodlights' })).toHaveAttribute('aria-checked', 'true');
  await check(host.page, 'backdrop picker');
  await host.page.getByRole('radio', { name: 'Harbour' }).click();
  await expect(host.page.getByRole('radio', { name: 'Harbour' })).toHaveAttribute('aria-checked', 'true');
  await host.page.keyboard.press('Escape');
  await expect(host.page.locator('[data-backdrop="harbour"]')).toHaveCount(1);
  await host.page.reload();
  await expect(host.page.getByRole('button', { name: 'Start game' })).toBeVisible();
  await expect(host.page.locator('[data-backdrop="harbour"]')).toHaveCount(1);
  const saved = await (await host.page.request.get('/api/auth/me')).json();
  expect(saved.user.preferences.stageBackdrop).toBe('harbour');

  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await phoneContext.newPage();
  const phoneErrors = watchErrors(phone);
  await phone.goto(`/join/${code}`);
  await phone.getByLabel('Your name').fill('Sunny Otter');
  await phone.getByRole('button', { name: 'Join game' }).click();
  await expect(phone.getByText('You are in', { exact: true })).toBeVisible();
  await expect(host.page.getByText('Sunny Otter', { exact: true })).toBeVisible();
  await check(host.page, 'lobby with a player');
  await check(phone, 'player lobby');

  // How to play: the game's own rules, for a player with only a name on a phone and on the big screen for the class.
  await phone.getByRole('button', { name: 'How to play' }).click();
  const phoneRules = phone.getByRole('dialog', { name: 'How to play Classic' });
  await expect(phoneRules.getByRole('listitem')).toHaveCount(5);
  await expect(phoneRules.getByText('Everyone gets the same question at the same time.')).toBeVisible();
  await check(phone, 'how to play on a phone');
  await phone.keyboard.press('Escape');
  await expect(phoneRules).toHaveCount(0);
  await host.page.getByRole('button', { name: 'How to play' }).click();
  const hostRules = host.page.getByRole('dialog', { name: 'How to play Classic' });
  await expect(hostRules.getByText('A correct answer is worth 500 points plus up to 500 for speed.')).toBeVisible();
  // Read from the back of a classroom: the rules on the big screen are set larger than body text.
  expect(await hostRules.getByRole('listitem').first().locator('span').last().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);
  await check(host.page, 'how to play on the big screen');
  await host.page.keyboard.press('Escape');
  await expect(hostRules).toHaveCount(0);

  const next = host.page.getByRole('button', { name: /Next|Skip ahead/ });
  await host.page.getByRole('button', { name: 'Start game' }).click();
  await expect(host.page.getByText('Get ready')).toBeVisible();
  await check(host.page, 'get ready');

  // Question 1: answered right, so the phone shows the answer locked in (alone in the room, the round closes at once).
  await expect(phone.getByRole('heading', { name: 'Which planet is known as the red planet?' })).toBeVisible();
  // While the question is up the backdrop gives way to the game.
  await expect(host.page.locator('[data-backdrop="harbour"]')).toHaveClass(/opacity-0/);
  await check(host.page, 'question on the big screen');
  await check(phone, 'question on a phone');
  await phone.getByRole('group', { name: 'Answers' }).getByRole('button', { name: /Mars/ }).click();
  await expect(phone.getByText('Correct', { exact: true })).toBeVisible();
  await check(phone, 'right answer on a phone');
  await check(host.page, 'reveal on the big screen');
  await next.click();
  await expect(host.page.getByText('Leaderboard')).toBeVisible();
  await expect(host.page.getByRole('button', { name: 'Next question' })).toBeVisible();
  await check(host.page, 'leaderboard on the big screen');
  await check(phone, 'standings on a phone');
  await next.click();

  // Question 2: answered wrong, kindly, with the right answer shown.
  await expect(phone.getByRole('heading', { name: 'The Sun is a star.' })).toBeVisible();
  await phone.getByRole('group', { name: 'Answers' }).getByRole('button', { name: /False/ }).click();
  await expect(phone.getByText('Incorrect', { exact: true })).toBeVisible();
  await expect(phone.getByText('Answer: True')).toBeVisible();
  await check(phone, 'wrong answer on a phone');
  await next.click();
  await expect(host.page.getByText('Leaderboard')).toBeVisible();
  await next.click();
  await expect(phone.getByRole('heading', { name: 'Spiders are insects.' })).toBeVisible();
  await phone.getByRole('group', { name: 'Answers' }).getByRole('button', { name: /False/ }).click();
  await expect(phone.getByText('Correct', { exact: true })).toBeVisible();
  await next.click();

  // The results: the host can skip the podium reveal, and the standings are there at once.
  await expect(phone.getByRole('heading', { level: 1, name: 'Game over' })).toBeVisible();
  const skip = host.page.getByRole('button', { name: 'Skip to the winner' });
  // With one player there is no podium; the skip button is tested with bots below.
  await expect(skip).toHaveCount(0);
  await expect(phone.getByRole('heading', { level: 2, name: /You came/ })).toHaveCount(0);
  await check(phone, 'results on a phone');

  // A second room with three practice bots, so there is a podium.
  const room2 = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId: (await set.json()).set.id, modeId: 'classic', common: { questionLimit: 3, shuffleQuestions: false, questionTimeSec: 10 }, settings: { autoAdvance: false } } });
  expect(room2.ok(), await room2.text()).toBe(true);
  const code2 = (await room2.json()).code as string;
  await host.page.goto(`/room/${code2}`);
  await expect(host.page.getByRole('button', { name: 'Start game' })).toBeVisible();
  await phone.goto(`/join/${code2}`);
  await phone.getByLabel('Your name').fill('Sunny Otter');
  await phone.getByRole('button', { name: 'Join game' }).click();
  await expect(phone.getByText('You are in', { exact: true })).toBeVisible();
  await host.page.getByRole('button', { name: 'Add 3 practice bots' }).click();
  await expect(host.page.getByText(/1 player and 3 practice bots/)).toBeVisible();
  await host.page.getByRole('button', { name: 'Start game' }).click();
  host.page.setDefaultTimeout(8_000);
  const podiumList = host.page.getByRole('list', { name: 'Podium' });
  // The podium reveal lasts about a second and a half: the page presses Skip to the winner the moment it appears
  // (a click from the test could arrive after the reveal has finished on a slow machine).
  const pressedSkip = host.page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Skip to the winner');
      b?.click();
      return Boolean(b);
    },
    undefined,
    { polling: 'raf', timeout: 120_000 },
  );
  // Short turns, so the test is looking when the podium arrives (its reveal lasts about a second and a half).
  for (let turn = 0; turn < 120; turn++) {
    if (await podiumList.isVisible()) break;
    const answers = phone.getByRole('group', { name: 'Answers' });
    if (await answers.isVisible()) await answers.getByRole('button').first().click({ timeout: 4_000 }).catch(() => {});
    if (await host.page.getByRole('button', { name: /^Next/ }).isVisible()) await next.click({ timeout: 4_000 }).catch(() => {});
    await host.page.waitForTimeout(250);
  }
  host.page.setDefaultTimeout(0);
  await expect(podiumList).toBeVisible();
  await pressedSkip;
  await expect(skip).toHaveCount(0);
  await expect(host.page.getByRole('list', { name: 'Final standings' })).toBeVisible();
  await check(host.page, 'results on the big screen');
  await expect(phone.getByRole('heading', { level: 1, name: 'Game over' })).toBeVisible();

  // The player's own end card.
  await expect(phone.getByRole('heading', { level: 2, name: /^You came \d+(st|nd|rd|th)$/ })).toBeVisible();
  await expect(phone.getByText('Accuracy')).toBeVisible();
  await check(phone, 'end card on a phone');

  // The class photo: a preview, first names only when asked, and a PNG download.
  await host.page.getByRole('button', { name: 'Class photo' }).click();
  await expect(host.page.getByRole('img', { name: /^Class photo: 1 Glim on the stage\.$/ })).toBeVisible();
  await host.page.getByLabel('Show first names').check();
  await expect(host.page.getByRole('img', { name: /with first names/ })).toBeVisible();
  await check(host.page, 'class photo');
  const download = host.page.waitForEvent('download');
  await host.page.getByRole('button', { name: 'Download photo' }).click();
  expect((await download).suggestedFilename()).toBe(`ludora-${code2}-class-photo.png`);

  expect(hostErrors).toEqual([]);
  expect(phoneErrors).toEqual([]);
});
