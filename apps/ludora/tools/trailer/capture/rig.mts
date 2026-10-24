// The filming rig: a teacher hosting on a projector-sized screen, named students joining on phones and playing
// like real players (mostly right, at human speed, making their mode's choices).
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { SETS } from '@ludora/content';

// Filmed at a neutral local-network address instead of 127.0.0.1:8990, which the lobby would print.
export const BASE = process.env.BASE ?? 'http://ludora.local';
export const CSRF = { 'x-ludora-csrf': '1' };
export const PROJECTOR = { width: 1280, height: 720 };
export const PHONE = { width: 390, height: 844 };
export const NAMES = ['Maya', 'Leo', 'Aisha', 'Tomás', 'Priya', 'Jonah', 'Zara', 'Kofi'];

type AnyQ = Record<string, unknown> & { prompt: string; type: string };
const QUESTIONS = new Map<string, AnyQ>();
for (const s of SETS) for (const q of s.questions as unknown as AnyQ[]) QUESTIONS.set(q.prompt.trim(), q);

export async function launch(): Promise<Browser> {
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-proxy-server', '--host-resolver-rules=MAP ludora.local:80 127.0.0.1:8990'] });
}

export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const vis = async (l: { isVisible(): Promise<boolean> }) => l.isVisible().catch(() => false);

/** A signed-in teacher on a projector-sized screen, dark theme (the stage is dark anyway). */
export async function teacher(browser: Browser, viewport = PROJECTOR, dpr = 1): Promise<{ ctx: BrowserContext; page: Page; username: string; id: string }> {
  const ctx = await browser.newContext({ baseURL: BASE, viewport, deviceScaleFactor: dpr, colorScheme: 'dark' });
  const username = `msreed${Date.now().toString(36).slice(-6)}`;
  const page = await ctx.newPage();
  await page.goto('/');
  const id = await register(page, { username, password: 'a long trailer passphrase', displayName: 'Ms Reed', accountType: 'teacher' });
  return { ctx, page, username, id };
}

/** Registers through the page itself (the API client outside the browser cannot resolve ludora.local). */
export async function register(page: Page, data: Record<string, string>): Promise<string> {
  return page.evaluate(async (body) => {
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ludora-csrf': '1' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`register ${r.status} ${await r.text()}`);
    const me = await (await fetch('/api/auth/me')).json();
    return me.user.id as string;
  }, data);
}

/** Opens a room for `mode` (its title on the host page) with `set` and returns the join code. */
export async function openRoom(host: Page, mode: string, set = 'General Knowledge Mix'): Promise<string> {
  await host.goto('/host');
  await host.getByText(set, { exact: false }).first().click();
  await host.getByRole('radio', { name: new RegExp(`^${mode}\\b`) }).first().check();
  await host.getByRole('button', { name: /^(Create|Open|Start|Host)/ }).first().click();
  await host.waitForURL(/\/room\//, { timeout: 20_000 });
  return host.url().split('/room/')[1]!.slice(0, 6);
}

export interface Player {
  ctx: BrowserContext;
  page: Page;
  name: string;
  stop: () => void;
  done: Promise<void>;
}

/** A guest joins on a phone. `typeSlowly` types the name like a person (for the camera). */
export async function join(browser: Browser, code: string, name: string, opts: { dpr?: number; typeSlowly?: boolean; page?: Page } = {}): Promise<Page> {
  const page = opts.page ?? (await (await browser.newContext({ baseURL: BASE, viewport: PHONE, deviceScaleFactor: opts.dpr ?? 1, colorScheme: 'dark', hasTouch: true, isMobile: true })).newPage());
  await page.goto(`/join/${code}`);
  const field = page.getByLabel('Your name');
  await field.waitFor({ timeout: 20_000 });
  if (opts.typeSlowly) await field.pressSequentially(name, { delay: 120 });
  else await field.fill(name);
  await page.getByRole('button', { name: 'Join game' }).click();
  await page.getByText(/^You('re| are) in$/).first().waitFor({ timeout: 20_000 });
  return page;
}

/** Answers the question on screen: right with probability `accuracy`, from the built-in set's answer key. */
export async function answer(page: Page, accuracy: number): Promise<'right' | 'guess' | 'none'> {
  const main = page.locator('main');
  const group = main.getByRole('group', { name: 'Answers' });
  const typed = main.getByPlaceholder(/^Type (a number|your answer)$/);
  const order = main.getByRole('button', { name: 'Lock in this order' });
  const matches = main.getByRole('button', { name: 'Lock in matches' });
  if (!(await vis(group)) && !(await vis(typed)) && !(await vis(order)) && !(await vis(matches))) return 'none';
  const prompt = (await main.locator('h2[tabindex="-1"]').first().textContent({ timeout: 1000 }).catch(() => ''))?.trim() ?? '';
  const q = QUESTIONS.get(prompt);
  const right = Boolean(q) && Math.random() < accuracy;
  const tile = (text: string) => group.getByRole('button').filter({ has: page.getByText(text, { exact: true }) }).first();
  const choices = ((q?.choices ?? []) as { id: string; text: string }[]);
  const textOf = (id: string) => choices.find((c) => c.id === id)?.text ?? '';
  try {
    if (await vis(typed)) {
      const value = right && q ? (q.type === 'short' ? (q.accepted as string[])[0]! : String(q.answer)) : String(Math.floor(Math.random() * 20) + 1);
      await typed.fill(value);
      await main.getByRole('button', { name: 'Submit answer' }).click({ timeout: 2000 });
      return right ? 'right' : 'guess';
    }
    if (await vis(order)) {
      await order.click({ timeout: 2000 });
      return 'guess';
    }
    if (await vis(matches)) {
      if (right && q) {
        for (const p of q.pairs as { left: string; right: string }[]) {
          await main.getByRole('button', { name: new RegExp(`^${p.left}`) }).first().click({ timeout: 1500 });
          await main.getByRole('button', { name: new RegExp(`^${p.right}`) }).first().click({ timeout: 1500 });
        }
      } else {
        const cols = main.locator('.grid-cols-2 > div');
        await cols.nth(0).getByRole('button').first().click({ timeout: 1500 });
        for (const r of await cols.nth(1).getByRole('button').all()) await r.click({ timeout: 1500 }).catch(() => {});
      }
      await matches.click({ timeout: 2000 });
      return right ? 'right' : 'guess';
    }
    if (right && q) {
      if (q.type === 'mcq') await tile(textOf(q.correct as string)).click({ timeout: 2000 });
      else if (q.type === 'truefalse') await tile(q.correct ? 'True' : 'False').click({ timeout: 2000 });
      else if (q.type === 'multi') {
        for (const id of q.correct as string[]) await tile(textOf(id)).click({ timeout: 2000 });
        await main.getByRole('button', { name: /^Submit \d+ answers?$/ }).click({ timeout: 2000 });
      } else return 'none';
      return 'right';
    }
    const buttons = await group.getByRole('button').all();
    if (!buttons.length) return 'none';
    await buttons[Math.floor(Math.random() * buttons.length)]!.click({ timeout: 2000 });
    const submit = main.getByRole('button', { name: /^Submit \d+ answers?$/ });
    if (await vis(submit)) await submit.click({ timeout: 2000 });
    return 'guess';
  } catch {
    return 'none';
  }
}

/** The mode's own choices, if one is on screen. Returns true if it made one. */
export async function choose(page: Page): Promise<boolean> {
  const m = page.locator('main');
  const click = async (l: ReturnType<Page['locator']>) => {
    if (!(await vis(l))) return false;
    await l.click({ timeout: 1500 }).catch(() => {});
    return true;
  };
  try {
    const next = m.getByRole('button', { name: /^(Next question|Continue)$/ });
    if (await click(next.first())) return true;
    // Night Market: a lantern, then a trick target.
    const lanterns = m.getByRole('group', { name: 'Lanterns' }).getByRole('button');
    if (await vis(lanterns.first())) return click(lanterns.nth(Math.floor(Math.random() * Math.max(1, await lanterns.count()))));
    if (await click(m.locator('section[aria-labelledby="nm-targets"] button:not([disabled])').first())) return true;
    // Lantern Trail: forks, the stall, targets.
    const fork = m.getByRole('region', { name: 'Choose your way' });
    if (await vis(fork)) return click(fork.getByRole('button', { name: Math.random() < 0.6 ? /^Shortcut/ : /^Long way round/ }).first());
    if (await click(m.getByRole('button', { name: /^Buy for/ }).first())) return true;
    if (await click(m.getByRole('list', { name: 'Players you can pick' }).getByRole('button').first())) return true;
    // Festival Workshop: favours and pranks.
    const favour = m.getByRole('region', { name: 'Festival Favour' }).getByRole('button');
    if (await vis(favour.first())) return click(favour.nth(Math.floor(Math.random() * Math.max(1, await favour.count()))));
    if (await click(m.getByRole('region', { name: 'Prank: pick a player' }).getByRole('list').getByRole('button').first())) return true;
    // Sky Lanterns: light lanterns with oil, and launch now and then.
    const light = m.getByRole('button', { name: /^Light/ }).and(page.locator(':enabled'));
    if ((await vis(light.first())) && Math.random() < 0.7) return click(light.first());
    const launch = m.getByRole('button', { name: /^Launch/ }).and(page.locator(':enabled'));
    if ((await vis(launch.first())) && Math.random() < 0.35) return click(launch.first());
    // Glim Duels: a ready power now and then.
    const powers = m.locator('section[aria-label="Powers"] button:not([disabled])');
    if ((await vis(powers.first())) && Math.random() < 0.4) return click(powers.first());
    // Lantern Guard: build on the best spot when the build sheet is open.
    const best = page.getByRole('button', { name: 'Best spot' });
    if (await vis(best)) {
      await best.click({ timeout: 1500 }).catch(() => {});
      const tower = page.getByRole('button', { name: /tower, \d+ gold\. (?!You need)/ }).and(page.locator('button:not([disabled])'));
      if (await vis(tower.first())) await tower.first().click({ timeout: 1500 }).catch(() => {});
      return true;
    }
    // Lantern Lands: spend energy on the map.
    const mapTab = m.getByRole('tab', { name: /^Map/ });
    if ((await vis(mapTab)) && /\d/.test((await mapTab.textContent().catch(() => '')) ?? '') && Math.random() < 0.5) {
      await mapTab.click({ timeout: 1500 }).catch(() => {});
      const act = m.getByRole('button', { name: /^(Raid|Claim|Fortify) [A-Z]?\d*/ }).and(page.locator(':enabled'));
      if (await vis(act.first())) await act.first().click({ timeout: 1500 }).catch(() => {});
      await m.getByRole('tab', { name: /^Questions/ }).click({ timeout: 1500 }).catch(() => {});
      return true;
    }
  } catch {
    /* a choice that vanished mid-click */
  }
  return false;
}

/** Plays on until stopped: answers at a human pace and makes the mode's choices. */
export function autoplay(page: Page, accuracy: number, pace: [number, number] = [1200, 4500]): { stop: () => void; done: Promise<void> } {
  let on = true;
  const done = (async () => {
    while (on) {
      try {
        if (await choose(page)) {
          await pause(500 + Math.random() * 900);
          continue;
        }
        const q = page.locator('main').getByRole('group', { name: 'Answers' }).or(page.locator('main').getByPlaceholder(/^Type (a number|your answer)$/)).or(page.locator('main').getByRole('button', { name: /^Lock in/ }));
        if (await vis(q.first())) {
          await pause(pace[0] + Math.random() * (pace[1] - pace[0]));
          if (!on) break;
          await answer(page, accuracy);
          await pause(600);
        } else await pause(400);
      } catch {
        await pause(500);
      }
    }
  })();
  return { stop: () => (on = false), done };
}

/** Joins `names` one after another (for the lobby shot) and starts each playing. */
export async function crowd(browser: Browser, code: string, names: string[], gapMs = 0, accuracy = [0.92, 0.85, 0.8, 0.75, 0.7, 0.66, 0.6, 0.55]): Promise<Player[]> {
  const out: Player[] = [];
  for (const [i, name] of names.entries()) {
    const page = await join(browser, code, name);
    const play = autoplay(page, accuracy[i % accuracy.length]!);
    out.push({ ctx: page.context(), page, name, ...play });
    if (gapMs) await pause(gapMs);
  }
  return out;
}

export async function dismiss(players: Player[]) {
  for (const p of players) p.stop();
  await Promise.all(players.map((p) => p.done.catch(() => {})));
  await Promise.all(players.map((p) => p.ctx.close().catch(() => {})));
}
