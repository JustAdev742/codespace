import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { CSRF, account, expectFocused, watchErrors } from './helpers.ts';

/*
 * Bugs found in the pages (docs/features/pages-polish.md): signing in that
 * forgot where you were, sign-up errors nobody was taken to, sessions that
 * ended without the page noticing, the dead end on Host for signed-out
 * visitors, and home pages with nothing for teachers and students.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

test('signing in from a page comes back to it, and a signed-in visitor skips the forms', async ({ browser }) => {
  const p = await account(browser);
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto('/leaderboards');
  await page.locator('header').first().getByRole('link', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/signin\?next=%2Fleaderboards$/);
  // The way to sign up keeps the same place.
  await expect(page.getByRole('link', { name: 'Create a free account' })).toHaveAttribute('href', '/signup?next=%2Fleaderboards');
  await page.getByLabel('Username').fill(p.username);
  await page.getByLabel('Password').fill(p.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/leaderboards$/);
  await page.goto('/signin');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/signup?next=/quests');
  await expect(page).toHaveURL(/\/quests$/);
  // Another site is never followed.
  await page.goto('/signin?next=//example.com');
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  expect(errors).toEqual([]);
});

test('sign-up and recovery errors are said in plain words, and focus goes to the first one', async ({ page }) => {
  await page.goto('/signup');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Choose a username.')).toBeVisible();
  await expect(page.getByText('Choose a password.')).toBeVisible();
  await expectFocused(page.getByLabel('Username'));
  // The server's answer lands on its field too.
  await page.getByLabel('Username').fill('ok_name_here');
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true');
  await expectFocused(page.getByLabel('Password'));

  await page.goto('/recover');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByText('Enter your username.')).toBeVisible();
  await expectFocused(page.getByLabel('Username'));
  await expect(page.locator('main, body').first()).not.toContainText('expected string');
});

test('a session that ends shows the signed-out page and says so, rather than a retry that cannot work', async ({ browser }) => {
  const p = await account(browser);
  await p.page.goto('/settings');
  await expect(p.page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  // Signed out somewhere else: the cookie no longer works.
  await p.page.request.post('/api/auth/logout', { headers: CSRF });
  await p.page.getByRole('link', { name: 'Shop' }).first().click();
  await expect(p.page.getByText('You have been signed out. Sign in again to carry on.')).toBeVisible();
  await expect(p.page.getByRole('heading', { name: 'Sign in to shop' })).toBeVisible();
  await expect(p.page.locator('header').first().getByRole('link', { name: 'Sign in' })).toBeVisible();
});

test('a signed-out visitor can host straight away as a guest', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/host');
  await expect(page.getByRole('heading', { name: 'Sign in to host' })).toBeVisible();
  await page.getByRole('button', { name: 'Host as a guest' }).click();
  await expect(page.getByRole('heading', { name: 'Questions' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('home gives a teacher their classes and last game, and a student the assignment to play', async ({ browser }) => {
  const teacher = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera' });
  const student = await account(browser, { accountType: 'student', displayName: 'Ada Bright' });
  const tErrors = watchErrors(teacher.page);
  const sErrors = watchErrors(student.page);
  const set = await teacher.page.request.post('/api/sets', {
    headers: CSRF,
    data: { title: 'Planets', subject: 'science', visibility: 'private', questions: ['Mars is red.', 'Venus is hot.', 'Jupiter is big.', 'Saturn has rings.', 'Earth has a moon.'].map((prompt, i) => ({ id: `q${i}`, type: 'truefalse', prompt, correct: true })) },
  });
  const setId = (await set.json()).set.id;
  const { class: cls } = await (await teacher.page.request.post('/api/classes', { headers: CSRF, data: { name: 'Year 5 Space' } })).json();
  await student.page.request.post('/api/classes/join', { headers: CSRF, data: { code: cls.joinCode } });

  // Before any assignment, the student is caught up.
  await student.page.goto('/');
  await expect(student.page.getByRole('heading', { name: 'From your teacher' })).toBeVisible();
  await expect(student.page.getByText('You are all caught up')).toBeVisible();

  await teacher.page.request.post(`/api/classes/${cls.id}/assignments`, { headers: CSRF, data: { setId, modeId: 'classic', title: 'Planets homework' } });
  await teacher.page.goto('/');
  const teaching = teacher.page.getByRole('region', { name: 'Your teaching' });
  await expect(teaching.getByRole('link', { name: /Year 5 Space/ })).toBeVisible();
  await expect(teaching.getByText('No games hosted yet')).toBeVisible();
  await teaching.getByRole('link', { name: /Make a class/ }).click();
  await expect(teacher.page.getByRole('dialog', { name: 'New class' })).toBeVisible();

  await student.page.reload();
  await expect(student.page.getByText('Planets homework')).toBeVisible();
  const axe = await new AxeBuilder({ page: student.page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await student.page.getByRole('button', { name: 'Play: Planets homework' }).click();
  await expect(student.page).toHaveURL(/\/room\/\d{6}$/);
  expect(tErrors).toEqual([]);
  expect(sErrors).toEqual([]);
});

test('on a phone a teacher reaches sign-in help, and long words never push a page sideways', async ({ browser }) => {
  const teacher = await account(browser, { accountType: 'teacher' });
  const student = await account(browser, { accountType: 'student', displayName: 'Ada Bright' });
  await teacher.page.setViewportSize({ width: 360, height: 780 });
  const { class: cls } = await (await teacher.page.request.post('/api/classes', { headers: CSRF, data: { name: 'Year6ScienceWithAVeryLongNameThatHasNoSpacesAtAll' } })).json();
  await student.page.request.post('/api/classes/join', { headers: CSRF, data: { code: cls.joinCode } });
  await teacher.page.goto(`/classes/${cls.id}`);
  await teacher.page.getByRole('tab', { name: /Students/ }).click();
  // In reach without scrolling sideways: before, it sat in a fifth table column off the right of the screen.
  const help = teacher.page.getByRole('button', { name: 'Sign-in help for Ada Bright' });
  await expect(help).toBeVisible();
  const box = (await help.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(360);

  const long = 'Supercalifragilisticexpialidocious'.repeat(5);
  const set = await teacher.page.request.post('/api/sets', {
    headers: CSRF,
    data: { title: long.slice(0, 80), description: long, subject: 'science', visibility: 'private', questions: [{ id: 'q1', type: 'truefalse', prompt: long, correct: true }] },
  });
  for (const path of [`/sets/${(await set.json()).set.id}`, `/classes/${cls.id}`, '/classes', '/']) {
    await teacher.page.goto(path);
    await teacher.page.waitForLoadState('networkidle');
    const overflow = await teacher.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
});

test('Game Maker tabs point at their panel, and the mode catalogue filters by kind and name', async ({ browser }) => {
  const p = await account(browser);
  await p.page.goto('/games');
  await expect(p.page.getByRole('tabpanel')).toBeVisible();
  const axe = await new AxeBuilder({ page: p.page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await p.page.goto('/modes?kind=party');
  await expect(p.page.getByRole('button', { name: /^Party/ })).toHaveAttribute('aria-pressed', 'true');
  await p.page.getByRole('searchbox', { name: 'Search modes' }).fill('zzzz nothing');
  await expect(p.page.getByRole('heading', { name: 'No modes match' })).toBeVisible();
  await p.page.getByRole('button', { name: 'Show every mode' }).click();
  await expect(p.page).toHaveURL(/\/modes$/);
  await expect(p.page.getByRole('heading', { level: 2, name: 'Classic' })).toBeVisible();
});

test('the library keeps its filters when you open a set and come back, and offers guests only what they can do', async ({ browser }) => {
  const p = await account(browser, { accountType: 'teacher' });
  await p.page.goto('/library');
  await p.page.getByRole('button', { name: 'By Ludora' }).click();
  await p.page.getByPlaceholder('Search sets').fill('capitals');
  await expect(p.page).toHaveURL(/scope=official/);
  await expect(p.page).toHaveURL(/q=capitals/);
  await p.page.getByRole('link', { name: /World Capitals/ }).click();
  await expect(p.page.getByRole('heading', { level: 1, name: 'World Capitals' })).toBeVisible();
  await p.page.goBack();
  await expect(p.page.getByRole('button', { name: 'By Ludora' })).toHaveAttribute('aria-pressed', 'true');
  await expect(p.page.getByPlaceholder('Search sets')).toHaveValue('capitals');

  const guest = await browser.newContext();
  const g = await guest.newPage();
  await g.request.post('/api/auth/guest', { headers: CSRF, data: {} });
  await g.goto('/library?scope=mine');
  await expect(g.getByRole('button', { name: 'My sets' })).toHaveCount(0);
  await expect(g.getByRole('button', { name: 'Everything' })).toHaveAttribute('aria-pressed', 'true');
});

// The search writes to the address a moment after typing. It used to start from a stale copy of the
// address, so a filter chosen just before typing was dropped (seen on CI, where the machine is slower).
test('a filter chosen just before typing a search is kept', async ({ browser, browserName }) => {
  const p = await account(browser, { accountType: 'teacher' });
  await p.page.goto('/library');
  await expect(p.page.getByRole('button', { name: 'By Ludora' })).toBeVisible();
  // Slowing the processor is what made the old bug show every time; only Chromium can do it.
  // The other browsers run the same steps at their own speed.
  const cdp = browserName === 'chromium' ? await p.page.context().newCDPSession(p.page) : null;
  await cdp?.send('Emulation.setCPUThrottlingRate', { rate: 20 });
  // Click and type in the same tick, as a fast hand (or a slow laptop) would.
  await p.page.evaluate(() => {
    (Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'By Ludora') as HTMLButtonElement).click();
    const input = document.querySelector('input[placeholder="Search sets"]') as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(input, 'capitals');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(p.page).toHaveURL(/q=capitals/);
  await cdp?.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await expect(p.page).toHaveURL(/scope=official/);
  await expect(p.page.getByRole('button', { name: 'By Ludora' })).toHaveAttribute('aria-pressed', 'true');
});

test('when the home overview cannot load, it says so once instead of leaving placeholders pulsing', async ({ browser }) => {
  const p = await account(browser);
  await p.page.route('**/api/me/overview', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"code":"internal","message":"Something went wrong."}}' }));
  await p.page.goto('/');
  await expect(p.page.getByText('Your overview could not be loaded.')).toBeVisible({ timeout: 20_000 });
  await expect(p.page.getByText('Your quests will show here once your overview loads.')).toBeVisible();
  await expect(p.page.locator('main .skeleton')).toHaveCount(0);
});
