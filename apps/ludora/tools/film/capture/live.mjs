// The live shots: a real game from lobby to podium on the big screen and a phone, and the making
// tools, filmed frame by frame from the private filming copy (every page on the film clock).
// usage: node live.mjs [game] [make] [gallery] [designs] [tools]   (no names: all)
import { launch, Recorder, pump, open, still, account, visitor, post } from './rig.mjs';

const want = new Set(process.argv.slice(2));
const on = (name) => want.size === 0 || want.has(name);
const BIG = { width: 1280, height: 720 };

const SPACE = [
  { id: 'q1', type: 'mcq', prompt: 'Which planet is known as the red planet?', choices: [{ id: 'a', text: 'Mars' }, { id: 'b', text: 'Venus' }, { id: 'c', text: 'Jupiter' }, { id: 'd', text: 'Mercury' }], correct: 'a' },
  { id: 'q2', type: 'mcq', prompt: 'What is the largest planet in our solar system?', choices: [{ id: 'a', text: 'Saturn' }, { id: 'b', text: 'Jupiter' }, { id: 'c', text: 'Neptune' }, { id: 'd', text: 'Earth' }], correct: 'b' },
  { id: 'q3', type: 'mcq', prompt: 'How long does light from the Sun take to reach Earth?', choices: [{ id: 'a', text: 'About 8 seconds' }, { id: 'b', text: 'About 8 hours' }, { id: 'c', text: 'About 8 minutes' }, { id: 'd', text: 'About 8 days' }], correct: 'c' },
  { id: 'q4', type: 'mcq', prompt: 'Which planet has the most famous rings?', choices: [{ id: 'a', text: 'Uranus' }, { id: 'b', text: 'Mars' }, { id: 'c', text: 'Venus' }, { id: 'd', text: 'Saturn' }], correct: 'd' },
];
const CLASS = ['Aisha', 'Kai', 'Zara', 'Leo', 'Priya', 'Noah', 'Mia', 'Tomas', 'Ella', 'Jun', 'Sofia', 'Ravi'];
const answers = (page) => page.getByRole('group', { name: 'Answers' });

async function game(browser) {
  const host = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera', viewport: BIG, deviceScaleFactor: 1.5 });
  const set = await post(host.page, '/api/sets', { title: 'Space explorers', description: 'Planets, light and rings', subject: 'science', visibility: 'private', questions: SPACE });
  const room = await post(host.page, '/api/rooms', { setId: set.set.id, modeId: 'classic', common: { questionLimit: 4, shuffleQuestions: false, questionTimeSec: 120 }, settings: { autoAdvance: false } });
  const code = room.code;
  await open(host.page, `/room/${code}`, host.page.getByRole('button', { name: 'Start game' }));

  // The hero phone joins with just a name.
  const hero = await visitor(browser);
  await open(hero.page, `/join/${code}`, hero.page.getByLabel('Your name'));
  let rec = new Recorder('phone-join', { main: hero.page });
  await rec.frames(8);
  await hero.page.getByLabel('Your name').click();
  for (const ch of 'Sunny Otter') { await hero.page.keyboard.insertText(ch); await rec.frames(2); }
  await rec.frames(10);
  await rec.during(() => hero.page.getByRole('button', { name: 'Join game' }).click());
  await rec.until(() => hero.page.getByText('You are in', { exact: true }).isVisible(), { extra: 60 });
  rec.done();

  // The class: twelve small windows in real time, names typed, ready to press Join one after another.
  const kids = [];
  for (const name of CLASS) {
    const k = await visitor(browser, { viewport: { width: 360, height: 640 }, deviceScaleFactor: 1, filmClock: false });
    await k.page.goto(`/join/${code}`);
    await k.page.getByLabel('Your name').fill(name);
    kids.push(k);
  }
  rec = new Recorder('host-lobby', { main: host.page });
  await rec.frames(18);
  for (const k of kids) {
    await k.page.getByRole('button', { name: 'Join game' }).click();
    await rec.frames(7);
  }
  await rec.frames(60);
  rec.done();
  for (const k of kids) await k.page.getByText('You are in', { exact: true }).waitFor();
  await still(host.page, 'host-lobby');
  await still(hero.page, 'phone-lobby');

  const both = [host.page, hero.page];
  const next = host.page.getByRole('button', { name: /Next|Skip ahead/ });
  const classAnswers = async (q, recorder) => {
    const right = SPACE[q].choices.find((c) => c.id === SPACE[q].correct).text;
    const wrong = SPACE[q].choices.filter((c) => c.id !== SPACE[q].correct).map((c) => c.text);
    for (const [i, k] of kids.entries()) {
      // Most of the class is right (the game shuffles the choices, so they are found by their words);
      // a few are not, and not always the same few, so the leaderboard has some shape.
      const miss = (i + q * 5) % 4 === 3;
      const pick = miss ? wrong[(i + q) % wrong.length] : right;
      await answers(k.page).getByRole('button', { name: new RegExp(pick) }).click({ timeout: 10000 }).catch(() => {});
      if (recorder) await recorder.frames(2);
    }
  };

  // Question 1, big screen and phone in step: start, get ready, the question, the class answering,
  // the hero's answer, the reveal, the leaderboard.
  rec = new Recorder('q1', { host: host.page, phone: hero.page });
  await rec.frames(10);
  await rec.during(() => host.page.getByRole('button', { name: 'Start game' }).click());
  await rec.until(() => host.page.getByRole('heading', { name: SPACE[0].prompt }).isVisible(), { max: 500 });
  rec.mark('question');
  await rec.frames(24);
  await classAnswers(0, rec);
  await rec.frames(8);
  // Where on the phone the thumb lands (as fractions of the screen), so the film can show the touch.
  const marsBox = await answers(hero.page).getByRole('button', { name: /Mars/ }).boundingBox();
  if (marsBox) { rec.marks.tapX = (marsBox.x + marsBox.width / 2) / 390; rec.marks.tapY = (marsBox.y + marsBox.height / 2) / 844; }
  rec.mark('tap');
  await rec.during(() => answers(hero.page).getByRole('button', { name: /Mars/ }).click());
  await rec.until(() => hero.page.getByText('Correct', { exact: true }).isVisible(), { max: 200, extra: 80 });
  await still(host.page, 'host-reveal');
  await still(hero.page, 'phone-correct');
  await rec.during(() => next.click());
  rec.mark('next');
  await rec.until(() => host.page.getByText('Leaderboard').isVisible(), { max: 200 });
  rec.mark('lead');
  await rec.frames(96);
  rec.done();
  await still(host.page, 'host-leaderboard');

  // Question 2: the phone meets a new question and answers it.
  rec = new Recorder('q2', { host: host.page, phone: hero.page });
  await rec.during(() => next.click());
  await rec.until(() => hero.page.getByRole('heading', { name: SPACE[1].prompt }).isVisible(), { max: 300, extra: 30 });
  await still(host.page, 'host-question');
  await still(hero.page, 'phone-question');
  await classAnswers(1, rec);
  rec.mark('tap');
  await rec.during(() => answers(hero.page).getByRole('button', { name: /Jupiter/ }).click());
  await rec.until(() => hero.page.getByText('Correct', { exact: true }).isVisible(), { max: 200, extra: 50 });
  rec.done();

  // Questions 3 and 4 are played but not filmed.
  for (const q of [2, 3]) {
    await pump(both, next.click());
    await pump(both, host.page.getByText('Leaderboard').waitFor());
    await pump(both, next.click());
    await pump(both, hero.page.getByRole('heading', { name: SPACE[q].prompt }).waitFor());
    await classAnswers(q, null);
    await pump(both, answers(hero.page).getByRole('button', { name: new RegExp(SPACE[q].choices.find((c) => c.id === SPACE[q].correct).text) }).click());
    await pump(both, hero.page.getByText('Correct', { exact: true }).waitFor());
  }

  // The end: the podium on the big screen and the player's own end card.
  rec = new Recorder('podium', { host: host.page, phone: hero.page });
  await rec.frames(6);
  await rec.during(() => next.click());
  await rec.until(() => hero.page.getByRole('heading', { level: 1, name: 'Game over' }).isVisible(), { max: 400 });
  rec.mark('over');
  await rec.frames(240);
  rec.done();
  await still(host.page, 'host-results');
  await still(hero.page, 'phone-result');

  // The report a teacher gets.
  await open(host.page, '/reports', host.page.getByRole('heading', { level: 1 }));
  await still(host.page, 'reports');
  const first = host.page.getByRole('link', { name: /Space explorers/ }).first();
  if (await first.count()) {
    await pump([host.page], first.click());
    await pump([host.page], host.page.waitForTimeout(1500));
    await still(host.page, 'report-game');
    await still(host.page, 'report-game-full', { fullPage: true });
  }
  for (const k of kids) await k.context.close();
  await hero.context.close();
  await host.context.close();
}

const NOTES = `Rivers of the world
The Nile is the longest river in Africa.
The Amazon carries more water than any other river.
The Thames flows through London to the North Sea.

source - where a river starts
mouth - where a river meets the sea
tributary - a smaller river that joins a bigger one
meander - a bend in a river`;

async function make(browser) {
  const t = await account(browser, { accountType: 'teacher', displayName: 'Mr Okafor', viewport: BIG, deviceScaleFactor: 1.5 });
  const page = t.page;
  await open(page, '/make', page.getByRole('heading', { level: 1, name: 'Make' }));
  await still(page, 'make-empty');
  await open(page, '/make/quick', page.getByLabel('Notes, a word list or a table'));
  const rec = new Recorder('make-notes', { main: page });
  await rec.frames(12);
  await page.getByLabel('Notes, a word list or a table').click();
  await rec.type(page, NOTES, 3);
  await rec.frames(14);
  await rec.during(() => page.getByRole('button', { name: 'Make questions' }).click());
  await rec.until(() => page.getByRole('heading', { level: 1, name: 'Keep the questions you like' }).isVisible(), { max: 200, extra: 45 });
  await rec.frames(48, () => page.evaluate(() => window.scrollBy(0, 8)));
  await rec.frames(30);
  rec.done();
  await page.evaluate(() => window.scrollTo(0, 0));
  await still(page, 'make-questions');
  await pump([page], page.getByRole('button', { name: 'Save and choose a game' }).click());
  await pump([page], page.getByRole('heading', { level: 1, name: 'Play it' }).waitFor());
  await pump([page], page.waitForTimeout(1200));
  await still(page, 'make-play');
  await open(page, '/make', page.getByRole('heading', { level: 1, name: 'Make' }));
  await still(page, 'make');
  await t.context.close();
}

async function gallery(browser) {
  const t = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera', viewport: BIG, deviceScaleFactor: 1.5 });
  const page = t.page;
  await open(page, '/modes', page.getByRole('heading', { level: 1 }), { settleFrames: 45 });
  await still(page, 'modes');
  const rec = new Recorder('modes-scroll', { main: page });
  await rec.frames(15);
  await rec.frames(170, () => page.evaluate(() => window.scrollBy(0, 13)));
  await rec.frames(15);
  rec.done();
  await open(page, '/collection', page.getByRole('heading', { level: 1 }), { settleFrames: 45 });
  await still(page, 'collection');
  await still(page, 'collection-full', { fullPage: true });
  await open(page, '/shop', page.getByRole('heading', { level: 1 }), { settleFrames: 45 });
  await still(page, 'shop');
  await t.context.close();
}

async function designs(browser) {
  // Tall, so the Glim and the painter are both in the picture; the film crops what it needs.
  const s = await account(browser, { accountType: 'student', displayName: 'Robin Park', viewport: { width: 1280, height: 1500 }, deviceScaleFactor: 1.5 });
  const page = s.page;
  await open(page, '/designs', page.getByRole('heading', { name: 'My designs' }));
  await pump([page], page.getByRole('button', { name: 'New Glim' }).click());
  await pump([page], page.getByRole('button', { name: 'Randomise' }).waitFor());
  await pump([page], page.waitForTimeout(2500));
  await still(page, 'designs-new');
  let rec = new Recorder('designs-shuffle', { main: page });
  await rec.frames(10);
  for (let i = 0; i < 8; i++) {
    await rec.during(() => page.getByRole('button', { name: 'Randomise' }).click());
    await rec.frames(13);
  }
  await rec.frames(20);
  rec.done();
  const painter = page.getByRole('grid', { name: /Markings painter/ });
  await pump([page], page.getByRole('button', { name: 'Clear the grid' }).click().catch(() => {}));
  await pump([page], page.getByRole('radio', { name: 'Left and right' }).click().catch(() => {}));
  const cells = [[4, 4], [4, 5], [4, 6], [5, 3], [5, 4], [5, 5], [5, 6], [6, 3], [6, 4], [6, 5], [6, 6], [7, 4], [7, 5], [7, 6], [8, 5], [8, 6], [9, 6]];
  rec = new Recorder('designs-paint', { main: page });
  await rec.frames(10);
  for (const [r, c] of cells) {
    await painter.getByRole('gridcell', { name: new RegExp(`^Row ${r}, column ${c}:`) }).click({ timeout: 5000 }).catch(() => {});
    await rec.frames(4);
  }
  await rec.frames(40);
  rec.done();
  await still(page, 'designs-painted');
  await s.context.close();
}

async function tools(browser) {
  const t = await account(browser, { accountType: 'teacher', displayName: 'Ms Patel', viewport: BIG, deviceScaleFactor: 1.5 });
  const page = t.page;
  const oak = (await post(page, '/api/classes', { name: 'Year 5 Oak' })).class;
  for (const name of ['Ada Bright', 'Bo Chen', 'Cleo Diaz', 'Dev Shah', 'Eli Moon', 'Fay Okoro', 'Gus Lind', 'Hana Sato']) {
    const s = await account(browser, { accountType: 'student', displayName: name, viewport: { width: 400, height: 400 }, deviceScaleFactor: 1, filmClock: false });
    await post(s.page, '/api/classes/join', { code: oak.joinCode });
    await s.context.close();
  }
  await open(page, `/classes/${oak.id}`, page.getByRole('link', { name: 'Class tools' }));
  await still(page, 'class');
  await open(page, `/classes/${oak.id}/tools`, page.getByRole('button', { name: 'Pick a student' }));
  const rec = new Recorder('tools-picker', { main: page });
  await rec.frames(10);
  await rec.during(() => page.getByRole('button', { name: 'Pick a student' }).click());
  await rec.frames(75);
  await rec.during(() => page.getByRole('region', { name: 'Countdown' }).getByRole('button', { name: 'Start', exact: true }).click().catch(() => {}));
  await rec.frames(75);
  rec.done();
  await still(page, 'tools');
  await open(page, '/today', page.getByRole('heading', { level: 1 }));
  await still(page, 'today');
  await t.context.close();
}

const browser = await launch();
for (const [name, fn] of [['game', game], ['make', make], ['gallery', gallery], ['designs', designs], ['tools', tools]]) {
  if (!on(name)) continue;
  try {
    await fn(browser);
    console.log(`== ${name} done`);
  } catch (e) {
    console.log(`== ${name} FAILED: ${String(e.stack ?? e.message).split('\n').slice(0, 4).join(' | ')}`);
  }
}
await browser.close();
