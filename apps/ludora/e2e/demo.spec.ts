import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { answerAnyQuestion, watchErrors } from './helpers.ts';

/*
 * The playable demo (playwright.demo.config.ts): the static build under a
 * sub-path, as GitHub Pages serves it, with no server anywhere.
 */

const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);

/** Everything the page loads must come from the demo's own folder: no API, no sockets, no other sites. */
function watchRequests(page: Page, base: string): string[] {
  const outside: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(base)) outside.push(r.url());
  });
  return outside;
}

const startPage = (page: Page) => page.getByRole('heading', { level: 1, name: 'Play Ludora in your browser' });

test('plays a game against practice bots with nothing but static files', async ({ page, baseURL }) => {
  const errors = watchErrors(page);
  const outside = watchRequests(page, baseURL!);
  await page.goto('./');
  await expect(startPage(page)).toBeVisible();
  await expect(page.getByText('Classic with “General Knowledge Mix”, you and 5 practice bots.')).toBeVisible();
  expect(await axe(page), 'start page accessibility').toEqual([]);

  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page).toHaveURL(/#\/play\?set=official-general-knowledge&mode=classic&bots=5$/);
  await expect(page.getByText('Demo, with 5 practice bots', { exact: true })).toBeVisible();
  // The first question, of whatever type the shuffle dealt: answer it, and the game takes the answer.
  await expect(page.getByText(/^Question 1 of \d+$/)).toBeVisible();
  await answerAnyQuestion(page);
  await expect(page.getByText(/^(Answer locked in|Correct!|Partly right \(\d+%\)|Not this time)$/).first()).toBeVisible();
  await expect(page.getByText('No answer this time.')).toHaveCount(0);

  // The big screen is the host's view of the same game, with the host's controls, and never shows your answer.
  const bigScreen = page.getByRole('button', { name: 'Big screen' });
  await bigScreen.click();
  await expect(bigScreen).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/This is the big screen/)).toBeVisible();
  await expect(page.getByText(/^\d+ of 6 answered$/)).toBeVisible();
  // The answer to question 1 as the room sees it (a marked choice, the right order or pairs, or the typed answer).
  // A choice you picked is tagged Your answer on your own screen, never here.
  const revealed = page.getByRole('img', { name: 'Correct answer' }).or(page.getByRole('list', { name: /^The right (order|pairs)$/ })).or(page.getByText('Answer', { exact: true }));
  await expect(revealed.first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^Question 1 of \d+$/)).toBeVisible();
  await expect(page.getByText('Your answer', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('Paused', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  expect(await axe(page), 'big screen accessibility').toEqual([]);
  await bigScreen.click();
  await expect(bigScreen).toHaveAttribute('aria-pressed', 'false');
  expect(await axe(page), 'game screen accessibility').toEqual([]);

  // Finish now goes to the results; Play again starts the next game in the same room.
  await page.getByRole('button', { name: 'Finish now' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Game over' })).toBeVisible();
  await expect(page.getByText('You finished the game early.', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Final standings' }).getByRole('listitem')).toHaveCount(6);
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByRole('button', { name: 'Finish now' })).toBeVisible();

  // Leave goes back to the start page, which remembers the game.
  await page.getByRole('button', { name: 'Leave' }).click();
  await expect(startPage(page)).toBeVisible();
  await expect(page.getByText('Classic with “General Knowledge Mix”, you and 5 practice bots.')).toBeVisible();

  expect(outside, 'requests outside the demo').toEqual([]);
  expect(errors).toEqual([]);
});

test('offers every mode, with bots where a mode takes them', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  // One-player modes take no bots.
  await page.getByRole('radio', { name: /Time Attack/ }).check();
  await expect(page.getByText('Time Attack is played on your own, so there are no bots.')).toBeVisible();
  await expect(page.getByText('Time Attack with “General Knowledge Mix”, on your own.')).toBeVisible();
  // Team modes need someone on the other side.
  await page.getByRole('radio', { name: /Tug of War/ }).check();
  await expect(page.getByLabel('Practice bots')).not.toContainText('No bots');
  // A set from the library.
  await page.getByRole('button', { name: 'Change the question set, General Knowledge Mix' }).click();
  await page.getByRole('button', { name: /^World Capitals/ }).click();
  await page.getByLabel('Practice bots').selectOption('3');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page).toHaveURL(/#\/play\?set=official-world-capitals&mode=tug-of-war&bots=3$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Tug of War' })).toBeVisible();
  await expect(page.getByText('Demo, with 3 practice bots', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a game address survives a reload, and pages the demo does not have lead to its start', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/play?set=official-times-tables&mode=time-attack&bots=4');
  await expect(page.getByRole('heading', { level: 1, name: 'Time Attack' })).toBeVisible();
  // A one-player mode ignores the bots asked for.
  await expect(page.getByText('Demo, on your own', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Time Attack' })).toBeVisible();
  // The results screen links to Host and Sign up, which only the full site has.
  await page.goto('./#/host?solo=1');
  await expect(startPage(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('fits a 360px phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('./');
  await expect(startPage(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'start page scrolls sideways').toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByText(/^Question 1 of \d+$/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'game scrolls sideways').toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Big screen' }).click();
  await expect(page.getByText(/This is the big screen/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'big screen scrolls sideways').toBeLessThanOrEqual(0);
});
