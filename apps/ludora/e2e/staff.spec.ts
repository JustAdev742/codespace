import { expect, test } from '@playwright/test';
import { account, operator, watchErrors } from './helpers.ts';

test('a staff warning reaches the player, and is in the audit log', async ({ browser }) => {
  const staff = await account(browser, { displayName: 'Lead Moderator' });
  const player = await account(browser, { displayName: 'Skye Marsh' });
  expect(operator('grant', staff.username, 'superadmin', '--reason', 'e2e')).toContain('Granted');
  const errors = watchErrors(staff.page);

  await staff.page.goto('/staff/users');
  await staff.page.getByLabel('Search accounts').fill(player.username);
  await staff.page.getByRole('link', { name: 'Skye Marsh' }).click();
  await staff.page.getByRole('button', { name: 'Warn' }).click();
  await staff.page.getByLabel('Message to the player').fill('Please keep your display name friendly.');
  await staff.page.getByRole('dialog').getByRole('button', { name: 'Warn' }).click();
  await expect(staff.page.getByText('Warned.')).toBeVisible();

  await player.page.goto('/');
  const notice = player.page.getByRole('dialog');
  await expect(notice.getByText('Please keep your display name friendly.')).toBeVisible();
  await notice.getByRole('button', { name: 'I understand' }).click();
  await expect(notice).toBeHidden();

  const audit = await (await staff.page.request.get('/api/admin/audit?action=user.warn')).json();
  expect(audit.entries[0]).toMatchObject({ action: 'user.warn', targetId: player.userId, reason: 'Please keep your display name friendly.' });
  // The player cannot open the staff area or its API.
  expect((await player.page.request.get('/api/admin/users')).status()).toBe(403);
  expect(errors).toEqual([]);
});

const SECTIONS = [
  '',
  'users',
  'reports',
  'content',
  'rooms',
  'modes',
  'economy',
  'economy?tab=ledger',
  'economy?tab=rules',
  'economy?tab=currencies',
  'economy?tab=grant',
  'catalog',
  'catalog?tab=collections',
  'catalog?tab=lanterns',
  'shop',
  'events',
  'flags',
  'testing',
  'system',
  'audit',
];

test('every staff section loads for a super administrator, fits a phone and logs no errors', async ({ browser }) => {
  // Forty page loads (twenty sections at two widths): more than the default allowance on a busy machine.
  test.setTimeout(180_000);
  const staff = await account(browser, { displayName: 'Night Shift' });
  expect(operator('grant', staff.username, 'superadmin', '--reason', 'e2e')).toContain('Granted');
  const errors = watchErrors(staff.page);
  const failed: string[] = [];
  staff.page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) failed.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  for (const width of [390, 1366]) {
    await staff.page.setViewportSize({ width, height: 900 });
    for (const section of SECTIONS) {
      const path = `/staff/${section}`;
      await staff.page.goto(path);
      await staff.page.waitForLoadState('networkidle');
      await expect(staff.page.locator('h1'), `${path} at ${width}px needs exactly one h1`).toHaveCount(1);
      await expect(staff.page.getByText('Not available to you'), `${path} at ${width}px`).toHaveCount(0);
      const overflow = await staff.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} at ${width}px scrolls sideways`).toBeLessThanOrEqual(0);
    }
  }
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});
