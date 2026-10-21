import { expect, test } from '@playwright/test';
import { account, watchErrors } from './helpers.ts';

test('a new player buys and opens a Lantern, and the Glim reaches their collection', async ({ browser }) => {
  const p = await account(browser);
  const errors = watchErrors(p.page);
  const before = await (await p.page.request.get('/api/collection')).json();
  await p.page.goto('/shop');
  await p.page.getByRole('tab', { name: 'Lanterns' }).click();
  await p.page.getByRole('button', { name: /^Buy Meadow Lantern for 150/i }).first().click();
  await p.page.getByRole('button', { name: /^Open it for 150/ }).click();
  await expect(p.page.getByText(/New to your collection|You have \d+ now/)).toBeVisible();
  await p.page.getByRole('button', { name: 'Done' }).click();

  const overview = await (await p.page.request.get('/api/me/overview')).json();
  expect(overview.balances.sparks).toBe(100);
  const after = await (await p.page.request.get('/api/collection')).json();
  const owned = (c: { collections: { glims: { owned: number }[] }[] }) => c.collections.flatMap((x) => x.glims).reduce((n, g) => n + g.owned, 0);
  expect(owned(after)).toBe(owned(before) + 1);
  expect(errors).toEqual([]);
});
