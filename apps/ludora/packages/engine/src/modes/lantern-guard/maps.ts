/*
 * Lantern Guard's maps: the path the gloom walks to the Great Lantern and the
 * spots beside it where towers can stand, in a 160 x 90 box (y grows
 * downwards). Pure geometry, no game rules. The engine and the screens import
 * this same module (the web through "@ludora/engine/lantern-guard-maps"), so
 * what the projector draws is exactly what the towers aim at.
 */
export * from './units.ts';

export type Point = readonly [x: number, y: number];
export type MapId = 'river' | 'spiral' | 'twin';

export const MAP_W = 160;
export const MAP_H = 90;

export interface MapPath {
  /** The polyline, from the entrance to the Great Lantern. */
  points: readonly Point[];
  /** Distance along the path at each point. */
  at: readonly number[];
  length: number;
}

export interface GuardMap {
  id: MapId;
  name: string;
  /** One line for the settings and the intro. */
  blurb: string;
  /** One path, or two (Twin Gates) that share their second half. */
  paths: readonly MapPath[];
  /** Where the Great Lantern stands, at the end of every path. */
  lantern: Point;
  spots: readonly Point[];
  /**
   * Gloomling health on this map, measured with bot games so that every map
   * is about as hard to hold: Spiral Hill's long road is harder to cover.
   */
  toughness: number;
}

const mirror = (a: Point, b: Point): Point => [2 * a[0] - b[0], 2 * a[1] - b[1]];

/**
 * A smooth curve through the waypoints (a Catmull-Rom spline), as a polyline
 * with `per` points for each stretch between waypoints. `before` and `after`
 * steer the curve at its two ends.
 */
function smooth(points: readonly Point[], per = 10, before?: Point, after?: Point): Point[] {
  const n = points.length;
  const at = (i: number): Point => (i < 0 ? (before ?? mirror(points[0]!, points[1]!)) : i >= n ? (after ?? mirror(points[n - 1]!, points[n - 2]!)) : points[i]!);
  const out: Point[] = [];
  for (let i = 0; i < n - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a: number, b: number, d: number, e: number) => 0.5 * (2 * b + (d - a) * t + (2 * a - 5 * b + 4 * d - e) * t2 + (3 * b - a - 3 * d + e) * t3);
      out.push([round2(c(p0[0], p1[0], p2[0], p3[0])), round2(c(p0[1], p1[1], p2[1], p3[1]))]);
    }
  }
  out.push(points[n - 1]!);
  return out;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function toPath(points: readonly Point[]): MapPath {
  const at = [0];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    at.push(at[i - 1]! + Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2));
  }
  return { points, at, length: at[at.length - 1]! };
}

/** The point at `progress` (0 at the entrance, 1 at the Great Lantern) along a path. */
export function pointAt(path: MapPath, progress: number): Point {
  const d = Math.max(0, Math.min(1, progress)) * path.length;
  const { at, points } = path;
  let lo = 0;
  let hi = at.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (at[mid]! <= d) lo = mid;
    else hi = mid;
  }
  const span = at[hi]! - at[lo]!;
  const f = span > 0 ? (d - at[lo]!) / span : 0;
  const a = points[lo]!;
  const b = points[hi]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** The direction of travel at `progress`, in radians (0 points right). */
export function headingAt(path: MapPath, progress: number): number {
  const a = pointAt(path, Math.max(0, progress - 0.01));
  const b = pointAt(path, Math.min(1, progress + 0.01));
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

/** Shortest distance from a point to a path. */
export function distanceToPath(p: Point, path: MapPath): number {
  let best = Infinity;
  const pts = path.points;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]!;
    const [bx, by] = pts[i]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2)) : 0;
    const ex = ax + dx * t - p[0];
    const ey = ay + dy * t - p[1];
    best = Math.min(best, Math.sqrt(ex * ex + ey * ey));
  }
  return best;
}

/**
 * How much path a tower at `p` with this reach can see, in map units, summed
 * over every path (on Twin Gates the shared half counts twice, as all the
 * gloom walks it). Measured every unit along the path.
 */
export function pathInReach(map: GuardMap, p: Point, range: number): number {
  let total = 0;
  for (const path of map.paths) {
    const steps = Math.ceil(path.length);
    for (let i = 0; i <= steps; i++) {
      const q = pointAt(path, i / steps);
      if ((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 <= range * range) total += path.length / steps;
    }
  }
  return Math.round(total);
}

/** Where along the paths a spot sits, 0 to 1: the progress of the nearest path point (for sorting spots from entrance to lantern). */
export function spotProgress(map: GuardMap, p: Point): number {
  let best = Infinity;
  let progress = 0;
  for (const path of map.paths) {
    const steps = Math.ceil(path.length);
    for (let i = 0; i <= steps; i++) {
      const q = pointAt(path, i / steps);
      const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
      if (d < best) {
        best = d;
        progress = i / steps;
      }
    }
  }
  return progress;
}

/* ------------------------------------ maps ----------------------------------- */

const RIVER_PATH = smooth([
  [-8, 22],
  [14, 22],
  [36, 22],
  [56, 30],
  [70, 46],
  [86, 62],
  [106, 70],
  [126, 64],
  [138, 54],
  [146, 50],
]);

const SPIRAL_PATH = smooth(
  [
    [-8, 12],
    [20, 12],
    [118, 12],
    [138, 14],
    [146, 26],
    [146, 62],
    [138, 76],
    [118, 79],
    [40, 79],
    [20, 76],
    [14, 64],
    [14, 50],
    [22, 39],
    [40, 37],
    [94, 37],
    [106, 42],
    [112, 54],
  ],
  8,
);

/** Twin Gates: two branches from two gates on the left, meeting at M and sharing the road to the lantern. */
const TWIN_M: Point = [78, 46];
const TWIN_SHARED: Point[] = [TWIN_M, [96, 46], [114, 40], [132, 43], [146, 48]];
const TWIN_SHARED_PATH = smooth(TWIN_SHARED);
const twinBranch = (pts: Point[]) => [...smooth([...pts, TWIN_M], 10, undefined, TWIN_SHARED[1]).slice(0, -1), ...TWIN_SHARED_PATH];
const TWIN_TOP = twinBranch([
  [-8, 14],
  [16, 14],
  [38, 18],
  [56, 30],
  [68, 42],
]);
const TWIN_BOTTOM = twinBranch([
  [-8, 78],
  [16, 78],
  [38, 72],
  [56, 60],
  [68, 50],
]);

const SPIRAL_TOUGHNESS = 0.95;

export const MAPS: Record<MapId, GuardMap> = {
  river: {
    id: 'river',
    name: 'River Road',
    blurb: 'One road with a gentle bend.',
    paths: [toPath(RIVER_PATH)],
    lantern: [146, 50],
    toughness: 1,
    spots: [
      [12, 13], [9, 31], [21, 31], [24, 12], [37, 13], [35, 31], [49, 11], [57, 20],
      [48, 36], [69, 23], [73, 35], [57, 45], [66, 55], [81, 44], [72, 66], [91, 54],
      [83, 71], [102, 60], [94, 77], [106, 79], [115, 59], [124, 75], [135, 69], [125, 52],
      [134, 44], [146, 63],
    ],
  },
  spiral: {
    id: 'spiral',
    name: 'Spiral Hill',
    blurb: 'A long road that winds in towards the lantern.',
    paths: [toPath(SPIRAL_PATH)],
    lantern: [112, 54],
    toughness: SPIRAL_TOUGHNESS,
    spots: [
      [76, 24], [112, 25], [133, 24], [137, 36], [137, 54], [135, 67], [117, 70], [105, 69],
      [92, 70], [70, 70], [58, 70], [46, 70], [34, 69], [29, 58], [16, 27], [28, 27],
      [40, 27], [34, 47], [52, 26], [46, 46], [64, 26], [58, 46], [88, 27], [80, 46],
      [100, 27], [92, 46], [97, 59], [126, 59],
    ],
  },
  twin: {
    id: 'twin',
    name: 'Twin Gates',
    blurb: 'Two gates, two roads that meet halfway.',
    paths: [toPath(TWIN_TOP), toPath(TWIN_BOTTOM)],
    lantern: [146, 48],
    toughness: 1,
    spots: [
      [12, 23], [27, 6], [15, 69], [24, 24], [40, 9], [28, 66], [36, 27], [40, 81],
      [54, 17], [39, 61], [54, 73], [49, 36], [46, 48], [66, 27], [67, 63], [58, 45],
      [75, 35], [77, 56], [87, 37], [90, 56], [100, 35], [105, 53], [113, 31], [117, 49],
      [130, 33], [129, 52], [142, 35], [139, 59],
    ],
  },
};

export const MAP_IDS: readonly MapId[] = ['river', 'spiral', 'twin'];
