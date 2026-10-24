// Films every class mode: a hosted game with eight named students, the projector mid-game, and a phone.
import { mkdirSync } from 'node:fs';
import { startCast } from './cast.mts';
import { launch, teacher, openRoom, join, crowd, autoplay, dismiss, pause, vis, NAMES } from './rig.mts';

const OUT = process.argv[2]!;
// [mode title, seconds into the game for the shot]
const ALL: [string, number][] = [
  ['Comet Dash', 16], ['Quick Draw', 14], ['Lantern Out', 16], ['Confidence', 9], ['Glimgo', 16], ['Lantern Match', 16],
  ['Word Scramble', 18], ['Sky Lanterns', 30], ['Gloom Giant', 18], ['Tug of War', 18], ['Night Market', 28], ['Lantern Guard', 34],
  ['Glim Duels', 26], ['Lantern Trail', 28], ['Lantern Lands', 32], ['Festival Workshop', 32],
];
const only = process.argv.slice(3);
const MODES = only.length ? ALL.filter(([m]) => only.includes(m)) : ALL;
mkdirSync(OUT, { recursive: true });
const browser = await launch();
const host = await teacher(browser);

for (const [mode, at] of MODES) {
  const slug = mode.toLowerCase().replace(/ /g, '-');
  try {
    const code = await openRoom(host.page, mode);
    const hero = await join(browser, code, NAMES[0]!, { dpr: 2 });
    const heroPlay = autoplay(hero, 0.9);
    const players = await crowd(browser, code, NAMES.slice(1), 0);
    await pause(800);
    await host.page.getByRole('button', { name: /^Start/ }).first().click();
    let hosting = true;
    const hostLoop = (async () => {
      while (hosting) {
        const next = host.page.getByRole('button', { name: /^Next$/ });
        if (await vis(next)) await next.click().catch(() => {});
        await pause(700);
      }
    })();
    await pause(at * 1000);
    let cast = await startCast(host.page, `${OUT}/${slug}-big`);
    await pause(5000);
    console.log(mode, 'big', await cast.stop());
    await host.page.screenshot({ path: `${OUT}/${slug}-big.png` });
    cast = await startCast(hero, `${OUT}/${slug}-phone`);
    await pause(4000);
    console.log(mode, 'phone', await cast.stop());
    await hero.screenshot({ path: `${OUT}/${slug}-phone.png` });
    await pause(6000);
    await host.page.screenshot({ path: `${OUT}/${slug}-big-later.png` });
    hosting = false;
    await hostLoop;
    heroPlay.stop();
    await heroPlay.done.catch(() => {});
    await host.page.getByRole('button', { name: /^End game$/ }).click().catch(() => {});
    const confirm = host.page.getByRole('dialog').getByRole('button', { name: /^(End game|End now|End)/ });
    if (await vis(confirm.first())) await confirm.first().click();
    await pause(2500);
    await host.page.screenshot({ path: `${OUT}/${slug}-results.png` });
    await dismiss(players);
    await hero.context().close();
  } catch (e) {
    console.log('FAIL', mode, String(e).split('\n')[0]);
  }
}
await browser.close();
