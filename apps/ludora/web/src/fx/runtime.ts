/*
 * The stage's effects, drawn: one canvas over the page while a celebration plays, and no canvas at
 * all the rest of the time (so nothing sits between a reader and the words, or between axe and the
 * colours it measures). Fetched on its own, after the page is up (fx/index.ts): nothing here is
 * needed to join a game or answer a question.
 *
 * It never blocks: pieces are thrown into a fixed store, a full store drops what does not fit, and
 * the frame-time check (governor.ts) draws less, then nothing, on a device that cannot keep up.
 */

import { alphaAt, burst, cannon, Field, GLOWS, HEADS, rain, seeded, SHAPES, TUMBLES, type Shape } from './particles.ts';
import { FxGovernor, type GovernorStep } from './governor.ts';

const field = new Field();
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let raf = 0;
let last = 0;
let dpr = 1;
let maxDpr = 2;
let budget = 1;
let palette: string[] = [];
let seed = 20261125;
/** Told when the device is not keeping up; answers whether to give up on the celebration in the air. */
let onStep: (step: GovernorStep) => boolean = () => false;
const governor = new FxGovernor((step) => {
  if (onStep(step)) stop();
});

/** How much to draw (a level's share of the richest, fx/decide.ts), how sharply, and who to ask when the device cannot keep up. */
export function configure(opts: { budget: number; dpr: number; onStep: (step: GovernorStep) => boolean }) {
  budget = opts.budget;
  maxDpr = opts.dpr;
  onStep = opts.onStep;
}

/* ----------------------------------- drawing ----------------------------------- */

/** A rounded box where the browser can draw one, a square one where it cannot (browsers from before 2023). */
function box(p: Path2D, x: number, y: number, w: number, h: number) {
  if (typeof p.roundRect === 'function') p.roundRect(x, y, w, h, 1);
  else p.rect(x, y, w, h);
}

/** Each shape in a box twelve units across, centred on the piece's own middle. */
const PATHS: Partial<Record<Shape, Path2D>> = {};
function path(shape: Shape): Path2D {
  let p = PATHS[shape];
  if (p) return p;
  p = new Path2D();
  switch (shape) {
    case 'ribbon':
      box(p, -1.7, -5.2, 3.4, 10.4);
      break;
    case 'square':
      box(p, -3.8, -3.8, 7.6, 7.6);
      break;
    case 'shard':
      p.moveTo(0, -5.5);
      p.lineTo(4.5, 4.5);
      p.lineTo(-3.5, 2);
      p.closePath();
      break;
    case 'streak':
      p.moveTo(0, -6);
      p.lineTo(1.4, 0);
      p.lineTo(0, 6);
      p.lineTo(-1.4, 0);
      p.closePath();
      break;
    case 'star':
      p.moveTo(0, -6);
      p.lineTo(1.3, -1.3);
      p.lineTo(6, 0);
      p.lineTo(1.3, 1.3);
      p.lineTo(0, 6);
      p.lineTo(-1.3, 1.3);
      p.lineTo(-6, 0);
      p.lineTo(-1.3, -1.3);
      p.closePath();
      break;
    case 'leaf':
      p.moveTo(0, -5.2);
      p.bezierCurveTo(3.6, -2.6, 3.6, 2.6, 0, 5.2);
      p.bezierCurveTo(-3.6, 2.6, -3.6, -2.6, 0, -5.2);
      break;
    case 'ring':
      p.arc(0, 0, 4.8, 0, Math.PI * 2);
      break;
    case 'dot':
      p.arc(0, 0, 3, 0, Math.PI * 2);
      break;
    case 'lantern':
      box(p, -3, -3.6, 6, 7);
      break;
  }
  PATHS[shape] = p;
  return p;
}
let caps: Path2D | null = null;
let halo: Path2D | null = null;

function draw(c: CanvasRenderingContext2D) {
  const f = field;
  // First the soft light round a spark, an ember or a star, which brightens where lights cross on a dark stage
  // (and is invisible, harmlessly, on a white card). Then every piece itself, solid, so it shows on any surface.
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < f.n; i++) {
    if (!(f.bits[i]! & GLOWS)) continue;
    const a = alphaAt(f.age[i]!, f.ttl[i]!);
    if (a <= 0) continue;
    const s = (f.size[i]! / 12) * dpr;
    c.setTransform(s, 0, 0, s, f.x[i]! * dpr, f.y[i]! * dpr);
    c.globalAlpha = a * 0.22;
    c.fillStyle = palette[f.color[i]!] ?? '#ffffff';
    c.fill((halo ??= circle(6.5)));
  }
  c.globalCompositeOperation = 'source-over';
  for (let i = 0; i < f.n; i++) {
    const bits = f.bits[i]!;
    const age = f.age[i]!;
    const a = alphaAt(age, f.ttl[i]!);
    if (a <= 0) continue;
    const s = (f.size[i]! / 12) * dpr;
    const rot = bits & HEADS ? Math.atan2(f.vy[i]!, f.vx[i]!) + Math.PI / 2 : f.rot[i]!;
    // A flat piece turning end over end shows its face, then its edge, then its back.
    const turn = bits & TUMBLES ? Math.cos(f.phase[i]! * 1.3 + age * f.rate[i]! * 1.7) : 1;
    const cos = Math.cos(rot) * s;
    const sin = Math.sin(rot) * s;
    c.setTransform(cos, sin, -sin * turn, cos * turn, f.x[i]! * dpr, f.y[i]! * dpr);
    const color = palette[f.color[i]!] ?? '#ffffff';
    const shape = SHAPES[f.shape[i]!]!;
    // The back of a piece is a shade duller than its face.
    c.globalAlpha = turn < 0 ? a * 0.78 : a;
    if (shape === 'ring') {
      c.strokeStyle = color;
      c.lineWidth = 1.5;
      c.stroke(path(shape));
      continue;
    }
    c.fillStyle = color;
    c.fill(path(shape));
    if (shape === 'lantern') {
      c.fillStyle = '#1a1d33';
      c.fill((caps ??= lanternCaps()));
    }
  }
  c.globalAlpha = 1;
}

function circle(r: number): Path2D {
  const p = new Path2D();
  p.arc(0, 0, r, 0, Math.PI * 2);
  return p;
}
function lanternCaps(): Path2D {
  const p = new Path2D();
  p.rect(-2.4, -5.2, 4.8, 1.8);
  p.rect(-2.4, 3.4, 4.8, 1.8);
  return p;
}

/* ------------------------------ the canvas and its loop ------------------------------ */

function size() {
  if (!canvas) return;
  dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}

function start(): boolean {
  if (!canvas) {
    const el = document.createElement('canvas');
    const c = el.getContext('2d');
    if (!c) return false;
    el.setAttribute('aria-hidden', 'true');
    el.dataset.fx = '';
    // Above the page and its dialogs, and never in the way of a tap or a click.
    el.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60';
    document.body.append(el);
    canvas = el;
    ctx = c;
    size();
    window.addEventListener('resize', size);
  }
  if (!raf) {
    last = 0;
    governor.settle();
    raf = requestAnimationFrame(frame);
  }
  return true;
}

/** Everything off the page at once: the celebration is over, or the device cannot keep up. */
export function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  field.clear();
  palette = [];
  window.removeEventListener('resize', size);
  canvas?.remove();
  canvas = null;
  ctx = null;
}

function frame(now: number) {
  raf = 0;
  if (!canvas || !ctx) return;
  const dtMs = last ? now - last : 16;
  last = now;
  governor.sample(dtMs);
  if (!canvas || !ctx) return;
  // The pieces keep to the clock, however slowly frames arrive: a slow device sees fewer pictures of the same
  // fall, not a longer one. Taken in steps of an ordinary frame, so nothing leaps through the floor. A long gap
  // (a tab left and come back to) moves them on by a quarter of a second at most.
  for (let left = Math.min(dtMs, 250) / 1000; left > 0; left -= 0.05) field.step(Math.min(left, 0.05), window.innerHeight + 40);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (field.n === 0) {
    stop();
    return;
  }
  draw(ctx);
  raf = requestAnimationFrame(frame);
}

/* ---------------------------------- what can be thrown ---------------------------------- */

/** The caller's colours join the palette; pieces remember which was theirs. */
function colours(list: readonly string[]): { base: number; count: number } {
  const base = palette.length;
  palette.push(...list);
  return { base, count: list.length };
}
const share = (count: number) => Math.max(1, Math.round(count * budget * governor.trim));
/** A fresh run of numbers for each celebration, so no two fall the same way. */
const run = () => seeded(seed++);

export interface BurstRequest {
  /** Where on the screen, in CSS pixels. */
  x: number;
  y: number;
  /** The burst's width, as the plain burst counts it. */
  size: number;
  count: number;
  rise?: boolean;
  style?: string;
  colors: readonly string[];
}

/** One burst from a point: the richer cousin of the plain burst (art/bursts.tsx), in the same style and colours. */
export function burstAt(r: BurstRequest) {
  if (!start()) return;
  const c = colours(r.colors);
  const next = run();
  const thrown = burst(field, next, { x: r.x, y: r.y, reach: r.size * 0.5, count: share(r.count * 2.5), rise: r.rise, style: r.style, colors: c.count, piece: [Math.max(9, r.size / 26), Math.max(14, r.size / 13)] });
  shift(thrown, c.base);
}

/**
 * The winner's shower. On a big screen two cannons fire from the foot of the stage and paper falls
 * across its whole width; on a phone, a lighter fall. `colors` are the game's own.
 */
export function shower(opts: { big: boolean; colors: readonly string[] }) {
  if (!start()) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const c = colours(opts.colors);
  const next = run();
  let thrown = 0;
  if (opts.big) {
    // Paper a class can see from the back of the room: it grows with the screen, from a laptop to a hall's projector.
    const grow = Math.max(1, Math.min(2.2, w / 1100));
    const piece = [11 * grow, 22 * grow] as const;
    const power = Math.min(2600, Math.max(w, h) * 1.7);
    thrown += cannon(field, next, { x: -10, y: h + 10, angle: -Math.PI * 0.3, spread: 0.7, power, count: share(140), colors: c.count, piece });
    thrown += cannon(field, next, { x: w + 10, y: h + 10, angle: -Math.PI * 0.7, spread: 0.7, power, count: share(140), colors: c.count, piece });
    thrown += rain(field, next, { x0: 0, x1: w, y: -20, count: share(200), over: 2.6, colors: c.count, delay: 0.35, piece });
  } else {
    thrown += rain(field, next, { x0: 0, x1: w, y: -20, count: share(90), over: 1.8, colors: c.count });
  }
  shift(thrown, c.base);
}

/** The pieces just thrown were numbered within their own colours: point them at their place in the palette. */
function shift(thrown: number, base: number) {
  if (!base) return;
  for (let i = field.n - thrown; i < field.n; i++) field.color[i]! += base;
}

/** For tests and for anyone curious: how many pieces are in the air. */
export const alive = () => field.n;
