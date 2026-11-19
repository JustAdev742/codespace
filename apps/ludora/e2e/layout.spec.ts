import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { account, settled, watchErrors } from './helpers.ts';

const PAGES = ['/', '/play', '/host', '/modes', '/library', '/shop', '/collection', '/locker', '/quests', '/friends', '/leaderboards', '/me', '/settings', '/privacy', '/terms'];

test('main pages fit a 360px phone, have one main heading, pass automated accessibility checks and log no errors', async ({ browser }) => {
  // Fifteen pages, each scanned by axe: more than the default allows in the slower engines.
  test.setTimeout(180_000);
  const p = await account(browser);
  await p.page.setViewportSize({ width: 360, height: 780 });
  const errors = watchErrors(p.page);
  for (const path of PAGES) {
    await p.page.goto(path);
    await p.page.waitForLoadState('networkidle');
    const overflow = await p.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
    await expect(p.page.locator('h1'), `${path} needs exactly one h1`).toHaveCount(1);
    // WCAG 2.2 A and AA rules that a machine can check: contrast, names, labels, structure.
    await settled(p.page);
    const axe = await new AxeBuilder({ page: p.page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`), `${path} accessibility`).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test('every section in the navigation says what you do there, and a student’s sidebar fits a 768px-tall laptop', async ({ browser }) => {
  const student = await account(browser, { accountType: 'student' });
  const page = student.page;
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = watchErrors(page);
  await page.goto('/collection');
  const nav = page.getByRole('navigation', { name: 'Main' });
  // Named by the section alone (so tests and voice control find it by its name), described by its line.
  await expect(nav.getByRole('link', { name: 'Game Maker', exact: true })).toHaveAccessibleDescription('Invent a game with code');
  await expect(nav.getByRole('link', { name: 'Host a game', exact: true })).toHaveAccessibleDescription('Put a code on the board');
  await expect(nav.getByRole('link', { name: 'Collection', exact: true })).toHaveAttribute('aria-current', 'page');
  // Grouped under plain headings.
  for (const group of ['Play', 'Make things', 'Glims and rewards', 'With others']) await expect(nav.getByRole('list', { name: group })).toBeVisible();
  // Every section has its line.
  for (const link of await nav.getByRole('link').all()) expect(await link.getAttribute('aria-describedby'), await link.innerText()).toBeTruthy();
  // Teachers' sections are not offered to a student.
  await expect(nav.getByRole('link', { name: 'Lessons' })).toHaveCount(0);
  // The whole sidebar shows at 1366x768, in a school's look too: there the school's logo starts the header (D60).
  const extra = await page.locator('aside').evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(extra, 'the sidebar scrolls').toBeLessThanOrEqual(0);
  // With room to spare for one more row: a school with houses gives every student a School section.
  const spare = await page.locator('aside').evaluate((el) => el.getBoundingClientRect().bottom - el.querySelector('nav')!.getBoundingClientRect().bottom);
  expect(spare, 'room under the last section for one more').toBeGreaterThanOrEqual(36);
  if (process.env.E2E_SCHOOL_THEME) await expect(page.getByRole('banner').getByRole('img', { name: /School$/ })).toBeVisible();
  // Settings is the gear by the logo.
  await page.locator('aside').getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  // The phone's More sheet lists the same sections with the same lines, each 44px tall or more.
  await page.setViewportSize({ width: 360, height: 740 });
  await page.getByRole('button', { name: 'More' }).click();
  const sheet = page.getByRole('dialog', { name: 'Menu' });
  await expect(sheet.getByRole('link', { name: 'Game Maker', exact: true })).toHaveAccessibleDescription('Invent a game with code');
  await expect(sheet.getByRole('link', { name: 'Settings', exact: true })).toHaveAccessibleDescription('Sound, reading help and more');
  for (const link of await sheet.getByRole('link').all()) expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(errors).toEqual([]);
});
