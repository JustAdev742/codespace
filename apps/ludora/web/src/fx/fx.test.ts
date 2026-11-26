import { describe, expect, it } from 'vitest';
import { decideFx, FX_BUDGET, stageLightWanted, type FxFacts } from './decide.ts';
import { FxGovernor, SLOW_FRAME_MS, WINDOW, type GovernorStep } from './governor.ts';
import { alphaAt, burst, cannon, Field, HEADS, rain, seeded, SHAPES, styleOf, TUMBLES } from './particles.ts';
import { GAIN, rgb } from './stageLight.ts';

const facts = (over: Partial<FxFacts> = {}): FxFacts => ({ choice: 'auto', cores: 8, memory: 8, software: false, dataSaver: false, slow: false, ...over });

describe('what a device gets', () => {
  it('a modern laptop gets everything, a middling one most of it', () => {
    expect(decideFx(facts())).toBe('rich');
    expect(decideFx(facts({ cores: 4, memory: 4 }))).toBe('full');
    expect(decideFx(facts({ cores: 8, memory: 4 }))).toBe('full');
  });

  it('a browser that does not say how much memory it has is judged on its processor', () => {
    expect(decideFx(facts({ memory: null }))).toBe('rich');
    expect(decideFx(facts({ memory: null, cores: 4 }))).toBe('full');
    expect(decideFx(facts({ memory: null, cores: 2 }))).toBe('plain');
  });

  it('an old or struggling device gets the plain game on the automatic setting', () => {
    expect(decideFx(facts({ cores: 2 }))).toBe('plain');
    expect(decideFx(facts({ memory: 2 }))).toBe('plain');
    expect(decideFx(facts({ software: true }))).toBe('plain');
    expect(decideFx(facts({ dataSaver: true }))).toBe('plain');
    expect(decideFx(facts({ slow: true }))).toBe('plain');
  });

  it('a choice made by hand is kept on a weak device', () => {
    const weak = { cores: 2, memory: 2, dataSaver: true, slow: true };
    expect(decideFx(facts({ ...weak, choice: 'high' }))).toBe('rich');
    expect(decideFx(facts({ ...weak, choice: 'medium' }))).toBe('full');
    expect(decideFx(facts({ choice: 'low' }))).toBe('plain');
    expect(decideFx(facts({ choice: 'off' }))).toBe('plain');
  });

  it('a device with no graphics chip keeps the plain game, whatever is chosen', () => {
    expect(decideFx(facts({ software: true, choice: 'high' }))).toBe('plain');
    expect(decideFx(facts({ software: true, choice: 'medium' }))).toBe('plain');
    expect(decideFx(facts({ software: true }))).toBe('plain');
  });

  it('the plain game draws nothing on the canvas, and a richer level draws more', () => {
    expect(FX_BUDGET.plain).toBe(0);
    expect(FX_BUDGET.full).toBeLessThan(FX_BUDGET.rich);
  });
});

describe('the frame-time check', () => {
  const run = (frames: number[]) => {
    const steps: GovernorStep[] = [];
    const g = new FxGovernor((s) => steps.push(s));
    frames.forEach((ms) => g.sample(ms));
    return { steps, g };
  };
  const many = (ms: number, n: number) => Array.from({ length: n }, () => ms);

  it('says nothing while frames are quick', () => {
    expect(run(many(16.7, WINDOW * 5)).steps).toEqual([]);
  });

  it('one hitch among quick frames is not slowness', () => {
    const frames = many(16.7, WINDOW);
    frames[10] = 180;
    expect(run(frames).steps).toEqual([]);
  });

  it('steady slow frames trim the celebration, then stop it', () => {
    const slow = SLOW_FRAME_MS + 6;
    const { steps, g } = run(many(slow, WINDOW));
    expect(steps).toEqual(['trim']);
    expect(g.trim).toBe(0.5);
    expect(run(many(slow, WINDOW * 2)).steps).toEqual(['trim', 'stop']);
  });

  it('a tab coming back from the background starts the count again', () => {
    const slow = SLOW_FRAME_MS + 6;
    expect(run([...many(slow, WINDOW - 1), 4000, ...many(16.7, WINDOW)]).steps).toEqual([]);
  });

  it('the first frames of a burst do not count', () => {
    const steps: GovernorStep[] = [];
    const g = new FxGovernor((s) => steps.push(s));
    g.settle(4);
    many(90, 4).forEach((ms) => g.sample(ms));
    many(16.7, WINDOW).forEach((ms) => g.sample(ms));
    expect(steps).toEqual([]);
  });
});

describe('the pieces of a celebration', () => {
  const fly = (f: Field, seconds: number, floor = 2000) => {
    for (let t = 0; t < seconds; t += 1 / 60) f.step(1 / 60, floor);
  };

  it('the same seed throws the same celebration', () => {
    const a = new Field();
    const b = new Field();
    burst(a, seeded(7), { x: 400, y: 300, reach: 150, count: 40, colors: 5 });
    burst(b, seeded(7), { x: 400, y: 300, reach: 150, count: 40, colors: 5 });
    fly(a, 0.5);
    fly(b, 0.5);
    expect(a.n).toBe(b.n);
    expect(Array.from(a.x.slice(0, a.n))).toEqual(Array.from(b.x.slice(0, b.n)));
    expect(Array.from(a.y.slice(0, a.n))).toEqual(Array.from(b.y.slice(0, b.n)));
  });

  it('a burst flies out about as far as it was asked to, in every direction', () => {
    const f = new Field();
    burst(f, seeded(3), { x: 0, y: 0, reach: 200, count: 60, style: 'ripple', colors: 3 });
    fly(f, 0.6);
    const far = Array.from({ length: f.n }, (_, i) => Math.hypot(f.x[i]!, f.y[i]!));
    const mean = far.reduce((a, b) => a + b, 0) / far.length;
    expect(mean).toBeGreaterThan(200 * 0.5);
    expect(mean).toBeLessThan(200 * 1.3);
    expect(Array.from(f.x.slice(0, f.n)).some((x) => x < -40)).toBe(true);
    expect(Array.from(f.x.slice(0, f.n)).some((x) => x > 40)).toBe(true);
  });

  it('a rising burst goes up before it comes down', () => {
    const f = new Field();
    burst(f, seeded(5), { x: 0, y: 0, reach: 180, count: 40, rise: true, colors: 3 });
    fly(f, 0.25);
    expect(Array.from(f.y.slice(0, f.n)).every((y) => y < 0)).toBe(true);
  });

  it('every piece is gone when its life is over, and nothing is left behind', () => {
    const f = new Field();
    burst(f, seeded(1), { x: 0, y: 0, reach: 150, count: 50, colors: 3 });
    cannon(f, seeded(2), { x: 0, y: 800, angle: -Math.PI * 0.3, spread: 0.7, power: 2000, count: 100, colors: 5 });
    rain(f, seeded(3), { x0: 0, x1: 1200, y: -20, count: 100, over: 2.5, colors: 5 });
    expect(f.n).toBe(250);
    fly(f, 8);
    expect(f.n).toBe(0);
  });

  it('a piece that falls off the foot of the screen is gone at once', () => {
    const f = new Field();
    rain(f, seeded(9), { x0: 0, x1: 300, y: -20, count: 30, over: 0.1, colors: 2 });
    fly(f, 1.5, 100);
    expect(f.n).toBe(0);
  });

  it('a full field drops what does not fit instead of growing', () => {
    const f = new Field(20);
    expect(burst(f, seeded(1), { x: 0, y: 0, reach: 100, count: 50, colors: 2 })).toBe(20);
    expect(f.n).toBe(20);
  });

  it('a piece waits for its moment without moving', () => {
    const f = new Field();
    burst(f, seeded(4), { x: 10, y: 20, reach: 100, count: 8, colors: 2, delay: 1 });
    fly(f, 0.5);
    expect(Array.from(f.x.slice(0, f.n)).every((x) => x === 10)).toBe(true);
    expect(alphaAt(f.age[0]!, f.ttl[0]!)).toBe(0);
    fly(f, 0.8);
    expect(Array.from(f.x.slice(0, f.n)).some((x) => x !== 10)).toBe(true);
  });

  it('a cannon in the bottom left corner fires up and to the right', () => {
    const f = new Field();
    cannon(f, seeded(6), { x: 0, y: 800, angle: -Math.PI * 0.3, spread: 0.5, power: 1800, count: 60, colors: 5 });
    fly(f, 0.5);
    expect(Array.from(f.x.slice(0, f.n)).every((x) => x > 0)).toBe(true);
    expect(Array.from(f.y.slice(0, f.n)).every((y) => y < 800)).toBe(true);
  });

  it('paper falls slowly enough to be seen: under 300 pixels a second once the air has it', () => {
    const f = new Field();
    rain(f, seeded(8), { x0: 0, x1: 100, y: 0, count: 40, over: 0, colors: 2 });
    fly(f, 1.5, 5000);
    expect(f.n).toBe(40);
    expect(Math.max(...Array.from(f.vy.slice(0, f.n)))).toBeLessThan(300);
  });

  it('a piece is solid for most of its life and gone by the end of it', () => {
    expect(alphaAt(0, 2)).toBe(1);
    expect(alphaAt(1, 2)).toBe(1);
    expect(alphaAt(1.7, 2)).toBeCloseTo(0.5);
    expect(alphaAt(2, 2)).toBe(0);
  });

  it('every style a player can equip has its own pieces, and an unknown one still celebrates', () => {
    for (const style of ['festival', 'stars', 'sparkle', 'fireworks', 'comets', 'bubbles', 'leaves', 'petals', 'lanterns', 'embers', 'ripple', 'house']) {
      const b = styleOf(style);
      expect(b.shapes.length).toBeGreaterThan(0);
      expect(b.shapes.every((s) => SHAPES.includes(s))).toBe(true);
    }
    expect(styleOf('something new')).toBe(styleOf('house'));
    // Bubbles, lanterns and embers float up; paper and leaves come down.
    expect(styleOf('bubbles').gravity).toBeLessThan(0);
    expect(styleOf('leaves').gravity).toBeGreaterThan(0);
  });

  it('a streak points the way it flies and never tumbles', () => {
    const f = new Field();
    burst(f, seeded(11), { x: 0, y: 0, reach: 100, count: 60, style: 'festival', colors: 3 });
    const streak = SHAPES.indexOf('streak');
    const streaks = Array.from({ length: f.n }, (_, i) => i).filter((i) => f.shape[i] === streak);
    expect(streaks.length).toBeGreaterThan(0);
    expect(streaks.every((i) => (f.bits[i]! & HEADS) !== 0 && (f.bits[i]! & TUMBLES) === 0)).toBe(true);
  });
});

describe('the stage light', () => {
  it('reads a colour as the three numbers a shader wants', () => {
    expect(rgb('#ffffff')).toEqual([1, 1, 1]);
    expect(rgb('#000000')).toEqual([0, 0, 0]);
    const [r, g, b] = rgb('#9db7ff');
    expect(r).toBeCloseTo(157 / 255);
    expect(g).toBeCloseTo(183 / 255);
    expect(b).toBe(1);
  });

  it('is drawn only where effects are up and a graphics chip will draw it', () => {
    const board = { level: 'rich' as const, webgl: true, software: false, dataSaver: false, lessMotion: false };
    expect(stageLightWanted(board)).toBe(true);
    expect(stageLightWanted({ ...board, level: 'full' })).toBe(true);
    expect(stageLightWanted({ ...board, level: 'plain' })).toBe(false);
    // No WebGL, or WebGL drawn by the processor (a Chromebook with no usable chip, a headless browser): the flat beams.
    expect(stageLightWanted({ ...board, webgl: false })).toBe(false);
    expect(stageLightWanted({ ...board, software: true })).toBe(false);
  });

  it('gives way to less motion and to data saver, whatever the graphics setting', () => {
    const board = { level: 'rich' as const, webgl: true, software: false, dataSaver: false, lessMotion: false };
    expect(stageLightWanted({ ...board, lessMotion: true })).toBe(false);
    expect(stageLightWanted({ ...board, dataSaver: true })).toBe(false);
  });

  it('is never brighter than the flat beams it stands in for', () => {
    // The shader holds a beam to 1.1 times the gain; the drawn beams are 22% of the same colour.
    expect(GAIN * 1.1).toBeLessThanOrEqual(0.22 + 1e-9);
  });
});
