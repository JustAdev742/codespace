import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { account, CSRF, operator, settled, watchErrors } from './helpers.ts';

/*
 * A school's own copy, end to end: school staff (granted with the operator CLI, the way every role
 * is) set up houses, the school's values and a notice and event; a teacher sorts a student into a
 * house, gives a merit and sets sport days; the student is welcomed to their house, sees the
 * countdown and notice on home, the School page's standings, cups, competitions and notices, and the
 * merit on their profile. Then a house match: the lobby seats carry house chips and a spectator
 * screen shows the room read only. Every screen passes axe (WCAG 2.2 A and AA) with no sideways
 * scrolling at a school laptop's size and on a phone.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SHOTS = process.env.SCHOOL_SHOTS;

async function check(page: Page, name: string, include?: string) {
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || !Number.isFinite(Number(a.effect?.getComputedTiming().endTime))), undefined, { timeout: 5000 })
    .catch(() => {});
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  }
  await settled(page);
  let builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
  if (include) builder = builder.include(include);
  const axe = await builder.analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), name).toEqual([]);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways, `${name} scrolls sideways`).toBeLessThanOrEqual(0);
}

/** Both widths: a school laptop and a phone. */
async function checkBoth(page: Page, name: string) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await check(page, `${name}-1366`);
  await page.setViewportSize({ width: 390, height: 844 });
  await check(page, `${name}-390`);
  await page.setViewportSize({ width: 1366, height: 768 });
}

test('school staff set up houses, a teacher sorts and rewards, a student sees their school', async ({ browser }) => {
  test.setTimeout(240_000);
  const staff = await account(browser, { displayName: 'Ms Office' });
  const teacher = await account(browser, { accountType: 'teacher', displayName: 'Mr Rivers' });
  const student = await account(browser, { displayName: 'Ada Lovelace' });
  expect(operator('grant', staff.username, 'school_staff', '--reason', 'e2e')).toContain('Granted');
  const errors = [...watchErrors(staff.page)];
  const teacherErrors = watchErrors(teacher.page);
  const studentErrors = watchErrors(student.page);

  // School staff: houses, through the form.
  await staff.page.goto('/school/manage');
  await expect(staff.page.getByRole('heading', { name: 'Run the school', level: 1 })).toBeVisible();
  for (const [name, colour, emblem] of [['Banksia', 3, 'Leaf'], ['Waratah', 1, 'Flame']] as const) {
    await staff.page.getByLabel('Name', { exact: true }).fill(name);
    await staff.page.getByLabel(`Colour ${colour} of 13`).check({ force: true });
    await staff.page.getByLabel(emblem, { exact: true }).check({ force: true });
    await staff.page.getByRole('button', { name: 'Add house' }).click();
    await expect(staff.page.getByRole('list').getByText(name, { exact: true })).toBeVisible();
  }
  await checkBoth(staff.page, 'manage-houses');
  // The school's values.
  await staff.page.getByRole('tab', { name: 'Rules and values' }).click();
  await staff.page.getByLabel('The school’s values').fill('Kindness\nCourage');
  await staff.page.getByRole('button', { name: 'Save settings' }).click();
  await expect(staff.page.getByText('School settings saved')).toBeVisible();
  await checkBoth(staff.page, 'manage-rules');
  // A notice for everyone, and an event in three days.
  await staff.page.getByRole('tab', { name: 'Notices' }).click();
  await staff.page.getByLabel('Title').fill('Mufti day on Friday');
  await staff.page.getByLabel('Notice', { exact: true }).fill('Wear your house colours.');
  await staff.page.getByRole('button', { name: 'Schedule' }).click();
  await expect(staff.page.getByRole('listitem').getByText('Mufti day on Friday')).toBeVisible();
  await checkBoth(staff.page, 'manage-notices');
  const day = 86_400_000;
  // A retry runs on the same database: clear events an earlier run left, so this one is the next.
  for (const e of (await (await staff.page.request.get('/api/school/events')).json()).events as { id: string }[]) await staff.page.request.delete(`/api/school/events/${e.id}`, { headers: CSRF });
  const ev = await staff.page.request.post('/api/school/events', { headers: CSRF, data: { title: 'Swimming carnival', message: 'At the town pool', decor: 'sun', hue: 200, startsAt: new Date(Date.now() + 3 * day).toISOString(), endsAt: new Date(Date.now() + 3.3 * day).toISOString() } });
  expect(ev.ok(), await ev.text()).toBe(true);
  await staff.page.getByRole('tab', { name: 'Usage' }).click();
  await expect(staff.page.getByRole('heading', { name: 'Live games each week' })).toBeVisible();
  await checkBoth(staff.page, 'manage-usage');
  // A student cannot run the school, whatever the browser asks for.
  expect((await student.page.request.post('/api/school/houses', { headers: CSRF, data: { name: 'Mine', hue: 10, emblem: 'star' } })).status()).toBe(403);

  // The teacher: a class, the student in it, a house, a merit and sport days.
  const cls = (await (await teacher.page.request.post('/api/classes', { headers: CSRF, data: { name: 'Year 5 Blue' } })).json()).class;
  expect((await student.page.request.post('/api/classes/join', { headers: CSRF, data: { code: cls.joinCode } })).ok()).toBe(true);
  await teacher.page.goto('/school/classes');
  await teacher.page.getByRole('link', { name: /Year 5 Blue/ }).click();
  await teacher.page.getByLabel('House for Ada Lovelace').selectOption({ label: 'Banksia' });
  await expect(teacher.page.getByText('Ada Lovelace is in Banksia')).toBeVisible();
  await teacher.page.getByRole('button', { name: 'Give Ada Lovelace a merit' }).click();
  const merit = teacher.page.getByRole('dialog');
  await merit.getByLabel('Value').selectOption('Courage');
  await merit.getByLabel('What for (optional)').fill('Spoke up in assembly');
  await check(teacher.page, 'merit-dialog', '[role="dialog"]');
  await merit.getByRole('button', { name: 'Give merit' }).click();
  await expect(teacher.page.getByText(/Merit given to Ada Lovelace: 5 house points/)).toBeVisible();
  await teacher.page.getByLabel('Wednesday').check();
  await teacher.page.getByRole('button', { name: 'Save sport days' }).click();
  await expect(teacher.page.getByText('Sport days saved')).toBeVisible();
  await checkBoth(teacher.page, 'class-houses');
  // A tournament among named teams: the bracket page.
  const t = await (await teacher.page.request.post('/api/school/tournaments', { headers: CSRF, data: { name: 'Spelling cup', format: 'knockout', entrants: [{ name: 'Owls' }, { name: 'Hawks' }, { name: 'Year 5 Blue', classId: cls.id }] } })).json();
  await teacher.page.goto(`/school/tournaments/${t.tournament.id}`);
  await expect(teacher.page.getByRole('heading', { name: 'Final', exact: true })).toBeVisible();
  await teacher.page.getByRole('button', { name: 'Record result' }).first().click();
  await teacher.page.getByRole('dialog').getByRole('button', { name: /won$/ }).first().click();
  await expect(teacher.page.getByText('Result saved')).toBeVisible();
  await checkBoth(teacher.page, 'tournament');

  // The student: welcomed to their house on home, with the countdown and the notice.
  await student.page.goto('/');
  const welcome = student.page.getByRole('dialog', { name: 'You are in Banksia' });
  await expect(welcome).toBeVisible();
  await check(student.page, 'welcome', '[role="dialog"]');
  await welcome.getByRole('button', { name: 'Let’s go' }).click();
  await expect(welcome).toBeHidden();
  await expect(student.page.getByRole('heading', { name: 'Swimming carnival' })).toBeVisible();
  await expect(student.page.getByText('Mufti day on Friday')).toBeVisible();
  await expect(student.page.getByText(/^(3|2) days to go$/)).toHaveCount(1);
  await checkBoth(student.page, 'home');
  // The welcome is shown once.
  await student.page.reload();
  await expect(student.page.getByRole('heading', { name: 'Swimming carnival' })).toBeVisible();
  await expect(student.page.getByRole('dialog')).toHaveCount(0);

  // The School page: standings (the merit's 5 points), cups, competitions and notices.
  await student.page.goto('/school');
  await expect(student.page.getByText('Your house')).toBeVisible();
  const board = student.page.getByRole('list', { name: /House standings/ });
  await expect(board.getByRole('listitem').first()).toContainText('Banksia');
  await expect(board.getByRole('listitem').first()).toContainText('5');
  await checkBoth(student.page, 'school-standings');
  for (const tab of ['Cups and hall of fame', 'Tournaments and challenges', 'Notices']) {
    await student.page.getByRole('tab', { name: tab }).click();
    await expect(student.page.getByRole('tabpanel')).toBeVisible();
    await checkBoth(student.page, `school-${tab.split(' ')[0]!.toLowerCase()}`);
  }
  await expect(student.page.getByRole('tabpanel').getByText('Mufti day on Friday')).toBeVisible();
  expect(new URL(student.page.url()).searchParams.get('tab')).toBe('notices');

  // The merit on the student's profile, with the teacher's note for the student.
  await student.page.goto(`/profile/${student.userId}`);
  const merits = student.page.getByRole('region', { name: /Merits/ });
  await expect(merits.getByRole('list', { name: 'Merits by value' })).toContainText('Courage');
  await expect(merits.getByText('Spoke up in assembly')).toBeVisible();
  await checkBoth(student.page, 'profile-merits');

  // On a school's copy that dresses Glims in uniform, the Locker has the uniform and sport days.
  if (process.env.E2E_SCHOOL_THEME === 'hills-grammar') {
    await student.page.goto('/locker');
    const panel = student.page.getByRole('region', { name: 'School uniform' });
    await panel.getByLabel('School year').selectOption({ label: 'Year 8' });
    await expect(panel.getByText('Green blazer, red jumper and striped tie')).toBeVisible();
    // The teacher set Wednesday for the class: on a Wednesday at school the Glim is in sport kit already.
    await expect(panel.getByText(/Your teacher set these for your class|Today is a sport day/)).toBeVisible();
    await panel.getByText('Fri', { exact: true }).click();
    await panel.getByRole('button', { name: 'Save sport days' }).click();
    await expect(student.page.getByText('Sport days saved')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Use my class’s days' })).toBeVisible();
    await checkBoth(student.page, 'locker-uniform');
  }

  expect([...errors, ...teacherErrors, ...studentErrors]).toEqual([]);
});

test('a house match seats houses, and a spectator screen shows the room read only', async ({ browser }) => {
  test.setTimeout(180_000);
  const staff = await account(browser, { displayName: 'Ms Office' });
  const teacher = await account(browser, { accountType: 'teacher', displayName: 'Mrs Hall' });
  const student = await account(browser, { displayName: 'Grace Hopper' });
  const viewer = await account(browser, { displayName: 'Hall Screen' });
  expect(operator('grant', staff.username, 'school_staff', '--reason', 'e2e')).toContain('Granted');
  const ensure = async (name: string, hue: number, emblem: string) => {
    const r = await staff.page.request.post('/api/school/houses', { headers: CSRF, data: { name, hue, emblem } });
    expect([200, 409]).toContain(r.status());
  };
  await ensure('Banksia', 40, 'leaf');
  await ensure('Waratah', 0, 'flame');
  const houses = (await (await staff.page.request.get('/api/school')).json()).houses as { id: string; name: string }[];
  expect((await staff.page.request.put(`/api/school/students/${student.userId}/house`, { headers: CSRF, data: { houseId: houses.find((h) => h.name === 'Waratah')!.id } })).ok()).toBe(true);
  await student.page.request.post('/api/school/me/welcomed', { headers: CSRF });
  // A school event on today: the host's lobby wears it.
  const on = await staff.page.request.post('/api/school/events', { headers: CSRF, data: { title: 'House day', decor: 'bunting', hue: 140, startsAt: new Date(Date.now() - 3_600_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString() } });
  expect(on.ok(), await on.text()).toBe(true);
  const errors = watchErrors(teacher.page);
  const viewerErrors = watchErrors(viewer.page);

  // The teacher hosts a house match from My classes.
  await teacher.page.goto('/school/classes');
  await teacher.page.getByRole('button', { name: 'House match' }).click();
  const dialog = teacher.page.getByRole('dialog', { name: 'Host a house match' });
  await expect(dialog.getByLabel('Question set').locator('option').first()).toBeAttached();
  await check(teacher.page, 'house-match-dialog', '[role="dialog"]');
  await dialog.getByRole('button', { name: 'Open the room' }).click();
  await teacher.page.waitForURL(/\/room\/\d{6}/);
  const code = teacher.page.url().match(/\/room\/(\d{6})/)![1]!;

  // The student joins: their seat carries their house, and the teams are the houses.
  await student.page.goto(`/join/${code}`);
  await student.page.getByRole('button', { name: 'Join game' }).click();
  await expect(teacher.page.getByText('Grace Hopper')).toBeVisible();
  await expect(teacher.page.getByText('Waratah').first()).toBeVisible();
  await expect(teacher.page.getByText('Banksia').first()).toBeVisible();
  await expect(teacher.page.getByText('Today at school:')).toContainText('House day');
  await check(teacher.page, 'lobby-house-match');

  // The spectator screen: the room code, the player and their house; it cannot start the game.
  await viewer.page.goto(`/school/watch/${code}?hall=1`);
  await expect(viewer.page.getByText(code).first()).toBeVisible();
  const players = viewer.page.getByRole('list', { name: 'Players in the room' });
  await expect(players.getByText('Grace Hopper')).toBeVisible();
  await expect(viewer.page.getByRole('list', { name: 'Houses in the room' }).getByText('Waratah')).toBeVisible();
  await check(viewer.page, 'hall-screen');
  await expect(viewer.page.getByRole('button', { name: /Start/ })).toHaveCount(0);
  // Signed out, there is no spectator screen.
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(`/school/watch/${code}`);
  await expect(anonPage.getByRole('heading', { name: 'Sign in to show this game' })).toBeVisible();
  await anon.close();

  await staff.page.request.delete(`/api/school/events/${(await on.json()).event.id}`, { headers: CSRF });
  expect([...errors, ...viewerErrors]).toEqual([]);
});
