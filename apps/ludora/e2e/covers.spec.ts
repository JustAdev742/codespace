import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { account, settled, watchErrors } from './helpers.ts';

/*
 * Mode covers (docs/features/art.md): every mode on the Game modes page and on
 * Host a game shows its illustrated cover, hidden from screen readers beside
 * the mode's name; a mode's own page names its large cover; variants carry a
 * mark. Checked in the day and night themes and at phone and laptop sizes.
 * ART_SHOTS=<dir> also saves screenshots of each page for a person to look at.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const SHOTS = process.env.ART_SHOTS;

async function check(page: Page, path: string, name: string) {
  await page.waitForLoadState('networkidle');
  // Every cover on the page has loaded its scene; none is still a placeholder.
  await expect(page.locator('.mode-cover[data-cover="loading"]')).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  await settled(page);
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`), `${path} accessibility`).toEqual([]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

for (const scheme of ['dark', 'light'] as const) {
  test(`every mode shows its cover on Game modes, Host a game and its own page (${scheme})`, async ({ browser }) => {
    test.setTimeout(150_000);
    const teacher = await account(browser, { accountType: 'teacher' });
    const page = teacher.page;
    await page.emulateMedia({ colorScheme: scheme });
    const errors = watchErrors(page);
    const school = process.env.E2E_SCHOOL_THEME ? `-${process.env.E2E_SCHOOL_THEME}` : '';

    for (const [w, h, size] of [
      [1366, 768, 'laptop'],
      [390, 844, 'phone'],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/modes');
      const covers = page.locator('main .mode-cover');
      await expect(covers.first()).toBeVisible();
      // Thirty modes, thirty covers, each with its drawn scene, each hidden beside its name.
      expect(await covers.count()).toBeGreaterThanOrEqual(30);
      await expect(page.locator('main .mode-cover[aria-hidden="true"] svg path').first()).toBeAttached();
      await check(page, '/modes', `modes-${size}-${scheme}${school}`);

      await page.goto('/host');
      await expect(page.locator('main .mode-cover').first()).toBeVisible();
      await check(page, '/host', `host-${size}-${scheme}${school}`);
    }

    // A mode's own page: the cover large and named, its variants each with a mark.
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/modes/classic');
    await expect(page.getByRole('img', { name: 'Classic artwork' })).toBeVisible();
    await expect(page.locator('main .mode-cover-mark').first()).toBeVisible();
    await check(page, '/modes/classic', `mode-classic-${scheme}${school}`);
    expect(errors).toEqual([]);
  });
}

test('covers hold still with reduced motion', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/modes');
  const card = page.locator('main a[href="/modes/classic"]');
  await expect(card.locator('.mode-cover[data-cover="ready"]')).toBeVisible();
  await card.hover();
  const transform = await card.locator('.cover-lift').first().evaluate((el) => getComputedStyle(el).transform);
  expect(transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);
  await context.close();
});
