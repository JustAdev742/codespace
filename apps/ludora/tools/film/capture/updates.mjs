// Footage for "What's new": the Hills Grammar copy of Ludora, filmed frame by frame from a private
// copy on this machine (SCHOOL_THEME=hills-grammar, its own database), and the staff dashboard
// from its no-server demo (os/demo). Every Glim wears the school's uniform because the copy does.
// usage: node updates.mjs [home] [game] [economy] [school] [dash]   (no names: all)
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { launch, Recorder, pump, open, still, account, visitor, signIn, post, put, CSRF, OUT, FAKE_CLOCK } from './rig.mjs';

const want = new Set(process.argv.slice(2));
const on = (name) => want.size === 0 || want.has(name);
const BIG = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };
const DB = process.env.FILM_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/ludora_e2e_film_hills';
const DASH = process.env.FILM_DASH ?? 'http://127.0.0.1:8791/index.html';
/** The 3D home is asked for by name: this machine draws WebGL with the processor, which the app would otherwise answer with the flat menu. */
const WANT_3D = `try { localStorage.setItem('ludora.menu', 'on'); } catch {}`;

const operator = (...args) => execFileSync('node', ['server/dist/admin.js', ...args], { cwd: new URL('../../..', import.meta.url).pathname, env: { ...process.env, DATABASE_URL: DB }, encoding: 'utf8' });
const answers = (page) => page.getByRole('group', { name: 'Answers' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCIENCE = [
  { id: 'q1', type: 'mcq', prompt: 'Which of these is a planet?', choices: [{ id: 'a', text: 'Mars' }, { id: 'b', text: 'Halley' }, { id: 'c', text: 'The Sun' }, { id: 'd', text: 'The Moon' }], correct: 'a' },
  { id: 'q2', type: 'mcq', prompt: 'What do plants take in from the air?', choices: [{ id: 'a', text: 'Oxygen' }, { id: 'b', text: 'Carbon dioxide' }, { id: 'c', text: 'Helium' }, { id: 'd', text: 'Steam' }], correct: 'b' },
  { id: 'q3', type: 'mcq', prompt: 'Which force pulls things towards the ground?', choices: [{ id: 'a', text: 'Friction' }, { id: 'b', text: 'Magnetism' }, { id: 'c', text: 'Gravity' }, { id: 'd', text: 'Lift' }], correct: 'c' },
];
/** The class, and the school year each one picks on the join screen (so the lobby shows every uniform). */
const CLASS = [
  ['Aisha', 'Year 5'], ['Kai', 'Year 5'], ['Zara', 'Year 6'], ['Leo', 'Year 4'], ['Priya', 'Year 5'], ['Noah', 'Year 3'],
  ['Mia', 'Year 5'], ['Tomas', 'Year 6'], ['Ella', 'Year 2'], ['Jun', 'Year 5'], ['Sofia', 'Year 7'], ['Ravi', 'Kindergarten'],
];

/** The same student all the way through: Ada, Year 5. Made once, then signed in wherever a shot needs her. */
async function ada(browser) {
  // The same account on every run against this database, so one scene can be shot again after another (her Wallet keeps what the game paid).
  const known = { username: 'adafilm', password: 'a long film passphrase' };
  try {
    const again = await signIn(browser, known, { filmClock: false });
    const me = await (await again.page.request.get('/api/auth/me')).json();
    await again.context.close();
    if (me?.user?.id) return { ...known, userId: me.user.id };
  } catch { /* not made yet */ }
  const a = await account(browser, { accountType: 'player', displayName: 'Ada Bloom', username: known.username, viewport: BIG, deviceScaleFactor: 1.5, colorScheme: 'light', filmClock: false });
  await a.page.goto('/settings');
  const panel = a.page.locator('#uniform');
  await panel.getByLabel('School year').selectOption({ label: 'Year 5' });
  await panel.getByText(/blazer/i).first().waitFor();
  await a.page.waitForTimeout(800);
  await still(a.page, 'settings-uniform', { clip: await panel.boundingBox() ?? undefined });
  await a.context.close();
  return a;
}

/* ------------------------------------------------------------------ the 3D home, and the navigation */

async function home(browser, who) {
  const s = await signIn(browser, who, { viewport: BIG, deviceScaleFactor: 1.5, colorScheme: 'light', init: WANT_3D });
  const page = s.page;
  // The signs stand around the scene, so the list that holds them has no size of its own: wait for a sign.
  await open(page, '/', page.getByRole('navigation', { name: 'Places to go' }).getByRole('link').first(), { settleFrames: 30 });
  // The scene arrives in an idle moment after the flat menu: keep the clock moving until its canvas is drawing.
  for (let i = 0; i < 260; i++) {
    await page.evaluate((ms) => window.__film.step(ms), 1000 / 30);
    await sleep(60);
    if (i > 60 && (await page.locator('.place canvas').count())) break;
  }
  for (let i = 0; i < 120; i++) { await page.evaluate((ms) => window.__film.step(ms), 1000 / 30); await sleep(50); }
  const rec = new Recorder('home-yard', { main: page }, { quality: 94 });
  const places = page.getByRole('navigation', { name: 'Places to go' });
  const spot = async (name) => { const b = await places.getByRole('link', { name: new RegExp(`^${name}`) }).first().boundingBox(); return b ? [b.x + b.width / 2, b.y + b.height / 2] : [640, 360]; };
  let at = [640, 520];
  await page.mouse.move(at[0], at[1]);
  await rec.frames(45);
  // The pointer visits each place in turn; the place lights and the buddy points to it.
  for (const name of ['Host a game', 'Play solo', 'Game modes', 'Quests', 'Lantern shop', 'My Glims']) {
    const to = await spot(name);
    rec.mark(name.toLowerCase().replace(/ /g, '-'));
    const from = at;
    await rec.frames(16, (i) => { const u = (i + 1) / 16, e = u * u * (3 - 2 * u); return page.mouse.move(from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e); });
    at = to;
    await rec.frames(30);
  }
  await rec.frames(30);
  rec.done();
  await still(page, 'home-yard');

  // The navigation: every section with its line. A tall, sharp picture of the sidebar alone.
  const side = await signIn(browser, who, { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 3, colorScheme: 'light', filmClock: false });
  await side.page.goto('/collection');
  await side.page.getByRole('navigation', { name: 'Main' }).waitFor();
  await side.page.waitForTimeout(1200);
  const aside = await side.page.locator('aside').boundingBox();
  await still(side.page, 'sidebar', { clip: aside ?? undefined });
  await side.context.close();
  const ph = await signIn(browser, who, { viewport: PHONE, deviceScaleFactor: 3, colorScheme: 'light', filmClock: false, mobile: true });
  await ph.page.goto('/collection');
  await ph.page.getByRole('button', { name: 'More' }).click();
  await ph.page.getByRole('dialog', { name: 'Menu' }).waitFor();
  await ph.page.waitForTimeout(900);
  await still(ph.page, 'phone-menu');
  await ph.context.close();
  await s.context.close();
}

/* ------------------------------------------------------------------ a calm game with the walkthrough */

async function game(browser, who) {
  const host = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera', viewport: BIG, deviceScaleFactor: 1.5 });
  const set = await post(host.page, '/api/sets', { title: 'Science starters', description: 'Planets, plants and forces', subject: 'science', visibility: 'private', questions: SCIENCE });
  // A school's copy plays calmly unless the host says otherwise; it is asked for by name here so the footage does not depend on that.
  const room = await post(host.page, '/api/rooms', { setId: set.set.id, modeId: 'classic', common: { questionLimit: 3, shuffleQuestions: false, questionTimeSec: 120 }, settings: { autoAdvance: false }, options: { calmPlay: true, tutorial: true } });
  const code = room.code;
  await open(host.page, `/room/${code}`, host.page.getByRole('button', { name: 'Start game' }));
  await still(host.page, 'host-lobby-empty');

  // Ada joins on her phone; her year comes from her settings, so the join screen only asks to join.
  const hero = await signIn(browser, who, { viewport: PHONE, deviceScaleFactor: 2, mobile: true });
  await open(hero.page, `/join/${code}`, hero.page.getByRole('button', { name: 'Join game' }));
  let rec = new Recorder('phone-join', { main: hero.page });
  await rec.frames(24);
  await rec.during(() => hero.page.getByRole('button', { name: 'Join game' }).click());
  await rec.until(() => hero.page.getByText('You are in', { exact: true }).isVisible(), { extra: 75 });
  rec.done();
  await still(hero.page, 'phone-lobby');

  // The class: twelve small windows in real time, each choosing a school year.
  const kids = [];
  for (const [name, year] of CLASS) {
    const k = await visitor(browser, { viewport: { width: 360, height: 640 }, deviceScaleFactor: 1, filmClock: false });
    await k.page.goto(`/join/${code}`);
    await k.page.getByLabel('Your name').fill(name);
    await k.page.getByLabel('School year').selectOption({ label: year });
    kids.push(k);
  }
  rec = new Recorder('host-lobby', { main: host.page });
  await rec.frames(20);
  for (const k of kids) {
    await k.page.getByRole('button', { name: 'Join game' }).click();
    await rec.frames(8);
  }
  await rec.frames(75);
  rec.done();
  for (const k of kids) await k.page.getByText('You are in', { exact: true }).waitFor();
  await still(host.page, 'host-lobby');

  // Start: every player gets the walkthrough first. The phone goes through it; the board counts who is ready.
  const both = [host.page, hero.page];
  rec = new Recorder('walk', { host: host.page, phone: hero.page });
  await rec.frames(8);
  await rec.during(() => host.page.getByRole('button', { name: 'Start game' }).click());
  const walk = hero.page.getByRole('dialog', { name: /How to play/ });
  await rec.until(() => walk.isVisible(), { max: 300 });
  rec.mark('open');
  await rec.frames(50);
  await still(hero.page, 'phone-walk-1');
  await still(host.page, 'host-walk');
  for (let i = 0; i < 8; i++) {
    if (await walk.getByRole('button', { name: 'I’m ready' }).count()) break;
    rec.mark(`step${i + 2}`);
    await rec.during(() => walk.getByRole('button', { name: /^Next/ }).click());
    await rec.frames(44);
    if (i === 0) await still(hero.page, 'phone-walk-2');
    // The classmates say they know how to play, a few at a time, so the board's count climbs.
    for (const k of kids.slice(i * 4, i * 4 + 4)) await k.page.getByRole('button', { name: /Skip: I know how to play/ }).click({ timeout: 4000 }).catch(() => {});
  }
  for (const k of kids) await k.page.getByRole('button', { name: /Skip: I know how to play/ }).click({ timeout: 800 }).catch(() => {});
  await still(hero.page, 'phone-walk-last');
  rec.mark('ready');
  await rec.during(() => walk.getByRole('button', { name: 'I’m ready' }).click());
  await rec.until(() => host.page.getByRole('heading', { name: SCIENCE[0].prompt }).isVisible(), { max: 600 });
  rec.mark('question');
  // The question is only open for two minutes of real time, and this machine films slowly: straight on to the answer.
  await rec.frames(4);
  rec.done();

  const next = host.page.getByRole('button', { name: /Next|Skip ahead/ });
  const classAnswers = async (q, recorder) => {
    const right = SCIENCE[q].choices.find((c) => c.id === SCIENCE[q].correct).text;
    const wrong = SCIENCE[q].choices.filter((c) => c.id !== SCIENCE[q].correct).map((c) => c.text);
    for (const [i, k] of kids.entries()) {
      const miss = (i + q * 5) % 4 === 3;
      const pick = miss ? wrong[(i + q) % wrong.length] : right;
      await answers(k.page).getByRole('button', { name: new RegExp(pick) }).click({ timeout: 10000 }).catch(() => {});
      if (recorder) await recorder.frames(1);
    }
  };

  // Ada answers first (the question is only open for two minutes of real time and this machine films
  // slowly), then the class; the answer is shown once everyone is in.
  rec = new Recorder('q1', { host: host.page, phone: hero.page });
  await rec.frames(8);
  const box = await answers(hero.page).getByRole('button', { name: /Mars/ }).boundingBox();
  if (box) { rec.marks.tapX = (box.x + box.width / 2) / PHONE.width; rec.marks.tapY = (box.y + box.height / 2) / PHONE.height; }
  rec.mark('tap');
  await rec.during(() => answers(hero.page).getByRole('button', { name: /Mars/ }).click());
  await rec.frames(10);
  rec.mark('class');
  await classAnswers(0, rec);
  await rec.until(() => hero.page.getByText('Correct', { exact: true }).isVisible(), { max: 240, extra: 80 });
  await still(host.page, 'host-reveal');
  await still(hero.page, 'phone-correct');
  await rec.during(() => next.click());
  rec.mark('next');
  await rec.until(() => host.page.getByText('Leaderboard').isVisible(), { max: 240 });
  rec.mark('lead');
  await rec.frames(90);
  rec.done();
  await still(host.page, 'host-leaderboard');

  // Questions 2 and 3 are played but not filmed.
  for (const q of [1, 2]) {
    await pump(both, next.click());
    await pump(both, hero.page.getByRole('heading', { name: SCIENCE[q].prompt }).waitFor());
    await classAnswers(q, null);
    await pump(both, answers(hero.page).getByRole('button', { name: new RegExp(SCIENCE[q].choices.find((c) => c.id === SCIENCE[q].correct).text) }).click());
    await pump(both, hero.page.getByText('Correct', { exact: true }).waitFor());
    await pump(both, next.click());
    if (q === 1) await pump(both, host.page.getByText('Leaderboard').waitFor());
  }
  rec = new Recorder('podium', { host: host.page, phone: hero.page });
  await rec.until(() => hero.page.getByRole('heading', { level: 1, name: 'Game over' }).isVisible(), { max: 400 });
  rec.mark('over');
  await rec.frames(200);
  rec.done();
  await still(host.page, 'host-results');
  await still(hero.page, 'phone-result');
  for (const k of kids) await k.context.close();
  await hero.context.close();
  await host.context.close();
}

/* Ada's Wallet on her phone: what she has, a goal from her wishlist, and where every Spark came and went.
   She has bought one Lantern, so the list shows spending too, and she saves for a Glim she cannot yet afford. */
const GOAL = 'l-daily-glim-ashbloom';
async function filmWallet(page) {
  const before = (await (await page.request.get('/api/shop')).json()).balances.sparks;
  if (before >= 500) await post(page, '/api/shop/purchase', { listingId: 'l-lantern-starfall', requestKey: randomUUID() });
  await page.request.delete('/api/me/wishlist/l-lantern-moonlit', { headers: CSRF }).catch(() => {});
  await put(page, `/api/me/wishlist/${GOAL}`, {});
  await open(page, '/wallet', page.getByRole('heading', { name: 'Wallet', level: 1 }), { settleFrames: 40 });
  const rec = new Recorder('wallet', { main: page });
  await rec.frames(50);
  await page.getByLabel('Choose from your wishlist').selectOption(GOAL);
  await rec.frames(12);
  rec.mark('goal');
  await rec.during(() => page.getByRole('button', { name: 'Save for this' }).click());
  await rec.until(() => page.getByRole('progressbar', { name: /Saving for/ }).isVisible(), { max: 200, extra: 60 });
  rec.mark('scroll');
  const tall = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const steps = Math.max(1, Math.ceil(tall / 7));
  await rec.frames(steps, () => page.evaluate(() => window.scrollBy(0, 7)));
  rec.mark('end');
  await rec.frames(60);
  rec.done();
  await page.evaluate(() => window.scrollTo(0, 0));
  await pump([page], page.waitForTimeout(6000));
  await still(page, 'wallet-top');
  await still(page, 'wallet-full', { fullPage: true });
}

async function wallet(browser, who) {
  const a = await signIn(browser, who, { viewport: PHONE, deviceScaleFactor: 2, colorScheme: 'light', mobile: true });
  await filmWallet(a.page);
  await a.context.close();
}

/* ------------------------------------------------------------------ Wallet, class rewards, sales, the economy room */

async function economy(browser, who) {
  // The economy manager: a role granted with the operator's own command, as on a real copy.
  const econ = await account(browser, { accountType: 'player', displayName: 'Robin Ledger', viewport: BIG, deviceScaleFactor: 1.5, colorScheme: 'light', filmClock: false });
  operator('grant', econ.username, 'economist', '--reason', 'filming the economy room');
  const day = 86_400_000;
  const until = new Date(Date.now() + 3 * day);
  until.setHours(18, 0, 0, 0);
  await put(econ.page, '/api/admin/economy/sales/l-lantern-moonlit', { salePrice: 15, startsAt: new Date(Date.now() - 3_600_000).toISOString(), endsAt: until.toISOString(), reason: 'A sale for the end of term' });
  const rules = (await (await econ.page.request.get('/api/admin/economy/rules')).json()).rules;
  await put(econ.page, '/api/admin/economy/rules', { rules: { ...rules, boost: { label: 'Double Sparks', multiplier: 2, startsAt: new Date(Date.now() - 3_600_000).toISOString(), endsAt: until.toISOString() } }, reason: 'A boost for the end of term' });

  // The teacher, her class, and six students in it (Ada among them).
  const teacher = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera', viewport: BIG, deviceScaleFactor: 1.5, colorScheme: 'light' });
  const made = await post(teacher.page, '/api/classes', { name: 'Year 5 Willow' });
  const adaPage = await signIn(browser, who, { viewport: PHONE, deviceScaleFactor: 2, colorScheme: 'light', mobile: true });
  await post(adaPage.page, '/api/classes/join', { code: made.class.joinCode });
  for (const name of ['Ben Okafor', 'Chloe Tan', 'Dev Shah', 'Amira Said', 'Finn Walsh']) {
    const k = await account(browser, { accountType: 'player', displayName: name, filmClock: false });
    await post(k.page, '/api/classes/join', { code: made.class.joinCode });
    await k.context.close();
  }

  // Rewards: the whole class for teamwork, then Ada for an answer.
  await open(teacher.page, `/classes/${made.class.id}?tab=rewards`, teacher.page.getByRole('heading', { name: 'Give Sparks' }), { settleFrames: 30 });
  await teacher.page.evaluate(() => { const h = [...document.querySelectorAll('h2')].find((e) => e.textContent?.includes('Give Sparks')); h?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -110); });
  let rec = new Recorder('rewards', { main: teacher.page });
  await rec.frames(30);
  await rec.during(() => teacher.page.getByRole('radio', { name: /Whole class/ }).click());
  await rec.frames(18);
  rec.mark('reason');
  await rec.during(() => teacher.page.getByRole('button', { name: 'Great teamwork' }).click());
  await rec.frames(26);
  rec.mark('give');
  await rec.during(() => teacher.page.getByRole('button', { name: /Give 10 Sparks each to 6 students/ }).click());
  await rec.until(() => teacher.page.getByText(/440 left of 500/).isVisible(), { max: 240, extra: 70 });
  rec.done();
  await pump([teacher.page], teacher.page.getByRole('radio', { name: /One student/ }).click());
  // Her entry also says what she has had this week, so it is found by her name and chosen by its value.
  const adaOption = await teacher.page.getByLabel('Student', { exact: true }).locator('option', { hasText: 'Ada Bloom' }).getAttribute('value');
  await pump([teacher.page], teacher.page.getByLabel('Student', { exact: true }).selectOption(adaOption ?? ''));
  await pump([teacher.page], teacher.page.getByLabel('Sparks', { exact: true }).fill('20'));
  await pump([teacher.page], teacher.page.getByRole('button', { name: 'Brilliant answer' }).click());
  await pump([teacher.page], teacher.page.getByRole('button', { name: 'Give 20 Sparks to Ada Bloom' }).click());
  await pump([teacher.page], teacher.page.getByText(/420 left of 500/).waitFor());
  await pump([teacher.page], teacher.page.waitForTimeout(5000));
  await still(teacher.page, 'rewards');
  await teacher.context.close();

  const page = adaPage.page;
  await filmWallet(page);

  // The shop says a sale calmly: "On sale until Sunday", never a countdown.
  await open(page, '/shop?tab=lanterns', page.getByRole('article').filter({ hasText: 'Moonlit Lantern' }).first(), { settleFrames: 40 });
  const card = page.getByRole('article').filter({ hasText: 'Moonlit Lantern' }).first();
  await card.scrollIntoViewIfNeeded();
  await pump([page], page.waitForTimeout(800));
  await still(page, 'shop-sale', { clip: await card.boundingBox() ?? undefined });
  await still(page, 'shop-phone');
  await adaPage.context.close();

  // The economy room: health, a rule with its preview, sales, and a grant against the daily limit.
  const e = econ.page;
  await e.goto('/staff/economy');
  await e.getByRole('heading', { name: 'Day by day' }).waitFor();
  await e.waitForLoadState('networkidle');
  await e.waitForTimeout(800);
  await still(e, 'econ-health');
  await still(e, 'econ-health-full', { fullPage: true });
  await e.getByRole('tab', { name: 'Rules' }).click();
  await e.getByLabel('Sparks per correct answer').fill('6');
  await e.getByText(/earns 108 Sparks instead of 92/).first().waitFor();
  await e.getByLabel('Sparks per correct answer').scrollIntoViewIfNeeded();
  await e.evaluate(() => window.scrollBy(0, -260));
  await e.waitForTimeout(600);
  await still(e, 'econ-rules');
  await e.getByRole('button', { name: 'Discard changes' }).click();
  await e.getByRole('tab', { name: 'Shop and sales' }).click();
  await e.getByRole('row').filter({ hasText: 'Moonlit Lantern' }).first().waitFor();
  await e.waitForTimeout(600);
  await still(e, 'econ-sales');
  await e.getByRole('tab', { name: 'Grants and refunds' }).click();
  await e.getByLabel('Find an account').fill('Ben Okafor');
  await e.getByRole('button', { name: /Ben Okafor/ }).first().click();
  await e.getByRole('button', { name: 'Grant currency or an item' }).click();
  const dlg = e.getByRole('dialog');
  await dlg.getByLabel('Amount').fill('500').catch(() => {});
  await dlg.getByLabel('Reason').fill('Lost Sparks after a dropped game').catch(() => {});
  await e.waitForTimeout(500);
  await still(e, 'econ-grant-dialog');
  await econ.context.close();
}

/* ------------------------------------------------------------------ the school's own pages */

async function school(browser) {
  // The front page of the school's copy, signed out, light and dark.
  for (const scheme of ['light', 'dark']) {
    const v = await visitor(browser, { viewport: BIG, deviceScaleFactor: 1.5, colorScheme: scheme, filmClock: false, mobile: false });
    await v.page.goto('/');
    await v.page.getByRole('heading', { level: 1 }).waitFor();
    await v.page.waitForTimeout(1500);
    await still(v.page, `landing-${scheme}`);
    await v.context.close();
  }
  // Class login cards, as they print.
  const t = await account(browser, { accountType: 'teacher', displayName: 'Ms Rivera', viewport: BIG, deviceScaleFactor: 2, colorScheme: 'light', filmClock: false });
  const made = await post(t.page, '/api/classes', { name: 'Year 5 Willow' });
  await t.page.goto(`/classes/${made.class.id}?tab=students`);
  await t.page.getByRole('button', { name: 'Make class logins' }).click();
  await t.page.getByLabel('First names').fill('Amira\nBen\nChloe\nDev');
  await t.page.getByRole('button', { name: 'Make 4 logins' }).click();
  const cards = t.page.getByRole('list', { name: 'Login cards' });
  await cards.waitFor();
  await t.page.waitForTimeout(900);
  await still(t.page, 'class-logins', { clip: await cards.boundingBox() ?? undefined });
  await t.context.close();
}

/* ------------------------------------------------------------------ the staff dashboard (its no-server demo) */

// The guard's own sentences, as the sentinel writes them, in the order an attack unfolds. No attacker-chosen text here: the demo keeps that for showing the page is safe to read.
function world(scenario, now) {
  const ev = (ago, severity, kind, text) => ({ at: Math.floor(now - ago), severity, kind, text });
  const calm = [
    ev(26 * 3600, 'info', 'sentinel', 'Sentinel started. Watching 9 decoy listeners, SSH and the web log.'),
    ev(22 * 3600, 'info', 'backup', 'Nightly backup made and encrypted (212 MB). 7 kept.'),
    ev(5.2 * 3600, 'info', 'backup', 'Nightly backup made and encrypted (214 MB). 7 kept.'),
    ev(40 * 60, 'info', 'sentinel', 'Game P4TT started with 24 players.'),
    ev(17 * 60, 'info', 'doctor', 'Self-check: 21 passed, 0 failed, 1 could not be checked.'),
    ev(9 * 60, 'info', 'sentinel', 'All quiet: 0 bans, 0 refused sign-ins in the last hour.'),
  ];
  const attack = [
    ev(190, 'warning', 'probe', '10.20.3.41 asked for /.env and 2 other pages that only other software has. Banned for 15 min.'),
    ev(160, 'warning', 'login', '10.20.3.52 tried to sign in to Ludora 20 times in five minutes. Banned for 60 min.'),
    ev(130, 'warning', 'decoy', '10.20.3.44 connected to decoy port 445. Banned for 15 min.'),
    ev(100, 'warning', 'flood', '10.20.3.45 made 912 requests in ten seconds. Banned for 15 min.'),
    ev(80, 'warning', 'flood', '10.20.3.46 made 1,404 requests in ten seconds. Banned for 60 min.'),
    ev(60, 'alert', 'shield', 'Shield raised: 5 addresses misbehaved within two minutes. Every limit is quartered for everyone outside the staff addresses.'),
    ev(50, 'alert', 'level', 'Threat level: under attack.'),
    ev(35, 'notice', 'integrity', 'Game K7QX: a player answered five questions faster than a person can.'),
    ev(20, 'info', 'alert-delivery', 'Security alert sent to 2 of 2 recipients.'),
  ];
  const bans = {};
  if (scenario === 'attack') [9, 52, 7, 10, 55].forEach((left, i) => { bans[`10.20.3.${[41, 52, 44, 45, 46][i]}`] = now + left * 60 + 20; });
  return {
    scenario, session: { since: now, seen: now }, failures: [], paused: 0,
    settings: { DOMAIN: 'play.school.example', TLS_MODE: 'internal', OPERATOR_NAME: 'Example School', OPERATOR_CONTACT: 'privacy@school.example', ALERT_SECURITY_TO: 'it@school.example,ntfy:ludora-k3j9x2m8q7wz', ALERT_UPKEEP_TO: 'it@school.example', ALERT_CHEAT_TO: 'it@school.example', ALERT_QUIET_MINUTES: '10', SMTP_HOST: 'smtp.school.example', SMTP_PORT: '587', SMTP_SECURITY: 'starttls', SMTP_USER: 'ludora@school.example', SMTP_FROM: 'ludora@school.example', NTFY_SERVER: 'https://ntfy.sh' },
    secrets: { smtp_password: true, telegram_token: false },
    shield_mode: 'auto', lockdown: false, bans, events: scenario === 'attack' ? [...calm, ...attack] : calm,
    doctor_at: now - 17 * 60, backups: 7, backup_at: now - 5.2 * 3600, support: null,
    analyst: { enabled: scenario === 'attack', installed: scenario === 'attack' },
    // A long gap before the scenario adds events of its own, so the list on screen is the one written here.
    last_event: now + 3600, next_host: 60, last_change: null, outage: [0, 0], move: null,
  };
}

async function dash(browser) {
  const WIDE = { width: 1440, height: 810 };
  const HIDE_STRIP = `document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.demo { display: none !important; }'; document.head.appendChild(st); });`;
  const seed = (scenario) => `try { sessionStorage.setItem('ludora-dash-demo', JSON.stringify({ scenario: ${JSON.stringify(scenario)}, world: (${world.toString()})(${JSON.stringify(scenario)}, Date.now() / 1000) })); } catch {}`;
  const window_ = async (scenario, viewport = WIDE, dsf = 4 / 3, extra = {}) => {
    const context = await browser.newContext({ viewport, deviceScaleFactor: dsf, reducedMotion: 'no-preference', colorScheme: 'dark', ...extra });
    await context.addInitScript(FAKE_CLOCK);
    await context.addInitScript(seed(scenario));
    await context.addInitScript(HIDE_STRIP);
    const page = await context.newPage();
    await pump([page], page.goto(`${DASH}#overview`));
    await pump([page], page.waitForSelector('#app:not([hidden])'));
    await pump([page], page.evaluate(() => document.fonts.ready.then(() => true)));
    for (let i = 0; i < 45; i++) { await page.evaluate((ms) => window.__film.step(ms), 1000 / 30); await sleep(15); }
    return { context, page };
  };
  // One scripted step of the pretend server, then the dashboard's own refresh key so it shows at once.
  const tell = async (page, fn, ...args) => { await page.evaluate(([f, a]) => window.ludoraDemo.script[f](...a), [fn, args]); };
  const refresh = (page) => page.keyboard.press('r');

  // One take: a calm morning, a probe, guessing, a flood, the shield, then calm again.
  const { context, page } = await window_('calm');
  let rec = new Recorder('dash-attack', { main: page }, { quality: 95 });
  await rec.frames(75);
  await still(page, 'dash-calm');
  rec.mark('probe');
  await tell(page, 'event', 'warning', 'probe', '10.20.3.41 asked for /.env and 2 other pages that only other software has. Banned for 15 min.');
  await tell(page, 'ban', '10.20.3.41', 15);
  await tell(page, 'scenario', 'watchful');
  await refresh(page);
  await rec.frames(60);
  await still(page, 'dash-watchful');
  rec.mark('guess');
  await tell(page, 'event', 'warning', 'login', '10.20.3.52 tried to sign in to Ludora 20 times in five minutes. Banned for 60 min.');
  await tell(page, 'ban', '10.20.3.52', 60);
  await refresh(page);
  await rec.frames(36);
  rec.mark('decoy');
  await tell(page, 'event', 'warning', 'decoy', '10.20.3.44 connected to decoy port 445. Banned for 15 min.');
  await tell(page, 'ban', '10.20.3.44', 15);
  await refresh(page);
  await rec.frames(36);
  rec.mark('attack');
  await tell(page, 'event', 'warning', 'flood', '10.20.3.45 made 912 requests in ten seconds. Banned for 15 min.');
  await tell(page, 'ban', '10.20.3.45', 15);
  await tell(page, 'event', 'warning', 'flood', '10.20.3.46 made 1,404 requests in ten seconds. Banned for 60 min.');
  await tell(page, 'ban', '10.20.3.46', 60);
  await tell(page, 'event', 'alert', 'shield', 'Shield raised: 5 addresses misbehaved within two minutes. Every limit is quartered for everyone outside the staff addresses.');
  await tell(page, 'event', 'alert', 'level', 'Threat level: under attack.');
  await tell(page, 'scenario', 'attack');
  await tell(page, 'analyst', true);
  await refresh(page);
  await rec.frames(105);
  await still(page, 'dash-attack');
  rec.mark('told');
  await tell(page, 'event', 'notice', 'integrity', 'Game K7QX: a player answered five questions faster than a person can.');
  await tell(page, 'event', 'info', 'alert-delivery', 'Security alert sent to 2 of 2 recipients.');
  await refresh(page);
  await rec.frames(20);
  // Down the page: the services, the traffic each second, and what the sentinel has seen, line by line.
  rec.mark('scroll');
  const tall = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const steps = Math.ceil(Math.min(tall, 1500) / 9);
  await rec.frames(steps, () => page.evaluate(() => window.scrollBy(0, 9)));
  rec.mark('feed');
  await rec.frames(75);
  rec.done();
  await still(page, 'dash-feed');
  await still(page, 'dash-attack-full', { fullPage: true });

  // The Security section: who is banned, the shield, and lockdown switched on by hand.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.keyboard.press('2');
  for (let i = 0; i < 40; i++) { await page.evaluate((ms) => window.__film.step(ms), 1000 / 30); await sleep(15); }
  rec = new Recorder('dash-security', { main: page }, { quality: 95 });
  await rec.frames(60);
  await still(page, 'dash-security');
  const lock = page.locator('#lock-toggle');
  const y = await lock.evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 420);
  const from = await page.evaluate(() => window.scrollY);
  await rec.frames(30, (i) => page.evaluate(([a, b, u]) => window.scrollTo(0, a + (b - a) * (u * u * (3 - 2 * u))), [from, y, (i + 1) / 30]));
  await rec.frames(24);
  rec.mark('lock');
  await rec.during(() => lock.click());
  await rec.frames(30);
  await still(page, 'dash-lock-ask');
  rec.mark('yes');
  await rec.during(() => page.locator('#confirm-yes').click());
  await rec.until(() => page.locator('#lock-out').evaluate((el) => /Lockdown is on/.test(el.textContent || '')), { max: 240, extra: 75 });
  rec.done();
  await still(page, 'dash-locked');
  await still(page, 'dash-security-full', { fullPage: true });

  // It passes: lockdown off, bans run out, the level comes back down.
  await pump([page], lock.click());
  await pump([page], page.waitForTimeout(1500));
  // Opening the site again asks nothing; closing it does.
  if (await page.locator('#confirm').evaluate((d) => d.open)) await pump([page], page.locator('#confirm-yes').click());
  await pump([page], page.waitForTimeout(4000));
  await tell(page, 'clearBans');
  await tell(page, 'scenario', 'calm');
  await tell(page, 'event', 'info', 'sentinel', 'All quiet: 0 bans, 0 refused sign-ins in the last hour.');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.keyboard.press('1');
  for (let i = 0; i < 20; i++) { await page.evaluate((ms) => window.__film.step(ms), 1000 / 30); await sleep(15); }
  rec = new Recorder('dash-calm', { main: page }, { quality: 95 });
  await rec.frames(120);
  rec.done();

  // Health (the self-check, backups) and set-up (the site's name, email, who is told), as sharp pictures.
  await page.keyboard.press('4');
  await pump([page], page.waitForTimeout(2500));
  await still(page, 'dash-health');
  await still(page, 'dash-health-full', { fullPage: true });
  await page.keyboard.press('3');
  await pump([page], page.waitForTimeout(2500));
  await still(page, 'dash-setup');
  await still(page, 'dash-setup-full', { fullPage: true });
  await context.close();

  // On a phone, as a member of staff would open it away from their desk.
  const ph = await window_('attack', PHONE, 3, { isMobile: true, hasTouch: true });
  await still(ph.page, 'dash-phone');
  await ph.context.close();
}

const browser = await launch();
try {
  let who = null;
  if (on('home') || on('game') || on('economy') || on('wallet')) who = await ada(browser);
  // One scene failing does not stop the others being shot; it is named at the end.
  const failed = [];
  const shoot = async (name, fn) => { if (!on(name)) return; try { await fn(); } catch (e) { failed.push(name); console.log(`SCENE FAILED: ${name}\n${String(e?.stack ?? e).slice(0, 1500)}`); } };
  await shoot('game', () => game(browser, who));
  await shoot('economy', () => economy(browser, who));
  await shoot('wallet', () => wallet(browser, who));
  await shoot('home', () => home(browser, who));
  await shoot('school', () => school(browser));
  await shoot('dash', () => dash(browser));
  if (failed.length) console.log(`failed scenes: ${failed.join(', ')}`);
  console.log(`footage in ${OUT}`);
} finally {
  await browser.close();
}
