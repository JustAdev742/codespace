import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { account, answerAnyQuestion, CSRF, settled, watchErrors } from './helpers.ts';

/*
 * Making things (making), end to end: a new teacher goes from nothing to a hosted game through a
 * guided start on the Make page; notes become a set and a suggested game with no AI; a draft
 * carries on from another device; classroom tools work from a class page and as a lesson step;
 * the teacher's day shows homework due and what to follow up; homework is set for two classes at
 * once. Every page added passes axe (WCAG 2.2 A and AA) at phone and laptop widths, with no
 * sideways scrolling.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SHOTS = process.env.MAKING_SHOTS;

async function check(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
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

async function both(page: Page, name: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await check(page, `${name}-390`);
  await page.setViewportSize({ width: 1366, height: 768 });
  await check(page, `${name}-1366`);
}

const NOTES = `Rivers of the world
The Nile is the longest river in Africa.
The Amazon carries more water than any other river.
The Thames flows through London to the North Sea.
The Danube flows through ten countries.

source - where a river starts
mouth - where a river meets the sea
tributary - a smaller river that joins a bigger one
meander - a bend in a river`;

test('a new teacher goes from nothing to a hosted game through a guided start, with no AI', async ({ browser }) => {
  test.setTimeout(180_000);
  const t = await account(browser, { accountType: 'teacher', displayName: 'Mr Okafor' });
  const page = t.page;
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  // The Make page is in the navigation.
  await page.getByRole('navigation').getByRole('link', { name: 'Make', exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Make' })).toBeVisible();
  // Nothing made yet: guided starts and the checklist, not an empty page.
  await expect(page.getByRole('heading', { name: 'Start here' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'First things to make' })).toBeVisible();
  await expect(page.getByText('0 of 5 done')).toBeVisible();
  await both(page, 'make-empty');

  await page.getByRole('link', { name: /Turn your notes into a game/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Make a set from your notes' })).toBeVisible();
  await page.getByLabel('Notes, a word list or a table').fill(NOTES);
  await both(page, 'quick-notes');
  await page.getByRole('button', { name: 'Make questions' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Keep the questions you like' })).toBeVisible();
  // The heading line named the set; four sentences became gaps and four pairs became choices and a match.
  await expect(page.getByLabel('Name of the set')).toHaveValue('Rivers of the world');
  await expect(page.getByText('9 questions kept', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Leave out question 1' }).click();
  await expect(page.getByText('8 questions kept', { exact: true })).toBeVisible();
  // Change one: a question with no text is refused with a reason.
  await page.getByRole('button', { name: 'Change question 4' }).click();
  await page.getByLabel('Question 4').fill('');
  await page.getByRole('button', { name: 'Save the change' }).click();
  await expect(page.getByText(/Write the question/)).toBeVisible();
  await page.getByLabel('Question 4').fill('Where does a river start?');
  await page.getByRole('button', { name: 'Save the change' }).click();
  await expect(page.getByRole('listitem', { name: 'Question 4: Where does a river start?' })).toBeVisible();
  // The draft is kept on the server as it goes.
  await expect(page).toHaveURL(/draft=[0-9a-f-]{36}/);
  await both(page, 'quick-choose');

  await page.getByRole('button', { name: 'Save and choose a game' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Play it' })).toBeVisible();
  const suggestions = page.getByRole('list', { name: 'Suggested games, best first' });
  await expect(suggestions.locator(':scope > li')).toHaveCount(3);
  await both(page, 'quick-play');
  const best = suggestions.locator(':scope > li').first();
  const modeTitle = (await best.getByRole('heading').innerText()).replace(/^Best fit:\s*/, '').trim();
  await best.getByRole('link', { name: /^Host / }).click();
  // The host page opens with the set and the suggested mode already chosen.
  await expect(page).toHaveURL(/\/host\?set=.+&mode=/);
  await expect(page.getByRole('button', { name: /Change the question set, Rivers of the world/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: new RegExp(modeTitle) }).first()).toBeChecked();
  await page.getByRole('button', { name: 'Create game' }).click();
  await expect(page).toHaveURL(/\/room\/\d{6}/);
  await expect(page.getByText('Rivers of the world').first()).toBeVisible();

  // Back on the Make page: the set is there to carry on with, and the checklist has ticked it off (hosting ticks once a game is played to the end).
  await page.goto('/make');
  await expect(page.getByRole('heading', { name: 'Start here' })).toHaveCount(0);
  await expect(page.getByText('1 of 5 done')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Rivers of the world' })).toBeVisible();
  await both(page, 'make-after');
  expect(errors).toEqual([]);
  await t.context.close();
});

async function api(page: Page, method: 'post' | 'put' | 'get', url: string, data?: unknown) {
  const res = await page.request[method](url, { headers: CSRF, ...(data === undefined ? {} : { data }) });
  expect(res.ok(), `${method} ${url}: ${await res.text()}`).toBe(true);
  return res.json();
}

const MANY = Array.from({ length: 6 }, (_, i) => ({ id: `q${i + 1}`, type: 'truefalse', prompt: `Statement number ${i + 1} is true.`, correct: true }));

test('a draft carries on from another device', async ({ browser }) => {
  const t = await account(browser, { accountType: 'teacher' });
  await t.page.goto('/make/quick');
  await t.page.getByLabel('Notes, a word list or a table').fill('chat - cat\nchien - dog\noiseau - bird');
  await t.page.getByRole('button', { name: 'Make questions' }).click();
  await t.page.getByLabel('Name of the set').fill('French animals');
  await expect(t.page.getByRole('status').filter({ hasText: 'Draft saved' })).toBeAttached();
  await expect(t.page).toHaveURL(/draft=/);
  // The same teacher on another computer.
  const other = await browser.newContext();
  const page = await other.newPage();
  const errors = watchErrors(page);
  expect((await page.request.post('/api/auth/login', { headers: CSRF, data: { username: t.username, password: t.password } })).ok()).toBe(true);
  await page.goto('/make');
  await page.getByRole('link', { name: 'French animals' }).click();
  await expect(page.getByLabel('Name of the set')).toHaveValue('French animals');
  await expect(page.getByText('3 questions kept', { exact: true })).toBeVisible();
  // Thrown away from the Make page.
  await page.goto('/make');
  await page.getByRole('button', { name: 'Throw away the draft French animals' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Throw it away' }).click();
  await expect(page.getByRole('link', { name: 'French animals' })).toHaveCount(0);
  expect(errors).toEqual([]);
  await other.close();
  await t.context.close();
});

test('classroom tools from a class page and as a lesson step, the day view, and homework for two classes', async ({ browser }) => {
  test.setTimeout(240_000);
  const t = await account(browser, { accountType: 'teacher', displayName: 'Ms Patel' });
  const page = t.page;
  const errors = watchErrors(page);
  const s1 = await account(browser, { accountType: 'student', displayName: 'Ada Bright' });
  const s2 = await account(browser, { accountType: 'student', displayName: 'Bo Chen' });
  const oak = (await api(page, 'post', '/api/classes', { name: 'Year 5 Oak' })).class;
  await api(page, 'post', '/api/classes', { name: 'Year 5 Elm' });
  await api(s1.page, 'post', '/api/classes/join', { code: oak.joinCode });
  await api(s2.page, 'post', '/api/classes/join', { code: oak.joinCode });
  const setId = (await api(page, 'post', '/api/sets', { title: 'Times tables', subject: 'math', visibility: 'private', questions: MANY })).set.id as string;

  // From the class page: tools in one press. The picker remembers who has had a turn.
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/classes/${oak.id}`);
  await page.getByRole('link', { name: 'Class tools' }).click();
  await page.getByRole('button', { name: 'Pick a student' }).click();
  const picker = page.getByRole('region', { name: 'Random picker' });
  await expect(picker).toContainText(/Ada Bright|Bo Chen/);
  const first = (await picker.textContent())!.includes('Ada Bright') ? 'Ada Bright' : 'Bo Chen';
  const second = first === 'Ada Bright' ? 'Bo Chen' : 'Ada Bright';
  // Check-in, stopwatch and scoreboard.
  const checkin = page.getByRole('region', { name: 'Check-in' });
  await checkin.getByRole('button', { name: /Got it.*add one/ }).click();
  await checkin.getByRole('button', { name: /Stuck.*add one/ }).click();
  await expect(checkin.getByRole('status')).toHaveText(/50% are stuck: worth going over it again\. 2 of 2 counted\./);
  const board = page.getByRole('region', { name: 'Scoreboard' });
  await board.getByLabel('Add a row').fill('Table one');
  await board.getByRole('button', { name: 'Add', exact: true }).click();
  await board.getByRole('button', { name: '+5: give Table one five points' }).click();
  await expect(board.getByText('5 points for Table one')).toBeAttached();
  await page.getByRole('region', { name: 'Stopwatch' }).getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Stopwatch' }).getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await both(page, 'class-tools');
  // Wait for the memory to be saved, then come back: the next pick is the other student, and the score is kept.
  await expect.poll(async () => (await api(page, 'get', `/api/making/classes/${oak.id}/tools`)).state.picked.length).toBe(1);
  await expect.poll(async () => (await api(page, 'get', `/api/making/classes/${oak.id}/tools`)).state.scores.length).toBe(1);
  await page.reload();
  await expect(page.getByText(/Carrying on from last time: 1 student already picked/)).toBeVisible();
  await page.getByRole('button', { name: 'Pick a student' }).click();
  await expect(page.getByRole('region', { name: 'Random picker' })).toContainText(second);
  await expect(page.getByRole('region', { name: 'Scoreboard' }).getByText('5 points for Table one')).toBeAttached();

  // Homework for both classes at once, from the shared picker.
  await page.goto('/make/organise?tab=homework');
  await page.getByRole('group', { name: 'Which sets to show' }).getByRole('button', { name: 'Made by me' }).click();
  await page.getByRole('button', { name: /^Times tables/ }).click();
  await page.getByRole('button', { name: 'Tick all', exact: true }).click();
  const due = new Date(Date.now() + 2 * 3_600_000);
  const local = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}T${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`;
  await page.getByLabel('Due (optional)').fill(local);
  await both(page, 'organise-homework');
  await page.getByRole('button', { name: 'Set it for 2 classes' }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 classes done.' })).toBeVisible();

  // The class page says what is next; the day view lists it (if it is still today here).
  await page.goto(`/classes/${oak.id}`);
  await expect(page.getByRole('region', { name: 'Next due' })).toContainText('Times tables');
  await page.goto('/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Your day' })).toBeVisible();
  const sameDay = due.getDate() === new Date().getDate();
  if (sameDay) await expect(page.getByRole('region', { name: /Homework due/ })).toContainText('Year 5 Elm');
  else await expect(page.getByRole('region', { name: /Due in the next week/ })).toContainText('Year 5 Elm');
  await expect(page.getByRole('link', { name: 'Classroom tools for Year 5 Oak' })).toBeVisible();
  await both(page, 'today');

  // A classroom tool as a lesson step: added in the editor, then on the big screen in the room.
  const lesson = await api(page, 'post', '/api/lessons', { title: 'Tables lesson', step: { id: 'g1', kind: 'game', title: '', setId, modeId: 'classic', variantId: null, settings: {}, common: {}, note: '' } });
  await page.goto(`/lessons/${lesson.id}`);
  await page.getByRole('button', { name: 'Add a classroom tool' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Classroom tool on the big screen')).toHaveValue('checkin');
  await dialog.getByLabel('Classroom tool on the big screen').selectOption('picker');
  await dialog.getByRole('button', { name: 'Save step' }).click();
  await expect(page.getByText('How are we doing?').first()).toBeVisible();
  // The tool comes first, before the game.
  await page.getByRole('button', { name: 'Move step 2 up' }).click();
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.getByRole('button', { name: 'Run lesson' }).click();
  await expect(page).toHaveURL(/\/room\/\d{6}/);
  const code = /\/room\/(\d{6})/.exec(page.url())![1]!;
  await expect(page.getByRole('heading', { name: 'How are we doing?', level: 1 })).toBeVisible();
  // A player joins: the picker on the big screen picks from the room.
  const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await guest.newPage();
  await phone.goto(`/join/${code}`);
  await phone.getByLabel('Your name').fill('Cal');
  await phone.getByRole('button', { name: 'Join game' }).click();
  await expect(phone.getByText('Look at the big screen: random picker.')).toBeVisible();
  await page.getByRole('button', { name: 'Pick a student' }).click();
  await expect(page.getByRole('region', { name: 'Random picker' })).toContainText('Cal');
  await check(page, 'lesson-tool-host');
  await check(phone, 'lesson-tool-player');
  expect(errors).toEqual([]);
  await guest.close();
  for (const c of [t.context, s1.context, s2.context]) await c.close();
});

test('more ways to make and organise: maths practice, a ready-made set, a lesson from a set, bulk sets and classes, a printed day', async ({ browser }) => {
  test.setTimeout(180_000);
  const t = await account(browser, { accountType: 'teacher' });
  const page = t.page;
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });

  // Maths practice: every answer worked out, then saved as a set.
  await page.goto('/make/quick?start=maths');
  await page.getByRole('tab', { name: 'Maths practice' }).click();
  await page.getByLabel('Questions', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Make the sums' }).click();
  await expect(page.getByText('8 questions kept', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Name of the set')).toHaveValue('Maths practice');
  await page.getByRole('button', { name: 'Save and choose a game' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Play it' })).toBeVisible();

  // A ready-made set, copied into the teacher's own sets.
  await page.goto('/make/quick?start=topic');
  await page.getByRole('tab', { name: 'A ready-made set' }).click();
  await both(page, 'quick-topic');
  const firstSet = page.getByRole('tabpanel').getByRole('listitem').first().getByRole('button');
  await firstSet.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Play it' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Suggested games, best first' })).toBeVisible();

  // From a set's page: a whole lesson in one press.
  const setId = (await api(page, 'post', '/api/sets', { title: 'Capitals', subject: 'geography', visibility: 'private', questions: MANY })).set.id as string;
  await page.goto(`/sets/${setId}`);
  await page.getByRole('button', { name: 'Make a lesson with it' }).click();
  await expect(page).toHaveURL(/\/lessons\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel('Lesson title')).toHaveValue('Lesson: Capitals');
  const lessonId = /\/lessons\/([0-9a-f-]{36})/.exec(page.url())![1]!;
  const lesson = await api(page, 'get', `/api/lessons/${lessonId}`);
  const games = (lesson.lesson.steps as { kind: string; setId?: string }[]).filter((s) => s.kind === 'game');
  expect(games.length).toBeGreaterThan(0);
  expect(games.every((g) => g.setId === setId)).toBe(true);

  // Bulk: three sets into a folder, one to the bin.
  await page.goto('/make/organise?tab=sets');
  await page.getByRole('button', { name: /^Tick all/ }).click();
  await page.getByRole('button', { name: 'Put in a folder' }).click();
  await page.getByRole('dialog').getByLabel('Folder').fill('Year 6');
  await page.getByRole('dialog').getByRole('button', { name: 'Move them' }).click();
  await expect(page.getByRole('status').filter({ hasText: /3 sets done\./ })).toBeVisible();
  await expect(page.getByText(/in Year 6/)).toHaveCount(3);
  await page.getByRole('checkbox', { name: /Capitals/ }).check();
  await page.getByRole('button', { name: 'Send to the bin' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send to the bin' }).click();
  await expect(page.getByRole('status').filter({ hasText: /1 set done\./ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Capitals/ })).toHaveCount(0);
  await both(page, 'organise-sets');

  // Bulk: archive two classes at the end of the year.
  await api(page, 'post', '/api/classes', { name: 'Old class A' });
  await api(page, 'post', '/api/classes', { name: 'Old class B' });
  await page.goto('/make/organise?tab=classes');
  await page.getByRole('checkbox', { name: 'Old class A' }).check();
  await page.getByRole('checkbox', { name: 'Old class B' }).check();
  await both(page, 'organise-classes');
  await page.getByRole('button', { name: 'Archive 2 classes' }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 classes done.' })).toBeVisible();
  const list = await api(page, 'get', '/api/classes');
  expect((list.teaching as { archived: boolean }[]).every((c) => c.archived)).toBe(true);

  // The day view prints on its own sheet.
  await page.goto('/today');
  await page.evaluate(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => void (window as unknown as { printed: number }).printed++;
  });
  await page.getByRole('button', { name: 'Print' }).click();
  await expect(page.locator('.print-sheet')).toContainText('Homework due');
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  // The previous day is one press away.
  await page.getByRole('button', { name: 'The day before' }).click();
  await expect(page.getByText(/^Yesterday, /)).toBeVisible();
  expect(errors).toEqual([]);
  await t.context.close();
});

test('after a game the host has the full report and the missed questions as a new set, one press each', async ({ browser }) => {
  test.setTimeout(300_000);
  const t = await account(browser, { accountType: 'teacher' });
  const page = t.page;
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  const setId = (await api(page, 'post', '/api/sets', { title: 'Facts', subject: 'science', visibility: 'private', questions: MANY.slice(0, 3).map((q) => ({ ...q, prompt: q.prompt.replace('true', 'false'), correct: false })) })).set.id as string;
  const { code } = await api(page, 'post', '/api/rooms', { setId, modeId: 'classic', common: { questionLimit: 3, shuffleQuestions: false, questionTimeSec: 90 }, settings: { autoAdvance: false } });
  await page.goto(`/room/${code}`);
  const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await guest.newPage();
  await phone.goto(`/join/${code}`);
  await phone.getByLabel('Your name').fill('Dee');
  await phone.getByRole('button', { name: 'Join game' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  // The player answers every question wrong-or-right as it comes; the host moves on.
  const whatNext = page.getByRole('group', { name: 'What next' });
  const next = page.getByRole('button', { name: /^Next( question|: results)?( \(N\))?$/ });
  page.setDefaultTimeout(6_000);
  phone.setDefaultTimeout(6_000);
  try {
    for (let i = 0; i < 80; i++) {
      if (await whatNext.isVisible().catch(() => false)) break;
      await answerAnyQuestion(phone).catch(() => {});
      if (await next.first().isVisible().catch(() => false)) await next.first().click({ timeout: 3_000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  } finally {
    page.setDefaultTimeout(0);
    phone.setDefaultTimeout(0);
  }
  await expect(whatNext).toBeVisible();
  await expect(whatNext.getByRole('link', { name: 'Full report' })).toHaveAttribute('href', /\/reports\/[0-9a-f-]{36}$/);
  await whatNext.getByRole('button', { name: 'Missed questions as a new set' }).click();
  // Every answer is false and the player pressed the first choice (True), so every question was missed.
  await whatNext.getByRole('link', { name: /^Open “/ }).click();
  await expect(page).toHaveURL(/\/sets\/[0-9a-f-]{36}$/);
  await expect(page.getByText('3 questions').first()).toBeVisible();
  expect(errors).toEqual([]);
  await guest.close();
  await t.context.close();
});

test('a student gets a shorter checklist on the Make page, which goes away for good', async ({ browser }) => {
  const s = await account(browser, { accountType: 'student' });
  const page = s.page;
  const errors = watchErrors(page);
  await page.goto('/make');
  await expect(page.getByRole('heading', { name: 'Start here' })).toBeVisible();
  await expect(page.getByText('0 of 3 done')).toBeVisible();
  // Teachers' things are not offered.
  await expect(page.getByRole('heading', { name: 'For your classes' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Your day' })).toHaveCount(0);
  await both(page, 'make-student');
  await page.getByRole('button', { name: 'Close the first things to make checklist for good' }).click();
  await expect(page.getByRole('heading', { name: 'First things to make' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Start here' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'First things to make' })).toHaveCount(0);
  // The day view and bulk tools say they are for teachers.
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'This is for teachers' })).toBeVisible();
  expect(errors).toEqual([]);
  await s.context.close();
});
