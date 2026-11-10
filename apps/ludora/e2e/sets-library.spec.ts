import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { CSRF, account, watchErrors } from './helpers.ts';

/* The set editor's tools and the library around a set, driven as a teacher would. */

const SHOTS = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const axe = async (page: Page, include = 'main') => {
  const r = await new AxeBuilder({ page }).include(include).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
};

const QUESTIONS = [
  { id: 'q1', type: 'mcq', prompt: 'What is $3/4$ of 20?', choices: [{ id: 'a', text: '12' }, { id: 'b', text: '15' }, { id: 'c', text: '16' }], correct: 'b' },
  { id: 'q2', type: 'blanks', prompt: 'Fill in the blanks.', text: 'Plants need [sunlight] and [water].' },
  { id: 'q3', type: 'sort', prompt: 'Sort these.', groups: [{ id: 'm', label: 'Mammals' }, { id: 'b', label: 'Birds' }], items: [{ id: 'd', text: 'Dog', group: 'm' }, { id: 'o', text: 'Owl', group: 'b' }, { id: 'c', text: 'Cat', group: 'm' }, { id: 'h', text: 'Hen', group: 'b' }] },
  { id: 'q4', type: 'poll', prompt: 'Favourite season?', choices: [{ id: 's', text: 'Summer' }, { id: 'w', text: 'Winter' }] },
];

test('the editor checks a set, tries a question, writes starters, edits in bulk, undoes and saves itself', async ({ browser, browserName }) => {
  const teacher = await account(browser, { accountType: 'teacher' });
  const page = teacher.page;
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  const made = await page.request.post('/api/sets', { headers: CSRF, data: { title: 'Mixed bag', subject: 'science', visibility: 'private', questions: QUESTIONS } });
  expect(made.ok(), await made.text()).toBe(true);
  const id = (await made.json()).set.id as string;
  await page.goto(`/sets/${id}/edit`);
  await expect(page.getByRole('heading', { name: 'Edit question set' })).toBeVisible();
  await axe(page);
  await shot(page, 'editor-desktop');

  // Health check: the poll keeps the set out of no mode, but some modes leave it out.
  await page.getByRole('button', { name: 'Health check' }).click();
  const health = page.getByRole('dialog', { name: 'Set health check' });
  await expect(health.getByRole('heading', { name: /^Plays in \d+ of \d+ game modes$/ })).toBeVisible();
  await expect(health.getByText(/cannot show polls/).first()).toBeVisible();
  await axe(page, '[role="dialog"]');
  await shot(page, 'health-dialog');
  await page.keyboard.press('Escape');

  // Try a question as a player: the sort question, sorted wrong once, gets part marks.
  await page.getByRole('button', { name: 'Try question 3 as a player' }).click();
  const tryDialog = page.getByRole('dialog', { name: 'Try this question' });
  for (const [item, group] of [['Dog', 'Mammals'], ['Owl', 'Birds'], ['Cat', 'Mammals'], ['Hen', 'Mammals']] as const) {
    await tryDialog.getByRole('button', { name: item, exact: true }).click();
    await tryDialog.getByRole('button', { name: new RegExp(`^(Put ${item} in )?${group}`) }).click();
  }
  await tryDialog.getByRole('button', { name: 'Lock in groups' }).click();
  await expect(tryDialog.getByText('Partly right (75%)')).toBeVisible();
  await axe(page, '[role="dialog"]');
  await shot(page, 'try-dialog');
  await page.keyboard.press('Escape');

  // Starters: the 7 times table, as choices.
  await page.getByRole('button', { name: 'Starters' }).click();
  const starters = page.getByRole('dialog', { name: 'Starters' });
  for (const t of ['2', '5', '10']) await starters.locator('label').filter({ hasText: new RegExp(`^${t} times table$`) }).click();
  await starters.locator('label').filter({ hasText: /^7 times table$/ }).click();
  await starters.getByLabel('How many questions, at most').fill('5');
  await expect(starters.getByText('5 questions ready.')).toBeVisible();
  await axe(page, '[role="dialog"]');
  await starters.getByRole('button', { name: 'Add 5 questions' }).click();
  await expect(page.getByRole('heading', { name: /Questions/ }).getByText('9')).toBeVisible();

  // Undo takes the starter questions out again, redo puts them back.
  await page.getByRole('toolbar', { name: 'Question tools' }).getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('heading', { name: /Questions/ }).getByText('4')).toBeVisible();
  await page.getByRole('toolbar', { name: 'Question tools' }).getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByRole('heading', { name: /Questions/ }).getByText('9')).toBeVisible();

  // Bulk edit: tick two and give them 45 seconds.
  await page.getByLabel('Tick question 1 to change several at once').check();
  await page.getByLabel('Tick question 2 to change several at once').check();
  const bulk = page.getByRole('region', { name: 'Change the ticked questions' });
  await expect(bulk.getByText('2 questions ticked')).toBeVisible();
  await bulk.getByLabel('Time limit in seconds').fill('45');
  await bulk.getByRole('button', { name: 'Set time limit' }).click();
  await shot(page, 'bulk-bar');

  // The set saves itself, and the server has what the editor shows.
  await expect(page.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible({ timeout: 15_000 });
  const saved = await (await page.request.get(`/api/sets/${id}`)).json();
  expect(saved.questions).toHaveLength(9);
  expect(saved.questions.slice(0, 2).map((q: { timeLimitSec?: number }) => q.timeLimitSec)).toEqual([45, 45]);
  expect(saved.questions.slice(4).every((q: { prompt: string }) => /7/.test(q.prompt))).toBe(true);

  // Keyboard: the shortcuts sheet, Alt+N for a new question, Alt+arrows between questions.
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('Shift+Slash');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await axe(page, '[role="dialog"]');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+KeyN');
  await expect(page.getByRole('heading', { name: /Questions/ }).getByText('10')).toBeVisible();
  await page.getByRole('button', { name: 'Collapse all' }).click();
  await page.locator('#q-q1-header').focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.locator('#q-q2-header')).toBeFocused();

  // Drag a question by its handle onto another (a mouse convenience beside the arrow buttons).
  if (browserName === 'chromium') {
    const handle = page.locator('#q-q3 [title^="Drag to move"]');
    await handle.dragTo(page.locator('#q-q1'));
    await expect(page.locator('ol > li[id^="q-"]').first()).toHaveAttribute('id', 'q-q3');
  }

  // The phone layout has no sideways scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, 'editor-phone');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('a teacher files, stars, shares, prints, bins and restores a set', async ({ browser }) => {
  const owner = await account(browser, { accountType: 'teacher', displayName: 'Mr Lee' });
  const colleague = await account(browser, { accountType: 'teacher', displayName: 'Ms Shah' });
  const page = owner.page;
  const errors = watchErrors(page);
  const made = await page.request.post('/api/sets', { headers: CSRF, data: { title: 'Habitats quiz', subject: 'science', gradeBand: 'Year 5', topic: 'Habitats', visibility: 'private', questions: QUESTIONS } });
  const id = (await made.json()).set.id as string;
  await page.goto(`/sets/${id}`);
  await expect(page.getByRole('link', { name: 'Host this' })).toHaveAttribute('href', `/host?set=${id}`);
  await page.getByRole('button', { name: 'Add to favourites' }).click();
  await expect(page.getByRole('button', { name: 'Take out of favourites' })).toBeVisible();
  await page.getByRole('button', { name: 'Put in a folder' }).click();
  await page.getByLabel('Folder name').fill('Term 1');
  await page.getByRole('dialog', { name: 'Folder' }).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Change folder' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How it has gone' })).toBeVisible();
  await axe(page);
  await shot(page, 'set-page');

  // Share: a co-editor by username, and a private link.
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const share = page.getByRole('dialog', { name: 'Share this set' });
  await share.getByLabel("Teacher's username").fill(colleague.username);
  await share.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(share.getByText('Ms Shah')).toBeVisible();
  await share.getByRole('button', { name: 'Make a share link' }).click();
  const link = await share.getByLabel('Share link').inputValue();
  expect(link).toMatch(/\/sets\/shared\/[A-Za-z0-9_-]+$/);
  await axe(page, '[role="dialog"]');
  await shot(page, 'share-dialog');
  await page.keyboard.press('Escape');

  // The colleague sees the set as a co-editor, and the link's page lets them copy it.
  await colleague.page.goto(`/sets/${id}`);
  await expect(colleague.page.getByText('You are a co-editor')).toBeVisible();
  await colleague.page.goto(new URL(link).pathname);
  await expect(colleague.page.getByText('Shared with you by Mr Lee')).toBeVisible();
  await axe(colleague.page);
  await colleague.page.getByRole('button', { name: 'Copy to my sets' }).click();
  await expect(colleague.page).toHaveURL(/\/sets\/[0-9a-f-]+\/edit/);

  // The library: my sets, filtered by folder, favourites and year level.
  await page.goto('/library?scope=mine');
  await page.getByLabel('Folder').selectOption('Term 1');
  await expect(page.getByRole('link', { name: /Habitats quiz/ })).toBeVisible();
  await page.getByRole('button', { name: 'Favourites' }).click();
  await expect(page.getByRole('link', { name: /Habitats quiz/ })).toBeVisible();
  await page.getByLabel('Year level').selectOption('Year 6');
  await expect(page.getByText('Nothing matches')).toBeVisible();
  await page.getByRole('button', { name: 'Clear the search' }).click();
  await expect(page.getByRole('link', { name: /Habitats quiz/ })).toBeVisible();
  await axe(page);
  await shot(page, 'library-mine');

  // Print: the worksheet hides the answers; the answer key shows them.
  await page.goto(`/sets/${id}/print`);
  await expect(page.getByRole('heading', { name: 'Habitats quiz' })).toBeVisible();
  await expect(page.getByText('Name ______________________________')).toBeVisible();
  await expect(page.getByText(/^Answer: /)).toHaveCount(0);
  await axe(page);
  await shot(page, 'print-worksheet');
  await page.getByRole('radio', { name: 'Answer key' }).or(page.getByRole('button', { name: 'Answer key' })).first().click();
  await expect(page.getByText('Answer: 15', { exact: true })).toBeVisible();
  await shot(page, 'print-key');

  // The bin: delete, see it there, restore it.
  await page.goto(`/sets/${id}/edit`);
  await page.getByRole('button', { name: 'Delete set' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Move to the bin' }).click();
  await expect(page).toHaveURL(/\/library/);
  await page.goto('/sets/bin');
  await expect(page.getByRole('heading', { name: 'Habitats quiz' })).toBeVisible();
  await expect(page.getByText(/Removed for good in (29|30) days\./)).toBeVisible();
  await axe(page);
  await shot(page, 'bin');
  await page.getByRole('button', { name: 'Restore Habitats quiz' }).click();
  await expect(page.getByText('The bin is empty')).toBeVisible();
  expect((await page.request.get(`/api/sets/${id}`)).status()).toBe(200);
  expect(errors).toEqual([]);
});
