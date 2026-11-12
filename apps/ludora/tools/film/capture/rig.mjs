// The film's camera. Two ways to shoot the real app:
//
//  - stepped(): the page runs on a clock this script owns. Time moves one frame at a time and a
//    picture is taken after each step, so software-rendered 3D comes out perfectly smooth however
//    long a frame takes to draw. For the 3D scenes.
//  - live(): the page runs in real time and Chromium's own screencast is recorded with its
//    timestamps, then laid out at a constant frame rate. For ordinary pages, where the app talks to
//    the server and CSS does the moving.
//
// Everything is shot from a private copy of Ludora on this machine (serve.sh), never the live site.
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const OUT = process.env.FILM_OUT ?? '/tmp/claude-0/-home-user/97a5c84e-6d10-5253-ab94-c316a24e49f4/scratchpad/film';
export const APP = process.env.FILM_APP ?? 'http://127.0.0.1:8980';
export const DEV = process.env.FILM_DEV ?? 'http://127.0.0.1:5199';
export const FPS = 30;
export const CSRF = { 'x-ludora-csrf': '1' };

const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', '--force-color-profile=srgb'];

export async function launch() {
  const exe = '/opt/pw-browsers/chromium';
  return chromium.launch({ args: GL, ...(existsSync(exe) ? {} : {}) });
}

export function shotDir(name) {
  const dir = join(OUT, 'footage', name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

const pad = (n) => String(n).padStart(5, '0');

/** A clock the script owns, installed before any of the page's own code runs. */
export const FAKE_CLOCK = `(() => {
  let now = 0;
  const epoch = Date.now();
  let seq = 1;
  const timers = new Map();
  let rafs = [];
  const anims = new WeakMap();
  const RealDate = Date;
  class FilmDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(epoch + now); else super(...a); }
    static now() { return epoch + now; }
  }
  window.Date = FilmDate;
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => { const id = seq++; rafs.push([id, cb]); return id; };
  window.cancelAnimationFrame = (id) => { rafs = rafs.filter((r) => r[0] !== id); };
  window.setTimeout = (cb, ms = 0, ...a) => { const id = seq++; timers.set(id, { at: now + Math.max(0, +ms || 0), cb, a }); return id; };
  window.clearTimeout = (id) => { timers.delete(id); };
  window.setInterval = (cb, ms = 0, ...a) => { const id = seq++; const every = Math.max(1, +ms || 0); timers.set(id, { at: now + every, cb, a, every }); return id; };
  window.clearInterval = (id) => { timers.delete(id); };
  const run = (cb, a) => { try { typeof cb === 'function' && cb(...a); } catch (e) { console.error('film clock:', e); } };
  window.__film = {
    get now() { return now; },
    step(ms) {
      const target = now + ms;
      for (let guard = 0; guard < 5000; guard++) {
        let next = null;
        for (const [id, t] of timers) if (t.at <= target && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        now = Math.max(now, next[1].at);
        if (next[1].every) next[1].at += next[1].every; else timers.delete(next[0]);
        run(next[1].cb, next[1].a);
      }
      const before = now;
      now = target;
      const due = rafs; rafs = [];
      for (const [, cb] of due) run(cb, [now]);
      // CSS animations and transitions run on the browser's own clock. Each one is held and moved
      // along by hand, one frame at a time; when it reaches its end it is finished properly, so the
      // page still hears animationend and transitionend.
      try {
        for (const a of document.getAnimations()) {
          let born = anims.get(a);
          if (born === undefined) { born = before; anims.set(a, born); try { a.pause(); a.currentTime = 0; } catch {} }
          const at = (now - born) * (a.playbackRate || 1);
          let end = Infinity;
          try { end = Number(a.effect && a.effect.getComputedTiming().endTime); } catch {}
          try {
            if (Number.isFinite(end) && at >= end) { if (a.playState !== 'finished') a.finish(); }
            else a.currentTime = at;
          } catch {}
        }
      } catch {}
      // Drawing is queued to the graphics process. Reading one pixel back makes this call wait until
      // the frame has really been drawn, so the picture taken next is of this frame and nothing piles up.
      for (const c of document.querySelectorAll('canvas')) {
        try {
          const gl = c.getContext('webgl2') || c.getContext('webgl');
          if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
        } catch {}
      }
    },
  };
})();`;

/** The "Dev" badge marks this private copy; the real site does not show it. */
export const SITE = process.env.FILM_SITE ?? 'ludora-yja3.onrender.com';
/**
 * Two things differ between this private copy and the real site, and the film shows the real site:
 * the "Dev" badge (hidden), and the address a lobby tells players to go to (the private copy says
 * 127.0.0.1:8980; the words are swapped for the real site's address as they are drawn).
 */
export const NO_ENV_BADGE = `(() => {
  // Also hidden: the tip that offers to turn 3D off when frames are slow (they always are on this machine's software renderer).
  const css = 'span[title^="Test environment"], .s3-tip { display: none !important; }';
  const add = () => { if (!document.head || document.getElementById('film-style')) return; const st = document.createElement('style'); st.id = 'film-style'; st.textContent = css; document.head.appendChild(st); };
  add();
  document.addEventListener('DOMContentLoaded', add);
  const here = location.host, site = ${JSON.stringify(process.env.FILM_SITE ?? 'ludora-yja3.onrender.com')};
  const fix = (root) => {
    if (!root || here === site) return;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue && n.nodeValue.includes(here)) n.nodeValue = n.nodeValue.split(here).join(site);
  };
  new MutationObserver((list) => {
    add();
    for (const m of list) {
      if (m.type === 'characterData') { const n = m.target; if (n.nodeValue && n.nodeValue.includes(here) && here !== site) n.nodeValue = n.nodeValue.split(here).join(site); }
      else for (const n of m.addedNodes) fix(n.nodeType === 3 ? n.parentNode : n);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stepPage = (page, ms = 1000 / FPS) => page.evaluate((m) => window.__film && window.__film.step(m), ms).catch(() => {});

/** Keeps the film clock moving (no pictures) until a promise settles: for loading and for waiting on the page. */
export async function pump(pages, promise) {
  let done = false;
  const settled = Promise.resolve(promise).finally(() => { done = true; });
  settled.catch(() => {});
  while (!done) {
    for (const p of pages) await stepPage(p);
    await sleep(12);
  }
  return settled;
}

/**
 * A camera on one or more pages that all run on the film clock. Every call to frames() moves each
 * page on by one frame and takes its picture, so pages filmed together stay in step.
 */
export class Recorder {
  constructor(name, pages, { quality = 93 } = {}) {
    this.name = name;
    this.pages = pages; // { key: page }
    this.quality = quality;
    this.n = 0;
    this.marks = {};
    this.dirs = {};
    const keys = Object.keys(pages);
    for (const k of keys) this.dirs[k] = shotDir(keys.length === 1 && k === 'main' ? name : `${name}-${k}`);
    this.t0 = Date.now();
  }
  async frames(count = 1, each) {
    for (let i = 0; i < count; i++) {
      if (each) await each(i);
      this.n++;
      for (const [k, page] of Object.entries(this.pages)) {
        await stepPage(page);
        await page.screenshot({ path: join(this.dirs[k], `${pad(this.n)}.jpg`), type: 'jpeg', quality: this.quality });
      }
    }
  }
  /** Remembers the next frame's number under a name, so the edit can find the moment. */
  mark(name) { this.marks[name] = this.n + 1; }
  /** Films until `cond` is true (checked each frame), at most `max` frames. */
  async until(cond, { max = 600, extra = 0 } = {}) {
    for (let i = 0; i < max; i++) {
      if (await cond().catch(() => false)) break;
      await this.frames(1);
    }
    if (extra) await this.frames(extra);
  }
  /** Runs an action (a click, a navigation) while the cameras keep rolling. */
  async during(action) {
    let done = false;
    const p = Promise.resolve(action()).finally(() => { done = true; });
    p.catch(() => {});
    while (!done) await this.frames(1);
    return p;
  }
  /** Types text into whatever has focus, `perFrame` characters a frame. */
  async type(page, text, perFrame = 1) {
    for (let i = 0; i < text.length; i += perFrame) {
      await page.keyboard.insertText(text.slice(i, i + perFrame));
      await this.frames(1);
    }
  }
  done() {
    for (const [k, dir] of Object.entries(this.dirs)) writeFileSync(join(dir, 'meta.json'), JSON.stringify({ name: dir.split('/').pop(), frames: this.n, fps: FPS, kind: 'stepped', marks: this.marks }));
    console.log(`${this.name}: ${this.n} frames in ${((Date.now() - this.t0) / 1000).toFixed(1)} s`);
  }
}

/**
 * Shoots `frames` pictures of a page that runs on the film clock. `warm` frames are stepped first
 * (with real pauses between, so textures and bodies that load for real have time to arrive).
 */
export async function stepped(page, name, { frames, warm = 90, warmPauseMs = 40, quality = 93, clip, each } = {}) {
  const dir = shotDir(name);
  for (let i = 0; i < warm; i++) {
    await page.evaluate((ms) => window.__film.step(ms), 1000 / FPS);
    await page.waitForTimeout(warmPauseMs);
  }
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    if (each) await each(i);
    await page.evaluate((ms) => window.__film.step(ms), 1000 / FPS);
    await page.screenshot({ path: join(dir, `${pad(i + 1)}.jpg`), type: 'jpeg', quality, ...(clip ? { clip } : {}) });
  }
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ name, frames, fps: FPS, kind: 'stepped' }));
  console.log(`${name}: ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return dir;
}

/**
 * Records a page in real time while `act` runs, then writes the frames at a constant rate.
 * Chromium only sends a frame when the picture changes, so each output frame is the newest one
 * at or before its moment.
 */
export async function live(page, name, act, { quality = 92, lead = 0.15, tail = 0.3, maxSeconds = 60 } = {}) {
  const dir = shotDir(name);
  const cdp = await page.context().newCDPSession(page);
  const got = [];
  cdp.on('Page.screencastFrame', (f) => {
    got.push({ t: f.metadata.timestamp, data: f.data });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  const vp = page.viewportSize();
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality, maxWidth: Math.round(vp.width * dpr), maxHeight: Math.round(vp.height * dpr), everyNthFrame: 1 });
  // A first frame is always sent; nudge one if the page is perfectly still.
  await page.waitForTimeout(lead * 1000);
  const started = Date.now();
  await act();
  await page.waitForTimeout(tail * 1000);
  await cdp.send('Page.stopScreencast').catch(() => {});
  await cdp.detach().catch(() => {});
  if (!got.length) throw new Error(`${name}: no frames were recorded`);
  const t0 = got[0].t;
  const t1 = Math.min(got[got.length - 1].t + tail, t0 + maxSeconds);
  const total = Math.max(1, Math.round((t1 - t0) * FPS));
  let k = 0;
  for (let i = 0; i < total; i++) {
    const at = t0 + i / FPS;
    while (k + 1 < got.length && got[k + 1].t <= at) k++;
    writeFileSync(join(dir, `${pad(i + 1)}.jpg`), Buffer.from(got[k].data, 'base64'));
  }
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ name, frames: total, fps: FPS, kind: 'live', source: got.length, seconds: +(t1 - t0).toFixed(2), wall: +((Date.now() - started) / 1000).toFixed(2) }));
  console.log(`${name}: ${total} frames from ${got.length} recorded (${(t1 - t0).toFixed(1)} s)`);
  return dir;
}

/** One sharp still, for the film's still shots and for the slides. */
export async function still(page, name, opts = {}) {
  const dir = join(OUT, 'stills');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.png`);
  await page.screenshot({ path, type: 'png', ...opts });
  console.log(`still ${name}`);
  return path;
}

/** A signed-in account in its own window. */
export async function account(browser, { accountType = 'teacher', displayName, viewport = { width: 1280, height: 720 }, deviceScaleFactor = 1.5, username, filmClock = true, mobile = false } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor, baseURL: APP, reducedMotion: 'no-preference', colorScheme: 'dark', serviceWorkers: 'block', ...(mobile ? { hasTouch: true, isMobile: true } : {}) });
  if (filmClock) await context.addInitScript(FAKE_CLOCK);
  await context.addInitScript(NO_ENV_BADGE);
  const page = await context.newPage();
  const name = username ?? `film${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 900 + 100)}`;
  const password = 'a long film passphrase';
  const res = await page.request.post('/api/auth/register', { headers: CSRF, data: { username: name, password, displayName: displayName ?? name, accountType } });
  if (!res.ok()) throw new Error(`register ${name}: ${res.status()} ${await res.text()}`);
  const me = await (await page.request.get('/api/auth/me')).json();
  return { context, page, username: name, password, userId: me.user.id };
}

/** A window with no account, on the film clock unless told otherwise: a phone joining with only a name. */
export async function visitor(browser, { viewport = { width: 390, height: 844 }, deviceScaleFactor = 2, filmClock = true, mobile = true } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor, baseURL: APP, reducedMotion: 'no-preference', colorScheme: 'dark', serviceWorkers: 'block', ...(mobile ? { hasTouch: true, isMobile: true } : {}) });
  if (filmClock) await context.addInitScript(FAKE_CLOCK);
  await context.addInitScript(NO_ENV_BADGE);
  const page = await context.newPage();
  return { context, page };
}

/** Goes to a page on the film clock and keeps the clock moving until `ready` is on screen and fonts are in. */
export async function open(page, url, ready, { settleFrames = 20 } = {}) {
  await pump([page], page.goto(url, { waitUntil: 'domcontentloaded' }));
  if (ready) await pump([page], ready.waitFor({ timeout: 45000 }));
  await pump([page], page.evaluate(() => document.fonts.ready.then(() => true)));
  for (let i = 0; i < settleFrames; i++) { await stepPage(page); await sleep(20); }
}

export async function post(page, url, data) {
  const res = await page.request.post(url, { headers: CSRF, data });
  if (!res.ok()) throw new Error(`POST ${url}: ${res.status()} ${await res.text()}`);
  return res.json();
}
export async function put(page, url, data) {
  const res = await page.request.put(url, { headers: CSRF, data });
  if (!res.ok()) throw new Error(`PUT ${url}: ${res.status()} ${await res.text()}`);
  return res.json();
}

/** Waits until fonts are in and the page has stopped loading things. */
export async function settle(page, ms = 400) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}
