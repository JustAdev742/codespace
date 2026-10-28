/*
 * Glow Tag Royale: the arena. Map building and geometry (walking, cover,
 * lines of sight, spawn spots, the ring). Pure functions over plain data and
 * no game rules, so the screens can import it too (`@ludora/engine/glow-tag-arena`),
 * for example to predict a player's own walking between views.
 *
 * Fairness comes from symmetry: one quarter of the park is laid out at random
 * and the other three are the same quarter turned by 90, 180 and 270 degrees
 * about the centre. Starting spots are spread evenly round the edge, so every
 * player starts from the same kind of place. Two cross lanes through the
 * centre and a band round the edge are always open.
 */
import type { Rng } from '@ludora/shared';
import { ARENA, COVER_KINDS, COVER_SHAPES, PLAYER_RADIUS, RING, type ArenaMap, type CoverBox, type CoverKind, type CoverTree, type RingCircle } from './meta.ts';

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Side of the square arena in metres for a number of players: 40 for up to 6, growing evenly to 80 for 40. */
export function arenaSize(players: number): number {
  const { minSize, maxSize, smallRoom, bigRoom } = ARENA;
  const t = clamp((players - smallRoom) / (bigRoom - smallRoom), 0, 1);
  return Math.round((minSize + t * (maxSize - minSize)) / 2) * 2;
}

/* ---------------------------------- the map --------------------------------- */

interface Piece {
  kind: CoverKind | 'tree';
  x: number;
  z: number;
  w: number;
  d: number;
}

function pickShape(rng: Rng): CoverKind | 'tree' {
  const kinds = [...COVER_KINDS, 'tree'] as const;
  const total = kinds.reduce((n, k) => n + COVER_SHAPES[k].weight, 0);
  let roll = rng.next() * total;
  for (const k of kinds) {
    roll -= COVER_SHAPES[k].weight;
    if (roll < 0) return k;
  }
  return 'tree';
}

/** Build the park for an arena `size` metres a side. */
export function generateMap(size: number, rng: Rng): ArenaMap {
  const half = size / 2;
  const lo = ARENA.lane;
  const hi = half - ARENA.edgeBand;
  const span = hi - lo;
  const target = clamp(Math.round((span * span) / ARENA.areaPerPiece), ARENA.minPieces, ARENA.maxPieces);
  const quarter: Piece[] = [];
  for (let tries = 0; quarter.length < target && tries < 600; tries++) {
    const kind = pickShape(rng);
    const sizes = COVER_SHAPES[kind].sizes;
    const [sw, sd] = sizes[Math.floor(rng.next() * sizes.length)]!;
    const turned = kind !== 'tree' && rng.next() < 0.5;
    const w = turned ? sd : sw;
    const d = turned ? sw : sd;
    if (w > span || d > span) continue;
    const x = round1(lo + w / 2 + rng.next() * (span - w));
    const z = round1(lo + d / 2 + rng.next() * (span - d));
    // Stay inside the quarter after rounding, and keep the gap from every other piece.
    if (x - w / 2 < lo || x + w / 2 > hi || z - d / 2 < lo || z + d / 2 > hi) continue;
    const g = ARENA.gap;
    if (quarter.some((p) => Math.abs(p.x - x) < (p.w + w) / 2 + g && Math.abs(p.z - z) < (p.d + d) / 2 + g)) continue;
    quarter.push({ kind, x, z, w, d });
  }
  const boxes: CoverBox[] = [];
  const trees: CoverTree[] = [];
  // Turn the quarter about the centre: (x, z) -> (z, -x) each time, swapping width and depth.
  for (let turn = 0; turn < 4; turn++) {
    for (const p of quarter) {
      let { x, z, w, d } = p;
      for (let k = 0; k < turn; k++) {
        [x, z] = [z, -x];
        [w, d] = [d, w];
      }
      x = round1(x) + 0;
      z = round1(z) + 0;
      if (p.kind === 'tree') trees.push([x, z, round2(w / 2)]);
      else boxes.push([COVER_KINDS.indexOf(p.kind), x, z, w, d]);
    }
  }
  return { size, boxes, trees };
}

/* ------------------------------ cover and walls ----------------------------- */

/** Whether a circle of radius r at (x, z) overlaps any cover piece. */
export function overlapsCover(map: ArenaMap, x: number, z: number, r: number): boolean {
  for (const [, bx, bz, w, d] of map.boxes) {
    const dx = Math.max(Math.abs(x - bx) - w / 2, 0);
    const dz = Math.max(Math.abs(z - bz) - d / 2, 0);
    if (dx * dx + dz * dz < r * r) return true;
  }
  for (const [tx, tz, tr] of map.trees) {
    const dx = x - tx;
    const dz = z - tz;
    if (dx * dx + dz * dz < (r + tr) * (r + tr)) return true;
  }
  return false;
}

/** Keep a circle of radius r inside the arena walls. */
export function clampToArena(size: number, x: number, z: number, r = PLAYER_RADIUS): [number, number] {
  const lim = size / 2 - r;
  return [clamp(x, -lim, lim), clamp(z, -lim, lim)];
}

/** Push a circle of radius r out of every cover piece it overlaps (a few passes, for pieces close together). */
export function pushOut(map: ArenaMap, x: number, z: number, r = PLAYER_RADIUS): [number, number] {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const [, bx, bz, w, d] of map.boxes) {
      const hw = w / 2;
      const hd = d / 2;
      const qx = clamp(x, bx - hw, bx + hw);
      const qz = clamp(z, bz - hd, bz + hd);
      const dx = x - qx;
      const dz = z - qz;
      const dist2 = dx * dx + dz * dz;
      if (dist2 >= r * r) continue;
      moved = true;
      if (dist2 > 1e-12) {
        const dist = Math.sqrt(dist2);
        x = qx + (dx / dist) * r;
        z = qz + (dz / dist) * r;
      } else {
        // The centre is inside the box: leave by the nearest face.
        const exits = [bx + hw - x, x - (bx - hw), bz + hd - z, z - (bz - hd)];
        const i = exits.indexOf(Math.min(...exits));
        if (i === 0) x = bx + hw + r;
        else if (i === 1) x = bx - hw - r;
        else if (i === 2) z = bz + hd + r;
        else z = bz - hd - r;
      }
    }
    for (const [tx, tz, tr] of map.trees) {
      const dx = x - tx;
      const dz = z - tz;
      const min = r + tr;
      const dist2 = dx * dx + dz * dz;
      if (dist2 >= min * min) continue;
      moved = true;
      const dist = Math.sqrt(dist2);
      if (dist > 1e-9) {
        x = tx + (dx / dist) * min;
        z = tz + (dz / dist) * min;
      } else x = tx + min;
    }
    if (!moved) break;
  }
  return [x, z];
}

/** The longest stretch walked before cover and walls are checked again, so nobody steps through a thin hedge. */
const SUB_STEP = 0.25;

/**
 * Walk a player from (x, z) towards (tx, tz): in short steps, sliding along
 * any cover in the way and stopping at the walls. Returns where they end up.
 * The caller limits how far (tx, tz) may be.
 */
export function walk(map: ArenaMap, x: number, z: number, tx: number, tz: number, r = PLAYER_RADIUS): [number, number] {
  const dx = tx - x;
  const dz = tz - z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / SUB_STEP));
  let px = x;
  let pz = z;
  for (let i = 0; i < steps; i++) {
    [px, pz] = clampToArena(map.size, px + dx / steps, pz + dz / steps, r);
    [px, pz] = pushOut(map, px, pz, r);
  }
  // Pushing out of one piece never ends past a wall.
  return clampToArena(map.size, px, pz, r);
}

/* ------------------------------- lines of sight ----------------------------- */

/**
 * How far a beam from (x, z) in the unit direction (dx, dz) travels before it
 * meets cover, up to `max` metres. Walls do not stop beams (the arena is open
 * park); only cover does.
 */
export function raycast(map: ArenaMap, x: number, z: number, dx: number, dz: number, max: number): number {
  let best = max;
  for (const [, bx, bz, w, d] of map.boxes) {
    // Slab test against the box.
    let t0 = 0;
    let t1 = best;
    const hw = w / 2;
    const hd = d / 2;
    let miss = false;
    for (const [o, v, c, h] of [
      [x, dx, bx, hw],
      [z, dz, bz, hd],
    ] as const) {
      if (Math.abs(v) < 1e-12) {
        if (o < c - h || o > c + h) miss = true;
        continue;
      }
      let ta = (c - h - o) / v;
      let tb = (c + h - o) / v;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) miss = true;
    }
    if (!miss && t0 < best) best = t0;
  }
  for (const [tx, tz, tr] of map.trees) {
    const ox = x - tx;
    const oz = z - tz;
    const b = ox * dx + oz * dz;
    const c = ox * ox + oz * oz - tr * tr;
    if (c <= 0) return 0;
    const disc = b * b - c;
    if (disc < 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t >= 0 && t < best) best = t;
  }
  return best;
}

/** Whether nothing blocks the straight line between two points. */
export function lineOfSight(map: ArenaMap, ax: number, az: number, bx: number, bz: number): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 1e-9) return true;
  return raycast(map, ax, az, (bx - ax) / len, (bz - az) / len, len) >= len;
}

/* ---------------------------------- headings -------------------------------- */

/** An angle in (-π, π]. */
export function wrapAngle(a: number): number {
  const t = Math.PI * 2;
  let r = a % t;
  if (r <= -Math.PI) r += t;
  if (r > Math.PI) r -= t;
  return r;
}

/** The heading that faces from (ax, az) to (bx, bz). */
export function headingTo(ax: number, az: number, bx: number, bz: number): number {
  return Math.atan2(bx - ax, bz - az);
}

/** How far apart two headings are, 0 to π. */
export function angleBetween(a: number, b: number): number {
  return Math.abs(wrapAngle(a - b));
}

/**
 * Whether a player at distance `dist` in direction `toward` is inside a cone
 * of `coneDeg` degrees around heading `h`. Any part of their body counts, so
 * a close player is easier to catch at the edge of the cone.
 */
export function inCone(h: number, toward: number, dist: number, coneDeg: number, bodyRadius = PLAYER_RADIUS): boolean {
  const allowance = dist > bodyRadius ? Math.asin(bodyRadius / dist) : Math.PI;
  return angleBetween(h, toward) <= (coneDeg * Math.PI) / 360 + allowance;
}

/* -------------------------------- spawn spots ------------------------------- */

/**
 * `n` starting spots spread evenly round the open band at the edge, beginning
 * `offset` (0 to 1) of the way round, each facing the centre.
 */
export function edgeSpots(size: number, n: number, offset: number): { x: number; z: number; h: number }[] {
  const s = size / 2 - ARENA.edgeBand / 2;
  const perimeter = 8 * s;
  return Array.from({ length: n }, (_, i) => {
    const u = (((offset + i / n) % 1) + 1) % 1 * perimeter;
    const side = Math.min(3, Math.floor(u / (2 * s)));
    const t = u - side * 2 * s - s;
    const [x, z] = side === 0 ? [s, t] : side === 1 ? [-t, s] : side === 2 ? [-s, -t] : [t, -s];
    return { x: round2(x) + 0, z: round2(z) + 0, h: round2(headingTo(x, z, 0, 0)) + 0 };
  });
}

/* ---------------------------------- the ring -------------------------------- */

export interface RingShrink {
  from: RingCircle;
  to: RingCircle;
  startAt: number;
  endAt: number;
}

/** The ring at game time t: `from` before the shrink, `to` after it, in a straight line between. */
export function ringAt(ring: RingShrink, t: number): RingCircle {
  if (t >= ring.endAt) return { ...ring.to };
  if (t <= ring.startAt) return { ...ring.from };
  const k = (t - ring.startAt) / (ring.endAt - ring.startAt);
  return {
    x: ring.from.x + (ring.to.x - ring.from.x) * k,
    z: ring.from.z + (ring.to.z - ring.from.z) * k,
    r: ring.from.r + (ring.to.r - ring.from.r) * k,
  };
}

/** The ring before any shrink: centred, big enough to cover the corners. */
export function startRing(size: number): RingCircle {
  return { x: 0, z: 0, r: round1((size / 2) * RING.startRadius) };
}

export function outsideRing(ring: RingCircle, x: number, z: number): boolean {
  return Math.hypot(x - ring.x, z - ring.z) > ring.r;
}
