import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { mkdirSync } from 'node:fs';
import { account, CSRF, settled, watchErrors } from './helpers.ts';

/*
 * The loose ends (docs/features/finish.md): co-teachers and class groups, a set cover picture,
 * claiming an earlier quest, Host again on the teacher's home, exit ticket and poll answers in a
 * report, challenging a friend, and the error page. Every screen is checked with axe (WCAG 2.2 A
 * and AA) and for sideways scrolling at a phone and a laptop width.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const SHOTS = process.env.SHOTS_DIR;
const DB = process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/ludora_e2e';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAF0lEQVR4AWL6v0Hhv7XSsv8gmokBCQAAAAD//x3OmzEAAAAGSURBVAMAlBkHo5cp4fcAAAAASUVORK5CYII=', 'base64');

const QUESTIONS = [
  { id: 'q1', type: 'truefalse', prompt: 'Water boils at 100 C at sea level.', correct: true },
  { id: 'q2', type: 'truefalse', prompt: 'The Moon is a planet.', correct: false },
  { id: 'q3', type: 'truefalse', prompt: 'Bats are mammals.', correct: true },
  { id: 'q4', type: 'truefalse', prompt: 'Spiders have six legs.', correct: false },
];

async function check(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  for (const width of [390, 1366]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    await settled(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${name} scrolls sideways at ${width}`).toBeLessThanOrEqual(0);
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), `${name} at ${width}`).toEqual([]);
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: `${SHOTS}/${name}-${width}.png`, fullPage: true });
    }
  }
}

async function sql(text: string, values: unknown[] = []) {
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  try {
    return (await c.query(text, values)).rows;
  } finally {
    await c.end();
  }
}

async function makeSet(page: Page, title = 'Science facts', visibility = 'private', questions: unknown[] = QUESTIONS) {
  const res = await page.request.post('/api/sets', { headers: CSRF, data: { title, description: 'Some facts', subject: 'science', visibility, questions } });
  expect(res.ok(), await res.text()).toBe(true);
  const body = await res.json();
  return (body.set?.id ?? body.id) as string;
}

test('a teacher adds a co-teacher by username and makes a group; only the group sees its work', async ({ browser }) => {
  const owner = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera' });
  const co = await account(browser, { accountType: 'teacher', displayName: 'Mr Chen' });
  const ada = await account(browser, { accountType: 'student', displayName: 'Ada' });
  const bo = await account(browser, { accountType: 'student', displayName: 'Bo' });
  const errors = watchErrors(owner.page);
  const { class: cls } = await (await owner.page.request.post('/api/classes', { headers: CSRF, data: { name: 'Year 5 Hazel' } })).json();
  for (const s of [ada, bo]) expect((await s.page.request.post('/api/classes/join', { headers: CSRF, data: { code: cls.joinCode } })).ok()).toBe(true);
  const setId = await makeSet(owner.page);

  // Co-teacher, by username. An unknown name says so without saying more.
  await owner.page.goto(`/classes/${cls.id}?tab=students`);
  const field = owner.page.getByLabel('Add a teacher by username');
  await field.fill('nobody_at_all_here');
  await owner.page.getByRole('button', { name: 'Add teacher' }).click();
  await expect(owner.page.getByText('No teacher account has that username.')).toBeVisible();
  await field.fill(co.username);
  await owner.page.getByRole('button', { name: 'Add teacher' }).click();
  await expect(owner.page.getByRole('list', { name: 'Teachers of this class' }).getByRole('button', { name: 'Remove Mr Chen' })).toBeVisible();
  await check(owner.page, 'class-teachers');

  // The co-teacher makes a group from the Groups tab.
  await co.page.goto(`/classes/${cls.id}?tab=groups`);
  await co.page.getByRole('button', { name: 'New group' }).first().click();
  const dialog = co.page.getByRole('dialog', { name: 'New group' });
  await dialog.getByLabel('Name').fill('Robins');
  await dialog.getByRole('checkbox', { name: 'Ada' }).check();
  await settled(co.page);
  const axe = await new AxeBuilder({ page: co.page }).include('[role="dialog"]').withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await dialog.getByRole('button', { name: 'Make group' }).click();
  await expect(co.page.getByRole('list', { name: 'Groups' }).getByRole('heading', { name: 'Robins' })).toBeVisible();

  // Work set for the whole class, then given to the group in the assignment dialog.
  expect((await owner.page.request.post(`/api/classes/${cls.id}/assignments`, { headers: CSRF, data: { setId, modeId: 'classic', title: 'Robins reading' } })).ok()).toBe(true);
  await co.page.goto(`/classes/${cls.id}`);
  await co.page.getByRole('button', { name: 'Edit Robins reading' }).click();
  const edit = co.page.getByRole('dialog', { name: 'Edit assignment' });
  await edit.getByLabel('Who it is for').selectOption({ label: 'Robins (1 student)' });
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(co.page.getByText('For Robins only')).toBeVisible();
  await co.page.goto(`/classes/${cls.id}?tab=groups`);
  await check(co.page, 'class-groups');

  await ada.page.goto(`/classes/${cls.id}`);
  await expect(ada.page.getByRole('heading', { name: 'Robins reading' })).toBeVisible();
  await expect(ada.page.getByText(/Your group: Robins/)).toBeVisible();
  await check(ada.page, 'class-student-group');
  await bo.page.goto(`/classes/${cls.id}`);
  await expect(bo.page.getByRole('heading', { name: 'Year 5 Hazel', level: 1 })).toBeVisible();
  await expect(bo.page.getByText('Robins reading')).toHaveCount(0);
  // The unknown username's answer is a 404, which the browser logs; nothing else went wrong.
  expect(errors.filter((e) => !/status of 404/.test(e))).toEqual([]);
});

test('a set cover can be a picture the teacher uploads and describes', async ({ browser }) => {
  const teacher = await account(browser, { accountType: 'teacher' });
  const errors = watchErrors(teacher.page);
  const setId = await makeSet(teacher.page, 'Volcanoes');
  await teacher.page.goto(`/sets/${setId}/edit`);
  const cover = teacher.page.getByRole('group', { name: 'Your own picture' });
  await cover.locator('input[type="file"]').setInputFiles({ name: 'volcano.png', mimeType: 'image/png', buffer: PNG });
  const describe = teacher.page.getByLabel('Image description');
  await expect(describe).toBeVisible();
  await describe.fill('A volcano glowing at night');
  await teacher.page.getByRole('button', { name: /^Save( changes)?$/ }).first().click();
  await expect(teacher.page.getByText(/Saved/).first()).toBeVisible();
  const saved = (await (await teacher.page.request.get(`/api/sets/${setId}`)).json()).set.cover;
  expect(saved.image.alt).toBe('A volcano glowing at night');
  await teacher.page.goto(`/sets/${setId}`);
  await expect(teacher.page.getByRole('img', { name: 'A volcano glowing at night' })).toBeVisible();
  await check(teacher.page, 'set-cover-picture');
  expect(errors).toEqual([]);
});

test('an earlier finished quest is claimed from the history, and badges are drawn', async ({ browser }) => {
  const player = await account(browser, { accountType: 'student' });
  const quests = (await (await player.page.request.get('/api/quests')).json()).quests as { id: string; target: number }[];
  await sql(`insert into user_quests (user_id, quest_id, period, target, progress, completed_at) values ($1, $2, '2026-01-07', $3, $3, now())`, [player.userId, quests[0]!.id, quests[0]!.target]);
  await player.page.goto('/quests');
  await player.page.getByRole('button', { name: 'Show earlier quests' }).click();
  const history = player.page.locator('#history-list');
  await expect(history.getByText('Done, not claimed')).toBeVisible();
  await check(player.page, 'quests-history');
  await history.getByRole('button', { name: /^Claim / }).click();
  await expect(history.getByText('Done, claimed')).toBeVisible();
  await expect(history.getByRole('button', { name: /^Claim / })).toHaveCount(0);
});

test('a teacher hosts a recent game again from home, and its report shows the exit ticket and the poll', async ({ browser }) => {
  const teacher = await account(browser, { accountType: 'teacher' });
  const errors = watchErrors(teacher.page);
  const setId = await makeSet(teacher.page, 'Rivers');
  const voice = { feelings: { great: 5, okay: 2, tough: 1 }, polls: [{ questionId: 'p1', prompt: 'Which topic should we do next?', choices: [{ id: 'a', text: 'Volcanoes', votes: 6 }, { id: 'b', text: 'Rivers', votes: 2 }] }] };
  const [game] = await sql(
    `insert into game_sessions (room_code, mode_id, host_user_id, set_id, set_title, settings, common, status, ended_by, player_count, voice, options, started_at, ended_at, duration_ms)
     values ('123456', 'classic', $1, $2, 'Rivers', '{}', '{}', 'completed', 'mode', 8, $3, '{}', now() - interval '6 minutes', now() - interval '1 minute', 300000) returning id`,
    [teacher.userId, setId, JSON.stringify(voice)],
  );
  await teacher.page.goto('/');
  const again = teacher.page.getByRole('region', { name: 'Host again' }).or(teacher.page.locator('section[aria-labelledby="host-again-title"]'));
  await expect(again.getByRole('link', { name: 'Host again: Classic with Rivers' })).toBeVisible();
  await check(teacher.page, 'home-host-again');
  await again.getByRole('link', { name: 'Host again: Classic with Rivers' }).click();
  await expect(teacher.page).toHaveURL(new RegExp(`/host\\?again=${game.id}`));

  await teacher.page.goto(`/reports/${game.id}`);
  await expect(teacher.page.getByRole('heading', { name: 'How it felt' })).toBeVisible();
  await expect(teacher.page.getByRole('list', { name: 'How it felt' }).getByText('Great')).toBeVisible();
  await expect(teacher.page.getByText('Which topic should we do next?')).toBeVisible();
  await expect(teacher.page.getByRole('list', { name: 'Votes: Which topic should we do next?' }).getByText('6 votes')).toBeVisible();
  await check(teacher.page, 'report-voice');
  expect(errors).toEqual([]);
});

test('a player challenges a friend, who joins from the notification, and the game starts by itself', async ({ browser }) => {
  const ana = await account(browser, { accountType: 'student', displayName: 'Ana' });
  const ben = await account(browser, { accountType: 'student', displayName: 'Ben' });
  const code = (await (await ben.page.request.get('/api/friends')).json()).friendCode;
  expect((await ana.page.request.post('/api/friends/request', { headers: CSRF, data: { friendCode: code } })).ok()).toBe(true);
  expect((await ben.page.request.post(`/api/friends/${ana.userId}/accept`, { headers: CSRF })).ok()).toBe(true);
  await makeSet(ana.page, 'Quick facts', 'unlisted');

  await ana.page.goto('/friends');
  await ana.page.getByRole('button', { name: 'Challenge Ben' }).click();
  const dialog = ana.page.getByRole('dialog', { name: 'Challenge Ben' });
  await dialog.getByRole('radio', { name: 'My sets' }).or(dialog.getByRole('button', { name: 'My sets' })).first().click();
  await dialog.getByRole('button', { name: /Quick facts/ }).click();
  await settled(ana.page);
  const axe = await new AxeBuilder({ page: ana.page }).include('[role="dialog"]').withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await dialog.getByRole('button', { name: 'Send challenge' }).click();
  await expect(ana.page).toHaveURL(/\/room\/\d{6}\?as=player/);

  await ben.page.goto('/notifications');
  await check(ben.page, 'notifications-challenge');
  await ben.page.getByRole('link', { name: /^Join: Ana challenged you to/ }).click();
  await expect(ben.page).toHaveURL(/\/join\/\d{6}/);
  await ben.page.getByRole('button', { name: 'Join game' }).click({ timeout: 15_000 });
  // Both in: it counts down and starts with nobody pressing Start.
  for (const p of [ana.page, ben.page]) await expect(p.locator('[data-chaos-part="prompt"]').first()).toBeVisible({ timeout: 40_000 });
});

test('the error page has a Glim, plain words and a way out', async ({ browser }) => {
  const player = await account(browser);
  // The page's code failing to load is one way a page breaks; the router shows its error page.
  await player.page.route(/\/assets\/Quests-[^/]+\.js$/, (r) => r.abort());
  await player.page.goto('/quests');
  await expect(player.page.getByRole('heading', { name: 'Something went wrong', level: 1 })).toBeVisible();
  await expect(player.page.getByRole('button', { name: 'Reload the page' })).toBeVisible();
  await expect(player.page.getByRole('link', { name: 'Go home' })).toBeVisible();
  await check(player.page, 'route-error');
});

test('a host invites a friend from the lobby, and a shared device returns to the join page for the next player', async ({ browser }) => {
  const host = await account(browser, { accountType: 'teacher', displayName: 'Ms Okoro' });
  const friend = await account(browser, { accountType: 'student', displayName: 'Femi' });
  const code0 = (await (await friend.page.request.get('/api/friends')).json()).friendCode;
  expect((await host.page.request.post('/api/friends/request', { headers: CSRF, data: { friendCode: code0 } })).ok()).toBe(true);
  expect((await friend.page.request.post(`/api/friends/${host.userId}/accept`, { headers: CSRF })).ok()).toBe(true);
  const setId = await makeSet(host.page);
  const room = await (await host.page.request.post('/api/rooms', { headers: CSRF, data: { setId, modeId: 'classic', options: { sharedDevices: true } } })).json();
  await host.page.goto(`/room/${room.code}`);
  await host.page.getByRole('button', { name: 'Invite a friend' }).click();
  const dialog = host.page.getByRole('dialog', { name: 'Invite a friend' });
  await dialog.getByRole('button', { name: 'Invite Femi' }).click();
  await expect(dialog.getByText('Invited')).toBeVisible();
  await settled(host.page);
  expect((await new AxeBuilder({ page: host.page }).include('[role="dialog"]').withTags(AXE_TAGS).analyze()).violations.map((v) => v.id)).toEqual([]);
  await host.page.keyboard.press('Escape');
  const note = (await (await friend.page.request.get('/api/notifications')).json()).items.find((n: { link: string }) => n.link === `/join/${room.code}`);
  expect(note.title).toMatch(/Ms Okoro invited you/);

  // A device in the class joins with just a name.
  const device = await browser.newContext();
  const kid = await device.newPage();
  await kid.goto(`/join/${room.code}`);
  await kid.getByLabel('Your name').fill('Sunny Otter');
  await kid.getByRole('button', { name: 'Join game' }).click();
  await expect(kid.getByText('You are in', { exact: true })).toBeVisible();
  // A name-only device has no account to invite friends from.
  await expect(kid.getByRole('button', { name: 'Invite a friend' })).toHaveCount(0);
  await check(kid, 'player-lobby');
  await check(host.page, 'host-lobby');
  await host.page.getByRole('button', { name: 'Start game' }).click();
  await expect(kid.locator('[data-chaos-part="prompt"]').first()).toBeVisible({ timeout: 20_000 });
  await host.page.getByRole('button', { name: 'End game' }).click();
  await host.page.getByRole('dialog').getByRole('button', { name: 'End game' }).click();
  const banner = kid.getByRole('region', { name: 'Next player' });
  await expect(banner).toBeVisible();
  await check(kid, 'next-player');
  await banner.getByRole('button', { name: 'Next player now' }).click();
  await expect(kid).toHaveURL(new RegExp(`/join/${room.code}$`));
  // Back on the join page for this game, which lets the next player in when the host starts another.
  await expect(kid.getByText('This page lets you in as soon as the host starts another.')).toBeVisible();
});

test('a player picks practice bots at a skill for a solo game, and chooses their reactions', async ({ browser }) => {
  const player = await account(browser, { accountType: 'student' });
  const more = [...QUESTIONS, ...QUESTIONS.map((q) => ({ ...q, id: `${q.id}b`, prompt: `Again: ${q.prompt}` }))];
  await makeSet(player.page, 'Solo facts', 'private', more);
  await player.page.goto('/host?solo=1');
  await player.page.getByRole('button', { name: /Solo facts/ }).first().click();
  await player.page.getByRole('radio', { name: /^Gold Rush/ }).first().click({ timeout: 10_000 });
  await player.page.getByLabel('How many').selectOption('3');
  await player.page.getByRole('radio', { name: 'Hard' }).click();
  await check(player.page, 'solo-bots');
  const made = player.page.waitForRequest((r) => r.url().endsWith('/api/rooms') && r.method() === 'POST');
  await player.page.getByRole('button', { name: 'Start playing' }).click();
  expect((await made).postDataJSON()).toMatchObject({ solo: true, practiceBots: { count: 3, level: 'hard' } });
  await expect(player.page).toHaveURL(/\/room\/\d{6}/);
  // The bots play alongside: finishing early shows them in the standings.
  await player.page.getByRole('button', { name: 'Finish now' }).click({ timeout: 20_000 });
  const confirm = player.page.getByRole('dialog').getByRole('button', { name: /Finish/ });
  if (await confirm.count()) await confirm.first().click({ timeout: 6_000 });
  await expect(player.page.getByText(/^Bot /).first()).toBeVisible({ timeout: 20_000 });

  await player.page.goto('/settings#reactions');
  const panel = player.page.locator('#reactions');
  await expect(panel.getByRole('heading', { name: 'Reactions' })).toBeVisible();
  // A shop reaction cannot be picked until it is owned.
  await expect(panel.getByRole('checkbox', { name: /Party/ })).toBeDisabled();
  await panel.getByRole('checkbox', { name: /Wave/ }).uncheck();
  await panel.getByRole('button', { name: 'Save reactions' }).click();
  await expect.poll(async () => (await (await player.page.request.get('/api/auth/me')).json()).user.preferences.reactionBar).not.toContain('wave');
  await check(player.page, 'settings-reactions');
});
