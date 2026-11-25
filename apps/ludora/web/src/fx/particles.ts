/*
 * The stage's particles: what the pieces of a celebration do once they are thrown. Each one has a
 * place, a speed, a turn and a life; air slows it, weight pulls it (or lifts it: a bubble, an ember,
 * a lantern), and flat pieces flutter from side to side as they fall. Nothing here touches the
 * page, so it can be tested: fx/runtime.ts draws what this works out.
 *
 * Lengths are CSS pixels and times are seconds. The pieces live in flat arrays, so a few hundred of
 * them cost a frame almost nothing and no memory is handed out while a celebration plays.
 */

export const SHAPES = ['ribbon', 'shard', 'streak', 'star', 'ring', 'leaf', 'dot', 'lantern', 'square'] as const;
export type Shape = (typeof SHAPES)[number];

/** Turns end over end as it falls, like paper. */
export const TUMBLES = 1;
/** Points the way it flies, like a spark. */
export const HEADS = 2;
/** Drawn as light, brighter where pieces overlap. */
export const GLOWS = 4;

interface Behaviour {
  shapes: readonly Shape[];
  /** Downward pull, px/s². Negative for pieces that float up. */
  gravity: number;
  /** Air: the share of speed lost each second. */
  drag: number;
  /** Turning, radians a second (each way). */
  spin: number;
  /** Side-to-side flutter, px/s. */
  sway: number;
  /** Seconds a piece lasts, least and most. */
  life: readonly [number, number];
  bits: number;
}

const CONFETTI: Behaviour = { shapes: ['ribbon', 'square', 'shard', 'ribbon'], gravity: 520, drag: 2.4, spin: 7, sway: 60, life: [2.6, 4], bits: TUMBLES };

/** A player's own answer and victory effects (the shop's styles), and the game's festival default. */
const STYLES: Record<string, Behaviour> = {
  festival: { shapes: ['streak', 'shard', 'ribbon'], gravity: 620, drag: 2.6, spin: 6, sway: 26, life: [1.1, 1.7], bits: TUMBLES },
  stars: { shapes: ['star'], gravity: 260, drag: 2.8, spin: 3, sway: 10, life: [0.9, 1.4], bits: GLOWS },
  sparkle: { shapes: ['star'], gravity: 200, drag: 3, spin: 4, sway: 8, life: [0.8, 1.3], bits: GLOWS },
  fireworks: { shapes: ['streak'], gravity: 420, drag: 2.2, spin: 0, sway: 0, life: [0.8, 1.3], bits: HEADS | GLOWS },
  comets: { shapes: ['streak'], gravity: 300, drag: 1.9, spin: 0, sway: 0, life: [0.9, 1.4], bits: HEADS | GLOWS },
  bubbles: { shapes: ['ring'], gravity: -90, drag: 2.6, spin: 0, sway: 22, life: [1.4, 2.2], bits: 0 },
  leaves: { shapes: ['leaf'], gravity: 240, drag: 2.8, spin: 2.5, sway: 48, life: [1.6, 2.4], bits: TUMBLES },
  petals: { shapes: ['leaf'], gravity: 200, drag: 3, spin: 2, sway: 54, life: [1.7, 2.5], bits: TUMBLES },
  lanterns: { shapes: ['lantern'], gravity: -70, drag: 2.4, spin: 0, sway: 14, life: [1.6, 2.4], bits: 0 },
  embers: { shapes: ['dot'], gravity: -160, drag: 2, spin: 0, sway: 18, life: [1, 1.6], bits: GLOWS },
  ripple: { shapes: ['ring'], gravity: 0, drag: 3, spin: 0, sway: 0, life: [0.7, 1], bits: 0 },
  house: { shapes: ['square', 'ribbon'], gravity: 560, drag: 2.6, spin: 7, sway: 40, life: [1.3, 1.9], bits: TUMBLES },
};

export const styleOf = (style: string | undefined): Behaviour => STYLES[style ?? 'festival'] ?? STYLES.house!;

/** A seeded run of numbers from 0 up to 1 (mulberry32): the same seed throws the same celebration. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Field {
  /** Pieces alive (or waiting for their moment). */
  n = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly rot: Float32Array;
  readonly spin: Float32Array;
  readonly size: Float32Array;
  /** Seconds lived; negative while a piece waits for its moment. */
  readonly age: Float32Array;
  readonly ttl: Float32Array;
  readonly grav: Float32Array;
  readonly drag: Float32Array;
  readonly sway: Float32Array;
  readonly rate: Float32Array;
  readonly phase: Float32Array;
  readonly shape: Uint8Array;
  readonly bits: Uint8Array;
  /** Which of the caller's colours. */
  readonly color: Uint16Array;

  constructor(readonly cap = 1400) {
    const f = () => new Float32Array(cap);
    this.x = f();
    this.y = f();
    this.vx = f();
    this.vy = f();
    this.rot = f();
    this.spin = f();
    this.size = f();
    this.age = f();
    this.ttl = f();
    this.grav = f();
    this.drag = f();
    this.sway = f();
    this.rate = f();
    this.phase = f();
    this.shape = new Uint8Array(cap);
    this.bits = new Uint8Array(cap);
    this.color = new Uint16Array(cap);
  }

  /** Throws one piece. When the field is full the piece is simply not thrown: a celebration is never worth a stall. */
  add(b: Behaviour, rnd: () => number, at: { x: number; y: number; vx: number; vy: number; size: number; color: number; delay?: number }): boolean {
    if (this.n >= this.cap) return false;
    const i = this.n++;
    const shape = b.shapes[Math.floor(rnd() * b.shapes.length)]!;
    this.x[i] = at.x;
    this.y[i] = at.y;
    this.vx[i] = at.vx;
    this.vy[i] = at.vy;
    this.rot[i] = b.spin ? rnd() * Math.PI * 2 : 0;
    this.spin[i] = b.spin * (rnd() * 2 - 1);
    this.size[i] = at.size;
    this.age[i] = -(at.delay ?? 0);
    this.ttl[i] = b.life[0] + rnd() * (b.life[1] - b.life[0]);
    this.grav[i] = b.gravity * (0.85 + rnd() * 0.3);
    this.drag[i] = b.drag * (0.85 + rnd() * 0.3);
    this.sway[i] = b.sway * (0.5 + rnd());
    this.rate[i] = 3 + rnd() * 4;
    this.phase[i] = rnd() * Math.PI * 2;
    this.shape[i] = SHAPES.indexOf(shape);
    // A streak always points the way it flies, whatever style throws it.
    this.bits[i] = shape === 'streak' ? (b.bits | HEADS) & ~TUMBLES : b.bits;
    this.color[i] = at.color;
    return true;
  }

  /**
   * Moves every piece on by `dt` seconds. A piece is gone when its life is over or it has fallen
   * past `floor` (the foot of the screen, with room to leave it).
   */
  step(dt: number, floor: number) {
    for (let i = 0; i < this.n; i++) {
      const age = (this.age[i]! += dt);
      if (age < 0) continue;
      if (age >= this.ttl[i]! || this.y[i]! > floor) {
        this.drop(i--);
        continue;
      }
      const keep = Math.max(0, 1 - this.drag[i]! * dt);
      this.vx[i]! *= keep;
      this.vy[i] = this.vy[i]! * keep + this.grav[i]! * dt;
      this.x[i]! += (this.vx[i]! + this.sway[i]! * Math.sin(this.phase[i]! + age * this.rate[i]!)) * dt;
      this.y[i]! += this.vy[i]! * dt;
      this.rot[i]! += this.spin[i]! * dt;
    }
  }

  /** The last piece takes the place of the one that has gone, so the live ones stay together. */
  private drop(i: number) {
    const last = --this.n;
    if (i === last) return;
    for (const a of [this.x, this.y, this.vx, this.vy, this.rot, this.spin, this.size, this.age, this.ttl, this.grav, this.drag, this.sway, this.rate, this.phase, this.shape, this.bits, this.color]) a[i] = a[last]!;
  }

  clear() {
    this.n = 0;
  }
}

/** How see-through a piece is: solid for most of its life, gone by the end of it. */
export function alphaAt(age: number, ttl: number): number {
  if (age < 0) return 0;
  return Math.max(0, Math.min(1, (ttl - age) / (ttl * 0.3)));
}

export interface BurstOpts {
  x: number;
  y: number;
  /** How far the pieces fly before the air stops them. */
  reach: number;
  count: number;
  /** Thrown upwards, to come down again (the podium). */
  rise?: boolean;
  style?: string;
  /** How many colours the caller has for it. */
  colors: number;
  /** Seconds before it goes off. */
  delay?: number;
  /** Piece size in pixels, least and most. */
  piece?: readonly [number, number];
}

/** One outward hit from a point: a correct answer, a place on the podium. */
export function burst(field: Field, rnd: () => number, o: BurstOpts): number {
  const b = styleOf(o.style);
  const [small, large] = o.piece ?? [10, 20];
  let thrown = 0;
  for (let i = 0; i < o.count; i++) {
    // Evenly round the circle, each a little off its place, so a burst is full but never a perfect ring.
    const turn = ((i + rnd() * 0.8) / o.count) * Math.PI * 2;
    const angle = o.rise ? -Math.PI * (0.12 + 0.76 * ((turn / (Math.PI * 2)) % 1)) : turn;
    // With drag k a piece thrown at v travels about v/k before it stops.
    const speed = o.reach * b.drag * (0.55 + rnd() * 0.75) * (o.rise ? 1.3 : 1);
    if (field.add(b, rnd, { x: o.x, y: o.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: small + rnd() * (large - small), color: Math.floor(rnd() * o.colors), delay: (o.delay ?? 0) + rnd() * 0.06 })) thrown++;
  }
  return thrown;
}

export interface CannonOpts {
  x: number;
  y: number;
  /** The way it points, in radians: 0 is to the right, a quarter-turn back is straight up. */
  angle: number;
  /** How wide it sprays, in radians. */
  spread: number;
  /** Speed of the fastest pieces, px/s. */
  power: number;
  count: number;
  colors: number;
  delay?: number;
  /** Piece size in pixels, least and most. */
  piece?: readonly [number, number];
}

/** Paper for a phone; a big screen asks for larger pieces, to be seen from the back of a room. */
const PAPER: readonly [number, number] = [9, 17];

/** A confetti cannon: paper shot from a point, slowed by the air, fluttering down. */
export function cannon(field: Field, rnd: () => number, o: CannonOpts): number {
  const [small, large] = o.piece ?? PAPER;
  let thrown = 0;
  for (let i = 0; i < o.count; i++) {
    const angle = o.angle + (rnd() - 0.5) * o.spread;
    // More slow pieces than fast ones, so the cloud is thick near the cannon and thin at its edge.
    const speed = o.power * (0.35 + 0.65 * Math.sqrt(rnd()));
    if (field.add(CONFETTI, rnd, { x: o.x, y: o.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: small + rnd() * (large - small), color: Math.floor(rnd() * o.colors), delay: (o.delay ?? 0) + rnd() * 0.18 })) thrown++;
  }
  return thrown;
}

export interface RainOpts {
  x0: number;
  x1: number;
  /** Where it starts: just above the screen. */
  y: number;
  count: number;
  /** Seconds the shower goes on for. */
  over: number;
  colors: number;
  delay?: number;
  piece?: readonly [number, number];
}

/** A shower of paper from above, for as long as `over`. */
export function rain(field: Field, rnd: () => number, o: RainOpts): number {
  const [small, large] = o.piece ?? PAPER;
  let thrown = 0;
  for (let i = 0; i < o.count; i++) {
    if (field.add(CONFETTI, rnd, { x: o.x0 + rnd() * (o.x1 - o.x0), y: o.y - rnd() * 40, vx: (rnd() - 0.5) * 120, vy: 60 + rnd() * 160, size: small + rnd() * (large - small), color: Math.floor(rnd() * o.colors), delay: (o.delay ?? 0) + rnd() * o.over })) thrown++;
  }
  return thrown;
}
