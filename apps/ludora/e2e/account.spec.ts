import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { account, watchErrors } from './helpers.ts';

test('a player downloads their data, then deletes their account from Settings', async ({ browser }) => {
  const p = await account(browser);
  const errors = watchErrors(p.page);
  await p.page.goto('/settings#your-data');
  await expect(p.page.getByRole('heading', { name: 'Your data' })).toBeVisible();

  const [download] = await Promise.all([p.page.waitForEvent('download'), p.page.getByRole('link', { name: 'Download my data' }).click()]);
  expect(download.suggestedFilename()).toBe(`ludora-data-${p.username}.json`);
  const file = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(file.account.username).toBe(p.username);
  expect(JSON.stringify(file)).not.toMatch(/hash|token/i);

  await p.page.getByRole('button', { name: 'Delete my account' }).click();
  const dialog = p.page.getByRole('dialog', { name: 'Delete your account?' });
  await expect(dialog).toBeVisible();
  const axe = await new AxeBuilder({ page: p.page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  const confirm = dialog.getByRole('button', { name: 'Delete my account' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Type your username/).fill(p.username);
  await dialog.getByLabel('Password').fill('not the password');
  await confirm.click();
  // The server's refusal is shown on the field, and nothing is deleted.
  await expect(dialog.getByText('Your password is not right.').first()).toBeVisible();
  await dialog.getByLabel('Password').fill(p.password);
  await confirm.click();

  await expect(p.page.getByText('Your account was deleted.')).toBeVisible();
  await expect(p.page).toHaveURL(/\/$/);
  expect((await (await p.page.request.get('/api/auth/me')).json()).user).toBeNull();
  // The wrong password was refused with a 400, which the browser logs; that is the only error.
  expect(errors.filter((e) => !/status of 400/.test(e))).toEqual([]);
});
