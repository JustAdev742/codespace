// Films a whole Classic game: the hero joining on a phone, the lobby filling, rounds on the projector,
// right answers on the phone, the leaderboard, and the podium. Each round is its own clip.
import { type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startCast } from './cast.mts';
import { launch, teacher, openRoom, join, crowd, answer, dismiss, pause, vis, NAMES, PHONE, BASE } from './rig.mts';

const OUT = process.argv[2]!;
const ROUNDS = Number(process.argv[3] ?? 8);
mkdirSync(OUT, { recursive: true });
const browser = await launch();
const host = await teacher(browser);
const code = await openRoom(host.page, 'Classic');
console.log('room', code);
await pause(1500);

// P1: the hero types her name and joins.
const heroCtx = await browser.newContext({ baseURL: BASE, viewport: PHONE, deviceScaleFactor: 2, colorScheme: 'dark', hasTouch: true, isMobile: true });
const hero = await heroCtx.newPage();
await hero.goto(`/join/${code}`);
await hero.getByLabel('Your name').waitFor();
await pause(800);
let cast = await startCast(hero, `${OUT}/p1-join`);
await pause(700);
await join(browser, code, NAMES[0]!, { typeSlowly: true, page: hero });
await pause(2200);
console.log('p1', await cast.stop());

// B1: the lobby on the projector as the class arrives.
cast = await startCast(host.page, `${OUT}/b1-lobby`);
await pause(800);
const players = await crowd(browser, code, NAMES.slice(1), 650);
await pause(2000);
console.log('b1', await cast.stop());
await host.page.screenshot({ path: `${OUT}/b1-lobby.png` });

const main = (p: Page) => p.locator('main');
const questionOn = (p: Page) => main(p).getByRole('group', { name: 'Answers' }).or(main(p).getByPlaceholder(/^Type (a number|your answer)$/)).or(main(p).getByRole('button', { name: /^Lock in/ }));
let hosting = true;
const hostLoop = (async () => {
  while (hosting) {
    const next = host.page.getByRole('button', { name: /^Next$/ });
    if (await vis(next)) await next.click().catch(() => {});
    await pause(700);
  }
})();

await host.page.getByRole('button', { name: /^Start/ }).first().click();
for (let r = 1; r <= ROUNDS; r++) {
  await questionOn(hero).first().waitFor({ timeout: 60_000 });
  const onPhone = r === 2 || r === 4 || r === 6;
  const target = onPhone ? hero : host.page;
  cast = await startCast(target, `${OUT}/r${r}-${onPhone ? 'phone' : 'big'}`);
  await pause(1800 + Math.random() * 900);
  await answer(hero, 0.97);
  // Until the next question shows, or 16 s.
  const t0 = Date.now();
  await pause(1500);
  while (Date.now() - t0 < 16_000 && !(await vis(questionOn(hero).first()))) await pause(250);
  console.log(`r${r}`, onPhone ? 'phone' : 'big', await cast.stop());
}

// B5: end the game; film the podium on the projector, then the phone's results.
hosting = false;
await hostLoop;
for (const p of players) p.stop();
await questionOn(hero).first().waitFor({ timeout: 30_000 }).catch(() => {});
cast = await startCast(host.page, `${OUT}/b5-podium`);
await host.page.getByRole('button', { name: /^End game$/ }).click();
const confirm = host.page.getByRole('dialog').getByRole('button', { name: /^(End game|End now|End)/ });
if (await vis(confirm.first())) await confirm.first().click();
await pause(7500);
console.log('b5', await cast.stop());
await host.page.screenshot({ path: `${OUT}/b5-podium.png` });
cast = await startCast(hero, `${OUT}/p7-results`);
await pause(3000);
console.log('p7', await cast.stop());
await hero.screenshot({ path: `${OUT}/p7-results.png` });
console.log('report', host.page.url());
await dismiss(players);
await browser.close();
