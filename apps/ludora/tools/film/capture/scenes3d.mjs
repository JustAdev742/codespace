// The 3D montage: every 3D game shot from the app's own scene gallery (web/dev/three.html), on the
// film clock so the motion is smooth. usage: node scenes3d.mjs [name ...]   (no names: all of them)
import { launch, stepped, DEV, FAKE_CLOCK } from './rig.mjs';

const W = 1920, H = 1080;
// name, query, frames, warm frames. Host views are the wide establishing shots; player views sit behind a Glim.
const SHOTS = [
  ['3d-summit', 'scene=summit-host&players=24', 96, 70],
  ['3d-summit-player', 'scene=summit&players=10&ledge=9', 96, 70],
  ['3d-rally', 'scene=rally&circuit=harbour&players=10', 110, 70],
  ['3d-rally-host', 'scene=rally-host&circuit=rooftops&players=12', 96, 70],
  ['3d-spotkick', 'scene=spotkick&shot=goal&fire=1', 110, 70],
  ['3d-tower', 'scene=tower-host&crew=30&share=0.72&dawn=0.5', 96, 70],
  ['3d-garden', 'scene=garden-host&players=30', 96, 70],
  ['3d-gold', 'scene=gold&depth=6', 96, 70],
  ['3d-glowtag', 'scene=glowtag&players=12&walk=1', 96, 70],
  ['3d-catch', 'scene=catch&water=reef', 96, 70],
  ['3d-city', 'scene=skyline', 96, 70],
  ['3d-made', 'scene=made-host&players=24&place=canyon&shape=zigzag&time=dusk', 96, 70],
  ['3d-tower-player', 'scene=tower&players=12&crew=30&share=0.7&dawn=0.4', 96, 70],
  ['3d-made-follow', 'scene=made&players=24&place=harbour&shape=loop&camera=follow&time=dusk', 96, 70],
  ['3d-made-town', 'scene=made&players=24&place=old-town&shape=zigzag&camera=side&time=night', 96, 70],
  ['3d-made-climb', 'scene=made&players=24&kind=climb&place=snowfield&camera=follow', 96, 70],
];

const want = process.argv.slice(2);
const browser = await launch();
for (const [name, query, frames, warm] of SHOTS) {
  if (want.length && !want.includes(name)) continue;
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'no-preference', colorScheme: 'dark' });
  await context.addInitScript(FAKE_CLOCK);
  // The best picture the engine has: this is a film, not a phone.
  await context.addInitScript(() => { try { localStorage.setItem('ludora.graphics', 'high'); } catch {} });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] page error: ${e.message}`));
  await page.goto(`${DEV}/dev/three.html?${query}`, { waitUntil: 'domcontentloaded' });
  // The graphics button and the "running slowly" tip are for players, not for the film.
  await page.addStyleTag({ content: '.s3-menu-button, .s3-menu-panel, .s3-tip { display: none !important; }' });
  await page.waitForTimeout(1500);
  try {
    await stepped(page, name, { frames, warm });
  } catch (e) {
    console.log(`[${name}] failed: ${e.message}`);
  }
  await context.close();
}
await browser.close();
