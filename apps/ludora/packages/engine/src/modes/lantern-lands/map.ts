/*
 * Lantern Lands: the map. Hexagon geometry (axial coordinates, neighbours,
 * distance, corners, pixels) and the map builder. Pure data and geometry: no
 * game state and no game rules, so the screens can import it as well as the
 * engine (`@ludora/engine/lantern-lands-map`).
 *
 * Coordinates are axial (q, r) on a hexagon of hexagons centred on (0, 0).
 * Lands are numbered in reading order: rows top to bottom (r from -radius),
 * left to right within a row. Hexes are drawn pointy-top.
 *
 * Fairness comes from symmetry. The six corners of the big hexagon are the
 * possible homes. For each number of teams the homes sit at corners chosen so
 * that some rotation or reflection of the map carries every home onto every
 * other (five teams cannot be placed that way; they get the closest layout,
 * which is mirror-symmetric). Shrines are placed as whole orbits of that group,
 * and blocked lands as whole orbits of the six-fold rotations (plus the
 * mirrors, for four or five teams), so the same move carries the shrines and
 * the blocked lands along with the home: every team starts from an identical
 * position.
 */
import type { Rng } from '@ludora/shared';

export interface Hex {
  q: number;
  r: number;
}

/** Map sizes: the radius of the big hexagon. Small is 37 lands, normal 61, big 91. */
export const MAP_SIZES = { small: 3, normal: 4, big: 5 } as const;
export type MapSize = keyof typeof MAP_SIZES;

/** The six neighbour directions. Direction k also points at corner k of the big hexagon. */
export const DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** Corners used as homes, by number of teams (team order: left, then clockwise on screen). */
export const HOME_CORNERS: Readonly<Record<number, readonly number[]>> = {
  1: [3],
  2: [3, 0],
  3: [3, 1, 5],
  4: [3, 2, 0, 5],
  5: [3, 2, 1, 0, 5],
  6: [3, 2, 1, 0, 5, 4],
};

/** Roughly this share of the lands is blocked (lakes and hills), rounded to whole symmetric groups of six. */
export const BLOCKED_SHARE = 0.12;

export function landCount(radius: number): number {
  return 3 * radius * (radius + 1) + 1;
}

export function distance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function corner(radius: number, k: number): Hex {
  const d = DIRECTIONS[((k % 6) + 6) % 6]!;
  return { q: d.q * radius, r: d.r * radius };
}

export interface Grid {
  radius: number;
  hexes: readonly Hex[];
  /** Land index by "q,r". */
  index: ReadonlyMap<string, number>;
  /** Neighbouring land indexes of each land. */
  adj: readonly (readonly number[])[];
  /** Short names in reading order: row letter and place in the row, such as "D4". */
  labels: readonly string[];
  centre: number;
}

const grids = new Map<number, Grid>();
const key = (q: number, r: number) => `${q},${r}`;

/** The lands of a map of this radius, with neighbours and labels. Cached. */
export function grid(radius: number): Grid {
  const cached = grids.get(radius);
  if (cached) return cached;
  const hexes: Hex[] = [];
  const labels: string[] = [];
  for (let r = -radius; r <= radius; r++) {
    const from = Math.max(-radius, -r - radius);
    const to = Math.min(radius, -r + radius);
    for (let q = from; q <= to; q++) {
      hexes.push({ q, r });
      labels.push(`${String.fromCharCode(65 + r + radius)}${q - from + 1}`);
    }
  }
  const index = new Map(hexes.map((h, i) => [key(h.q, h.r), i]));
  const adj = hexes.map((h) => DIRECTIONS.map((d) => index.get(key(h.q + d.q, h.r + d.r))).filter((i): i is number => i !== undefined));
  const g: Grid = { radius, hexes, index, adj, labels, centre: index.get(key(0, 0))! };
  grids.set(radius, g);
  return g;
}

/* ------------------------------- drawing -------------------------------- */

const SQRT3 = Math.sqrt(3);

/** Centre of a hex in pixels, pointy-top, for hexes of circumradius `size`. */
export function toPixel(h: Hex, size: number): { x: number; y: number } {
  return { x: size * SQRT3 * (h.q + h.r / 2), y: size * 1.5 * h.r };
}

/** The six corners of a pointy-top hex as an SVG points string. */
export function hexPoints(x: number, y: number, size: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${(x + size * Math.cos(a)).toFixed(2)},${(y + size * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** The box around every hex of a map of this radius, for an SVG viewBox. */
export function mapBounds(radius: number, size: number): { x: number; y: number; width: number; height: number } {
  const w = SQRT3 * size * (radius + 0.5);
  const h = size * (1.5 * radius + 1);
  return { x: -w, y: -h, width: 2 * w, height: 2 * h };
}

/* ------------------------------- symmetry ------------------------------- */

/** Turns a hex one corner anticlockwise (corner k to corner k + 1). */
const rotate = (h: Hex): Hex => ({ q: h.q + h.r, r: -h.q });
/** Mirrors a hex in the line through corners 0 and 3 (corner k to corner -k). */
const mirror = (h: Hex): Hex => ({ q: h.q + h.r, r: -h.r });

/** One of the twelve symmetries of the hexagon: an optional mirror, then `turns` rotations. */
interface Symmetry {
  turns: number;
  flip: boolean;
}

function apply(s: Symmetry, h: Hex): Hex {
  let out = s.flip ? mirror(h) : h;
  for (let i = 0; i < s.turns; i++) out = rotate(out);
  return out;
}

const ALL_SYMMETRIES: Symmetry[] = [false, true].flatMap((flip) => [0, 1, 2, 3, 4, 5].map((turns) => ({ turns, flip })));
const ROTATIONS = ALL_SYMMETRIES.filter((s) => !s.flip);

/** The symmetries that carry the set of home corners onto itself. */
export function homeSymmetries(corners: readonly number[]): Symmetry[] {
  const set = new Set(corners.map((c) => ((c % 6) + 6) % 6));
  return ALL_SYMMETRIES.filter((s) => [...set].every((c) => set.has((((s.flip ? -c : c) + s.turns) % 6 + 6) % 6)));
}

/** Groups of land indexes that the symmetries carry onto one another. */
function orbits(g: Grid, cells: readonly number[], group: readonly Symmetry[]): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const c of cells) {
    if (seen.has(c)) continue;
    const orbit = new Set<number>();
    for (const s of group) {
      const h = apply(s, g.hexes[c]!);
      const i = g.index.get(key(h.q, h.r));
      if (i !== undefined) orbit.add(i);
    }
    for (const i of orbit) seen.add(i);
    out.push([...orbit].sort((a, b) => a - b));
  }
  return out;
}

const orders = new Map<string, number[]>();

/**
 * Each land's place in reading order as seen from `home`, with the map turned
 * so that home sits at the left-hand corner (and, with `mirrored`, flipped top
 * to bottom). Bots break ties with it, so every team's bots play the same way
 * from wherever they start.
 */
export function orderFrom(radius: number, home: number, mirrored = false): number[] {
  const id = `${radius}:${home}:${mirrored}`;
  const cached = orders.get(id);
  if (cached) return cached;
  const g = grid(radius);
  const h = g.hexes[home];
  const k = h ? [0, 1, 2, 3, 4, 5].find((c) => corner(radius, c).q === h.q && corner(radius, c).r === h.r) : undefined;
  const turns = (((3 - (k ?? 3)) % 6) + 6) % 6;
  const order = g.hexes.map((x) => {
    // Turn the home to corner 3, then mirror in the line through corners 0 and 3, which keeps it there.
    const turned = apply({ turns, flip: false }, x);
    const y = mirrored ? mirror(turned) : turned;
    return g.index.get(key(y.q, y.r)) ?? 0;
  });
  orders.set(id, order);
  return order;
}

/* ------------------------------- distances ------------------------------ */

/**
 * Steps from the nearest of `sources` to every land, walking only over lands
 * `open` allows; -1 where there is no way through. The bots plan with this.
 */
export function distancesFrom(radius: number, sources: readonly number[], open: (land: number) => boolean): number[] {
  const g = grid(radius);
  const dist = g.hexes.map(() => -1);
  const queue: number[] = [];
  for (const s of sources) {
    if (dist[s] === -1) {
      dist[s] = 0;
      queue.push(s);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]!;
    for (const n of g.adj[at]!) {
      if (dist[n] !== -1 || !open(n)) continue;
      dist[n] = dist[at]! + 1;
      queue.push(n);
    }
  }
  return dist;
}

/* -------------------------------- the map ------------------------------- */

export interface LanternMap {
  radius: number;
  /** Each team's home land, in team order. */
  homes: number[];
  /** Shrine lands; the first is always the centre. */
  shrines: number[];
  /** Blocked lands, drawn as lakes or hills. Nobody can claim them or walk through them. */
  lakes: number[];
  hills: number[];
}

/**
 * The shrine counts that treat every team alike, for this many teams on a
 * map of this radius: the centre plus whole symmetric groups of shrines.
 */
export function fairShrineCounts(radius: number, teams: number): number[] {
  const g = grid(radius);
  const homeCorners = HOME_CORNERS[clampTeams(teams)]!;
  const sizes = orbits(g, shrineCandidates(g, homeCorners), homeSymmetries(homeCorners)).map((o) => o.length);
  let can = new Set([0]);
  for (const s of sizes) can = new Set([...can, ...[...can].map((x) => x + s)]);
  return [...can].map((n) => n + 1).sort((a, b) => a - b);
}

/** The fair shrine count nearest to the one asked for (a tie goes to the larger). */
export function shrineCountFor(radius: number, teams: number, wanted: number): number {
  const options = fairShrineCounts(radius, teams);
  return options.reduce((best, n) => {
    const d = Math.abs(n - wanted);
    const bd = Math.abs(best - wanted);
    return d < bd || (d === bd && n > best) ? n : best;
  }, options[0] ?? 1);
}

const clampTeams = (teams: number) => Math.max(1, Math.min(6, Math.round(teams)));

/** Lands a shrine may stand on: away from the centre and the edge, and never on or next to a home. */
function shrineCandidates(g: Grid, homeCorners: readonly number[]): number[] {
  const rings = g.radius <= 3 ? [2] : g.radius === 4 ? [2, 3] : [2, 3, 4];
  const homes = homeCorners.map((k) => corner(g.radius, k));
  const origin = { q: 0, r: 0 };
  return g.hexes.flatMap((h, i) => (rings.includes(distance(h, origin)) && homes.every((c) => distance(h, c) >= 2) ? [i] : []));
}

/**
 * How lopsided a land is between teams: steps to the second-nearest home minus
 * steps to the nearest. 0 means it sits exactly between two teams.
 */
function lopsided(h: Hex, homes: readonly Hex[]): number {
  const d = homes.map((c) => distance(h, c)).sort((a, b) => a - b);
  return d.length > 1 ? d[1]! - d[0]! : 0;
}

function pickShrines(g: Grid, homeCorners: readonly number[], wanted: number, rng: Rng): number[] {
  const homes = homeCorners.map((k) => corner(g.radius, k));
  const pool = orbits(g, shrineCandidates(g, homeCorners), homeSymmetries(homeCorners))
    .map((cells) => ({ cells, cost: cells.length * lopsided(g.hexes[cells[0]!]!, homes) }))
    .sort((a, b) => a.cost / a.cells.length - b.cost / b.cells.length);
  const need = shrineCountFor(g.radius, homeCorners.length, wanted) - 1;
  // Search every way of making up the count from whole groups, best first:
  // shrines between teams (so they are contested), never next to each other,
  // then as far apart as possible. Equally good layouts are drawn at random.
  const hex = (i: number) => g.hexes[i]!;
  let best: { cost: number; spread: number; picks: number[][] }[] = [];
  const minGap = (cells: readonly number[]) => {
    let m = Infinity;
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) m = Math.min(m, distance(hex(cells[i]!), hex(cells[j]!)));
    return m;
  };
  const search = (from: number, left: number, cost: number, picks: number[][]) => {
    if (best.length && cost > best[0]!.cost) return;
    if (left === 0) {
      const spread = minGap([g.centre, ...picks.flat()]);
      if (spread < 2) return;
      const top = best[0];
      if (!top || cost < top.cost || (cost === top.cost && spread > top.spread)) best = [{ cost, spread, picks: [...picks] }];
      else if (cost === top.cost && spread === top.spread) best.push({ cost, spread, picks: [...picks] });
      return;
    }
    for (let i = from; i < pool.length; i++) {
      const o = pool[i]!;
      // The pool is sorted by cost per land, so nothing further on can do better than this bound.
      if (best.length && cost + (left * o.cost) / o.cells.length > best[0]!.cost) break;
      if (o.cells.length > left) continue;
      picks.push(o.cells);
      search(i + 1, left - o.cells.length, cost + o.cost, picks);
      picks.pop();
    }
  };
  search(0, need, 0, []);
  const pick = best.length ? best[Math.floor(rng.next() * best.length)]!.picks : [];
  return [g.centre, ...pick.flat().sort((a, b) => a - b)];
}

/** Every open land can be reached from every other, shrines keep three open sides and homes two. */
function playable(g: Grid, blocked: ReadonlySet<number>, shrines: readonly number[], homes: readonly number[]): boolean {
  const open = (i: number) => !blocked.has(i);
  const dist = distancesFrom(g.radius, [g.centre], open);
  if (g.hexes.some((_, i) => open(i) && dist[i] === -1)) return false;
  const openSides = (i: number) => g.adj[i]!.filter(open).length;
  return shrines.every((s) => openSides(s) >= 3) && homes.every((h) => openSides(h) >= 2);
}

function pickBlocked(g: Grid, homeCorners: readonly number[], shrines: readonly number[], homes: readonly number[], rng: Rng): { lakes: number[]; hills: number[] } {
  // Four or five teams are only symmetric under mirrors, so the lakes must be mirror-symmetric too.
  const group = homeCorners.length === 4 || homeCorners.length === 5 ? ALL_SYMMETRIES : ROTATIONS;
  const corners = [0, 1, 2, 3, 4, 5].map((k) => corner(g.radius, k));
  const taken = new Set(shrines);
  const cells = g.hexes.flatMap((h, i) => (i !== g.centre && !taken.has(i) && corners.every((c) => distance(h, c) >= 2) ? [i] : []));
  const pool = orbits(g, cells, group).filter((o) => o.every((i) => !taken.has(i)));
  for (let target = Math.round((BLOCKED_SHARE * g.hexes.length) / 6) * 6; target > 0; target -= 6) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const order = rng.shuffle(pool);
      const picked: number[][] = [];
      let total = 0;
      for (const o of order) {
        if (total + o.length > target) continue;
        picked.push(o);
        total += o.length;
      }
      if (total !== target) continue;
      const blocked = new Set(picked.flat());
      if (!playable(g, blocked, shrines, homes)) continue;
      // Whole groups alternate between lakes and hills, so the scenery stays symmetric as well.
      const lakes = picked.filter((_, i) => i % 2 === 0).flat().sort((a, b) => a - b);
      const hills = picked.filter((_, i) => i % 2 === 1).flat().sort((a, b) => a - b);
      return { lakes, hills };
    }
  }
  return { lakes: [], hills: [] };
}

/**
 * A new map: homes at corners, the centre shrine plus fair groups of others,
 * and symmetric lakes and hills that never cut anything off. `teams` is
 * clamped to 1 to 6; `shrines` is the count asked for (see shrineCountFor).
 */
export function buildMap(opts: { radius: number; teams: number; shrines: number; rng: Rng }): LanternMap {
  const g = grid(opts.radius);
  const homeCorners = HOME_CORNERS[clampTeams(opts.teams)]!;
  const homes = homeCorners.map((k) => {
    const c = corner(opts.radius, k);
    return g.index.get(key(c.q, c.r))!;
  });
  const shrines = pickShrines(g, homeCorners, opts.shrines, opts.rng);
  const { lakes, hills } = pickBlocked(g, homeCorners, shrines, homes, opts.rng);
  return { radius: opts.radius, homes, shrines, lakes, hills };
}

/** "the centre shrine" or "the shrine at D4". */
export function shrineName(radius: number, land: number): string {
  const g = grid(radius);
  return land === g.centre ? 'the centre shrine' : `the shrine at ${g.labels[land]}`;
}
