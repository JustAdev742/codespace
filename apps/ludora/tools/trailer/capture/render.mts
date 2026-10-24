// Renders the composition frame by frame: render.mts <outDir> [from=0] [to=DURATION] [every=1] [workers=4]
// Frame i is the page at t = i / 30, screenshotted as JPEG. Serve the trailer folder on :8770 first.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [out, fromS = '0', toS = '', everyS = '1', workersS = '4'] = process.argv.slice(2);
mkdirSync(out!, { recursive: true });
const FPS = 30;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-proxy-server', '--force-color-profile=srgb', '--font-render-hinting=none'] });
const open = async () => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto('http://127.0.0.1:8770/comp/trailer.html');
  await page.waitForFunction(() => typeof (window as any).renderFrame === 'function');
  await page.evaluate(() => document.fonts.ready);
  return page;
};
const first = await open();
const duration: number = await first.evaluate(() => (window as any).DURATION);
const from = Math.round(Number(fromS) * FPS);
const to = Math.round((toS ? Number(toS) : duration) * FPS);
const every = Number(everyS);
const frames: number[] = [];
for (let i = from; i < to; i += every) frames.push(i);
const workers = Number(workersS);
const pages = [first, ...(await Promise.all(Array.from({ length: workers - 1 }, open)))];
let next = 0;
let done = 0;
const t0 = Date.now();
await Promise.all(
  pages.map(async (page) => {
    while (next < frames.length) {
      const i = frames[next++]!;
      await page.evaluate((t) => (window as any).renderFrame(t), i / FPS);
      await page.screenshot({ path: `${out}/f${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 94 });
      if (++done % 100 === 0) console.log(done, '/', frames.length, `${((Date.now() - t0) / done).toFixed(0)} ms/frame`);
    }
  }),
);
console.log('rendered', frames.length, 'frames in', ((Date.now() - t0) / 1000).toFixed(0), 's');
await browser.close();
