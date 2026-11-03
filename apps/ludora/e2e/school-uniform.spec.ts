import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { CSRF, account } from './helpers.ts';

/*
 * Year-group uniforms on The Hills Grammar School's copy (E2E_SCHOOL_THEME=hills-grammar; CI runs
 * this file in that look). A player sets their year in Settings; a guest picks theirs on the join
 * screen; everyone in the lobby sees each player in their own year's uniform.
 */
test('players wear the uniform for their year, set in Settings or on the join screen', async ({ browser }) => {
  test.skip(process.env.E2E_SCHOOL_THEME !== 'hills-grammar', 'Only on a copy with the Hills Grammar look.');
  const host = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera' });
  const set = await host.page.request.post('/api/sets', {
    headers: CSRF,
    data: { title: 'Science starters', description: 'Three quick ones', subject: 'science', visibility: 'private', questions: [{ id: 'q1', type: 'truefalse', prompt: 'The Sun is a star.', correct: true }, { id: 'q2', type: 'truefalse', prompt: 'Spiders are insects.', correct: false }, { id: 'q3', type: 'truefalse', prompt: 'Water boils at 100 °C at sea level.', correct: true }] },
  });
  expect(set.ok(), await set.text()).toBe(true);
  const room = await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId: (await set.json()).set.id, modeId: 'classic' } });
  expect(room.ok(), await room.text()).toBe(true);
  const { code } = await room.json();
  // The host's big screen is open first, as in a lesson; a lobby nobody is hosting closes.
  await host.page.goto(`/room/${code}`);
  await expect(host.page.getByRole('button', { name: 'Start game' })).toBeVisible();

  // An account sets Year 9 and the grey blazer in Settings; the preview changes as they choose.
  const senior = await account(browser, { displayName: 'Sam Lee' });
  await senior.page.goto('/settings');
  const panel = senior.page.locator('#uniform');
  await expect(panel.getByRole('heading', { name: 'School uniform' })).toBeVisible();
  await panel.getByLabel('School year').selectOption({ label: 'Year 9' });
  await expect(panel.getByText('Green blazer, red jumper and striped tie')).toBeVisible();
  await panel.getByRole('radio', { name: 'Grey blazer' }).click();
  await expect(panel.getByText('Grey blazer, red jumper and striped tie')).toBeVisible();
  await expect(panel.locator('svg[data-uniform="senior-grey"]')).toBeVisible();
  const axe = await new AxeBuilder({ page: senior.page }).include('#uniform').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations).toEqual([]);
  // Saved to the account: still there after a reload.
  await senior.page.reload();
  await expect(senior.page.locator('#uniform').getByLabel('School year')).toHaveValue('9');
  await expect(senior.page.locator('#uniform').getByRole('radio', { name: 'Grey blazer' })).toHaveAttribute('aria-checked', 'true');

  // A guest picks Kindergarten on the join screen: the polo, so no blazer to choose.
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await guestContext.newPage();
  await guest.goto(`/join/${code}`);
  await guest.getByLabel('Your name').fill('Little Wren');
  await guest.getByLabel('School year').selectOption({ label: 'Kindergarten' });
  await expect(guest.getByText('Red polo and bucket hat')).toBeVisible();
  await expect(guest.getByRole('radio', { name: 'Grey blazer' })).toHaveCount(0);
  await guest.getByRole('button', { name: 'Join game' }).click();
  await expect(guest.getByText('You are in', { exact: true })).toBeVisible();

  await senior.page.goto(`/join/${code}`);
  // Their year comes from Settings, so the join screen does not ask again.
  await expect(senior.page.getByLabel('School year')).toHaveCount(0);
  await senior.page.getByRole('button', { name: 'Join game' }).click();
  await expect(senior.page.getByText('You are in', { exact: true })).toBeVisible();

  // On the big screen, each wears their own: Year 9 in the grey blazer, Kindergarten in the polo.
  const seat = (name: string) => host.page.locator('li').filter({ has: host.page.getByText(name, { exact: true }) }).locator('svg[data-uniform]');
  await expect(seat('Little Wren')).toHaveAttribute('data-uniform', 'kinder');
  await expect(seat('Sam Lee')).toHaveAttribute('data-uniform', 'senior-grey');
  await guestContext.close();
});
