/*
 * Small path helpers for drawing Glims. Everything works in the 120 x 120
 * viewBox the Glim component uses.
 */

export type Pt = readonly [number, number] | readonly [number, number, number];

const f = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
};

/**
 * A smooth closed outline through the points (Catmull-Rom turned into cubic
 * Beziers). A third number on a point scales its tangent: 0 makes a corner,
 * values below 1 tighten the curve there.
 */
export function smooth(points: readonly Pt[], tension = 1): string {
  const n = points.length;
  const P = (i: number) => points[((i % n) + n) % n]!;
  let d = `M${f(P(0)[0])} ${f(P(0)[1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const k1 = ((p1[2] ?? 1) * tension) / 6;
    const k2 = ((p2[2] ?? 1) * tension) / 6;
    const c1x = p1[0] + (p2[0] - p0[0]) * k1;
    const c1y = p1[1] + (p2[1] - p0[1]) * k1;
    const c2x = p2[0] - (p3[0] - p1[0]) * k2;
    const c2y = p2[1] - (p3[1] - p1[1]) * k2;
    d += `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
}

/** Mirror the right half of an outline (top centre, clockwise, to bottom centre) into a full symmetric loop. */
export function mirrored(right: readonly Pt[], axis = 60): Pt[] {
  const left: Pt[] = [];
  for (let i = right.length - 2; i >= 1; i--) {
    const p = right[i]!;
    left.push(p.length === 3 ? [2 * axis - p[0], p[1], p[2]] : [2 * axis - p[0], p[1]]);
  }
  return [...right, ...left];
}

/** A polygon with rounded corners. */
export function roundPoly(points: readonly (readonly [number, number])[], radius: number): string {
  const n = points.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]!;
    const cur = points[i]!;
    const next = points[(i + 1) % n]!;
    const v1 = [prev[0] - cur[0], prev[1] - cur[1]];
    const v2 = [next[0] - cur[0], next[1] - cur[1]];
    const l1 = Math.hypot(v1[0]!, v1[1]!);
    const l2 = Math.hypot(v2[0]!, v2[1]!);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    const a = [cur[0] + (v1[0]! / l1) * r, cur[1] + (v1[1]! / l1) * r];
    const b = [cur[0] + (v2[0]! / l2) * r, cur[1] + (v2[1]! / l2) * r];
    d += `${i === 0 ? 'M' : 'L'}${f(a[0]!)} ${f(a[1]!)}Q${f(cur[0])} ${f(cur[1])} ${f(b[0]!)} ${f(b[1]!)}`;
  }
  return `${d}Z`;
}

/** A star with rounded points. */
export function softStar(cx: number, cy: number, outer: number, inner: number, points = 5, rot = 0): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2 + rot;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const next = pts[(i + 1) % pts.length]!;
    const m = mid(p, next);
    if (i === 0) {
      const m0 = mid(pts[pts.length - 1]!, p);
      d += `M${f(m0[0])} ${f(m0[1])}`;
    }
    d += `Q${f(p[0])} ${f(p[1])} ${f(m[0])} ${f(m[1])}`;
  }
  return `${d}Z`;
}

/** A four-pointed sparkle centred on (cx, cy). */
export function sparkle(cx: number, cy: number, r: number, waist = 0.22): string {
  const w = r * waist;
  return `M${f(cx)} ${f(cy - r)}Q${f(cx + w)} ${f(cy - w)} ${f(cx + r)} ${f(cy)}Q${f(cx + w)} ${f(cy + w)} ${f(cx)} ${f(cy + r)}Q${f(cx - w)} ${f(cy + w)} ${f(cx - r)} ${f(cy)}Q${f(cx - w)} ${f(cy - w)} ${f(cx)} ${f(cy - r)}Z`;
}

/** A circle as a path, so it can join the contour pass like any other shape. */
export function circle(cx: number, cy: number, r: number): string {
  return `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z`;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
}

/** Where a part sits: translate to (x, y), rotate by r degrees, scale by s, and optionally mirror left-right first. */
export interface Place {
  x: number;
  y: number;
  r?: number;
  s?: number;
  m?: boolean;
}

/**
 * Move a path drawn in its own local coordinates into place. Supports the
 * commands M L H V C S Q T A Z, absolute and relative.
 */
export function place(d: string, t: Place): string {
  const s = t.s ?? 1;
  const rad = ((t.r ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const mx = t.m ? -1 : 1;
  const vec = (x: number, y: number): [number, number] => {
    const px = x * mx * s;
    const py = y * s;
    return [px * cos - py * sin, px * sin + py * cos];
  };
  const pt = (x: number, y: number): [number, number] => {
    const [vx, vy] = vec(x, y);
    return [vx + t.x, vy + t.y];
  };
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  let out = '';
  // Current point in local coordinates, for relative commands and H/V.
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const tok = tokens[i]!;
    if (/[a-zA-Z]/.test(tok)) {
      cmd = tok;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        out += 'Z';
        cx = sx;
        cy = sy;
        continue;
      }
    }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (C) {
      case 'M':
      case 'L':
      case 'T': {
        const x = num() + ox;
        const y = num() + oy;
        const [a, b] = pt(x, y);
        out += `${C === 'T' ? 'T' : C}${f(a)} ${f(b)}`;
        if (C === 'M') {
          sx = x;
          sy = y;
          cmd = rel ? 'l' : 'L';
        }
        cx = x;
        cy = y;
        break;
      }
      case 'H': {
        const x = num() + (rel ? cx : 0);
        const [a, b] = pt(x, cy);
        out += `L${f(a)} ${f(b)}`;
        cx = x;
        break;
      }
      case 'V': {
        const y = num() + (rel ? cy : 0);
        const [a, b] = pt(cx, y);
        out += `L${f(a)} ${f(b)}`;
        cy = y;
        break;
      }
      case 'C': {
        const x1 = num() + ox;
        const y1 = num() + oy;
        const x2 = num() + ox;
        const y2 = num() + oy;
        const x = num() + ox;
        const y = num() + oy;
        const p1 = pt(x1, y1);
        const p2 = pt(x2, y2);
        const p = pt(x, y);
        out += `C${f(p1[0])} ${f(p1[1])} ${f(p2[0])} ${f(p2[1])} ${f(p[0])} ${f(p[1])}`;
        cx = x;
        cy = y;
        break;
      }
      case 'S':
      case 'Q': {
        const x1 = num() + ox;
        const y1 = num() + oy;
        const x = num() + ox;
        const y = num() + oy;
        const p1 = pt(x1, y1);
        const p = pt(x, y);
        out += `${C}${f(p1[0])} ${f(p1[1])} ${f(p[0])} ${f(p[1])}`;
        cx = x;
        cy = y;
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = num();
        let sweep = num();
        const x = num() + ox;
        const y = num() + oy;
        const p = pt(x, y);
        const phi = (t.m ? -rot : rot) + (t.r ?? 0);
        if (t.m) sweep = sweep ? 0 : 1;
        out += `A${f(rx * s)} ${f(ry * s)} ${f(phi)} ${large} ${sweep} ${f(p[0])} ${f(p[1])}`;
        cx = x;
        cy = y;
        break;
      }
      default:
        i++;
    }
  }
  return out;
}

/** Both sides of a symmetric pair: the right part at `t`, and its mirror image across x = axis. */
export function pair(d: string, t: Place, axis = 60): [string, string] {
  return [place(d, t), place(d, { ...t, x: 2 * axis - t.x, r: -(t.r ?? 0), m: !t.m })];
}

export const fmt = f;

/** Points along an SVG elliptical arc (endpoint form, as in the SVG spec's implementation notes). */
function arcPoints(x1: number, y1: number, rx0: number, ry0: number, phiDeg: number, large: number, sweep: number, x2: number, y2: number): [number, number][] {
  if (rx0 === 0 || ry0 === 0) return [[x2, y2]];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy;
  const yp = -sin * dx + cos * dy;
  let rx = Math.abs(rx0);
  let ry = Math.abs(ry0);
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * yp) / ry;
  const cyp = (-coef * ry * xp) / rx;
  const ccx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const ccy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= Math.PI * 2;
  if (sweep && dt < 0) dt += Math.PI * 2;
  const out: [number, number][] = [];
  for (let k = 0; k <= 16; k++) {
    const t = t1 + (dt * k) / 16;
    out.push([ccx + rx * cos * Math.cos(t) - ry * sin * Math.sin(t), ccy + rx * sin * Math.cos(t) + ry * cos * Math.sin(t)]);
  }
  return out;
}

/**
 * A slightly generous bounding box of a path (control points count). Good
 * enough to keep parts inside the viewBox.
 */
export function pathBounds(d: string): [number, number, number, number] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x: number, y: number, pad = 0) => {
    x0 = Math.min(x0, x - pad);
    y0 = Math.min(y0, y - pad);
    x1 = Math.max(x1, x + pad);
    y1 = Math.max(y1, y + pad);
  };
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const tok = tokens[i]!;
    if (/[a-zA-Z]/.test(tok)) {
      cmd = tok;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        cx = sx;
        cy = sy;
        continue;
      }
    }
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L':
      case 'T': {
        const x = num() + ox;
        const y = num() + oy;
        add(x, y);
        if (cmd.toUpperCase() === 'M') {
          sx = x;
          sy = y;
          cmd = rel ? 'l' : 'L';
        }
        cx = x;
        cy = y;
        break;
      }
      case 'H':
        cx = num() + (rel ? cx : 0);
        add(cx, cy);
        break;
      case 'V':
        cy = num() + (rel ? cy : 0);
        add(cx, cy);
        break;
      case 'C':
        for (let k = 0; k < 3; k++) {
          const x = num() + ox;
          const y = num() + oy;
          add(x, y);
          if (k === 2) {
            cx = x;
            cy = y;
          }
        }
        break;
      case 'S':
      case 'Q':
        for (let k = 0; k < 2; k++) {
          const x = num() + ox;
          const y = num() + oy;
          add(x, y);
          if (k === 1) {
            cx = x;
            cy = y;
          }
        }
        break;
      case 'A': {
        const rx = num();
        const ry = num();
        const phi = num();
        const large = num();
        const sweep = num();
        const x = num() + ox;
        const y = num() + oy;
        for (const [px, py] of arcPoints(cx, cy, rx, ry, phi, large, sweep, x, y)) add(px, py);
        cx = x;
        cy = y;
        break;
      }
      default:
        i++;
    }
  }
  return [x0, y0, x1, y1];
}
