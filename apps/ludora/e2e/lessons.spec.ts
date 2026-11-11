import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { account, answerAnyQuestion, CSRF, settled, watchErrors } from './helpers.ts';

/*
 * Lessons, end to end: a teacher makes a lesson on the Lessons page (an info slide and two games,
 * a goal, a private plan note, a step moved by keyboard), prints the plan, and runs it in one room
 * with two players on their own devices, through both games to the lesson standings and the end of
 * the lesson; then the lesson report links each game and sets homework. A second flow schedules a
 * lesson for a class (the class page says when, and Join appears only once the teacher opens it)
 * and adds a set to a lesson from its page. Every page and screen added passes axe (WCAG 2.2 A and
 * AA) with no sideways scrolling.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SHOTS = process.env.LESSONS_SHOTS;
const NOTE = 'Remind them about the trip form';

async function check(page: Page, name: string) {
  await settled(page);
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  }
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), name).toEqual([]);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways, `${name} scrolls sideways`).toBeLessThanOrEqual(0);
}

async function makeSet(page: Page, title = 'Space quiz') {
  const set = await page.request.post('/api/sets', {
    headers: CSRF,
    data: {
      title,
      subject: 'science',
      visibility: 'private',
      questions: [
        { id: 'q1', type: 'truefalse', prompt: 'The Sun is a star.', correct: true },
        { id: 'q2', type: 'truefalse', prompt: 'Mars is the closest planet to the Sun.', correct: false },
        { id: 'q3', type: 'truefalse', prompt: 'The Moon orbits the Earth.', correct: true },
      ],
    },
  });
  expect(set.ok(), await set.text()).toBe(true);
  return (await set.json()).set.id as string;
}

/** A device that joins with only a name: no account and no session. */
async function guest(browser: Browser, code: string, name: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(`/join/${code}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join game' }).click();
  await expect(page).toHaveURL(/\/room\/\d{6}/);
  return { context, page, errors };
}

/** Answer questions until the results show. Every action is bounded, and the results are looked for on each turn. */
async function playToResults(page: Page) {
  const results = page.getByRole('heading', { name: /^(Game over|Victory|Defeat)$/, level: 1 });
  page.setDefaultTimeout(6_000);
  try {
    for (let i = 0; i < 120; i++) {
      if (await results.isVisible().catch(() => false)) return;
      await answerAnyQuestion(page).catch(() => {});
    }
  } finally {
    page.setDefaultTimeout(0);
  }
  await expect(results).toBeVisible();
}

/** The host moves a host-paced game on whenever there is a Next to press, until the results. */
async function hostToResults(page: Page) {
  const results = page.getByRole('heading', { name: /^(Game over|Victory|Defeat)$/, level: 1 });
  // The host's button reads Next, Next question or, after the last question, Next: results.
  const next = page.getByRole('button', { name: /^Next( question|: results)?( \(N\))?$/ });
  page.setDefaultTimeout(6_000);
  try {
    for (let i = 0; i < 120; i++) {
      if (await results.isVisible().catch(() => false)) return;
      if (await next.first().isVisible().catch(() => false)) await next.first().click({ timeout: 3_000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
  } finally {
    page.setDefaultTimeout(0);
  }
  await expect(results).toBeVisible();
}

test('a teacher plans a lesson and runs it in one room with two players, to the lesson standings and report', async ({ browser }) => {
  test.setTimeout(420_000);
  const teacher = await account(browser, { accountType: 'teacher', displayName: 'Ms Okafor' });
  const page = teacher.page;
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = watchErrors(page);
  await makeSet(page);
  const cls = await (await page.request.post('/api/classes', { headers: CSRF, data: { name: 'Year 6 Elm' } })).json();

  // The Lessons page, from the sidebar.
  await page.goto('/');
  await page.getByRole('link', { name: 'Lessons' }).first().click();
  await expect(page.getByRole('heading', { name: 'Lessons', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Friday quiz' })).toBeVisible();
  await check(page, 'lessons-1366');
  await page.getByRole('button', { name: 'New lesson' }).click();
  await expect(page.getByLabel('Lesson title')).toBeVisible();

  // Name it, give it a goal, and add an info slide and two games.
  await page.getByLabel('Lesson title').fill('The night sky');
  await page.getByRole('button', { name: 'Add a goal' }).click();
  await page.getByLabel('Goal 1', { exact: true }).fill('found out which planet is closest to the Sun');
  await page.getByRole('button', { name: 'Add an info slide' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Slide title').fill('Look up tonight');
  await dialog.getByLabel('Lines').fill('The Moon is not a star.\nPlanets do not twinkle.');
  await dialog.getByLabel('Your plan note').fill(NOTE);
  await check(page, 'step-dialog-slide');
  await dialog.getByRole('button', { name: 'Save step' }).click();
  await expect(dialog).toBeHidden();

  for (const title of ['Exit ticket', 'Starter quiz']) {
    await page.getByRole('button', { name: 'Add a game' }).click();
    await dialog.getByRole('button', { name: /^Space quiz/ }).click();
    await dialog.getByLabel('Title in the room').fill(title);
    await dialog.getByLabel('Seconds per question').fill('30');
    if (title === 'Starter quiz') await check(page, 'step-dialog-game');
    await dialog.getByRole('button', { name: 'Save step' }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(page.getByText('All changes saved')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Step 3: Starter quiz' })).toBeVisible();

  // Starter quiz belongs before the exit ticket: moved by keyboard, it keeps focus as it goes.
  const up = page.getByRole('button', { name: 'Move step 3 up' });
  await up.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Step 2: Starter quiz' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Step 3: Exit ticket' })).toBeVisible();
  await expect(page.getByText(/Moved Starter quiz to step 2 of 3/)).toBeAttached();
  await expect(page.getByText('All changes saved')).toBeVisible();
  await expect(page.getByText('Has your note')).toHaveCount(1);
  await expect(page.getByText(/3 steps\. About \d+ min in all\./)).toBeVisible();
  await check(page, 'lesson-editor-1366');
  await page.setViewportSize({ width: 390, height: 844 });
  await check(page, 'lesson-editor-390');
  await page.setViewportSize({ width: 1366, height: 768 });

  // The printed plan carries the timings and the private note, black on white.
  await page.getByRole('link', { name: 'Print the plan' }).click();
  const sheet = page.locator('[data-print-sheet]');
  await expect(sheet.getByText(NOTE)).toBeVisible();
  await expect(sheet.getByText(/2\. Starter quiz/)).toBeVisible();
  await check(page, 'lesson-print');
  await page.emulateMedia({ media: 'print' });
  expect(await sheet.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(0, 0, 0)');
  await page.emulateMedia({ media: 'screen' });
  await page.goBack();

  // Run it: the room opens on the slide.
  await page.getByRole('button', { name: 'Run lesson' }).click();
  await expect(page).toHaveURL(/\/room\/\d{6}/);
  const code = /\/room\/(\d{6})/.exec(page.url())![1]!;
  await expect(page.getByRole('heading', { name: 'Look up tonight', level: 1 })).toBeVisible();
  const ada = await guest(browser, code, 'Ada');
  const bo = await guest(browser, code, 'Bo');
  for (const p of [ada.page, bo.page]) await expect(p.getByRole('heading', { name: 'Look up tonight', level: 1 })).toBeVisible();
  await expect(ada.page.getByText('Planets do not twinkle.')).toBeVisible();
  await check(page, 'room-slide-host');
  await check(ada.page, 'room-slide-player');
  // The plan note is never on a player's device.
  expect(await ada.page.content()).not.toContain(NOTE);

  // Next: the starter quiz, in the same room with the same players. The lobby says where the class is.
  await page.getByRole('button', { name: 'Next: Starter quiz' }).click();
  await expect(page.getByText('Step 2 of 3: Starter quiz')).toBeVisible();
  await expect(ada.page.getByText('Step 2 of 3: Starter quiz')).toBeVisible();
  await expect(ada.page.getByText('You are in', { exact: true })).toBeVisible();
  // Today's goals in the lobby, on the big screen and the device.
  await expect(page.getByText('found out which planet is closest to the Sun')).toBeVisible();
  await expect(ada.page.getByText('found out which planet is closest to the Sun')).toBeVisible();
  await check(ada.page, 'room-lobby-player');
  await check(page, 'room-lobby-host');
  await page.getByRole('button', { name: /^Start( game)?$/ }).click();
  await Promise.all([playToResults(ada.page), playToResults(bo.page), hostToResults(page)]);

  // Lesson standings between the games, on the host's results and each device.
  await expect(page.getByRole('heading', { name: 'Lesson standings' })).toBeVisible();
  await expect(ada.page.getByRole('heading', { name: 'Lesson standings' })).toBeVisible();
  await expect(ada.page.getByRole('region', { name: 'Lesson standings' }).getByText('(you)')).toBeAttached();
  await check(page, 'room-results-host');
  await check(ada.page, 'room-results-player');

  await page.getByRole('button', { name: 'Next: Exit ticket' }).click();
  await expect(page.getByText('Step 3 of 3: Exit ticket')).toBeVisible();
  await expect(bo.page.getByText('Step 3 of 3: Exit ticket')).toBeVisible();
  await page.getByRole('button', { name: /^Start( game)?$/ }).click();
  await Promise.all([playToResults(ada.page), playToResults(bo.page), hostToResults(page)]);
  await expect(page.getByRole('heading', { name: 'Lesson standings' })).toBeVisible();

  // The end of the lesson: today's goals and the final standings, on every screen.
  await page.getByRole('button', { name: 'Finish the lesson' }).click();
  for (const p of [page, ada.page, bo.page]) {
    await expect(p.getByRole('heading', { name: 'Lesson complete', level: 1 })).toBeVisible();
    await expect(p.getByText('found out which planet is closest to the Sun')).toBeVisible();
    await expect(p.getByRole('heading', { name: 'Lesson standings' })).toBeVisible();
  }
  await check(page, 'room-end-host');
  await check(ada.page, 'room-end-player');
  expect(await bo.page.content()).not.toContain(NOTE);

  // One report for the lesson, linking each game's own report; homework in two clicks.
  await page.getByRole('link', { name: 'Lesson report' }).click();
  await expect(page.getByRole('heading', { name: 'Lesson report', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Game report: Classic/ })).toHaveCount(2);
  await check(page, 'lesson-report');
  await page.getByRole('button', { name: 'Set homework' }).click();
  await expect(page.getByRole('dialog').getByLabel('Class')).toHaveValue(cls.class.id);
  await page.getByRole('button', { name: 'Set Space quiz as homework' }).click();
  await expect(page.getByText('Set for Year 6 Elm')).toBeVisible();
  await check(page, 'homework-dialog');
  const detail = await (await page.request.get(`/api/classes/${cls.class.id}`)).json();
  expect(detail.assignments.map((a: { title: string }) => a.title)).toContain('Homework: Space quiz');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Game report: Classic' }).first().click();
  await expect(page).toHaveURL(/\/reports\/[0-9a-f-]{36}$/);

  expect(errors).toEqual([]);
  expect(ada.errors).toEqual([]);
  expect(bo.errors).toEqual([]);
  await ada.context.close();
  await bo.context.close();
  await teacher.context.close();
});

test('a lesson scheduled for a class shows on its page, and Join appears only once the teacher opens it; a set is added from its page', async ({ browser }) => {
  test.setTimeout(180_000);
  const teacher = await account(browser, { accountType: 'teacher', displayName: 'Mr Lund' });
  const student = await account(browser, { accountType: 'student', displayName: 'Cleo' });
  const page = teacher.page;
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = watchErrors(page);
  const studentErrors = watchErrors(student.page);
  const setId = await makeSet(page, 'Rivers');
  const cls = await (await page.request.post('/api/classes', { headers: CSRF, data: { name: 'Year 4 Ash' } })).json();
  expect((await student.page.request.post('/api/classes/join', { headers: CSRF, data: { code: cls.class.joinCode } })).ok()).toBe(true);

  // From the set's page: a new lesson with it as the first step.
  await page.goto(`/sets/${setId}`);
  await page.getByRole('button', { name: 'Add to a lesson' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Or start a new lesson with it').fill('Rivers lesson');
  await check(page, 'add-to-lesson');
  await dialog.getByRole('button', { name: 'New lesson with it' }).click();
  await expect(dialog.getByText('Added to “Rivers lesson”.')).toBeVisible();
  await dialog.getByRole('link', { name: 'Open the lesson' }).click();
  await expect(page.getByRole('heading', { name: 'Step 1: Classic: Rivers' })).toBeVisible();
  const lessonUrl = page.url();

  // From the Host page: "Add to a lesson instead", with the mode and settings chosen there.
  await page.goto(`/host?set=${setId}`);
  await page.getByRole('radio', { name: /^Gold Rush/ }).first().check();
  await page.getByRole('button', { name: 'Add to a lesson instead' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add to Rivers lesson' }).click();
  await expect(page.getByRole('dialog').getByText('Added to “Rivers lesson”.')).toBeVisible();
  await page.goto(lessonUrl);
  await expect(page.getByRole('heading', { name: 'Step 2: Gold Rush: Rivers' })).toBeVisible();

  // A discussion, moved to the start (dragged by its handle in Chromium, by keyboard elsewhere).
  await page.getByRole('button', { name: 'Add a discussion' }).click();
  const step = page.getByRole('dialog');
  await step.getByLabel('Question to talk about').fill('Where does the rain go after it lands?');
  await step.getByLabel('Timer').selectOption('300');
  await check(page, 'step-dialog-discussion');
  await step.getByRole('button', { name: 'Save step' }).click();
  await expect(page.getByRole('heading', { name: 'Step 3: Discussion' })).toBeVisible();
  if ((process.env.E2E_BROWSER ?? 'chromium') === 'chromium') {
    await page.locator('[data-step="2"] [draggable="true"]').dragTo(page.locator('[data-step="0"]'));
  } else {
    await page.getByRole('button', { name: 'Move step 3 up' }).focus();
    await page.keyboard.press('Alt+ArrowUp');
    await page.keyboard.press('Alt+ArrowUp');
  }
  await expect(page.getByRole('heading', { name: 'Step 1: Discussion' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Step 2: Classic: Rivers' })).toBeVisible();
  // Duplicate a step, then delete the copy.
  await page.getByRole('button', { name: 'Duplicate step 2' }).click();
  await expect(page.getByRole('heading', { name: 'Step 3: Classic: Rivers' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete step 3' }).click();
  await expect(page.getByRole('heading', { name: 'Step 3: Gold Rush: Rivers' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Step 4:/ })).toHaveCount(0);
  await expect(page.getByText('All changes saved')).toBeVisible();

  // Share by username: an unknown name says only that there is no such teacher.
  const beforeShare = errors.length;
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Their username').fill('nobody-by-this-name');
  await page.getByRole('dialog').getByRole('button', { name: 'Send a copy' }).click();
  await expect(page.getByRole('dialog').getByText('No teacher with that username.')).toBeVisible();
  await check(page, 'share-dialog');
  await page.keyboard.press('Escape');
  // That answer is a 404, which some browsers log as a failed load: expected here, so it is set aside.
  errors.splice(beforeShare, errors.length - beforeShare, ...errors.slice(beforeShare).filter((e) => !/status of 404/.test(e)));

  // Duplicate the whole lesson, then delete the copy: back on the list, the original is there.
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rivers lesson (copy)', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await check(page, 'delete-lesson-dialog');
  await page.getByRole('button', { name: 'Delete lesson' }).click();
  await expect(page).toHaveURL(/\/lessons$/);
  await expect(page.getByRole('link', { name: 'Rivers lesson (copy)' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Rivers lesson' }).click();
  await expect(page.getByRole('heading', { name: 'Step 1: Discussion' })).toBeVisible();

  // Schedule it for the class, twenty minutes from now.
  const at = new Date(Date.now() + 20 * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  await page.getByLabel('Class').selectOption(cls.class.id);
  await page.getByLabel('Starts at').fill(`${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`);
  await page.getByRole('button', { name: 'Save schedule' }).click();
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  await expect(page.getByText(new RegExp(`Year 4 Ash: Starts .*${time}`))).toBeVisible();

  // The class page says when; nothing has opened, so there is no Join yet.
  await student.page.setViewportSize({ width: 390, height: 844 });
  await student.page.goto(`/classes/${cls.class.id}`);
  await expect(student.page.getByText(new RegExp(`Starts .*${time}`))).toBeVisible();
  await expect(student.page.getByText('A Join button appears here when your teacher opens it.')).toBeVisible();
  await expect(student.page.getByRole('link', { name: 'Join Rivers lesson' })).toHaveCount(0);
  await check(student.page, 'class-page-scheduled');

  // The teacher opens it; the student's class page now has Join, which takes them into the lesson room.
  await page.getByRole('button', { name: 'Run lesson' }).click();
  await expect(page).toHaveURL(/\/room\/\d{6}/);
  // The room opens on the discussion: the question and a timer on the big screen.
  await expect(page.getByText('Where does the rain go after it lands?')).toBeVisible();
  await expect(page.getByRole('timer')).toBeVisible();
  await check(page, 'room-discussion-host');
  await student.page.reload();
  await student.page.getByRole('link', { name: 'Join Rivers lesson' }).click();
  const join = student.page.getByRole('button', { name: 'Join game' });
  const talk = student.page.getByText('Talk to the person next to you');
  await expect(join.or(talk).first()).toBeVisible();
  if (await join.isVisible()) await join.click();
  // On the device: the question, the timer and no answering.
  await expect(talk).toBeVisible();
  await expect(student.page.getByText('No answering on your device for this one: just talk.')).toBeVisible();
  await expect(student.page.getByRole('timer')).toBeVisible();
  await check(student.page, 'room-discussion-player');
  // Then the game, with the same student still in the room.
  await page.getByRole('button', { name: 'Next: Classic: Rivers' }).click();
  await expect(page.getByText('Step 2 of 3: Classic: Rivers')).toBeVisible();
  await expect(student.page.getByText('Step 2 of 3: Classic: Rivers')).toBeVisible();
  await expect(page.getByText('Cleo').first()).toBeVisible();

  expect(errors).toEqual([]);
  expect(studentErrors).toEqual([]);
  await student.context.close();
  await teacher.context.close();
});
