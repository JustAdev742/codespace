import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { account, watchErrors } from './helpers.ts';

/*
 * AI question drafts in the set editor. The end-to-end server has no Anthropic
 * key, so the two AI endpoints are answered in the browser here (the server
 * side is tested in server/test/ai.test.ts with a stand-in drafter). Saving
 * the set goes to the real server, so the drafts must pass its question rules.
 */

const DRAFTS = [
  { id: 'qa1', type: 'mcq', prompt: 'What is it called when water vapour turns into liquid?', choices: [{ id: 'a', text: 'Evaporation' }, { id: 'b', text: 'Condensation' }, { id: 'c', text: 'Melting' }], correct: 'b', explanation: 'Cooling vapour condenses into droplets.' },
  { id: 'qa2', type: 'truefalse', prompt: 'Clouds are made of tiny water droplets.', correct: true },
  { id: 'qa3', type: 'short', prompt: 'What falls from clouds as rain, snow or hail?', accepted: ['Precipitation'], explanation: 'Rain, snow and hail are all precipitation.' },
];

const axe = (page: import('@playwright/test').Page) => new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();

test('a teacher drafts questions with AI, keeps two of them and saves the set', async ({ browser }) => {
  const teacher = await account(browser, { accountType: 'teacher', displayName: 'Ms Achebe' });
  const page = teacher.page;
  const errors = watchErrors(page);

  // Switched off on this server: no button.
  await page.goto('/sets/new');
  await expect(page.getByRole('button', { name: 'Import' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Draft with AI' })).toHaveCount(0);

  let sent: Record<string, unknown> | null = null;
  await page.route('**/api/ai/drafts/status', (r) => r.fulfill({ json: { available: true, remainingToday: 30, limitToday: 30 } }));
  await page.route('**/api/ai/drafts', async (r) => {
    sent = r.request().postDataJSON();
    await r.fulfill({ json: { questions: DRAFTS, dropped: 1, remainingToday: 29 } });
  });
  await page.reload();
  await page.getByLabel('Title').fill('The water cycle');
  await page.getByLabel('Subject').selectOption('science');
  await page.getByRole('button', { name: 'Draft with AI' }).click();

  const dialog = page.getByRole('dialog', { name: 'Draft questions with AI' });
  await expect(dialog.getByText('You can ask for drafts 30 more times today')).toBeVisible();
  // The topic is required.
  await dialog.getByRole('button', { name: 'Draft questions' }).click();
  await expect(dialog.getByText('Say what the questions should be about.')).toBeVisible();
  expect(sent).toBeNull();
  await dialog.getByLabel('Topic').fill('The water cycle');
  await dialog.getByLabel('How many questions').selectOption('5');
  await dialog.getByLabel('Type the answer').check();
  expect((await axe(page)).violations).toEqual([]);

  await dialog.getByRole('button', { name: 'Draft questions' }).click();
  await expect(dialog.getByText('3 drafts ready')).toBeVisible();
  await expect(dialog.getByText("1 draft broke Ludora's question rules and was left out.")).toBeVisible();
  expect(sent).toEqual({ topic: 'The water cycle', level: '9-11', count: 5, types: ['mcq', 'truefalse', 'short'], language: 'en' });
  await expect(dialog.getByText('Accepted: Precipitation')).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
  // Closing by accident keeps the drafts: asking again would use up a request.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Draft with AI' }).click();
  await expect(dialog.getByText('3 drafts ready')).toBeVisible();

  await dialog.getByLabel(/^Clouds are made of tiny water droplets/).uncheck();
  await dialog.getByRole('button', { name: 'Add 2 questions' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Added 2 questions')).toBeVisible();

  await page.getByRole('button', { name: /^Save/ }).first().click();
  await expect(page).toHaveURL(/\/sets\/[0-9a-f-]+\/edit/);
  const setId = page.url().split('/sets/')[1]!.split('/')[0]!;
  const saved = await (await page.request.get(`/api/sets/${setId}`)).json();
  expect(saved.questions.map((q: { prompt: string }) => q.prompt)).toEqual([DRAFTS[0]!.prompt, DRAFTS[2]!.prompt]);
  expect(saved.questions[0]).toMatchObject({ type: 'mcq', correct: 'b', explanation: 'Cooling vapour condenses into droplets.' });
  expect(saved.questions[1]).toMatchObject({ type: 'short', accepted: ['Precipitation'] });
  expect(errors).toEqual([]);
});
