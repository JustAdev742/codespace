import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { account, CSRF, operator, settled, watchErrors } from './helpers.ts';

/*
 * AI helpers in the making tools. The end-to-end server has no AI provider, so
 * the AI endpoints are answered in the browser here; the server side (providers,
 * repair, fallback, allowance, the staff routes) is tested in server/test/ai.test.ts
 * against a fake provider. Everything else (sets, lessons, the host page) is the
 * real server.
 */

const TASKS = ['set.draft_questions', 'question.improve', 'question.wrong_answers', 'question.explain', 'question.difficulty', 'set.age_version', 'set.describe', 'lesson.outline', 'lesson.slide', 'lesson.discussion', 'game.suggest_mode', 'any.name_describe'];
const MODELS = [
  { id: 'groq/llama', label: 'Llama 3.3 70B', provider: 'Groq' },
  { id: 'cerebras/qwen', label: 'Qwen 3 32B', provider: 'Cerebras' },
];
const allowance = (remaining: number, nextAt: string | null = null) => ({ limit: 20, remaining, windowHours: 5, nextAt });
const status = (remaining = 20, nextAt: string | null = null) => ({ available: true, tasks: TASKS, models: MODELS, allowance: allowance(remaining, nextAt) });

const axe = (page: Page, include: string) => new AxeBuilder({ page }).include(include).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();

/** Answers the helper endpoints in the browser; records each task request. */
async function stubAi(page: Page, answers: Record<string, unknown>, opts: { remaining?: number; nextAt?: string | null } = {}) {
  const sent: { task: string; body: Record<string, unknown> }[] = [];
  let remaining = opts.remaining ?? 20;
  await page.route('**/api/ai/status', (r) => r.fulfill({ json: status(remaining, opts.nextAt ?? null) }));
  await page.route('**/api/ai/tasks/*', async (r: Route) => {
    const task = r.request().url().split('/api/ai/tasks/')[1]!;
    sent.push({ task, body: r.request().postDataJSON() });
    if (remaining <= 0) return r.fulfill({ status: 429, json: { error: { code: 'rate_limited', message: 'You have used your 20 helper requests for now. One more arrives in 42 minutes.' } } });
    remaining--;
    await r.fulfill({ json: { output: answers[task], model: MODELS[1], removed: 0, dropped: 0, allowance: allowance(remaining) } });
  });
  return sent;
}

/** Opens question 1's card in the editor, unless the editor opened it already. */
async function openCard(page: Page) {
  const header = page.locator('#q-q1-header');
  await expect(header).toBeVisible();
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
}

async function makeSet(page: Page, title = 'The water cycle') {
  const res = await page.request.post('/api/sets', {
    headers: CSRF,
    data: { title, subject: 'science', questions: [{ id: 'q1', type: 'mcq', prompt: 'What is it called when water vapour turns to liquid?', choices: [{ id: 'a', text: 'Evaporation' }, { id: 'b', text: 'Condensation' }, { id: 'c', text: 'Melting' }], correct: 'b' }] },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()).set.id as string;
}

test('a teacher discards one suggestion and accepts another in the set editor', async ({ browser }) => {
  const teacher = await account(browser, { accountType: 'teacher' });
  const page = teacher.page;
  const errors = watchErrors(page);
  const setId = await makeSet(page);

  // No provider on this server: no helpers anywhere.
  await page.goto(`/sets/${setId}/edit`);
  await openCard(page);
  await expect(page.locator('#q-q1-prompt')).toBeVisible();
  await expect(page.getByRole('button', { name: /Help from AI/ })).toHaveCount(0);

  const sent = await stubAi(page, { 'question.explain': { explanation: 'Cooling vapour condenses into tiny droplets.' }, 'question.improve': { prompt: 'What do we call water vapour turning into liquid?' } });
  await page.reload();
  await openCard(page);
  await page.getByRole('button', { name: 'Help from AI for question 1' }).click();
  await page.getByRole('button', { name: 'Write the explanation' }).click();
  const panel = page.getByRole('region', { name: 'Write the explanation' });
  await expect(panel.getByText('Cooling vapour condenses into tiny droplets.')).toBeVisible();
  await expect(panel.getByText('No explanation yet')).toBeVisible();
  await expect(panel.getByText('Suggested by Qwen 3 32B (Cerebras).')).toBeVisible();
  await expect(panel.getByText('19 helper requests left of 20 every 5 hours.')).toBeVisible();
  expect(sent[0]).toEqual({ task: 'question.explain', body: { input: { prompt: 'What is it called when water vapour turns to liquid?', answer: 'Condensation' }, fallback: true } });
  await settled(page);
  expect((await axe(page, '#q-q1-panel')).violations).toEqual([]);

  // Discard: nothing changes, and focus goes back to the button.
  await panel.getByRole('button', { name: 'Discard' }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByRole('button', { name: 'Write the explanation' })).toBeFocused();
  await page.getByRole('button', { name: /^More options/ }).click();
  await expect(page.locator('#q-q1-explanation')).toHaveValue('');

  // Pick the other model (remembered), ask again by keyboard, accept.
  await page.getByRole('button', { name: 'Write the explanation' }).focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByText('Cooling vapour condenses into tiny droplets.')).toBeVisible();
  await panel.getByLabel('Model', { exact: true }).selectOption('cerebras/qwen');
  await panel.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(() => sent.length).toBe(3);
  expect(sent[2]!.body).toMatchObject({ model: 'cerebras/qwen', fallback: true });
  await panel.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('#q-q1-explanation')).toHaveValue('Cooling vapour condenses into tiny droplets.');

  await page.getByRole('button', { name: 'Improve the wording' }).click();
  await page.getByRole('region', { name: 'Improve the wording' }).getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('#q-q1-prompt')).toHaveValue('What do we call water vapour turning into liquid?');
  // Accepting is undoable like any edit, and saving goes to the real server.
  await page.getByRole('button', { name: /^Save/ }).first().click();
  await expect.poll(async () => (await (await page.request.get(`/api/sets/${setId}`)).json()).questions[0]).toMatchObject({ prompt: 'What do we call water vapour turning into liquid?', explanation: 'Cooling vapour condenses into tiny droplets.' });
  expect(errors).toEqual([]);
});

test('a teacher outlines a lesson from their own set and adds the steps', async ({ browser }) => {
  const teacher = await account(browser, { accountType: 'teacher' });
  const page = teacher.page;
  const errors = watchErrors(page);
  const setId = await makeSet(page);
  const lesson = await (await page.request.post('/api/lessons', { headers: CSRF, data: {} })).json();
  const outline = {
    title: 'Where rain comes from',
    goals: ['learned how clouds form'],
    steps: [
      { id: 's1', kind: 'slide', title: 'The water cycle', lines: ['Water evaporates.', 'Vapour condenses into clouds.'], image: null, note: '' },
      { id: 's2', kind: 'game', title: 'Check it', setId, modeId: 'classic', variantId: null, settings: {}, common: {}, note: '' },
      { id: 's3', kind: 'discussion', prompt: 'Where does the water in a puddle go?', seconds: 120, note: '' },
    ],
  };
  const sent = await stubAi(page, { 'lesson.outline': outline });
  await page.goto(`/lessons/${lesson.id}`);
  await page.getByRole('button', { name: 'Outline with AI' }).click();
  const panel = page.getByRole('region', { name: 'Outline a lesson with AI' });
  await expect(panel.getByRole('button', { name: 'Suggest' })).toBeDisabled();
  await panel.getByLabel('What is the lesson for?').fill('How rain forms');
  await panel.getByLabel('The water cycle').check();
  await panel.getByRole('button', { name: 'Suggest' }).click();
  await expect(panel.getByText('Where rain comes from')).toBeVisible();
  expect(sent[0]!.body.input).toEqual({ goal: 'How rain forms', minutes: 45, setIds: [setId] });
  await settled(page);
  expect((await axe(page, '[aria-labelledby="steps"]')).violations).toEqual([]);
  await panel.getByRole('button', { name: 'Add these steps' }).click();
  await expect(page.getByRole('heading', { name: 'Step 1: The water cycle' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Step 3:/ })).toBeVisible();
  await expect(page.getByText('All changes saved')).toBeVisible();
  const saved = await (await page.request.get(`/api/lessons/${lesson.id}`)).json();
  expect(saved.lesson.title).toBe('Where rain comes from');
  expect(saved.lesson.steps.map((s: { kind: string }) => s.kind)).toEqual(['slide', 'game', 'discussion']);
  expect(errors).toEqual([]);
});

test('a host asks for a mode suggestion and uses it', async ({ browser }) => {
  const teacher = await account(browser, { accountType: 'teacher' });
  const page = teacher.page;
  const errors = watchErrors(page);
  const setId = await makeSet(page);
  const sent = await stubAi(page, { 'game.suggest_mode': { modeId: 'classic', modeTitle: 'Classic', variantId: null, variantTitle: null, common: { questionTimeSec: 25 }, settings: {}, why: 'A calm quiz suits a short starter.' } });
  await page.goto(`/host?set=${setId}`);
  await page.getByRole('button', { name: 'Suggest a mode with AI' }).click();
  const panel = page.getByRole('region', { name: 'Suggest a mode and settings' });
  await panel.getByLabel('How many players').fill('28');
  await panel.getByRole('button', { name: 'Suggest' }).click();
  await expect(panel.getByText('A calm quiz suits a short starter.')).toBeVisible();
  await expect(panel.getByText('Seconds per question: 25')).toBeVisible();
  expect(sent[0]!.body.input).toEqual({ setId, classSize: 28, minutes: 15 });
  await settled(page);
  expect((await axe(page, '[aria-labelledby="host-step-mode"]')).violations).toEqual([]);
  await panel.getByRole('button', { name: 'Use this mode' }).click();
  await expect(page.getByRole('heading', { name: /Settings/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Classic/ }).first()).toBeChecked();
  expect(errors).toEqual([]);
});

test('when the allowance is used up, the helper says when more arrives', async ({ browser }) => {
  const teacher = await account(browser, { accountType: 'teacher' });
  const page = teacher.page;
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = watchErrors(page);
  const setId = await makeSet(page);
  const nextAt = new Date(Date.now() + 42 * 60_000).toISOString();
  const sent = await stubAi(page, {}, { remaining: 0, nextAt });
  await page.goto(`/sets/${setId}`);
  await page.getByRole('button', { name: 'Suggest a title, description and tags' }).click();
  const panel = page.getByRole('region', { name: 'Suggest a title, description and tags' });
  await expect(panel.getByText(/^You have used your 20 helper requests for now\. One more at \d\d:\d\d\.$/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  expect(sent).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await settled(page);
  expect((await axe(page, 'main')).violations).toEqual([]);
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});

test('staff see the models and switch one off with a reason', async ({ browser }) => {
  const staff = await account(browser);
  expect(operator('grant', staff.username, 'superadmin', '--reason', 'e2e')).toContain('Granted');
  const page = staff.page;
  const errors = watchErrors(page);
  let changed: Record<string, unknown> | null = null;
  const admin = (enabled: boolean) => ({
    canChange: true,
    providers: [{ name: 'Groq', kind: 'openai', host: 'api.groq.com', models: [{ id: 'groq/llama', label: 'Llama 3.3 70B', model: 'llama-3.3-70b', enabled }] }],
    settings: { perAccount: 20, windowHours: 5, siteDailyCap: 500, siteDailyCapSetting: null, defaultSiteDailyCap: 500 },
    today: { total: 12, ok: 10, failed: 1, refused: 1, people: 4, byTask: [{ task: 'question.explain', n: 7 }] },
    failures: [{ provider: 'Groq', model: 'llama-3.3-70b', kind: 'busy', n: 2, last: new Date().toISOString() }],
  });
  await page.route('**/api/admin/ai', (r) => r.fulfill({ json: admin(changed === null) }));
  await page.route('**/api/admin/ai/models', async (r) => {
    changed = r.request().postDataJSON();
    await r.fulfill({ json: { ok: true } });
  });
  await page.goto('/staff/ai');
  await expect(page.getByRole('heading', { name: 'AI helpers', level: 1 })).toBeVisible();
  await expect(page.getByText('Busy or rate limited')).toBeVisible();
  await settled(page);
  expect((await axe(page, 'main')).violations).toEqual([]);
  await page.getByRole('button', { name: 'Switch off Llama 3.3 70B' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Reason').fill('Key revoked');
  await dialog.getByRole('button', { name: 'Switch off' }).click();
  await expect(page.getByText('Llama 3.3 70B is off')).toBeVisible();
  expect(changed).toEqual({ id: 'groq/llama', enabled: false, reason: 'Key revoked' });
  await expect(page.getByRole('button', { name: 'Switch on Llama 3.3 70B' })).toBeVisible();
  // The real server keeps the page to staff.
  const player = await account(browser);
  expect((await player.page.request.get('/api/admin/ai')).status()).toBe(403);
  expect(errors).toEqual([]);
});
