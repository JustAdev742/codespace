/*
 * Lantern Rally's circuits: their shapes and the maths that turns a distance
 * round the lap into a point on the ground. Plain numbers only, no game
 * logic and no three.js, so the mode (for lap lengths), the 3D scenes and the
 * drawn 2D map all read the same circuit.
 *
 * A circuit is a closed loop through a handful of points (metres on the
 * ground, x east and z south), smoothed into a curve. Distance along the
 * centre line is what the mode counts; lanes sit either side of it.
 */

export type CircuitId = 'harbour' | 'forest' | 'rooftops';

export interface Circuit {
  id: CircuitId;
  name: string;
  /** A few plain words about the place, for the catalogue and the screens. */
  blurb: string;
  /** The loop's points, in metres. Driven in this order. */
  points: readonly (readonly [number, number])[];
}

export const CIRCUITS: Record<CircuitId, Circuit> = {
  harbour: {
    id: 'harbour',
    name: 'Harbour Lights',
    blurb: 'Along the quay, round the lighthouse pier and back past the boat sheds.',
    points: [
      [0, -60],
      [70, -62],
      [128, -52],
      [156, -14],
      [138, 22],
      [96, 18],
      [70, 40],
      [38, 60],
      [-20, 60],
      [-80, 55],
      [-128, 30],
      [-140, -14],
      [-110, -50],
      [-55, -62],
    ],
  },
  forest: {
    id: 'forest',
    name: 'Lantern Wood',
    blurb: 'Winding bends between tall pines, with lanterns hung from the branches.',
    points: [
      [0, -82],
      [58, -72],
      [84, -34],
      [58, -2],
      [80, 38],
      [50, 78],
      [2, 70],
      [-28, 38],
      [-68, 58],
      [-102, 22],
      [-80, -18],
      [-100, -58],
      [-52, -86],
    ],
  },
  rooftops: {
    id: 'rooftops',
    name: 'Rooftop Run',
    blurb: 'Square corners and quick chicanes across the flat roofs of the city.',
    points: [
      [-96, -70],
      [-8, -74],
      [6, -54],
      [30, -54],
      [42, -74],
      [98, -70],
      [104, 0],
      [98, 70],
      [34, 72],
      [22, 50],
      [-2, 50],
      [-12, 72],
      [-98, 70],
      [-104, 0],
    ],
  },
};

export const CIRCUIT_IDS = Object.keys(CIRCUITS) as CircuitId[];

/** Lanes: 0 is the left lane in the direction of travel, 2 the right. */
export const LANES = 3;
/** Metres between the centres of two lanes. */
export const LANE_WIDTH = 3.2;

export interface TrackPath {
  id: CircuitId;
  /** Metres round one lap of the centre line. */
  length: number;
  /** Points along the centre line, evenly spaced in distance, closing the loop. */
  xs: Float64Array;
  zs: Float64Array;
  /** Metres between samples. */
  step: number;
}

const SAMPLES = 720;
/** The circuits' points are drawn at this scale: a lap of about 520 to 600 metres. */
const SCALE = 0.8;

/** A point on a closed centripetal Catmull-Rom curve through the circuit's points. */
function curvePoint(pts: readonly (readonly [number, number])[], u: number): [number, number] {
  const n = pts.length;
  const f = (((u % 1) + 1) % 1) * n;
  const i = Math.floor(f);
  const t = f - i;
  const p0 = pts[(i - 1 + n) % n]!;
  const p1 = pts[i % n]!;
  const p2 = pts[(i + 1) % n]!;
  const p3 = pts[(i + 2) % n]!;
  // Centripetal parameterisation keeps tight corners from looping.
  const d = (a: readonly [number, number], b: readonly [number, number]) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const t0 = 0;
  const t1 = t0 + d(p0, p1);
  const t2 = t1 + d(p1, p2);
  const t3 = t2 + d(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const lerp = (a: readonly [number, number], b: readonly [number, number], ta: number, tb: number): [number, number] => {
    const k = (tt - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

const cache = new Map<CircuitId, TrackPath>();

/** The circuit's centre line, sampled evenly by distance. Worked out once per circuit. */
export function trackPath(id: CircuitId): TrackPath {
  const hit = cache.get(id);
  if (hit) return hit;
  const pts = CIRCUITS[id].points.map(([x, z]) => [x * SCALE, z * SCALE] as const);
  // Sample finely by parameter, then resample evenly by distance.
  const fine = 4000;
  const fx: number[] = [];
  const fz: number[] = [];
  const acc: number[] = [0];
  for (let i = 0; i <= fine; i++) {
    const [x, z] = curvePoint(pts, i / fine);
    fx.push(x);
    fz.push(z);
    if (i > 0) acc.push(acc[i - 1]! + Math.hypot(x - fx[i - 1]!, z - fz[i - 1]!));
  }
  const length = Math.round(acc[fine]!);
  const step = acc[fine]! / SAMPLES;
  const xs = new Float64Array(SAMPLES + 1);
  const zs = new Float64Array(SAMPLES + 1);
  let j = 0;
  for (let k = 0; k <= SAMPLES; k++) {
    const want = k * step;
    while (j < fine - 1 && acc[j + 1]! < want) j++;
    const span = Math.max(1e-9, acc[j + 1]! - acc[j]!);
    const t = Math.min(1, Math.max(0, (want - acc[j]!) / span));
    xs[k] = fx[j]! + (fx[j + 1]! - fx[j]!) * t;
    zs[k] = fz[j]! + (fz[j + 1]! - fz[j]!) * t;
  }
  const path: TrackPath = { id, length, xs, zs, step };
  cache.set(id, path);
  return path;
}

/** Metres round one lap of a circuit. */
export function lapLength(id: CircuitId): number {
  return trackPath(id).length;
}

/** Where on the lap a distance falls (0 to the lap length), for any number of laps or a place on the grid. */
export function lapPos(d: number, length: number): number {
  return ((d % length) + length) % length;
}

export interface TrackPoint {
  x: number;
  z: number;
  /** The way the track runs here, in radians (0 = +z, as the 3D engine faces). */
  heading: number;
}

/**
 * A point on the track: `d` metres round (any lap), `offset` metres to the right of the centre
 * line (lanes are at -LANE_WIDTH, 0 and +LANE_WIDTH).
 */
export function pointAt(path: TrackPath, d: number, offset = 0): TrackPoint {
  const s = lapPos(d, path.length) * (path.xs.length - 1) / path.length;
  const i = Math.min(path.xs.length - 2, Math.floor(s));
  const t = s - i;
  const x = path.xs[i]! + (path.xs[i + 1]! - path.xs[i]!) * t;
  const z = path.zs[i]! + (path.zs[i + 1]! - path.zs[i]!) * t;
  // Direction from a little behind to a little ahead, so the heading turns smoothly.
  const a = Math.max(0, i - 1);
  const b = Math.min(path.xs.length - 1, i + 2);
  const dx = path.xs[b]! - path.xs[a]!;
  const dz = path.zs[b]! - path.zs[a]!;
  const len = Math.hypot(dx, dz) || 1;
  // Right of the direction of travel, looking down with x east and z south: (-dz, dx).
  const rx = -dz / len;
  const rz = dx / len;
  return { x: x + rx * offset, z: z + rz * offset, heading: Math.atan2(dx, dz) };
}

/** A lane's offset from the centre line, in metres (lane 0 left, 2 right). */
export function laneOffset(lane: number): number {
  return (lane - (LANES - 1) / 2) * LANE_WIDTH;
}

/** The circuit's bounding box, for fitting a map or a camera. */
export function trackBounds(path: TrackPath): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < path.xs.length; i++) {
    minX = Math.min(minX, path.xs[i]!);
    maxX = Math.max(maxX, path.xs[i]!);
    minZ = Math.min(minZ, path.zs[i]!);
    maxZ = Math.max(maxZ, path.zs[i]!);
  }
  return { minX, maxX, minZ, maxZ };
}
