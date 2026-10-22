import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { CSRF, account, watchErrors } from './helpers.ts';

/*
 * Sign-in help (D38): a student who lost their recovery code gets a new one
 * from their teacher, sets a new password with it and is told who made it.
 */

test('a teacher makes a recovery code for a student, who uses it to get back in', async ({ browser }) => {
  const teacher = await account(browser, { accountType: 'teacher', displayName: 'Mr Okafor' });
  const student = await account(browser, { accountType: 'student', displayName: 'Ada Bright' });
  const errors = watchErrors(teacher.page);
  const created = await teacher.page.request.post('/api/classes', { headers: CSRF, data: { name: 'Year 6 History' } });
  expect(created.ok(), await created.text()).toBe(true);
  const { class: cls } = await created.json();
  expect((await student.page.request.post('/api/classes/join', { headers: CSRF, data: { code: cls.joinCode } })).ok()).toBe(true);

  await teacher.page.goto(`/classes/${cls.id}`);
  await teacher.page.getByRole('tab', { name: /Students/ }).click();
  await teacher.page.getByRole('button', { name: 'Sign-in help for Ada Bright' }).click();
  const dialog = teacher.page.getByRole('dialog', { name: 'Help Ada Bright sign in' });
  await dialog.getByRole('button', { name: 'Make a recovery code' }).click();
  await expect(dialog.getByText(student.username)).toBeVisible();
  const code = (await dialog.locator('code').innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const axe = await new AxeBuilder({ page: teacher.page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();

  // The student, signed out on another device, gets back in with it.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/signin');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  // The sign-in form has a Username field too: wait for the recovery page.
  await expect(page.getByRole('heading', { name: 'Get back in' })).toBeVisible();
  await page.getByLabel('Username').fill(student.username);
  await page.getByLabel('Recovery code').fill(code);
  await page.getByLabel('New password').fill('a fresh start passphrase');
  await page.getByRole('button', { name: 'Reset password' }).click();
  const saved = page.getByRole('dialog', { name: 'Save your recovery code' });
  await expect(saved).toBeVisible();
  await saved.getByRole('checkbox').check();
  await saved.getByRole('button', { name: 'Continue' }).click();
  // Told who made the code.
  const notice = page.getByRole('dialog', { name: 'Your teacher made you a new recovery code' });
  await expect(notice).toBeVisible();
  await expect(notice.getByText(/Mr Okafor \(Year 6 History\) made a new recovery code for your account/)).toBeVisible();
  await notice.getByRole('button', { name: 'I understand' }).click();
  await expect(notice).toBeHidden();
  expect(errors).toEqual([]);
});
