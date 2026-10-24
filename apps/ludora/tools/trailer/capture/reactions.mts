// Films the room reacting: students waving from the lobby, then everyone firing reactions at the big screen
// when an answer is revealed, and the teacher pressing Play again with the same players.
import { type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startCast } from './cast.mts';
import { launch, teacher, openRoom, join, crowd, autoplay, dismiss, pause, vis, NAMES } from './rig.mts';

const OUT = process.argv[2]!;
// A bigger class makes a fuller screen of reactions.
const CLASS = [...NAMES, 'Sam', 'Ava', 'Omar', 'Lily', 'Ravi', 'Chloe', 'Ben', 'Hana', 'Luca', 'Ines', 'Theo', 'Nia'].slice(0, Number(process.argv[3] ?? 8));
mkdirSync(OUT, { recursive: true });
const browser = await launch();
const host = await teacher(browser);
const code = await openRoom(host.page, 'Classic');

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;
const react = (p: Page, emote: string) => p.getByRole('button', { name: `React: ${emote}` }).click({ timeout: 600 }).catch(() => {});
let mood: 'lobby' | 'game' | 'off' = 'lobby';
// Each phone reacts to what it sees: waves in the lobby, cheers for a right answer, a laugh or a gasp for a wrong one.
function reactor(p: Page, keen: number) {
  let on = true;
  const done = (async () => {
    while (on) {
      try {
        if (mood === 'lobby') {
          if (Math.random() < keen * 0.35) await react(p, pick(['wave', 'wave', 'heart', 'fire']));
        } else if (mood === 'game') {
          const main = p.locator('main');
          if (await vis(main.getByText(/^Correct$/).first())) {
            if (Math.random() < keen) await react(p, pick(['clap', 'fire', 'wow', 'gg', 'heart', 'clap', 'fire']));
          } else if (await vis(main.getByText(/^(Incorrect|Partly right.*)$/).first())) {
            if (Math.random() < keen * 0.7) await react(p, pick(['laugh', 'wow', 'think']));
          }
        }
      } catch {
        /* the page moved on */
      }
      await pause(350 + Math.random() * 500);
    }
  })();
  return { stop: () => (on = false), done };
}

const hero = await join(browser, code, NAMES[0]!, { dpr: 2 });
const heroPlay = autoplay(hero, 0.95);
const reactors = [reactor(hero, 0.9)];
let cast = await startCast(host.page, `${OUT}/l1-lobby`);
const players = await crowd(browser, code, CLASS.slice(1), 300, [0.95, 0.92, 0.9, 0.88, 0.85, 0.8]);
players.forEach((pl, i) => reactors.push(reactor(pl.page, 0.95 - i * 0.05)));
await pause(5000);
console.log('l1', await cast.stop());

let hosting = true;
const hostLoop = (async () => {
  while (hosting) {
    const next = host.page.getByRole('button', { name: /^Next$/ });
    if (await vis(next)) await next.click().catch(() => {});
    await pause(700);
  }
})();
mood = 'game';
await host.page.getByRole('button', { name: /^Start/ }).first().click();
// Three rounds on the projector, each from the question to the next one, reactions flying at the reveal.
const questionOn = (p: Page) => p.locator('main').getByRole('group', { name: 'Answers' }).or(p.locator('main').getByPlaceholder(/^Type (a number|your answer)$/)).or(p.locator('main').getByRole('button', { name: /^Lock in/ }));
for (let r = 1; r <= 3; r++) {
  await questionOn(hero).first().waitFor({ timeout: 60_000 });
  // The projector and the hero's phone at once, so both show the same question.
  cast = await startCast(host.page, `${OUT}/x${r}-big`);
  const phoneCast = await startCast(hero, `${OUT}/x${r}-phone`);
  const t0 = Date.now();
  await pause(2500);
  while (Date.now() - t0 < 22_000 && !(await vis(questionOn(hero).first()))) await pause(250);
  console.log(`x${r}`, await cast.stop(), await phoneCast.stop());
  await host.page.screenshot({ path: `${OUT}/x${r}-big-end.png` });
}

// The end: the podium, then Play again with the same players.
mood = 'off';
hosting = false;
await hostLoop;
await host.page.getByRole('button', { name: /^End game$/ }).click();
const confirm = host.page.getByRole('dialog').getByRole('button', { name: /^(End game|End now|End)/ });
if (await vis(confirm.first())) await confirm.first().click();
await pause(6000);
cast = await startCast(host.page, `${OUT}/a1-again`);
await pause(900);
await host.page.getByRole('button', { name: 'Play again with the same players' }).click();
mood = 'lobby';
await pause(5000);
console.log('a1', await cast.stop());
await host.page.screenshot({ path: `${OUT}/a1-again.png` });
for (const rr of reactors) rr.stop();
heroPlay.stop();
await dismiss(players);
await browser.close();
