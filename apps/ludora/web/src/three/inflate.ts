import { BufferGeometry, Float32BufferAttribute } from 'three';

/*
 * Turns a flat silhouette into a soft 3D body, like a vinyl toy blown up from
 * a drawing. The picture's opaque area is traced on a grid; its edge (found by
 * marching squares, between grid points) becomes the rim, and every point
 * inside is pushed out front and back by how far it is from the edge, on a
 * round profile. Seen straight on, the body is exactly the 2D drawing; from
 * the side it is a plush, rounded shape. The drawing is mapped onto the front,
 * and a faceless version onto the back.
 *
 * Units in: the Glim's 120 x 120 drawing box (y down). Units out: metres,
 * with the feet at the origin and the front facing +z.
 */

export interface Inflated {
  geometry: BufferGeometry;
  /** Deepest point of the front, in metres (for placing arms on the surface). */
  depth: number;
  /** How far the surface sits in front of the middle at a drawing-box point, in metres. */
  surfaceAt(x: number, y: number): number;
}

export interface InflateOptions {
  /** Grid cells across the drawing box. */
  grid: number;
  /** The point of the drawing that sits on the ground, in box units. */
  ground: { x: number; y: number };
  /** Front and back depth as a share of the widest half-width. */
  front?: number;
  back?: number;
}

const BOX = 120;
const M = 1 / 100;

export function inflate(alpha: Uint8ClampedArray | Uint8Array, size: number, opts: InflateOptions): Inflated {
  const n = opts.grid;
  const step = BOX / n;
  const W = n + 1;
  // Alpha at each grid point, sampled from the picture.
  const a = new Float32Array(W * W);
  const px = size / BOX;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const sx = Math.min(size - 1, Math.max(0, Math.round(i * step * px)));
      const sy = Math.min(size - 1, Math.max(0, Math.round(j * step * px)));
      a[j * W + i] = (alpha[(sy * size + sx) * 4 + 3] ?? 0) / 255;
    }
  }
  const inside = (i: number, j: number) => i >= 0 && j >= 0 && i <= n && j <= n && a[j * W + i]! >= 0.5;

  // Rim points: where the edge crosses between two grid points, keyed by that pair.
  const rimKey = (i0: number, j0: number, i1: number, j1: number) => (i0 < i1 || (i0 === i1 && j0 < j1) ? `${i0},${j0},${i1},${j1}` : `${i1},${j1},${i0},${j0}`);
  const rim = new Map<string, { x: number; y: number }>();
  const crossing = (i0: number, j0: number, i1: number, j1: number) => {
    const k = rimKey(i0, j0, i1, j1);
    let p = rim.get(k);
    if (!p) {
      const v0 = a[j0 * W + i0]!;
      const v1 = a[j1 * W + i1]!;
      const t = Math.min(1, Math.max(0, (0.5 - v0) / (v1 - v0 || 1e-6)));
      p = { x: (i0 + (i1 - i0) * t) * step, y: (j0 + (j1 - j0) * t) * step };
      rim.set(k, p);
    }
    return k;
  };

  // Walk every cell's edges in order, keeping inside corners and edge crossings: one convex polygon per cell.
  const polys: string[][] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const corners: [number, number][] = [
        [i, j],
        [i + 1, j],
        [i + 1, j + 1],
        [i, j + 1],
      ];
      const ins = corners.map(([ci, cj]) => inside(ci, cj));
      if (!ins.some(Boolean)) continue;
      const poly: string[] = [];
      for (let e = 0; e < 4; e++) {
        const [ci, cj] = corners[e]!;
        const [ni, nj] = corners[(e + 1) % 4]!;
        if (ins[e]) poly.push(`g${ci},${cj}`);
        if (ins[e] !== ins[(e + 1) % 4]) poly.push(crossing(ci, cj, ni, nj));
      }
      if (poly.length >= 3) polys.push(poly);
    }
  }

  // Distance from each inside grid point to the rim, in box units.
  const rimPts = [...rim.values()];
  const dist = new Float32Array(W * W);
  let maxD = 0;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      if (!inside(i, j)) continue;
      const x = i * step;
      const y = j * step;
      let best = Infinity;
      for (const p of rimPts) {
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < best) best = d;
      }
      const d = Math.sqrt(best);
      dist[j * W + i] = d;
      if (d > maxD) maxD = d;
    }
  }
  maxD = Math.max(maxD, step);
  const frontK = opts.front ?? 0.62;
  const backK = opts.back ?? 0.48;
  // A round profile: steep at the rim, flat in the middle.
  const profile = (d: number) => {
    const u = Math.min(1, d / maxD);
    return Math.sqrt(u * (2 - u)) * maxD;
  };
  const h = new Float32Array(W * W);
  for (let k = 0; k < h.length; k++) h[k] = dist[k]! > 0 ? profile(dist[k]!) : 0;
  // Two passes of smoothing so the grid does not show as terraces.
  for (let pass = 0; pass < 2; pass++) {
    const copy = h.slice();
    for (let j = 1; j < n; j++) {
      for (let i = 1; i < n; i++) {
        const k = j * W + i;
        if (!inside(i, j)) continue;
        let sum = copy[k]! * 2;
        let wsum = 2;
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const kk = (j + dj) * W + (i + di);
          sum += inside(i + di, j + dj) ? copy[kk]! : 0;
          wsum += 1;
        }
        h[k] = sum / wsum;
      }
    }
  }

  // Vertices: rim points once (shared by front and back), inside grid points twice.
  const pos: number[] = [];
  const uv: number[] = [];
  const index = new Map<string, number>();
  const gx = opts.ground.x;
  const gy = opts.ground.y;
  const add = (x: number, y: number, z: number) => {
    pos.push((x - gx) * M, (gy - y) * M, z * M);
    uv.push(x / BOX, 1 - y / BOX);
    return pos.length / 3 - 1;
  };
  for (const [k, p] of rim) index.set(k, add(p.x, p.y, 0));
  const vert = (key: string, side: 1 | -1) => {
    if (!key.startsWith('g')) return index.get(key)!;
    const full = `${key}|${side}`;
    let v = index.get(full);
    if (v === undefined) {
      const [i, j] = key.slice(1).split(',').map(Number) as [number, number];
      const hh = h[j * W + i]!;
      v = add(i * step, j * step, side > 0 ? hh * frontK : -hh * backK);
      index.set(full, v);
    }
    return v;
  };
  const front: number[] = [];
  const back: number[] = [];
  for (const poly of polys) {
    const f = poly.map((k) => vert(k, 1));
    const b = poly.map((k) => vert(k, -1));
    for (let t = 1; t < poly.length - 1; t++) {
      // The walk runs clockwise on screen, which is clockwise seen from the front once y points up.
      front.push(f[0]!, f[t + 1]!, f[t]!);
      back.push(b[0]!, b[t]!, b[t + 1]!);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex([...front, ...back]);
  geometry.addGroup(0, front.length, 0);
  geometry.addGroup(front.length, back.length, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  const surfaceAt = (x: number, y: number) => {
    const i = Math.round(x / step);
    const j = Math.round(y / step);
    if (!inside(i, j)) return 0;
    return h[j * W + i]! * frontK * M;
  };
  return { geometry, depth: maxD * frontK * M, surfaceAt };
}
