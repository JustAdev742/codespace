// Films and photographs what the montage does not: a Lantern opening, the collection and shop on a phone,
// and the teacher's side on a laptop (library, editor, a game report, a class, settings, moderation).
import { type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startCast } from './cast.mts';
import { launch, teacher, register, openRoom, crowd, dismiss, pause, vis, NAMES, PHONE, BASE } from './rig.mts';

const OUT = process.argv[2]!;
const PARTS = new Set(process.argv.slice(3).length ? process.argv.slice(3) : ['lantern', 'teacher']);
mkdirSync(OUT, { recursive: true });
const DB = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/ludora_e2e_trailer';
const ADMIN_CLI = fileURLToPath(new URL('../../../server/dist/admin.js', import.meta.url));
const browser = await launch();
const LAPTOP = { width: 1920, height: 1080 };

const api = (page: Page, method: string, path: string, body?: unknown) =>
  page.evaluate(
    async ([m, p, b]) => {
      const r = await fetch(p as string, { method: m as string, headers: { 'content-type': 'application/json', 'x-ludora-csrf': '1' }, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    [method, path, body] as const,
  );

if (PARTS.has('lantern')) {
  // A staff account sets Maya up as a test account with plenty to spend, through the real staff tools.
  const staffCtx = await browser.newContext({ baseURL: BASE, viewport: LAPTOP });
  const staff = await staffCtx.newPage();
  await staff.goto('/');
  const staffName = `staff${Date.now().toString(36).slice(-6)}`;
  await register(staff, { username: staffName, password: 'a long trailer passphrase', displayName: 'Staff', accountType: 'player' });
  execFileSync('node', [ADMIN_CLI, 'grant', staffName, 'superadmin', '--reason', 'trailer footage'], { env: { ...process.env, DATABASE_URL: DB } });
  const phoneCtx = await browser.newContext({ baseURL: BASE, viewport: PHONE, deviceScaleFactor: 2, colorScheme: 'dark', hasTouch: true, isMobile: true });
  // The local server is a development build, so the header carries a "Dev" badge that production does not show.
  await phoneCtx.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = 'span[title^="Test environment"] { display: none !important; }';
      document.head.appendChild(style);
    });
  });
  const maya = await phoneCtx.newPage();
  await maya.goto('/');
  const mayaName = `maya${Date.now().toString(36).slice(-6)}`;
  const mayaId = await register(maya, { username: mayaName, password: 'a long trailer passphrase', displayName: 'Maya', accountType: 'student' });
  console.log('flag', (await api(staff, 'POST', `/api/admin/testing/accounts/${mayaId}/test-flag`, { isTest: true, reason: 'trailer footage', confirm: mayaName })).status);
  for (const scenario of ['wealthy', 'every_cosmetic']) console.log(scenario, (await api(staff, 'POST', `/api/admin/testing/accounts/${mayaId}/scenario`, { scenario, reason: 'trailer footage' })).status);

  // Open Lanterns until a legendary or mythic lands, filming each opening; the guarantee makes each epic or better.
  let kept = false;
  for (let i = 1; i <= 10 && !kept; i++) {
    console.log('pity', (await api(staff, 'POST', `/api/admin/testing/accounts/${mayaId}/scenario`, { scenario: 'pity_ready', reason: 'trailer footage' })).status);
    await maya.goto('/shop');
    await maya.getByRole('tab', { name: 'Lanterns' }).click();
    await pause(1200);
    if (i === 1) await maya.screenshot({ path: `${OUT}/shop-lanterns.png` });
    await maya.getByRole('button', { name: /^Buy Starfall Lantern for/i }).first().click().catch(async () => maya.getByRole('button', { name: /^Buy .* Lantern for/i }).first().click());
    await pause(700);
    const cast = await startCast(maya, `${OUT}/lantern-${i}`);
    await maya.getByRole('button', { name: /^Open it for/ }).click();
    await maya.getByText(/New to your collection|You have \d+ now/).first().waitFor({ timeout: 15_000 }).catch(() => {});
    await pause(2600);
    console.log('lantern', i, await cast.stop());
    const text = (await maya.locator('body').innerText()).toUpperCase();
    const rarity = ['MYTHIC', 'LEGENDARY', 'EPIC'].find((r) => text.includes(r)) ?? '?';
    console.log('rarity', i, rarity);
    await maya.screenshot({ path: `${OUT}/lantern-${i}-${rarity.toLowerCase()}.png` });
    kept = rarity === 'MYTHIC' || rarity === 'LEGENDARY';
    await maya.getByRole('button', { name: 'Done' }).click().catch(() => {});
  }
  await maya.goto('/collection');
  await pause(1500);
  await maya.screenshot({ path: `${OUT}/collection-phone.png` });
  await maya.screenshot({ path: `${OUT}/collection-phone-full.png`, fullPage: true });
  await maya.goto('/locker');
  await pause(1500);
  await maya.screenshot({ path: `${OUT}/locker-phone.png` });
  // The same pages on a laptop.
  const lapCtx = await browser.newContext({ baseURL: BASE, viewport: LAPTOP, colorScheme: 'dark', storageState: await phoneCtx.storageState() });
  const lap = await lapCtx.newPage();
  for (const [name, path] of [['collection', '/collection'], ['shop', '/shop'], ['home-student', '/']] as const) {
    await lap.goto(path);
    await pause(1500);
    await lap.screenshot({ path: `${OUT}/${name}-laptop.png` });
  }
  await staff.goto('/staff');
  await pause(1500);
  await staff.screenshot({ path: `${OUT}/staff-overview.png` });
  await staff.goto('/staff/reports');
  await pause(1500);
  await staff.screenshot({ path: `${OUT}/staff-reports.png` });
  await lapCtx.close();
  await phoneCtx.close();
  await staffCtx.close();
}

if (PARTS.has('teacher')) {
  const t = await teacher(browser, LAPTOP);
  const page = t.page;
  // A short game, so the reports have something to show.
  const code = await openRoom(page, 'Classic');
  const players = await crowd(browser, code, NAMES, 0);
  await pause(800);
  await page.getByRole('button', { name: /^Start/ }).first().click();
  for (let i = 0; i < 70; i++) {
    const next = page.getByRole('button', { name: /^Next$/ });
    if (await vis(next)) await next.click().catch(() => {});
    await pause(1000);
  }
  await page.getByRole('button', { name: /^End game$/ }).click();
  const confirm = page.getByRole('dialog').getByRole('button', { name: /^(End game|End now|End)/ });
  if (await vis(confirm.first())) await confirm.first().click();
  await pause(3000);
  await dismiss(players);
  await page.goto('/reports');
  await pause(1500);
  await page.screenshot({ path: `${OUT}/reports.png` });
  await page.locator('a[href^="/reports/"]').first().click();
  await pause(2500);
  await page.screenshot({ path: `${OUT}/report.png` });
  await page.screenshot({ path: `${OUT}/report-full.png`, fullPage: true });
  for (const [name, path] of [['library', '/library'], ['modes', '/modes'], ['host-setup', '/host'], ['settings', '/settings'], ['home-teacher', '/']] as const) {
    await page.goto(path);
    await pause(1500);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  await page.goto('/modes/night-market');
  await pause(1500);
  await page.screenshot({ path: `${OUT}/mode-detail.png` });
  // A set of the teacher's own in the editor.
  await page.goto('/sets/new');
  await page.getByLabel('Title').fill('Year 8: Forces and Motion');
  await page.getByLabel('Subject').selectOption('science').catch(() => {});
  await page.getByLabel('Question', { exact: true }).fill('What force pulls objects towards the Earth?');
  const choices = page.getByLabel(/^Choice [A-D]$/);
  for (const [i, text] of ['Friction', 'Gravity', 'Magnetism', 'Air resistance'].entries()) await choices.nth(i).fill(text).catch(() => {});
  await page.getByLabel('Choice B is correct').check().catch(() => {});
  await page.getByRole('button', { name: /^True or false/ }).last().click().catch(() => {});
  await page.getByLabel('Statement', { exact: true }).last().fill('A heavier object always falls faster in a vacuum.').catch(() => {});
  await page.locator('label').filter({ has: page.getByRole('radio', { name: 'False' }) }).last().click().catch(() => {});
  await pause(800);
  await page.screenshot({ path: `${OUT}/editor.png` });
  await page.screenshot({ path: `${OUT}/editor-full.png`, fullPage: true });
  // A class.
  await page.goto('/classes');
  await page.getByRole('button', { name: 'New class' }).first().click();
  await page.getByLabel('Class name').fill('8R Science');
  await page.getByRole('button', { name: 'Create class' }).click();
  await pause(2500);
  await page.screenshot({ path: `${OUT}/class.png` });
  await t.ctx.close();
}
await browser.close();
