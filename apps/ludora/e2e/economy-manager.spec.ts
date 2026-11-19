import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { CSRF, operator, uniqueName, watchErrors } from './helpers.ts';

/*
 * The economy manager role and the economy room, class rewards and the Wallet (D58), driven in a
 * real browser against the production build. Screenshots go to ECONOMY_SHOTS when it is set.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SHOTS = process.env.ECONOMY_SHOTS ?? '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string, fullPage = true) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
}

/** A signed-in account in its own context, at a size and with sharp screenshots. */
async function person(browser: Browser, opts: { accountType?: 'player' | 'teacher'; displayName?: string; width?: number } = {}) {
  const context = await browser.newContext({ viewport: { width: opts.width ?? 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const username = uniqueName('e2e');
  const res = await page.request.post('/api/auth/register', { headers: CSRF, data: { username, password: 'a long e2e passphrase', displayName: opts.displayName ?? username, accountType: opts.accountType ?? 'player' } });
  expect(res.ok(), await res.text()).toBe(true);
  const me = await (await page.request.get('/api/auth/me')).json();
  return { context, page, username, userId: me.user.id as string };
}

async function axeClean(page: Page) {
  // Toasts fade in and out, and axe would measure them mid-fade.
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).exclude('[data-sonner-toaster]').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('an economy manager reads the health, previews and undoes a rule, runs a sale, and is kept out of the rest', async ({ browser }) => {
  test.setTimeout(180_000);
  const econ = await person(browser, { displayName: 'Robin Ledger' });
  expect(operator('grant', econ.username, 'economist', '--reason', 'e2e')).toContain('Granted');
  const errors = watchErrors(econ.page);
  const page = econ.page;

  // Health: real numbers with a sentence above each table.
  await page.goto('/staff/economy');
  await expect(page.getByRole('heading', { name: 'Economy', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Day by day' })).toBeVisible();
  await expect(page.getByText(/Players hold [\d,]+ Sparks between them/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How Sparks balances are spread' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await axeClean(page);
  await shot(page, 'economy-health');

  // The staff menu offers the economy and nothing else.
  const staffNav = page.getByRole('navigation', { name: 'Staff' });
  await expect(staffNav.getByRole('link', { name: 'Economy' })).toBeVisible();
  await expect(staffNav.getByRole('link', { name: 'Shop' })).toBeVisible();
  for (const name of ['Players', 'Reports', 'Audit log', 'System health', 'Feature flags', 'Catalogue']) await expect(staffNav.getByRole('link', { name })).toHaveCount(0);

  // Rules: change one, see the preview, save it, then undo it.
  await page.getByRole('tab', { name: 'Rules' }).click();
  const perCorrect = page.getByLabel('Sparks per correct answer');
  await perCorrect.fill('6');
  await expect(page.getByText('A player who answers 8 of 10 and comes 2nd of 5 in a class game earns 108 Sparks instead of 92.').first()).toBeVisible();
  await shot(page, 'economy-rules-preview');
  await page.getByRole('button', { name: 'Save rules' }).click();
  const save = page.getByRole('dialog');
  await expect(save.getByText('earns 108 Sparks instead of 92')).toBeVisible();
  await save.getByLabel('Reason').fill('Reward accuracy a little more');
  await save.getByRole('button', { name: 'Save rules' }).click();
  await expect(page.getByText('Economy rules saved.')).toBeVisible();
  const history = page.getByRole('heading', { name: 'Rule changes' }).locator('xpath=ancestor::section[1]');
  await expect(history.getByText('"Reward accuracy a little more"')).toBeVisible();
  await history.getByRole('button', { name: 'Undo this change' }).click();
  const undo = page.getByRole('dialog');
  await undo.getByLabel('Reason').fill('Too generous for now');
  await undo.getByRole('button', { name: 'Undo the change' }).click();
  await expect(page.getByText('Change undone.')).toBeVisible();
  await expect(perCorrect).toHaveValue('4');
  await expect(history.getByText('Undid change')).toBeVisible();

  // Shop and sales: put a listing on sale; the player's shop says so calmly.
  await page.getByRole('tab', { name: 'Shop and sales' }).click();
  await page.getByLabel('Find a listing').fill('Moonlit');
  const row = page.getByRole('row').filter({ hasText: 'Moonlit Lantern' }).first();
  await row.getByRole('button', { name: /^Put on sale/ }).click();
  const sale = page.getByRole('dialog');
  await expect(sale.getByText(/Players will see/)).toBeVisible();
  await sale.getByLabel('Reason').fill('Half-term sale');
  await shot(page, 'economy-sale-dialog', false);
  await sale.getByRole('button', { name: 'Save the sale' }).click();
  await expect(page.getByText('Sale saved.')).toBeVisible();
  await expect(row.getByText(/On sale until/)).toBeVisible();
  await page.getByLabel('Find a listing').fill('');
  await axeClean(page);
  await shot(page, 'economy-sales');

  const buyer = await person(browser);
  await buyer.page.goto('/shop?tab=lanterns');
  const card = buyer.page.getByRole('article').filter({ hasText: 'Moonlit Lantern' }).first();
  await expect(card.getByText(/On sale until/)).toBeVisible();
  await expect(card.getByText(/^Usually/)).toBeVisible();
  await buyer.context.close();

  // A page outside the economy says so, and its API refuses.
  await page.goto('/staff/users');
  await expect(page.getByText('Not available to you')).toBeVisible();
  for (const url of ['/api/admin/users', '/api/admin/audit', '/api/admin/system', '/api/admin/flags']) expect((await page.request.get(url)).status(), url).toBe(403);
  expect(errors).toEqual([]);
  await econ.context.close();
});

test('an economy manager grants within the daily limit and is stopped beyond it', async ({ browser }) => {
  test.setTimeout(120_000);
  const econ = await person(browser, { displayName: 'Robin Ledger' });
  expect(operator('grant', econ.username, 'economist', '--reason', 'e2e')).toContain('Granted');
  const player = await person(browser, { displayName: 'Kit Ferris' });
  const errors = watchErrors(econ.page);
  const page = econ.page;
  await page.goto('/staff/economy?tab=grant');
  await page.getByLabel('Find an account').fill(player.username);
  await page.getByRole('button', { name: new RegExp(player.username) }).click();
  const grant = async (amount: string) => {
    await page.getByRole('button', { name: 'Grant currency or an item' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Amount').fill(amount);
    await d.getByLabel('Reason').fill('Lost rewards in an outage');
    await d.getByLabel(`Type ${player.username} to confirm`).fill(player.username);
    await d.getByRole('button', { name: /^Grant [\d,]+ Sparks$/ }).click();
    return d;
  };
  await grant('10000');
  await expect(page.getByText(/Granted 10,000 Sparks to/)).toBeVisible();
  await grant('10000');
  await expect(page.getByText(/Granted 10,000 Sparks to/).last()).toBeVisible();
  await expect(page.getByText('20,000 of 20,000 granted today')).toBeVisible();
  const refused = await grant('1');
  await expect(refused.getByText(/reached today's grant limit/)).toBeVisible();
  await refused.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Daily grant limit' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change the limits' })).toHaveCount(0);
  await axeClean(page);
  await shot(page, 'economy-grants');
  // The refused grant's 409 is the one error the browser logs, and it is the point of the test.
  expect(errors.filter((e) => !e.includes('409'))).toEqual([]);
  await econ.context.close();
  await player.context.close();
});

test('a teacher rewards from the class budget and the student sees it in the Wallet', async ({ browser }) => {
  test.setTimeout(120_000);
  const teacher = await person(browser, { accountType: 'teacher', displayName: 'Ms Rivera' });
  const made = await (await teacher.page.request.post('/api/classes', { headers: CSRF, data: { name: 'Year 5 Willow' } })).json();
  const kids = [await person(browser, { displayName: 'Ada Bloom', width: 390 }), await person(browser, { displayName: 'Ben Okafor' })];
  for (const k of kids) expect((await k.page.request.post('/api/classes/join', { headers: CSRF, data: { code: made.class.joinCode } })).ok()).toBe(true);
  const tErrors = watchErrors(teacher.page);

  await teacher.page.goto(`/classes/${made.class.id}?tab=rewards`);
  await expect(teacher.page.getByRole('heading', { name: 'Give Sparks' })).toBeVisible();
  await expect(teacher.page.getByText('500 left of 500')).toBeVisible();
  await teacher.page.getByLabel('Student', { exact: true }).selectOption({ label: 'Ada Bloom' });
  await teacher.page.getByLabel('Sparks', { exact: true }).fill('20');
  await teacher.page.getByRole('button', { name: 'Brilliant answer' }).click();
  await teacher.page.getByRole('button', { name: 'Give 20 Sparks to Ada Bloom' }).click();
  await expect(teacher.page.getByText('Gave 20 Sparks. 480 left this week.')).toBeVisible();
  await teacher.page.getByRole('radio', { name: /Whole class/ }).click();
  await teacher.page.getByLabel('Sparks for each student').fill('10');
  await teacher.page.getByLabel('What it is for').fill('Great teamwork in the quiz');
  await teacher.page.getByRole('button', { name: 'Give 10 Sparks each to 2 students' }).click();
  await expect(teacher.page.getByText('460 left of 500')).toBeVisible();
  await expect(teacher.page.getByText('"Great teamwork in the quiz"')).toBeVisible();
  await axeClean(teacher.page);
  await shot(teacher.page, 'class-rewards');
  expect(tErrors).toEqual([]);

  // The student: who gave it and why, today's game Sparks, and a saving goal from the wishlist.
  const ada = kids[0]!;
  const sErrors = watchErrors(ada.page);
  expect((await ada.page.request.put('/api/me/wishlist/l-lantern-moonlit', { headers: CSRF })).ok()).toBe(true);
  await ada.page.goto('/wallet');
  await expect(ada.page.getByRole('heading', { name: 'Wallet', level: 1 })).toBeVisible();
  await expect(ada.page.getByText('From Ms Rivera: Brilliant answer')).toBeVisible();
  await expect(ada.page.getByText('From Ms Rivera: Great teamwork in the quiz')).toBeVisible();
  await expect(ada.page.getByText(/You have earned 0 of today's 1500 game Sparks/)).toBeVisible();
  await ada.page.getByLabel('Choose from your wishlist').selectOption({ index: 1 });
  await ada.page.getByRole('button', { name: 'Save for this' }).click();
  await expect(ada.page.getByText('Saving goal chosen')).toBeVisible();
  await expect(ada.page.getByRole('progressbar', { name: /Saving for/ })).toBeVisible();
  const overflow = await ada.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await axeClean(ada.page);
  await shot(ada.page, 'wallet-390');
  await ada.page.setViewportSize({ width: 1440, height: 900 });
  await shot(ada.page, 'wallet-1440');
  expect(sErrors).toEqual([]);
  for (const c of [teacher, ...kids]) await c.context.close();
});
