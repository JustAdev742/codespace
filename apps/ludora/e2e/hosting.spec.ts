import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { CSRF, account, watchErrors } from './helpers.ts';

/*
 * Hosting a live game, end to end: the lobby's QR code and invite, room settings (a countdown, the
 * waiting room, the exit ticket, a pinned message), a player let in from the waiting room, Ready,
 * a hop, the countdown on both screens, who is still answering and a nudge, add time, a brain
 * break, the end with awards, the class summary and the exit ticket, keyboard shortcuts, full
 * screen, and the phone remote. Each new screen passes axe (WCAG 2.2 A and AA) with no sideways
 * scrolling, at a school laptop's size and on a phone.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SHOTS = process.env.HOSTING_SHOTS;

async function check(page: Page, name: string, include?: string) {
  // A toast fading out fails colour contrast in WebKit: wait for the news to clear first.
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  // The same goes for a dialog or menu still fading in: let anything that is on its way finish
  // (things that move for ever, like a spinner, are left alone).
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || !Number.isFinite(Number(a.effect?.getComputedTiming().endTime))), undefined, { timeout: 5000 })
    .catch(() => {});
  // The picture first: axe moves focus about as it runs, which closes an open menu.
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
  }
  let builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
  if (include) builder = builder.include(include);
  const axe = await builder.analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), name).toEqual([]);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways, `${name} scrolls sideways`).toBeLessThanOrEqual(0);
}

async function makeSet(page: Page) {
  const set = await page.request.post('/api/sets', {
    headers: CSRF,
    data: {
      title: 'Space quiz',
      description: 'Five quick ones',
      subject: 'science',
      visibility: 'private',
      questions: [
        { id: 'q1', type: 'truefalse', prompt: 'The Sun is a star.', correct: true, explanation: 'It is a yellow dwarf star.' },
        { id: 'q2', type: 'truefalse', prompt: 'Mars is the closest planet to the Sun.', correct: false },
        { id: 'q3', type: 'truefalse', prompt: 'The Moon orbits the Earth.', correct: true },
        { id: 'q4', type: 'truefalse', prompt: 'Jupiter is smaller than Earth.', correct: false },
        { id: 'q5', type: 'truefalse', prompt: 'Owls hunt at night.', correct: true },
      ],
    },
  });
  expect(set.ok(), await set.text()).toBe(true);
  return (await set.json()).set.id as string;
}

test('hosting: lobby tools, waiting room, countdown, nudges, add time, a break, and the end-of-game summary', async ({ browser }) => {
  // A long walk through every hosting tool, with an axe check on each screen.
  test.setTimeout(240_000);
  const host = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera' });
  await host.page.setViewportSize({ width: 1366, height: 768 });
  const hostErrors = watchErrors(host.page);
  const setId = await makeSet(host.page);
  const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId, modeId: 'classic', common: { questionLimit: 3, shuffleQuestions: false, questionTimeSec: 120 }, settings: { autoAdvance: false } } });
  expect(room.ok(), await room.text()).toBe(true);
  const { code } = await room.json();
  await host.page.goto(`/room/${code}`);

  // The lobby: a QR code that opens the join page, an invite, how long the game takes.
  await expect(host.page.getByRole('img', { name: /QR code: scan to join game/ })).toBeVisible();
  await expect(host.page.getByText(/About \d+ minutes?/)).toBeVisible();
  if (await host.page.evaluate(() => document.fullscreenEnabled)) await expect(host.page.getByRole('button', { name: 'Full screen (F)' })).toBeVisible();
  await check(host.page, 'host-lobby-1366');
  // Share the invite: on a laptop it copies, and the button says so.
  // Only Chromium lets a test grant clipboard access; the others check the button's own feedback with a stubbed clipboard.
  const chromium = (process.env.E2E_BROWSER ?? 'chromium') === 'chromium';
  if (chromium) await host.context.grantPermissions(['clipboard-read', 'clipboard-write']);
  else
    await host.page.evaluate(() => {
      const copied: string[] = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void copied.push(t), readText: async () => copied.at(-1) ?? '' } });
    });
  await host.page.getByRole('button', { name: 'Copy invite link' }).click();
  await expect(host.page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await host.page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(host.page.url()).origin}/join/${code}`);

  // Preview the questions: prompts only.
  await host.page.getByRole('button', { name: 'Preview the questions' }).click();
  const preview = host.page.getByRole('dialog', { name: 'Questions in this game' });
  await expect(preview.getByText('Mars is the closest planet to the Sun.')).toBeVisible();
  await check(host.page, 'host-preview', '[role="dialog"]');
  await host.page.keyboard.press('Escape');

  // Room settings: a 3 second countdown, the waiting room, the exit ticket, a pinned message.
  await host.page.getByRole('button', { name: 'Room settings' }).click();
  const settings = host.page.getByRole('dialog', { name: 'Room settings' });
  await settings.getByLabel('Message on every screen').fill('First names only');
  await settings.getByRole('button', { name: 'Pin message' }).click();
  await settings.getByRole('switch', { name: /Waiting room/ }).click();
  await settings.getByRole('switch', { name: /Exit ticket/ }).click();
  await settings.getByLabel('Countdown before the start').selectOption('3');
  await expect(settings.getByRole('switch', { name: /Waiting room/ })).toHaveAttribute('aria-checked', 'true');
  await check(host.page, 'host-settings', '[role="dialog"]');
  await host.page.keyboard.press('Escape');
  await expect(host.page.getByText('First names only')).toBeVisible();

  // A phone joins: it waits until the host lets it in.
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await phoneContext.newPage();
  const phoneErrors = watchErrors(phone);
  await phone.goto(`/join/${code}`);
  await phone.getByLabel('Your name').fill('Sunny Otter');
  await phone.getByRole('button', { name: 'Join game' }).click();
  await expect(phone.getByRole('heading', { level: 1, name: 'Waiting to be let in' })).toBeVisible();
  await check(phone, 'player-waiting-room');
  await expect(host.page.getByText(/Waiting to come in/)).toBeVisible();
  await host.page.getByRole('button', { name: 'Let Sunny Otter in' }).click();
  await expect(phone.getByText('You are in', { exact: true })).toBeVisible();
  await expect(phone.getByText('First names only')).toBeVisible();

  // Ready, and a hop on the big screen.
  await phone.getByRole('button', { name: 'Tap when you are ready' }).click();
  await expect(host.page.getByText('1 ready')).toBeVisible();
  await phone.getByRole('button', { name: 'Make your Glim hop on the big screen' }).click();
  await check(phone, 'player-lobby-390');

  // The host's keyboard: "?" opens the shortcuts sheet.
  await host.page.locator('body').press('?');
  await expect(host.page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await check(host.page, 'host-shortcuts', '[role="dialog"]');
  await host.page.keyboard.press('Escape');

  // Start: "Starting in" on both screens, then the game.
  await host.page.getByRole('button', { name: 'Start game' }).click();
  await expect(host.page.getByRole('timer', { name: /Starting in \d seconds/ })).toBeVisible();
  await expect(phone.getByRole('timer', { name: /Starting in \d seconds/ })).toBeVisible();
  await check(phone, 'player-countdown');
  await expect(phone.getByRole('heading', { level: 2, name: 'The Sun is a star.' })).toBeVisible({ timeout: 20_000 });

  // Still answering: the host opens the list from the menu and nudges; the phone shows it gently.
  await host.page.getByRole('button', { name: /^Host menu/ }).click();
  await expect(host.page.getByRole('menu')).toBeVisible();
  await check(host.page, 'host-menu', '[role="menu"]');
  if (!(await host.page.getByRole('menu').count())) await host.page.getByRole('button', { name: /^Host menu/ }).click();
  await host.page.getByRole('menuitem', { name: /Still answering/ }).click();
  const waiting = host.page.getByRole('dialog', { name: /Still answering/ });
  await waiting.getByRole('button', { name: 'Nudge Sunny Otter' }).click();
  await expect(waiting.getByRole('button', { name: 'Sunny Otter was nudged' })).toBeVisible();
  await check(host.page, 'host-still-answering', '[role="dialog"]');
  await host.page.keyboard.press('Escape');
  await expect(phone.locator('.stage-card', { hasText: 'Your teacher is waiting for your answer.' })).toBeVisible();
  await check(phone, 'player-nudged');

  // Add time with the keyboard (+): the phone hears it in the news.
  await host.page.locator('body').press('+');
  await expect(phone.getByText('The host added 10 seconds.')).toBeVisible();

  // A brain break on every screen, ended early by the host.
  await host.page.getByRole('button', { name: /^Host menu/ }).click();
  await host.page.getByRole('menuitem', { name: 'Brain break, 30 seconds' }).click();
  await expect(phone.getByRole('heading', { level: 2, name: 'Brain break' })).toBeVisible();
  await check(phone, 'player-break');
  await check(host.page, 'host-break');
  await host.page.getByRole('button', { name: 'End the break' }).click();
  await expect(phone.getByRole('heading', { level: 2, name: 'Brain break' })).toHaveCount(0);

  // Answer wrong, then end the game.
  await phone.getByRole('button', { name: /False$/ }).first().click();
  await host.page.getByRole('button', { name: 'End game' }).click();
  await host.page.getByRole('dialog').getByRole('button', { name: 'End game' }).click();
  await expect(phone.getByRole('heading', { level: 1, name: 'Game over' })).toBeVisible();

  // The exit ticket on the phone; the host sees only the count.
  await phone.getByRole('radio', { name: 'Okay' }).click();
  await expect(phone.getByText(/never who chose what/)).toBeVisible();
  await expect(phone.getByRole('button', { name: 'Practise these questions on your own' })).toBeVisible();
  await check(phone, 'player-results-390');
  await expect(host.page.getByText('How it felt so far:')).toBeVisible();
  await expect(host.page.getByRole('list', { name: 'How it felt' }).getByText('Okay:')).toBeVisible();

  // The class summary: accuracy, the hardest question with its common wrong answer, and the table.
  await host.page.getByRole('button', { name: 'Class summary' }).click();
  const summary = host.page.getByRole('dialog', { name: 'Class summary' });
  await expect(summary.getByText('0%').first()).toBeVisible();
  await expect(summary.getByText(/Most common wrong answer: “False”/)).toBeVisible();
  await expect(summary.getByRole('table')).toBeVisible();
  await check(host.page, 'host-class-summary', '[role="dialog"]');
  // The printable results sheet: only it goes on paper.
  await host.page.evaluate(() => {
    window.print = () => {};
  });
  await summary.getByRole('button', { name: 'Print results' }).click();
  await host.page.emulateMedia({ media: 'print' });
  await expect(host.page.locator('.print-sheet')).toBeVisible();
  await expect(host.page.locator('.print-sheet').getByText('Standings')).toBeVisible();
  await expect(host.page.locator('.print-sheet').getByText('Mars is the closest planet to the Sun.')).toHaveCount(0);
  await expect(host.page.locator('.print-sheet').getByText('The Sun is a star.')).toBeVisible();
  if (SHOTS) await host.page.screenshot({ path: `${SHOTS}/host-print-sheet.png`, fullPage: true });
  await host.page.emulateMedia({ media: 'screen' });
  await host.page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  // Play the missed questions again: a new room with only them.
  await summary.getByRole('button', { name: 'Play the missed questions again' }).click();
  await expect(host.page).toHaveURL(/\/room\/\d{6}$/);
  await expect(host.page.getByText('Space quiz: missed questions')).toBeVisible();

  // Practise on your own from the phone: a solo game with the same questions.
  await phone.getByRole('button', { name: 'Practise these questions on your own' }).click();
  await expect(phone).toHaveURL(/\/room\/\d{6}$/);
  await expect(phone.getByText('Solo game')).toBeVisible();

  expect(hostErrors).toEqual([]);
  expect(phoneErrors).toEqual([]);
});

test('hosting: the phone remote runs the game while the laptop stays the big screen, with names hidden there', async ({ browser }) => {
  const host = await account(browser, { accountType: 'teacher' });
  await host.page.setViewportSize({ width: 1366, height: 768 });
  const setId = await makeSet(host.page);
  const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId, modeId: 'classic', common: { questionLimit: 2, shuffleQuestions: false, doubleFinal: true }, settings: { autoAdvance: false }, options: { hideNames: true } } });
  const { code } = await room.json();
  await host.page.goto(`/room/${code}`);

  // The remote: the same account on a phone.
  const remote = await host.context.newPage();
  await remote.setViewportSize({ width: 390, height: 844 });
  await remote.goto(`/room/${code}?remote=1`);
  await expect(remote.getByRole('heading', { level: 1, name: /^Remote:/ })).toBeVisible();

  const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const player = await playerContext.newPage();
  await player.goto(`/join/${code}`);
  await player.getByLabel('Your name').fill('Ada Lovelace');
  await player.getByRole('button', { name: 'Join game' }).click();
  await expect(player.getByText('Playing as Ada Lovelace')).toBeVisible();
  // The big screen shows "Player 1"; the remote shows the real name.
  await expect(host.page.getByText('Player 1', { exact: true })).toBeVisible();
  await expect(host.page.getByText('Ada Lovelace')).toHaveCount(0);
  await expect(remote.getByText('Ada Lovelace')).toBeVisible();
  await check(remote, 'remote-lobby');

  await remote.getByRole('button', { name: 'Start game' }).click();
  await expect(player.getByRole('heading', { level: 2, name: 'The Sun is a star.' })).toBeVisible({ timeout: 20_000 });
  await expect(remote.getByRole('button', { name: '+10 s' })).toBeEnabled();
  await remote.getByRole('button', { name: 'Pause' }).click();
  await expect(host.page.getByText('Paused', { exact: true })).toBeVisible();
  await check(remote, 'remote-game');
  await remote.getByRole('button', { name: 'Resume' }).click();
  await expect(host.page.getByText('Paused', { exact: true })).toHaveCount(0);
  // Double points on the final question: said on the big screen before it starts.
  await remote.getByRole('button', { name: /Skip ahead|Next/ }).click();
  await expect(host.page.getByText('Final question: double points')).toBeVisible();
  await expect(player.getByText('Final question: double points')).toBeVisible();
  // Connection health: the player's phone drops off; the remote says who is reconnecting.
  await player.close();
  await expect(remote.getByText('1 reconnecting. Their devices try again by themselves; they keep their place.')).toBeVisible();
  await expect(remote.getByText('Reconnecting', { exact: true })).toBeVisible();
  await remote.getByRole('button', { name: 'End game' }).click();
  await remote.getByRole('dialog').getByRole('button', { name: 'End game' }).click();
  await expect(remote.getByText('The game is over')).toBeVisible();
});

test('hosting for a class: members only, attendance on the class page, class defaults, and Host again', async ({ browser }) => {
  test.setTimeout(180_000);
  const teacher = await account(browser, { accountType: 'teacher' });
  await teacher.page.setViewportSize({ width: 1366, height: 768 });
  const errors = watchErrors(teacher.page);
  const student = await account(browser, { accountType: 'student', displayName: 'Ada Pupil' });
  const { class: cls } = await (await teacher.page.request.post('/api/classes', { headers: CSRF, data: { name: 'Year 4 Rowan' } })).json();
  await student.page.request.post('/api/classes/join', { headers: CSRF, data: { code: cls.joinCode } });
  const setId = await makeSet(teacher.page);

  // The class page: a Live games tab with hosting defaults.
  await teacher.page.goto(`/classes/${cls.id}?tab=live`);
  await expect(teacher.page.getByRole('heading', { level: 2, name: 'Host for this class' })).toBeVisible();
  await teacher.page.getByRole('switch', { name: /Quiet room/ }).click();
  await expect(teacher.page.getByRole('switch', { name: /Quiet room/ })).toHaveAttribute('aria-checked', 'true');
  await check(teacher.page, 'class-live-empty');

  // Host from the class page: the class's defaults are on, and the game is for its members.
  await teacher.page.goto(`/host?class=${cls.id}&set=${setId}`);
  await expect(teacher.page.getByText(/For Year 4 Rowan: only its members can join/)).toBeVisible();
  await teacher.page.getByRole('radio', { name: /^Classic/ }).check();
  await expect(teacher.page.getByRole('switch', { name: /Quiet room/ })).toHaveAttribute('aria-checked', 'true');
  await teacher.page.getByRole('button', { name: 'Create game' }).click();
  await expect(teacher.page).toHaveURL(/\/room\/\d{6}$/);
  const code = teacher.page.url().split('/').pop()!;
  await expect(teacher.page.getByText('Year 4 Rowan only')).toBeVisible();
  await expect(teacher.page.getByText('Quiet room', { exact: true })).toBeVisible();

  // Someone outside the class is turned away; the member gets in.
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await guestContext.newPage();
  await guest.goto(`/join/${code}`);
  await guest.getByLabel('Your name').fill('Outsider');
  await guest.getByRole('button', { name: 'Join game' }).click();
  await expect(guest.getByText(/This game is for Year 4 Rowan/)).toBeVisible();
  await student.page.setViewportSize({ width: 390, height: 844 });
  await student.page.goto(`/join/${code}`);
  await student.page.getByRole('button', { name: 'Join game' }).click();
  await expect(student.page.getByText('You are in', { exact: true })).toBeVisible();
  // A quiet room: the student's sound button says the host turned sound off.
  await expect(student.page.getByRole('button', { name: 'Quiet room: the host turned sound off' })).toBeVisible();

  await teacher.page.getByRole('button', { name: 'Start game' }).click();
  await expect(student.page.getByRole('group', { name: 'Answers' })).toBeVisible({ timeout: 20_000 });
  // Answer right, whichever question came up first.
  const prompt = (await student.page.locator('main h2').first().textContent()) ?? '';
  const right = /Sun is a star|Moon orbits|Owls hunt/.test(prompt) ? 'True' : 'False';
  await student.page.getByRole('group', { name: 'Answers' }).getByRole('button', { name: new RegExp(`${right}$`) }).click();
  await expect(teacher.page.getByText(/1 of 1 answered|Correct/).first()).toBeVisible();
  await teacher.page.getByRole('button', { name: 'End game' }).click();
  await teacher.page.getByRole('dialog').getByRole('button', { name: 'End game' }).click();
  await expect(student.page.getByRole('heading', { level: 1, name: 'Game over' })).toBeVisible();
  // The first answer (True) was right: an award, worked out on the server, on both screens.
  await expect(student.page.getByRole('heading', { level: 2, name: 'Awards' })).toBeVisible();
  await expect(student.page.getByText('Fastest right answer')).toBeVisible();
  await expect(teacher.page.getByText('Fastest right answer')).toBeVisible();
  await check(student.page, 'player-awards-390');
  await check(teacher.page, 'host-results-awards');

  // Attendance: the class page lists who took part.
  await teacher.page.goto(`/classes/${cls.id}?tab=live`);
  const game = teacher.page.getByRole('listitem').filter({ hasText: 'Classic: Space quiz' });
  await expect(game.getByText('1 student took part, 0 did not.')).toBeVisible();
  await expect(game.getByText('Ada Pupil')).toBeVisible();
  await check(teacher.page, 'class-live-attendance');
  await teacher.page.setViewportSize({ width: 390, height: 844 });
  await check(teacher.page, 'class-live-390');

  // Host again from the past results.
  await teacher.page.goto('/reports');
  await teacher.page.getByRole('link', { name: /Host again: Classic with Space quiz/ }).first().click();
  await expect(teacher.page.getByText('Hosting again: the same set, mode and settings as last time.')).toBeVisible();
  await expect(teacher.page.getByText(/For Year 4 Rowan/)).toBeVisible();
  await expect(teacher.page.getByRole('radio', { name: /^Classic/ })).toBeChecked();
  await check(teacher.page, 'host-again-390');
  expect(errors).toEqual([]);
});

test('hosting: teams in the lobby (players pick, the host renames and moves), and full screen with its key', async ({ browser }) => {
  const host = await account(browser, { accountType: 'teacher' });
  await host.page.setViewportSize({ width: 1366, height: 768 });
  const setId = await makeSet(host.page);
  const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId, modeId: 'classic', common: { teamCount: 2 }, options: { teamPick: true } } });
  const { code } = await room.json();
  await host.page.goto(`/room/${code}`);
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await phoneContext.newPage();
  await phone.goto(`/join/${code}`);
  await phone.getByLabel('Your name').fill('Tess Team');
  await phone.getByRole('button', { name: 'Join game' }).click();
  const pick = phone.getByRole('radiogroup', { name: 'Pick your team' });
  const radios = pick.getByRole('radio');
  await expect(radios).toHaveCount(2);
  const unchosen = pick.getByRole('radio', { checked: false });
  const other = (await unchosen.textContent())!.trim();
  await unchosen.click();
  await expect(pick.getByRole('radio', { name: other })).toHaveAttribute('aria-checked', 'true');
  await check(phone, 'player-team-pick');
  await expect(host.page.getByRole('region', { name: other }).getByText('Tess Team')).toBeVisible();

  // The host renames that team through the filter, then moves Tess back.
  await host.page.getByRole('button', { name: `Rename ${other}` }).click();
  const dialog = host.page.getByRole('dialog');
  await dialog.getByLabel('New name').fill('Rocket Owls');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(host.page.getByRole('region', { name: 'Rocket Owls' })).toBeVisible();
  await expect(phone.getByRole('radio', { name: 'Rocket Owls' })).toHaveAttribute('aria-checked', 'true');
  await host.page.getByRole('button', { name: 'Options for Tess Team' }).click();
  await check(host.page, 'host-seat-menu', '[role="menu"]');
  if (!(await host.page.getByRole('menu').count())) await host.page.getByRole('button', { name: 'Options for Tess Team' }).click();
  await host.page.getByRole('menuitem', { name: /^Move to / }).click();
  await expect(phone.getByRole('radio', { name: 'Rocket Owls' })).toHaveAttribute('aria-checked', 'false');
  // Rename a player (through the name filter): a rude name is refused, a fair one taken.
  await host.page.getByRole('button', { name: 'Options for Tess Team' }).click();
  await host.page.getByRole('menuitem', { name: 'Rename' }).click();
  const rename = host.page.getByRole('dialog');
  await rename.getByLabel('New name').fill('Sexy Tess');
  await rename.getByRole('button', { name: 'Save' }).click();
  await expect(rename.getByText('Pick a different name.')).toBeVisible();
  await rename.getByLabel('New name').fill('Tess T');
  await rename.getByRole('button', { name: 'Save' }).click();
  await expect(phone.getByText('Playing as Tess T')).toBeVisible();

  // Full screen, by the button and by F (where the headless browser offers full screen at all).
  if (!(await host.page.evaluate(() => document.fullscreenEnabled))) return;
  await host.page.getByRole('button', { name: 'Full screen (F)' }).click();
  await expect.poll(() => host.page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await host.page.locator('body').press('f');
  await expect.poll(() => host.page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
});

test('long names fit the Lantern Trail and Festival Workshop host boards', async ({ browser }) => {
  const host = await account(browser, { accountType: 'teacher' });
  await host.page.setViewportSize({ width: 1366, height: 768 });
  const setId = await makeSet(host.page);
  for (const modeId of ['lantern-trail', 'festival-workshop']) {
    const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId, modeId } });
    expect(room.ok(), await room.text()).toBe(true);
    const { code } = await room.json();
    await host.page.goto(`/room/${code}`);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const phone = await ctx.newPage();
    await phone.goto(`/join/${code}`);
    await phone.getByLabel('Your name').fill('Bartholomew Fitzgerald');
    await phone.getByRole('button', { name: 'Join game' }).click();
    await expect(phone.getByText('You are in', { exact: true })).toBeVisible();
    await host.page.getByRole('button', { name: 'Add 3 practice bots' }).click();
    await host.page.getByRole('button', { name: 'Start game' }).click();
    // The whole name shows (on two lines if need be), not "Bartholomew Fitzgerald…".
    const name = host.page.locator('main li').filter({ hasText: 'Bartholomew Fitzgerald' }).getByText('Bartholomew Fitzgerald', { exact: true }).first();
    await expect(name).toBeVisible({ timeout: 20_000 });
    const clipped = await name.evaluate((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 6);
    expect(clipped, `${modeId} cuts the name short`).toBe(false);
    if (SHOTS) await host.page.screenshot({ path: `${SHOTS}/long-names-${modeId}.png` });
    await ctx.close();
  }
});
