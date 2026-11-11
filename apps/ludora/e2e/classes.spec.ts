import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { mkdirSync, readFileSync } from 'node:fs';
import { account, CSRF, settled, watchErrors } from './helpers.ts';

/*
 * The teacher's class tools (docs/features/classes.md): class logins and their
 * printed cards, the gradebook, insights and reteach, the mastery grid and
 * comparing tries, a student's report and private note, the noticeboard and
 * goal, the calendar, class tools, scheduled and limited assignments, and what a
 * student sees of all that. Every screen is checked with axe, at phone and laptop
 * widths, for sideways scrolling.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const SHOTS = process.env.SHOTS_DIR;
const DB = process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/ludora_e2e';

const QUESTIONS = [
  { id: 'q1', type: 'truefalse', prompt: 'Water boils at 100 C at sea level.', correct: true },
  { id: 'q2', type: 'truefalse', prompt: 'The Moon is a planet.', correct: false },
  { id: 'q3', type: 'truefalse', prompt: 'Bats are mammals.', correct: true },
  { id: 'q4', type: 'truefalse', prompt: 'Spiders have six legs.', correct: false },
];

async function check(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  // A toast part-way through fading has faint text for a moment; the page is what is being checked.
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${name} scrolls sideways`).toBeLessThanOrEqual(0);
  await settled(page);
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), name).toEqual([]);
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    const w = page.viewportSize()?.width ?? 0;
    await page.screenshot({ path: `${SHOTS}/${name}-${w}.png`, fullPage: true });
  }
}

/** Finished assignment games, written straight to the database as the game server would. */
async function seedGame(opts: { classId: string; assignmentId: string; setId: string; userId: string; name: string; answers: [string, boolean][]; minutesAgo: number }) {
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  try {
    const correct = opts.answers.filter(([, r]) => r).length;
    const ended = new Date(Date.now() - opts.minutesAgo * 60_000);
    const g = await c.query(
      `insert into game_sessions (room_code, mode_id, host_user_id, set_id, set_title, settings, common, status, ended_by, player_count, class_id, assignment_id, is_solo, started_at, ended_at, duration_ms)
       values ('123456', 'classic', $1, $2, 'Science facts', '{}', '{}', 'completed', 'mode', 1, $3, $4, true, $5, $6, 95000) returning id`,
      [opts.userId, opts.setId, opts.classId, opts.assignmentId, new Date(ended.getTime() - 95_000), ended],
    );
    const gid = g.rows[0].id;
    await c.query(
      `insert into game_participants (game_id, user_id, player_key, display_name, is_guest, is_bot, rank, score, label, answered, correct, avg_response_ms, best_streak) values ($1, $2, 'p0', $3, false, false, 1, $4, '', $5, $6, 2000, 1)`,
      [gid, opts.userId, opts.name, correct * 100, opts.answers.length, correct],
    );
    for (const [qid, right] of opts.answers) {
      await c.query(`insert into answer_events (game_id, user_id, player_key, set_id, question_id, correct, partial, response_ms, kind, created_at) values ($1, $2, 'p0', $3, $4, $5, $6, 1500, 'answer', $7)`, [gid, opts.userId, opts.setId, qid, right, right ? 1 : 0, ended]);
    }
  } finally {
    await c.end();
  }
}

test('a teacher makes class logins, prints the cards, resets a passcode, and a student signs in with one', async ({ browser }) => {
  const teacher = await account(browser, { accountType: 'teacher', displayName: 'Mr Okafor' });
  const errors = watchErrors(teacher.page);
  await teacher.page.addInitScript(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => {
      (window as unknown as { printed: number }).printed++;
    };
  });
  const { class: cls } = await (await teacher.page.request.post('/api/classes', { headers: CSRF, data: { name: 'Year 3 Willow' } })).json();
  await teacher.page.goto(`/classes/${cls.id}?tab=students`);
  await teacher.page.getByRole('button', { name: 'Make class logins' }).first().click();
  const dialog = teacher.page.getByRole('dialog', { name: 'Make class logins' });
  // A CSV from the school's system fills the list; then it is edited by hand.
  await dialog.locator('input[type=file]').setInputFiles({ name: 'roster.csv', mimeType: 'text/csv', buffer: Buffer.from('Surname,First name,Year\nKhan,Amira,3\nOsei,Ben,3\n') });
  await expect(dialog.getByLabel('First names')).toHaveValue('Amira\nBen');
  await dialog.getByLabel('First names').fill('Amira\nBen\nChloé');
  await check(teacher.page, 'logins-dialog');
  await dialog.getByRole('button', { name: 'Make 3 logins' }).click();
  const done = teacher.page.getByRole('dialog', { name: '3 logins made' });
  await expect(done).toBeVisible();
  const card = done.getByRole('listitem').filter({ hasText: 'Amira' });
  const username = (await card.locator('dd').nth(0).textContent())!.trim();
  const passcode = (await card.locator('dd').nth(1).textContent())!.trim();
  expect(username).toMatch(/^amira\d{3}$/);
  expect(passcode).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/);
  await check(teacher.page, 'logins-cards');
  await done.getByRole('button', { name: 'Print 3 cards' }).click();
  await expect.poll(() => teacher.page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  await expect(teacher.page.locator('.print-sheet')).toContainText(passcode);
  await teacher.page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(teacher.page.locator('.print-sheet')).toHaveCount(0);
  await done.getByRole('button', { name: 'Done' }).last().click();
  await expect(teacher.page.getByRole('link', { name: /^Amira/ }).first()).toBeVisible();

  // The student signs in with the card, on a phone, and is in the class.
  const kid = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const kp = await kid.newPage();
  await kp.goto('/signin');
  await kp.getByLabel('Username').fill(username);
  await kp.getByLabel('Password').fill(passcode);
  await kp.getByRole('button', { name: 'Sign in' }).click();
  await expect(kp).toHaveURL(/\/$/);
  await kp.goto(`/classes/${cls.id}`);
  await expect(kp.getByRole('heading', { level: 1, name: 'Year 3 Willow' })).toBeVisible();

  // Reset: a new passcode, and the old one stops working.
  await teacher.page.getByRole('button', { name: 'Reset passcode for Amira' }).first().click();
  await teacher.page.getByRole('dialog').getByRole('button', { name: 'Reset passcode' }).click();
  await expect(teacher.page.getByRole('dialog', { name: 'New passcode for Amira' })).toBeVisible();
  const fresh = (await teacher.page.getByRole('dialog').locator('dd').nth(1).textContent())!.trim();
  expect(fresh).not.toBe(passcode);
  const old = await kp.request.post('/api/auth/login', { headers: CSRF, data: { username, password: passcode } });
  expect(old.status()).toBe(401);
  expect(errors).toEqual([]);
});

test('a teacher reads the gradebook, insights, mastery grid and a student report; a student sees notices, the goal and their to-do', async ({ browser }) => {
  test.setTimeout(240_000);
  const teacher = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera' });
  const ada = await account(browser, { accountType: 'student', displayName: 'Ada Bright' });
  const bo = await account(browser, { accountType: 'student', displayName: 'Bo Chen' });
  const tErrors = watchErrors(teacher.page);
  const sErrors = watchErrors(ada.page);
  const set = await (await teacher.page.request.post('/api/sets', { headers: CSRF, data: { title: 'Science facts', subject: 'science', visibility: 'private', questions: QUESTIONS } })).json();
  await teacher.page.request.post('/api/sets', { headers: CSRF, data: { title: 'One question only', subject: 'science', visibility: 'private', questions: [QUESTIONS[0]] } });
  const { class: cls } = await (await teacher.page.request.post('/api/classes', { headers: CSRF, data: { name: 'Year 5 Oak' } })).json();
  await (await teacher.page.request.post('/api/classes', { headers: CSRF, data: { name: 'Year 5 Elm' } })).json();
  for (const s of [ada, bo]) await s.page.request.post('/api/classes/join', { headers: CSRF, data: { code: cls.joinCode } });
  const due = new Date(Date.now() + 30 * 3_600_000).toISOString();
  const a = await (await teacher.page.request.post(`/api/classes/${cls.id}/assignments`, { headers: CSRF, data: { setId: set.set.id, modeId: 'classic', title: 'Science check', dueAt: due, maxAttempts: 3 } })).json();
  const aid = a.assignment.id;
  await teacher.page.request.post(`/api/classes/${cls.id}/assignments`, { headers: CSRF, data: { setId: set.set.id, modeId: 'classic', title: 'Next topic', opensAt: new Date(Date.now() + 5 * 86_400_000).toISOString() } });
  await seedGame({ classId: cls.id, assignmentId: aid, setId: set.set.id, userId: ada.userId, name: 'Ada Bright', answers: [['q1', true], ['q2', false], ['q3', false], ['q4', false]], minutesAgo: 120 });
  await seedGame({ classId: cls.id, assignmentId: aid, setId: set.set.id, userId: ada.userId, name: 'Ada Bright', answers: [['q1', true], ['q2', true], ['q3', false], ['q4', false]], minutesAgo: 30 });
  await seedGame({ classId: cls.id, assignmentId: aid, setId: set.set.id, userId: bo.userId, name: 'Bo Chen', answers: [['q1', true], ['q2', true], ['q3', true], ['q4', false]], minutesAgo: 20 });

  const tp = teacher.page;
  for (const width of [1366, 390]) {
    await tp.setViewportSize({ width, height: width > 500 ? 768 : 844 });
    for (const tab of ['assignments', 'students', 'gradebook', 'insights', 'board', 'calendar']) {
      await tp.goto(`/classes/${cls.id}${tab === 'assignments' ? '' : `?tab=${tab}`}`);
      await expect(tp.getByRole('tab', { selected: true })).toBeVisible();
      await check(tp, `class-${tab}`);
    }
    await tp.goto(`/classes/${cls.id}/assignments/${aid}`);
    await expect(tp.getByRole('heading', { name: 'Mastery grid' })).toBeVisible();
    await check(tp, 'assignment-report');
    await tp.goto(`/classes/${cls.id}/students/${ada.userId}`);
    await check(tp, 'student-report');
    await tp.goto(`/classes/${cls.id}/tools`);
    await check(tp, 'class-tools');
  }
  await tp.setViewportSize({ width: 1366, height: 768 });

  // Gradebook: the best of Ada's two tries, sortable.
  await tp.goto(`/classes/${cls.id}?tab=gradebook`);
  const grid = tp.getByRole('region', { name: 'Gradebook for Year 5 Oak' });
  await expect(grid.getByRole('row', { name: /Ada Bright/ })).toContainText('50%');
  await expect(grid.getByRole('row', { name: /Bo Chen/ })).toContainText('75%');
  const [csv] = await Promise.all([tp.waitForEvent('download'), tp.getByRole('button', { name: 'Gradebook CSV' }).click()]);
  const text = readFileSync((await csv.path())!, 'utf8');
  expect(text).toContain('"Ada Bright"');
  expect(text).toContain('"Science check: best (%)"');
  expect(text).toMatch(/"Ada Bright","e2e[^"]*",50,50,2,4,2,"Played"/);
  const [all] = await Promise.all([tp.waitForEvent('download'), tp.getByRole('button', { name: 'All class data' }).click()]);
  expect(readFileSync((await all.path())!, 'utf8')).toContain('"Class login"');

  // Calendar: the due date is listed.
  await tp.getByRole('tab', { name: 'Calendar' }).click();
  await expect(tp.getByRole('region', { name: /^Dates in / })).toContainText('Science check');

  // Insights: Ada may need a hand; the most-missed question makes a reteach set.
  await tp.getByRole('tab', { name: 'Insights' }).click();
  const help = tp.getByRole('region', { name: 'May need a hand' });
  await expect(help.getByRole('link', { name: 'Ada Bright' })).toBeVisible();
  await expect(help).not.toContainText('Bo Chen');
  await tp.getByRole('button', { name: 'Make a reteach set' }).click();
  await expect(tp.getByRole('status').filter({ hasText: 'Reteach: Year 5 Oak' })).toBeVisible();

  // Noticeboard and goal, through the forms.
  await tp.getByRole('tab', { name: /Noticeboard/ }).click();
  await tp.getByLabel('New notice').fill('Spelling test on Friday.');
  await tp.getByRole('button', { name: 'Post notice' }).click();
  await expect(tp.getByRole('list', { name: 'Notices, newest first' })).toContainText('Spelling test on Friday.');
  await tp.getByRole('button', { name: 'Set a goal' }).click();
  await tp.getByLabel('Right answers to reach').fill('10');
  await tp.getByRole('dialog').getByRole('button', { name: 'Set goal' }).click();
  await expect(tp.getByRole('progressbar', { name: /Right answers this week/ })).toBeVisible();

  // Mastery grid and comparing Ada's two tries.
  await tp.goto(`/classes/${cls.id}/assignments/${aid}`);
  await tp.getByRole('button', { name: "Compare Ada Bright's tries" }).click();
  const compare = tp.getByRole('dialog', { name: "Compare Ada Bright's tries" });
  await expect(compare).toContainText('Up 25 points.');
  await expect(compare).toContainText('1 question now right');
  await check(tp, 'compare-dialog');
  await compare.getByRole('button', { name: 'Close' }).click();

  // The private note, saved from the student's report.
  await tp.goto(`/classes/${cls.id}/students/${ada.userId}`);
  await tp.getByRole('textbox', { name: 'Note' }).fill('Sits at the front.');
  await tp.getByRole('button', { name: 'Save note' }).click();
  await expect(tp.getByText('Note saved')).toBeVisible();
  await tp.evaluate(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => void (window as unknown as { printed: number }).printed++;
  });
  await tp.getByRole('button', { name: 'Print report' }).click();
  await expect(tp.locator('.print-sheet')).toContainText('Ada Bright: progress report');
  await expect.poll(() => tp.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  await tp.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await tp.getByRole('button', { name: 'Certificate' }).click();
  await tp.getByLabel('Heading').fill('Science star');
  await check(tp, 'certificate');
  await tp.getByRole('button', { name: 'Print certificate' }).click();
  await expect(tp.locator('.print-sheet')).toContainText('Science star');
  await expect.poll(() => tp.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(2);
  await tp.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await tp.keyboard.press('Escape');

  // Class tools: a pick, teams and a running timer.
  await tp.goto(`/classes/${cls.id}/tools`);
  await tp.getByRole('button', { name: 'Pick a student' }).click();
  await expect(tp.getByRole('region', { name: 'Random picker' })).toContainText(/Ada Bright|Bo Chen/);
  await tp.getByRole('button', { name: 'Make teams' }).click();
  await expect(tp.getByRole('list', { name: 'Teams' }).getByRole('listitem').filter({ hasText: /^Team/ })).toHaveCount(2);

  // A one-question set is shown but not offered once Classic is chosen.
  await tp.goto(`/classes/${cls.id}`);
  await tp.getByRole('button', { name: 'New assignment' }).click();
  const newDialog = tp.getByRole('dialog', { name: 'New assignment' });
  await newDialog.getByRole('button', { name: /^Change the question set/ }).waitFor({ state: 'detached' }).catch(() => {});
  await newDialog.getByRole('button', { name: /^Classic/ }).first().click();
  await expect(newDialog.getByText('Too short for Classic: 1 question, needs 3')).toBeVisible();
  await expect(newDialog.getByRole('button', { name: /One question only/ })).toHaveCount(0);
  await check(tp, 'new-assignment');
  await tp.keyboard.press('Escape');

  // Bulk move: Bo moves to the other class.
  await tp.goto(`/classes/${cls.id}?tab=students`);
  await tp.getByRole('checkbox', { name: 'Select Bo Chen' }).last().check();
  await tp.getByLabel('Class to move them to').selectOption({ label: 'Year 5 Elm' });
  await tp.getByRole('button', { name: 'Move', exact: true }).click();
  await tp.getByRole('dialog').getByRole('button', { name: 'Move students' }).click();
  await expect(tp.getByText('1 student moved to Year 5 Elm')).toBeVisible();

  // Ada plays three more games, right through: the class passes its goal of 10.
  for (let i = 0; i < 3; i++) await seedGame({ classId: cls.id, assignmentId: aid, setId: set.set.id, userId: ada.userId, name: 'Ada Bright', answers: [['q1', true], ['q2', true], ['q3', true], ['q4', true]], minutesAgo: 0 });

  // Something due tomorrow, for the reminder on the student's home page.
  await teacher.page.request.post(`/api/classes/${cls.id}/assignments`, { headers: CSRF, data: { setId: set.set.id, modeId: 'classic', title: 'Spelling practice', dueAt: new Date(Date.now() + 20 * 3_600_000).toISOString() } });

  // The student: notice, goal (with the badge, since the class passed 10), to-do and their own report.
  const sp = ada.page;
  for (const width of [390, 1366]) {
    await sp.setViewportSize({ width, height: width > 500 ? 768 : 844 });
    await sp.goto(`/classes/${cls.id}`);
    await expect(sp.getByText('Spelling test on Friday.')).toBeVisible();
    await expect(sp.getByText('You earned the class badge.')).toBeVisible();
    await expect(sp.getByRole('heading', { name: 'Science check' })).toBeVisible();
    await expect(sp.getByText('You have used all 3 attempts at this assignment.')).toBeVisible();
    await expect(sp.getByRole('button', { name: 'Play again: Science check' })).toBeDisabled();
    // The scheduled assignment is not shown yet.
    await expect(sp.getByText('Next topic')).toHaveCount(0);
    await check(sp, 'student-class');
    await sp.goto('/');
    await expect(sp.getByRole('status').filter({ hasText: '1 assignment due in the next two days.' })).toBeVisible();
    await check(sp, 'student-home');
  }
  await sp.goto(`/classes/${cls.id}`);
  await sp.getByRole('link', { name: 'Your progress' }).click();
  await expect(sp.getByRole('heading', { level: 1, name: 'Ada Bright' })).toBeVisible();
  await expect(sp.getByText('Sits at the front.')).toHaveCount(0);
  await check(sp, 'student-own-report');
  // A classmate's report is refused.
  await sp.goto(`/classes/${cls.id}/students/${bo.userId}`);
  await expect(sp.getByText(/not in this class|private/)).toBeVisible();
  expect(tErrors).toEqual([]);
  expect(sErrors.filter((e) => !/40[34]/.test(e))).toEqual([]);
});
