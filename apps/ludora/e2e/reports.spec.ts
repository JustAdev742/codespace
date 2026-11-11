import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { CSRF, account, watchErrors } from './helpers.ts';

/*
 * Teacher reports, end to end: a teacher hosts a short game for two players (her own student,
 * signed in, and a guest who joins with a name), then reads what to teach next on the game
 * report, leaves guests out of the totals, opens a player's answers, makes a reteach set and
 * assigns it to her class, keeps a note, downloads both CSVs, prints the class report and the
 * slips, compares with a second game, and opens the reports home, the set across games, the
 * student across games, the term overview and her report data. Another teacher is refused.
 * Every page passes axe (WCAG 2.2 A and AA) with no sideways scrolling at 1366 and 390 wide.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SHOTS = process.env.REPORTS_SHOTS;

async function check(page: Page, name: string) {
  // A toast fading out fails colour contrast in WebKit: wait for the news to clear first.
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  // The same goes for a dialog still fading in.
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || !Number.isFinite(Number(a.effect?.getComputedTiming().endTime))), undefined, { timeout: 5000 })
    .catch(() => {});
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  }
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), name).toEqual([]);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways, `${name} scrolls sideways`).toBeLessThanOrEqual(0);
}

/** At a school laptop's size and then a phone's. */
async function checkBoth(page: Page, name: string) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await check(page, `${name}-1366`);
  await page.setViewportSize({ width: 390, height: 844 });
  await check(page, `${name}-390`);
  await page.setViewportSize({ width: 1366, height: 768 });
}

const QUESTIONS = [
  { id: 'q1', type: 'truefalse', prompt: 'The Sun is a star.', correct: true },
  { id: 'q2', type: 'truefalse', prompt: 'Spiders have six legs.', correct: false },
  { id: 'q3', type: 'truefalse', prompt: 'Owls hunt at night.', correct: true },
];

/** A classic room with the three questions in order, open on the host's screen. */
async function openRoom(host: Page, setId: string) {
  const room = await host.request.post('/api/rooms', { headers: CSRF, data: { setId, modeId: 'classic', common: { questionLimit: 3, shuffleQuestions: false, questionTimeSec: 120 }, settings: { autoAdvance: false } } });
  expect(room.ok(), await room.text()).toBe(true);
  const { code } = await room.json();
  await host.goto(`/room/${code}`);
  return code as string;
}

/** Every phone answers True each time (so q2 is wrong for everyone, with "True"); the host moves on with Next. */
async function playToEnd(host: Page, phones: Page[]) {
  await host.getByRole('button', { name: 'Start game' }).click();
  const over = host.getByRole('heading', { name: /results|game over/i }).first();
  host.setDefaultTimeout(6_000);
  for (const p of phones) p.setDefaultTimeout(6_000);
  try {
    for (let turn = 0; turn < 40; turn++) {
      if (await over.isVisible().catch(() => false)) break;
      for (const p of phones) {
        const answers = p.getByRole('group', { name: 'Answers' });
        if (await answers.isVisible().catch(() => false)) {
          const tf = answers.getByRole('button', { name: /True$/ });
          if (await tf.isEnabled().catch(() => false)) await tf.click().catch(() => {});
        }
      }
      const next = host.getByRole('button', { name: 'Next', exact: true });
      if (await next.isVisible().catch(() => false)) await next.click().catch(() => {});
      await host.waitForTimeout(400);
    }
  } finally {
    host.setDefaultTimeout(0);
    for (const p of phones) p.setDefaultTimeout(0);
  }
  await expect(over).toBeVisible({ timeout: 20_000 });
}

test('reports: what to teach next after a game with a student and a guest, and every report page', async ({ browser, browserName }) => {
  test.setTimeout(300_000);
  const teacher = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera' });
  const page = teacher.page;
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = watchErrors(page);
  const ada = await account(browser, { accountType: 'student', displayName: 'Ada Pupil' });
  const { class: cls } = await (await page.request.post('/api/classes', { headers: CSRF, data: { name: 'Year 5 Oak' } })).json();
  await ada.page.request.post('/api/classes/join', { headers: CSRF, data: { code: cls.joinCode } });
  const set = await page.request.post('/api/sets', { headers: CSRF, data: { title: 'Nature facts', description: 'Three quick ones', subject: 'science', visibility: 'private', questions: QUESTIONS } });
  expect(set.ok(), await set.text()).toBe(true);
  const setId = (await set.json()).set.id as string;

  // An empty reports home first: what to do to get a report.
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Host a game to see a report here' })).toBeVisible();
  await check(page, 'reports-empty-1366');

  // Two players: Ada (signed in, in the class) and a guest who joins with only a name.
  const code = await openRoom(page, setId);
  await ada.page.setViewportSize({ width: 390, height: 844 });
  await ada.page.goto(`/join/${code}`);
  await ada.page.getByRole('button', { name: 'Join game' }).click();
  await expect(ada.page.getByText('You are in', { exact: true })).toBeVisible();
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await guestContext.newPage();
  const guestErrors = watchErrors(guest);
  await guest.goto(`/join/${code}`);
  await guest.getByLabel('Your name').fill('Bo Guest');
  await guest.getByRole('button', { name: 'Join game' }).click();
  await expect(guest.getByText('You are in', { exact: true })).toBeVisible();
  await playToEnd(page, [ada.page, guest]);

  // The reports home lists it with its headline numbers (2 of 3 right for each: 67%).
  await page.goto('/reports');
  const row = page.getByRole('list', { name: 'Your games' }).getByRole('listitem').first();
  await expect(row).toContainText('Classic');
  await expect(row).toContainText('67%');
  await expect(row).toContainText('2 players');
  await checkBoth(page, 'reports-home');

  // The game report: the shared wrong answer, hardest and easiest, membership.
  await row.getByRole('link').first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Classic' })).toBeVisible();
  const shared = page.getByRole('list', { name: 'Shared wrong answers' });
  await expect(shared).toContainText('Spiders have six legs.');
  await expect(shared).toContainText('2 players answered');
  await expect(shared.getByText('True', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Hardest questions' })).toContainText('Spiders have six legs.');
  await expect(page.getByRole('main').getByText('Your student').first()).toBeVisible();
  await expect(page.getByRole('main').getByText('Guest', { exact: true }).first()).toBeVisible();
  await expect(page.locator('dl[aria-label="Game summary"]')).toContainText('67%');
  await checkBoth(page, 'game-report');

  // Leave the guest out of the totals: Ada alone is still 2 of 3.
  await page.getByRole('switch', { name: 'Count guests in the totals' }).click();
  await expect(page.locator('dl[aria-label="Game summary"]')).toContainText('guests left out');

  // One player's answers, question by question (the guest: no account, only this game).
  await page.getByRole('button', { name: 'Bo Guest' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Bo Guest' });
  await expect(dialog).toContainText('Guest');
  await expect(dialog.getByRole('list')).toContainText('Spiders have six legs.');
  await check(page, 'player-dialog-1366');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // A private note.
  await page.getByRole('textbox', { name: 'Note', exact: true }).fill('Retaught spiders on Tuesday.');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText('Note saved')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Note', exact: true })).toHaveValue('Retaught spiders on Tuesday.');

  // Downloads: every answer, and the question analysis.
  const [answersFile] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Every answer (CSV)' }).click()]);
  const answersCsv = readFileSync((await answersFile.path())!, 'utf8');
  expect(answersCsv).toContain('"Bo Guest"');
  expect(answersCsv).toContain('"Spiders have six legs."');
  const [questionsFile] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Question analysis (CSV)' }).click()]);
  expect(readFileSync((await questionsFile.path())!, 'utf8')).toContain('"Most common wrong answer"');

  // Print: the class report and the slips (the print dialog itself is stubbed).
  await page.evaluate(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => void (window as unknown as { printed: number }).printed++;
  });
  await page.getByRole('button', { name: 'Class report' }).click();
  await expect(page.locator('.print-sheet')).toContainText('Ludora class report');
  await expect(page.locator('.print-sheet')).toContainText('Spiders have six legs.');
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  if (browserName === 'chromium' && SHOTS) {
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: `${SHOTS}/class-report.pdf`, format: 'A4' });
    await page.emulateMedia({ media: 'screen' });
  }
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('.print-sheet')).toHaveCount(0);
  await page.getByRole('button', { name: 'Student slips' }).click();
  await expect(page.locator('.print-sheet')).toContainText('Ada Pupil');
  await expect(page.locator('.print-sheet')).toContainText('To practise:');
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(2);
  if (browserName === 'chromium' && SHOTS) {
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: `${SHOTS}/slips.pdf`, format: 'A4' });
    await page.emulateMedia({ media: 'screen' });
  }
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('.print-sheet')).toHaveCount(0);

  // Reteach, then assign the missed question to the class (Flashcard Study takes one question).
  await page.getByRole('button', { name: 'Make a reteach set' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Reteach: Nature facts' })).toBeVisible();
  await page.getByRole('button', { name: 'Assign to a class' }).click();
  const assign = page.getByRole('dialog', { name: 'Assign the missed questions' });
  await expect(assign.getByLabel('Class')).toHaveValue(cls.id);
  await expect(assign.getByLabel('Game mode')).toHaveValue('flashcard-study');
  await check(page, 'assign-dialog-1366');
  await assign.getByRole('button', { name: 'Set assignment' }).click();
  await expect(assign.getByRole('status')).toContainText('Set for Year 5 Oak');
  await assign.getByRole('button', { name: 'Done' }).click();
  const detail = await (await page.request.get(`/api/classes/${cls.id}`)).json();
  expect(JSON.stringify(detail)).toContain('Follow-up: Nature facts');
  const gameUrl = page.url();

  // A second game of the same set, then compare before and after.
  const code2 = await openRoom(page, setId);
  await ada.page.goto(`/join/${code2}`);
  await ada.page.getByRole('button', { name: 'Join game' }).click();
  await expect(ada.page.getByText('You are in', { exact: true })).toBeVisible();
  await playToEnd(page, [ada.page]);
  await page.goto(gameUrl);
  await page.getByRole('button', { name: 'Compare with another game' }).click();
  await page.getByRole('dialog', { name: 'Compare with another game' }).getByRole('button', { name: /Compare/ }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Before and after' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Spiders have six legs.');
  await checkBoth(page, 'compare');

  // The set across your games, the student across your games, the term overview.
  await page.goto(`/reports/sets/${setId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Nature facts' })).toBeVisible();
  await expect(page.locator('dl[aria-label="The set in numbers"]')).toContainText('2');
  await checkBoth(page, 'set-across');
  await page.goto('/reports/students');
  await page.getByRole('link', { name: /Ada Pupil/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ada Pupil' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'By question type' })).toBeVisible();
  expect(page.url()).not.toContain(ada.userId);
  await checkBoth(page, 'student-across');
  await page.goto('/reports/term');
  await expect(page.getByRole('heading', { level: 2, name: 'Week by week' })).toBeVisible();
  await checkBoth(page, 'term');

  // The reports home filters: by class (none of these games was hosted for it) and a search.
  await page.goto('/reports?q=nature');
  await expect(page.getByText('2 games match.')).toBeVisible();
  await page.goto(`/reports?class=${cls.id}`);
  await expect(page.getByRole('heading', { name: 'No games match' })).toBeVisible();

  // The teacher's home page: this week's reports.
  await page.goto('/');
  await expect(page.getByRole('list', { name: 'This week’s reports' }).getByRole('listitem')).toHaveCount(2);

  // Report data: the retention setting, and the download of everything.
  await page.goto('/reports/data');
  await page.getByLabel('Keep my reports for').selectOption('12');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/No games were old enough to remove/)).toBeVisible();
  const [everything] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download as JSON' }).click()]);
  const json = JSON.parse(readFileSync((await everything.path())!, 'utf8'));
  expect(json.games).toHaveLength(2);
  expect(JSON.stringify(json)).not.toContain(ada.username);
  await checkBoth(page, 'report-data');

  // Another teacher is refused the report; so is the student who played.
  const other = await account(browser, { accountType: 'teacher' });
  await other.page.goto(gameUrl.replace(/^https?:\/\/[^/]+/, ''));
  await expect(other.page.getByRole('heading', { name: 'Report not found' })).toBeVisible();
  await ada.page.goto(gameUrl.replace(/^https?:\/\/[^/]+/, ''));
  await expect(ada.page.getByRole('heading', { name: 'Report not found' })).toBeVisible();

  // Delete the report.
  await page.goto(gameUrl);
  await page.getByRole('button', { name: 'Delete this report' }).click();
  await page.getByRole('dialog', { name: 'Delete this report?' }).getByRole('button', { name: 'Delete report' }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByText('1 game hosted.')).toBeVisible();

  expect(errors).toEqual([]);
  expect(guestErrors).toEqual([]);
  await guestContext.close();
});
