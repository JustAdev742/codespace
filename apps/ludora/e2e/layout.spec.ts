import { expect, test } from '@playwright/test';
import { account, watchErrors } from './helpers.ts';

const PAGES = ['/', '/play', '/host', '/modes', '/library', '/shop', '/collection', '/locker', '/quests', '/settings'];

test('main pages fit a 360px phone, have one main heading and log no errors', async ({ browser }) => {
  const p = await account(browser);
  await p.page.setViewportSize({ width: 360, height: 780 });
  const errors = watchErrors(p.page);
  for (const path of PAGES) {
    await p.page.goto(path);
    await p.page.waitForLoadState('networkidle');
    const overflow = await p.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
    await expect(p.page.locator('h1'), `${path} needs exactly one h1`).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});
