// End-to-end check in headless Chromium (software WebGL): load the page, run every demo,
// verify behaviour from inside the page, record console errors and save screenshots.
// The three.js CDN URL is served from node_modules so the check runs offline.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const shots = path.join(root, 'screenshots');
await mkdir(shots, { recursive: true });

const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = { checks: [], errors: [], timings: {} };
const check = (name, ok, detail = '') => { results.checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

async function open({ touch = false, ...viewport }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') results.errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => results.errors.push(`pageerror: ${e.message}`));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.186.1/build/**', async (route) => {
    const file = path.join(root, 'node_modules/three/build', path.basename(new URL(route.request().url()).pathname));
    route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(file, 'utf8') });
  });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
  await page.goto(base);
  await page.waitForFunction(() => window.portalSim?.ready === true, null, { timeout: 30000 });
  return { ctx, page };
}

// wait until the simulation clock has advanced by `seconds` (frame rate in software GL is low)
async function simFor(page, seconds, timeout = 120000) {
  const t0 = await page.evaluate(() => window.portalSim.world().time);
  await page.waitForFunction((t) => window.portalSim.world().time >= t, t0 + seconds, { timeout, polling: 100 });
}

const { ctx, page } = await open({ width: 1280, height: 800 });
await page.screenshot({ path: path.join(shots, '00-intro.png') });
await page.click('#btn-enter');

// 1. stacked pair, game rule vs energy-conserving
for (const mode of ['kinematic', 'conservative']) {
  await page.evaluate((m) => { window.portalSim.setMode(m); window.portalSim.runDemo('infinite'); window.portalSim.setMode(m); }, mode);
  await simFor(page, 5);
  const s = await page.evaluate(() => {
    const w = window.portalSim.world();
    const b = w.bodies[0];
    return { speed: b.vel.length(), y: b.pos.y, crossings: w.ledger.traversals.length, energy: w.ledger.energyByMouths, renders: window.portalSim.renders() };
  });
  results.timings[`infinite-${mode}`] = s;
  await page.screenshot({ path: path.join(shots, `01-stacked-${mode}.png`) });
  if (mode === 'kinematic') check('game rule: ball keeps accelerating through the loop', s.crossings >= 3 && s.speed > 15, `v=${s.speed.toFixed(1)} m/s, crossings=${s.crossings}`);
  else check('energy-conserving: ball never exceeds free-fall speed from 6 m', s.speed <= Math.sqrt(2 * 9.81 * 6) + 0.3, `v=${s.speed.toFixed(2)} m/s, crossings=${s.crossings}`);
  check(`portal views rendered (${mode})`, s.renders >= 2, `render passes this frame: ${s.renders}`);
}

// 2. fling
await page.evaluate(() => { window.portalSim.setMode('kinematic'); window.portalSim.runDemo('fling'); });
await simFor(page, 1.55);
const fling = await page.evaluate(() => { const w = window.portalSim.world(); const b = w.bodies[0]; return { vx: b.vel.x, x: b.pos.x, crossings: w.ledger.traversals.length }; });
await page.screenshot({ path: path.join(shots, '02-fling.png') });
check('fling: ball leaves the west wall moving +x', fling.crossings >= 1 && fling.vx > 8, `vx=${fling.vx.toFixed(1)} m/s`);

// 3. moving mouth (piston)
await page.evaluate(() => window.portalSim.runDemo('piston'));
await page.waitForFunction(() => window.portalSim.world().ledger.traversals.length > 0, null, { timeout: 120000, polling: 50 });
const pist = await page.evaluate(() => { const w = window.portalSim.world(); const t = w.ledger.traversals[0]; return { vOut: t.vOut, energy: w.ledger.energyByMouths }; });
await simFor(page, 0.25);
await page.screenshot({ path: path.join(shots, '03-moving-mouth.png') });
check('moving mouth: resting ball leaves at the piston speed (8 m/s)', Math.abs(pist.vOut - 8) < 0.7, `vOut=${pist.vOut.toFixed(2)} m/s, mouths supplied ${pist.energy.toFixed(0)} J`);

// 4. facing portals (recursion)
for (const depth of [1, 3]) {
  await page.evaluate((d) => { window.portalSim.runDemo('facing'); window.portalSim.app.setDepth(d); }, depth);
  await simFor(page, 0.3);
  const r = await page.evaluate(() => window.portalSim.renders());
  results.timings[`facing-depth-${depth}`] = r;
  await page.screenshot({ path: path.join(shots, `04-facing-depth${depth}.png`) });
  check(`facing portals at depth ${depth}: recursive passes`, depth === 1 ? r >= 2 : r >= 4, `passes=${r}`);
}

// 5. height test: walk in under both models
for (const mode of ['kinematic', 'conservative']) {
  await page.evaluate((m) => { window.portalSim.runDemo('climb'); window.portalSim.setMode(m); window.portalSim.world().player.input.forward = 1; window.portalSim.app.keys.add('KeyW'); }, mode);
  await simFor(page, 2.5);
  const c = await page.evaluate(() => { const w = window.portalSim.world(); window.portalSim.app.keys.delete('KeyW'); return { y: w.player.root.y, refl: w.ledger.traversals.filter((t) => t.reflected).length, n: w.ledger.traversals.length }; });
  await page.screenshot({ path: path.join(shots, `05-height-${mode}.png`) });
  if (mode === 'kinematic') check('height test, game rule: player pops out 6.9 m up', c.n >= 1 && c.refl === 0, `crossings=${c.n}, y=${c.y.toFixed(2)}`);
  else check('height test, energy-conserving: walking speed is reflected', c.refl >= 1, `reflections=${c.refl}, y=${c.y.toFixed(2)}`);
}

// 6. gun placement failure states through the real aiming path
const fails = await page.evaluate(() => {
  const app = window.portalSim.app;
  app.runDemo('infinite');
  const p = app.world.player;
  const out = {};
  const aimAt = (pos, target) => { app.pose(pos, target); return app.aim(); };
  out.metal = aimAt(new p.root.constructor(10, 0, 0), new p.root.constructor(14, 3, 0)).planFor?.('A').reason;
  out.pillar = aimAt(new p.root.constructor(3, 0, 2), new p.root.constructor(3, 4, -4)).planFor?.('A').reason;
  out.wall = aimAt(new p.root.constructor(0, 0, 0), new p.root.constructor(0, 3, -14)).planFor?.('A').ok;
  return out;
});
check('aiming: metal panel rejects, narrow pillar too small, open wall accepts',
  fails.metal === 'surface-rejects' && fails.pillar === 'surface-too-small' && fails.wall === true, JSON.stringify(fails));

// 7. pixel-level rendering check: A on the north wall, B on the east wall. Looking at A
// you must see out of B, i.e. toward the cool-blue WEST wall, framed by the warm NORTH wall.
const px = await page.evaluate(() => {
  const app = window.portalSim.app;
  app.runDemo('facing');
  const w = app.world;
  w.closePortal('B', { override: true });
  const V = w.player.root.constructor;
  const placed = app.placeAt('B', new V(14, 3.2, 9), new V(-1, 0, 0), 'wall-east');
  if (!placed.ok) return { error: placed.reason };
  app.pose(new V(-4, 0, -6), new V(-4, 3.2, -14));
  const r = app.renderer;
  const c = r.project(w.portals.A.frame.center);
  const beside = r.project(w.portals.A.frame.center.clone().add(new V(2.6, 0, 0)));
  return { inside: r.probe(c.x, c.y), outside: r.probe(beside.x, beside.y), c, beside };
});
const warm = (rgb) => rgb[0] - rgb[2];
check('through-portal pixels: west-wall blue inside A, north-wall sand outside',
  warm(px.inside) < -5 && warm(px.outside) > 5, `inside rgb=${px.inside.slice(0, 3)} outside rgb=${px.outside.slice(0, 3)}`);
await page.screenshot({ path: path.join(shots, '07-pixel-check.png') });

// 8. phone layout (touch device emulation)
const phone = await open({ width: 390, height: 844, touch: true });
await phone.page.click('#btn-enter');
await simFor(phone.page, 0.5);
const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
await phone.page.screenshot({ path: path.join(shots, '06-phone.png') });
check('phone width: no horizontal page scroll', !overflow);
await phone.ctx.close();

check('no console or page errors', results.errors.length === 0, results.errors.slice(0, 3).join(' | '));
await writeFile(path.join(root, 'tests', 'browser-results.json'), JSON.stringify(results, null, 2));
await ctx.close();
await browser.close();
server.close();
process.exitCode = results.checks.every((c) => c.ok) ? 0 : 1;
