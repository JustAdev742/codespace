// Sharp still pictures of the app's pages, for the slides (and a few for the film).
// usage: node pages.mjs [name ...]   (no names: all)
import { launch, still, account, post, APP } from './rig.mjs';

const want = new Set(process.argv.slice(2));
const on = (name) => want.size === 0 || want.has(name);
const browser = await launch();
const t = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, filmClock: false });
const page = t.page;
const go = async (url, ready) => {
  await page.goto(url);
  if (ready) await ready.waitFor({ timeout: 20000 });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(900);
};
const shoot = async (name, fn) => {
  if (!on(name)) return;
  try { await fn(); await still(page, name); } catch (e) { console.log(`${name} FAILED: ${String(e.message).split('\n')[0]}`); }
};

const QUESTIONS = [
  { id: 'q1', type: 'mcq', prompt: 'Which planet is known as the red planet?', choices: [{ id: 'a', text: 'Mars' }, { id: 'b', text: 'Venus' }, { id: 'c', text: 'Jupiter' }, { id: 'd', text: 'Mercury' }], correct: 'a' },
  { id: 'q2', type: 'mcq', prompt: 'What is the largest planet in our solar system?', choices: [{ id: 'a', text: 'Saturn' }, { id: 'b', text: 'Jupiter' }, { id: 'c', text: 'Neptune' }, { id: 'd', text: 'Earth' }], correct: 'b' },
  { id: 'q3', type: 'truefalse', prompt: 'The Sun is a star.', correct: true },
  { id: 'q4', type: 'mcq', prompt: 'How long does light from the Sun take to reach Earth?', choices: [{ id: 'a', text: 'About 8 seconds' }, { id: 'b', text: 'About 8 hours' }, { id: 'c', text: 'About 8 minutes' }, { id: 'd', text: 'About 8 days' }], correct: 'c' },
  { id: 'q5', type: 'truefalse', prompt: 'Venus is the closest planet to the Sun.', correct: false },
  { id: 'q6', type: 'mcq', prompt: 'Which planet has the most famous rings?', choices: [{ id: 'a', text: 'Uranus' }, { id: 'b', text: 'Mars' }, { id: 'c', text: 'Venus' }, { id: 'd', text: 'Saturn' }], correct: 'd' },
];
const set = (await post(page, '/api/sets', { title: 'Space explorers', description: 'Planets, light and rings', subject: 'science', visibility: 'private', questions: QUESTIONS })).set;
await post(page, '/api/sets', { title: 'Times tables to 12', subject: 'math', visibility: 'private', questions: [3, 4, 6, 7, 8, 9].map((n, i) => ({ id: `m${i}`, type: 'mcq', prompt: `${n} x 7 = ?`, choices: [{ id: 'a', text: String(n * 7) }, { id: 'b', text: String(n * 7 + 7) }, { id: 'c', text: String(n * 6) }, { id: 'd', text: String(n * 7 - 1) }], correct: 'a' })) });

await shoot('home-teacher', () => go('/', page.getByRole('heading', { level: 1 })));
await shoot('library', () => go('/library', page.getByRole('heading', { level: 1 })));
await shoot('set-detail', () => go(`/sets/${set.id}`, page.getByRole('heading', { level: 1 })));
await shoot('set-editor', () => go(`/sets/${set.id}/edit`, page.getByRole('heading', { level: 1 })));
await shoot('host-setup', async () => { await go(`/host?set=${set.id}`, page.getByRole('heading', { level: 1 })); await page.mouse.wheel(0, 260); await page.waitForTimeout(500); });
await shoot('solo', async () => {
  await go(`/host?solo=1&set=${set.id}`, page.getByRole('heading', { level: 1 }));
  await page.getByRole('radio', { name: /Time Attack/ }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  const stage = page.getByRole('heading', { name: /Your settings/ }).first();
  if (await stage.count()) await stage.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(500);
});
await shoot('lesson-editor', async () => {
  await go('/lessons', page.getByRole('heading', { name: 'Lessons', level: 1 }));
  await page.getByRole('button', { name: 'New lesson' }).click();
  await page.getByLabel('Lesson title').fill('The night sky');
  await page.getByRole('button', { name: 'Add a goal' }).click();
  await page.getByLabel('Goal 1', { exact: true }).fill('can say which planet is closest to the Sun');
  await page.getByRole('button', { name: 'Add an info slide' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Slide title').fill('Look up tonight');
  await dialog.getByLabel('Lines').fill('The Moon is not a star.\nPlanets do not twinkle.');
  await dialog.getByRole('button', { name: 'Save step' }).click();
  await dialog.waitFor({ state: 'hidden' });
  for (const title of ['Starter quiz', 'Exit ticket']) {
    await page.getByRole('button', { name: 'Add a game' }).click();
    await dialog.getByRole('button', { name: /^Space explorers/ }).click();
    await dialog.getByLabel('Title in the room').fill(title);
    await dialog.getByRole('button', { name: 'Save step' }).click();
    await dialog.waitFor({ state: 'hidden' });
  }
  await page.getByText('All changes saved').waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
});
await shoot('lessons', () => go('/lessons', page.getByRole('heading', { name: 'Lessons', level: 1 })));
await shoot('quests', () => go('/quests', page.getByRole('heading', { level: 1 })));
await shoot('locker', () => go('/locker', page.getByRole('heading', { level: 1 })));
await shoot('settings', () => go('/settings', page.getByRole('heading', { level: 1 })));
await shoot('mode-detail', () => go('/modes/summit-scramble', page.getByRole('heading', { level: 1 })));
await shoot('gamemaker-home', () => go('/game-maker', page.getByRole('heading', { name: 'Game Maker', level: 1 })));
await shoot('gamemaker-builder', async () => {
  await go('/game-maker/new?from=coin-keeper', page.getByRole('textbox', { name: 'Game code' }));
  await page.waitForTimeout(4000);
});
await shoot('collection', () => go('/collection', page.getByRole('heading', { level: 1 })));
await t.context.close();
await browser.close();
