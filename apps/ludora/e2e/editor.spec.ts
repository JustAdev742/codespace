import { expect, test } from '@playwright/test';
import { CSRF, account, watchErrors } from './helpers.ts';

// A 3 x 2 PNG drawn by Chromium: amber with a violet stripe.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAF0lEQVR4AWL6v0Hhv7XSsv8gmokBCQAAAAD//x3OmzEAAAAGSURBVAMAlBkHo5cp4fcAAAAASUVORK5CYII=', 'base64');

test('a teacher writes a set with a picture in the editor, and players see the picture', async ({ browser }) => {
  const teacher = await account(browser, { accountType: 'teacher', displayName: 'Mr Okafor' });
  const errors = watchErrors(teacher.page);
  const page = teacher.page;
  await page.goto('/sets/new');
  await page.getByLabel('Title').fill('Stripes and colours');
  await page.getByLabel('Subject').selectOption('arts');
  await page.getByLabel('Question', { exact: true }).fill('Which colour is the middle stripe?');
  const choices = page.locator('input[aria-label^="Choice"], input[id*="choice"]');
  for (const [i, text] of ['Violet', 'Amber', 'Mint', 'Coral'].entries()) await choices.nth(i).fill(text);
  // The checkbox is see-through but covers its round button, so it can be checked like any other.
  await page.getByLabel('Choice A is correct').check();
  // The "Add an image" button opens this input.
  await page.locator('input[type=file]').first().setInputFiles({ name: 'stripes.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByLabel('Image description')).toBeFocused();
  await page.getByLabel('Image description').fill('Three stripes: amber, violet, amber');
  // Two more questions, so Classic can be played.
  // The question type cards below the list each add a question of that type.
  for (const [prompt, truth] of [['Amber is a colour.', 'True'], ['Violet is a fruit.', 'False']] as const) {
    await page.getByRole('button', { name: /^True or false/ }).last().click();
    await page.getByLabel('Statement', { exact: true }).last().fill(prompt);
    // The radio itself is visually hidden; a person clicks its label. (A forced click on the hidden radio
    // skips the checks that it is still and uncovered, so the sticky save bar or a late scroll could take it.)
    await page.locator('label').filter({ has: page.getByRole('radio', { name: truth }) }).last().click();
    await expect(page.getByRole('radio', { name: truth }).last()).toBeChecked();
  }
  await page.getByRole('button', { name: /^Save/ }).first().click();
  await expect(page).toHaveURL(/\/sets\/[0-9a-f-]+\/edit/);
  const setId = page.url().split('/sets/')[1]!.split('/')[0]!;
  const saved = await (await page.request.get(`/api/sets/${setId}`)).json();
  expect(saved.questions[0].media).toMatchObject({ kind: 'image', alt: 'Three stripes: amber, violet, amber' });
  const image = await page.request.get(saved.questions[0].media.url);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toBe('image/png');

  const room = await page.request.post('/api/rooms', { headers: CSRF, data: { setId, modeId: 'classic', common: { shuffleQuestions: false } } });
  expect(room.ok(), await room.text()).toBe(true);
  const { code } = await room.json();
  await page.goto(`/room/${code}`);
  const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const player = await playerContext.newPage();
  await player.goto(`/join/${code}`);
  await player.getByLabel('Your name').fill('Picture Fan');
  await player.getByRole('button', { name: 'Join game' }).click();
  await expect(player.getByText('You are in', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.getByRole('button', { name: /Next|Skip ahead/ }).first().click();
  await expect(player.getByRole('heading', { name: 'Which colour is the middle stripe?' })).toBeVisible();
  await expect(player.getByRole('img', { name: 'Three stripes: amber, violet, amber' })).toBeVisible();
  expect(errors).toEqual([]);
});
