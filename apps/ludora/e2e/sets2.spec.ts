import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { account, CSRF, settled, watchErrors } from './helpers.ts';

/*
 * Sound in questions and games that adapt to the set: a teacher adds a spoken question, a sound
 * bank question and an uploaded clip (a generated file, not a microphone) in the editor, sets the
 * set's feel, sees hosting rank the modes for it, and a class plays it: the phone shows the
 * listen-first screen with a Play control and a number pad, the big screen plays it for the room.
 */

const SHOTS = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string, fullPage = true) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
};
const axe = async (page: Page, include = 'main') => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await settled(page);
  const r = await new AxeBuilder({ page }).include(include).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
};

/** A stereo WAV of a quiet tone at 22,050 Hz, with a name in its metadata: the editor turns it into a clean mono clip. */
function toneWav(seconds: number): Buffer {
  const rate = 22050;
  const frames = Math.round(seconds * rate);
  const data = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000);
    data.writeInt16LE(v, i * 4);
    data.writeInt16LE(v, i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8, 'latin1');
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36, 'latin1');
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

test('a set with spoken, sound bank and uploaded sounds is made, ranked for hosting and played', async ({ browser }) => {
  test.setTimeout(300_000);
  const host = await account(browser, { accountType: 'teacher', displayName: 'Mr Okafor' });
  const page = host.page;
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  const made = await page.request.post('/api/sets', {
    headers: CSRF,
    data: {
      title: 'Listening warm-up',
      subject: 'languages',
      visibility: 'private',
      questions: [
        { id: 'say', type: 'short', prompt: 'Listen and type the French word you hear.', accepted: ['bonjour'], explanation: 'Bonjour means hello.' },
        { id: 'tone', type: 'mcq', prompt: 'Did the tone go up or down?', choices: [{ id: 'up', text: 'Up' }, { id: 'down', text: 'Down' }], correct: 'up', explanation: 'It rose.' },
        { id: 'clip', type: 'truefalse', prompt: 'Listen to the clip. Is it one steady note?', correct: true, explanation: 'It is a single note.' },
        { id: 'sum', type: 'numeric', prompt: 'How many sides does a hexagon have?', answer: 6, explanation: 'Hex means six.' },
      ],
    },
  });
  expect(made.ok(), await made.text()).toBe(true);
  const id = (await made.json()).set.id as string;

  // 1. The editor: a sound on each of the first three questions, from each of the three places.
  await page.goto(`/sets/${id}/edit`);
  await page.getByRole('button', { name: 'Expand all' }).click();
  const card = (qid: string) => page.locator(`#q-${qid}`);

  await card('say').getByRole('button', { name: 'Add a sound', exact: true }).click();
  await card('say').getByLabel('Words to say').fill('bonjour');
  await card('say').getByLabel('Language').selectOption('fr-FR');
  await card('say').getByLabel('Caption').fill('A French word is said aloud');

  await card('tone').getByRole('button', { name: 'Add a sound', exact: true }).click();
  await card('tone').getByRole('radio', { name: 'Sound bank' }).click();
  await card('tone').getByLabel('Sound', { exact: true }).selectOption('tone-rising');
  await expect(card('tone').getByLabel('Caption')).toHaveValue('A tone that rises');

  await card('clip').getByRole('button', { name: 'Add a sound', exact: true }).click();
  await card('clip').getByRole('radio', { name: 'Your own clip' }).click();
  await expect(card('clip').getByText(/Do not say anyone's name in a recording/)).toBeVisible();
  await card('clip').getByTestId('q-clip-sound-file').setInputFiles({ name: 'note.wav', mimeType: 'audio/wav', buffer: toneWav(1.5) });
  await expect(card('clip').getByText(/^Clip, 1\.5 seconds$/)).toBeVisible({ timeout: 20_000 });
  await card('clip').getByLabel('Caption').fill('One steady musical note');
  await shot(page, 'editor-sounds');

  // 2. The set's feel and how it should be played.
  await page.getByRole('combobox', { name: 'Reading time' }).selectOption('auto');
  await page.getByLabel('Made for (optional)', { exact: true }).selectOption('classic');
  await page.getByRole('combobox', { name: 'Right answer sound' }).selectOption('note-c5');
  await page.getByRole('combobox', { name: 'Big screen backdrop' }).selectOption('aurora');
  await page.getByRole('switch', { name: 'Accent colour' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible({ timeout: 20_000 });
  const saved = await (await page.request.get(`/api/sets/${id}`)).json();
  expect(saved.questions[0].sound).toEqual({ kind: 'speech', text: 'bonjour', lang: 'fr-FR', caption: 'A French word is said aloud' });
  expect(saved.questions[1].sound).toMatchObject({ kind: 'bank', id: 'tone-rising' });
  expect(saved.questions[2].sound).toMatchObject({ kind: 'clip', seconds: 1.5, caption: 'One steady musical note' });
  expect(saved.questions[2].sound.url).toMatch(/^\/uploads\/[a-f0-9]{32}\.wav$/);
  expect(saved.set.defaults).toMatchObject({ readingTime: 'auto', modes: ['classic'], feel: { right: 'note-c5', backdrop: 'aurora', accent: 200 } });
  // The clip is served as a clean WAV.
  const clip = await page.request.get(saved.questions[2].sound.url);
  expect(clip.headers()['content-type']).toBe('audio/wav');
  await axe(page);

  // Quick add reads lines as they are typed.
  await page.getByRole('button', { name: 'Quick add' }).click();
  const quick = page.getByRole('dialog', { name: 'Quick add' });
  await quick.getByLabel('Questions', { exact: true }).fill('Capital of France? = Paris\nOops no answer');
  await expect(quick.getByText('1 question read, 1 line to fix.')).toBeVisible();
  await axe(page, '[role="dialog"]');
  await page.keyboard.press('Escape');

  // The editor at phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await axe(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(page, 'editor-phone');
  await page.setViewportSize({ width: 1366, height: 768 });

  // 3. Hosting ranks the modes for this set, with reasons, and fills in the time per question.
  await page.goto(`/host?set=${id}`);
  await expect(page.getByText('Sorted by how well each mode fits “Listening warm-up”, best first.')).toBeVisible();
  const classicFit = page.locator('[data-fit="classic"]');
  await expect(classicFit).toContainText('Best fit');
  await expect(classicFit).toContainText('Made for this set');
  await expect(classicFit).toContainText('All 4 questions work');
  await page.getByRole('radio', { name: /^Classic/ }).first().check();
  await expect(page.locator('[data-suggested]')).toContainText('worked out from its questions, as its author asked');
  await axe(page);
  await shot(page, 'host-ranking');

  // 4. A class plays it. A long question time, so slow browsers never run a question out.
  const room = await page.request.post('/api/rooms', { headers: CSRF, data: { setId: id, modeId: 'classic', common: { shuffleQuestions: false, shuffleChoices: false, questionTimeSec: 90 }, settings: { autoAdvance: false } } });
  expect(room.ok(), await room.text()).toBe(true);
  const { code } = await room.json();
  await page.goto(`/room/${code}`);
  await expect(page.locator('[data-backdrop="aurora"]')).toHaveCount(1);

  const isChromium = browser.browserType().name() === 'chromium';
  const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: isChromium, isMobile: isChromium });
  const player = await playerContext.newPage();
  const playerErrors = watchErrors(player);
  await player.goto(`/join/${code}`);
  await player.getByLabel('Your name').fill('Bright Otter');
  await player.getByRole('button', { name: 'Join game' }).click();
  await expect(player.getByText('You are in', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start game' }).click();
  const next = page.getByRole('button', { name: /Next|Skip ahead/ });
  const toNext = async () => {
    await next.click();
    await expect(page.getByText('Leaderboard')).toBeVisible();
    await next.click();
  };

  // Spoken question: listen first on the phone (Play, or its caption where the device has no voices).
  await expect(player.getByRole('heading', { name: 'Listen and type the French word you hear.' })).toBeVisible();
  await expect(player.locator('[data-layout="listen"]')).toBeVisible();
  await expect(page.locator('[data-layout="listen"]')).toBeVisible();
  const play = player.locator('[data-listen] button');
  if (await play.count()) await expect(play).toHaveText('Play the sound');
  else await expect(player.getByText(/A French word is said aloud/)).toBeVisible();
  // The big screen carries the set's accent band and a Play control for the room.
  // (A school's own look keeps its colours, so there is no band in it.)
  await expect(page.locator('[data-layout="listen"] [data-accent="200"]')).toHaveCount(process.env.E2E_SCHOOL_THEME ? 0 : 1);
  await axe(player);
  await axe(page);
  await shot(player, 'listen-phone');
  await shot(page, 'listen-host');
  await player.getByPlaceholder('Type your answer').fill('bonjour');
  await player.getByRole('button', { name: 'Submit answer' }).click();
  await expect(player.getByText('Correct', { exact: true })).toBeVisible();
  await toNext();

  // Sound bank question: Play on the phone, and its own Play button on the big screen.
  await expect(player.getByRole('heading', { name: 'Did the tone go up or down?' })).toBeVisible();
  await player.locator('[data-listen] button').click();
  await expect(player.locator('[data-listen] button')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-listen] button')).toHaveText(/Play the sound again|Stop/);
  await player.getByRole('group', { name: 'Answers' }).getByRole('button', { name: /Up/ }).click();
  await expect(player.getByText('Correct', { exact: true })).toBeVisible();
  await toNext();

  // The uploaded clip plays from the server.
  await expect(player.getByRole('heading', { name: 'Listen to the clip. Is it one steady note?' })).toBeVisible();
  const fetched = player.waitForResponse((r) => /\/uploads\/[a-f0-9]{32}\.wav$/.test(r.url()) && r.status() === 200);
  await player.locator('[data-listen] button').click();
  await fetched;
  await axe(player);
  await player.getByRole('button', { name: /True/ }).first().click();
  await expect(player.getByText('Correct', { exact: true })).toBeVisible();
  await toNext();

  // A number answer: the game's own number pad on a touch phone.
  await expect(player.getByRole('heading', { name: 'How many sides does a hexagon have?' })).toBeVisible();
  const pad = player.getByRole('group', { name: 'Number pad' });
  if (isChromium) {
    await expect(pad).toBeVisible();
    await pad.getByRole('button', { name: '6', exact: true }).click();
    await expect(player.getByPlaceholder('Type a number')).toHaveValue('6');
    await axe(player);
    await shot(player, 'number-pad-phone', false);
  } else {
    // Headless Firefox and WebKit cannot pretend to be a touch phone: the keyboard answers.
    await player.getByPlaceholder('Type a number').fill('6');
  }
  await player.getByRole('button', { name: 'Submit answer' }).click();
  await expect(player.getByText('Correct', { exact: true })).toBeVisible();

  expect(errors).toEqual([]);
  expect(playerErrors).toEqual([]);
  await playerContext.close();
});
