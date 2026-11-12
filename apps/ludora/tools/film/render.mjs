// Photographs the film a frame at a time.
//   node render.mjs --frames 30,120,250          a few frames, for looking at
//   node render.mjs --from 0 --to 2040 --every 1  a run of frames (to is not included)
// Several of these can run side by side on different ranges; each is its own browser.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.FILM_OUT ?? '/tmp/claude-0/-home-user/97a5c84e-6d10-5253-ab94-c316a24e49f4/scratchpad/film';
const URL = process.env.FILM_URL ?? 'http://127.0.0.1:5188/';
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const dir = arg('out', join(OUT, 'frames'));
mkdirSync(dir, { recursive: true });
const list = arg('frames', null);
const from = Number(arg('from', 0)), every = Number(arg('every', 1));
const quality = Number(arg('quality', 95));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', '--force-color-profile=srgb'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('page error:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text().slice(0, 300)); });
await page.goto(URL);
await page.waitForFunction(() => document.title === 'ready' || document.title.startsWith('error'), null, { timeout: 180000 });
if ((await page.title()) !== 'ready') { console.log(await page.title()); await browser.close(); process.exit(1); }
const total = await page.evaluate(() => window.film.frames);
const to = Number(arg('to', total));
const frames = list ? list.split(',').map(Number) : Array.from({ length: Math.ceil((to - from) / every) }, (_, i) => from + i * every);
const t0 = Date.now();
for (const [k, f] of frames.entries()) {
  await page.evaluate((n) => window.film.render(n), f);
  await page.screenshot({ path: join(dir, `${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality });
  if (!list && k % 60 === 59) console.log(`frame ${f} (${((Date.now() - t0) / (k + 1)).toFixed(0)} ms a frame)`);
}
console.log(`${frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await browser.close();
