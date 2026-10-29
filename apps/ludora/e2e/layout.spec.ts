import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { account, watchErrors } from './helpers.ts';

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
    const axe = await new AxeBuilder({ page: p.page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`), `${path} accessibility`).toEqual([]);
  }
  expect(errors).toEqual([]);
});
