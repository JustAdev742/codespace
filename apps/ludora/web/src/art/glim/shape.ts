import type { GlimArt } from '@ludora/shared';
import type { BodyGeometry, GlimColors, Part } from './bodies.ts';
import { fmt as f } from './geometry.ts';

/*
 * Shape sliders: a body made wider, narrower, taller or shorter. The outline and the shapes drawn
 * with the body (its own wings, cap, marks) are stretched; the anchors move with them, so ears,
 * toppers, arms, feet, the face and anything worn are placed on the new shape without being
 * distorted themselves. Stretching is about the centre line and the bottom of the body, so a Glim
 * keeps its feet on the ground.
 */

/** Stretch a path by (sx, sy) about (ox, oy). Absolute and relative M L H V C S Q T A Z. Arcs scale their radii (exact for unrotated arcs, which every body uses). */
export function stretchPath(d: string, sx: number, sy: number, ox: number, oy: number): string {
  const X = (x: number) => ox + (x - ox) * sx;
  const Y = (y: number) => oy + (y - oy) * sy;
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  let out = '';
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const tok = tokens[i]!;
    if (/[a-zA-Z]/.test(tok)) {
      cmd = tok;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        out += 'Z';
        cx = startX;
        cy = startY;
        continue;
      }
    }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox0 = rel ? cx : 0;
    const oy0 = rel ? cy : 0;
    switch (C) {
      case 'M':
      case 'L':
      case 'T': {
        const x = num() + ox0;
        const y = num() + oy0;
        out += `${C}${f(X(x))} ${f(Y(y))}`;
        if (C === 'M') {
          startX = x;
          startY = y;
          cmd = rel ? 'l' : 'L';
        }
        cx = x;
        cy = y;
        break;
      }
      case 'H': {
        const x = num() + (rel ? cx : 0);
        out += `L${f(X(x))} ${f(Y(cy))}`;
        cx = x;
        break;
      }
      case 'V': {
        const y = num() + (rel ? cy : 0);
        out += `L${f(X(cx))} ${f(Y(y))}`;
        cy = y;
        break;
      }
      case 'C': {
        const p = [num() + ox0, num() + oy0, num() + ox0, num() + oy0, num() + ox0, num() + oy0];
        out += `C${f(X(p[0]!))} ${f(Y(p[1]!))} ${f(X(p[2]!))} ${f(Y(p[3]!))} ${f(X(p[4]!))} ${f(Y(p[5]!))}`;
        cx = p[4]!;
        cy = p[5]!;
        break;
      }
      case 'S':
      case 'Q': {
        const p = [num() + ox0, num() + oy0, num() + ox0, num() + oy0];
        out += `${C}${f(X(p[0]!))} ${f(Y(p[1]!))} ${f(X(p[2]!))} ${f(Y(p[3]!))}`;
        cx = p[2]!;
        cy = p[3]!;
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = num();
        const sweep = num();
        const x = num() + ox0;
        const y = num() + oy0;
        out += `A${f(rx * sx)} ${f(ry * sy)} ${f(rot)} ${large} ${sweep} ${f(X(x))} ${f(Y(y))}`;
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

const cache = new WeakMap<BodyGeometry, Map<string, BodyGeometry>>();

/** The body geometry with the art's width and height sliders applied (the same object when both are 100). */
export function shapedGeometry(geo: BodyGeometry, art: Pick<GlimArt, 'width' | 'height'>): BodyGeometry {
  const sx = (art.width ?? 100) / 100;
  const sy = (art.height ?? 100) / 100;
  if (sx === 1 && sy === 1) return geo;
  const key = `${sx}|${sy}`;
  let byKey = cache.get(geo);
  if (!byKey) cache.set(geo, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const ox = 60;
  const oy = geo.box[3];
  const X = (x: number) => ox + (x - ox) * sx;
  const Y = (y: number) => oy + (y - oy) * sy;
  const P = (d: string) => stretchPath(d, sx, sy, ox, oy);
  const parts = (fn?: (c: GlimColors) => Part[]) => (fn ? (c: GlimColors) => fn(c).map((p) => ({ ...p, d: P(p.d) })) : undefined);
  const pt = <T extends { x: number; y: number }>(p: T): T => ({ ...p, x: X(p.x), y: Y(p.y) });
  const out: BodyGeometry = {
    ...geo,
    path: P(geo.path),
    face: pt(geo.face),
    top: pt(geo.top),
    headW: geo.headW * sx,
    neck: Y(geo.neck),
    eyeGap: geo.eyeGap * Math.min(1.12, Math.max(0.9, sx)),
    ear: pt(geo.ear),
    arm: geo.arm ? pt(geo.arm) : null,
    foot: geo.foot ? { x: X(geo.foot.x), y: geo.foot.y } : null,
    tail: pt(geo.tail),
    wing: pt(geo.wing),
    hl: [X(geo.hl[0]), Y(geo.hl[1]), geo.hl[2] * sx, geo.hl[3] * sy, geo.hl[4]],
    box: [X(geo.box[0]), Y(geo.box[1]), X(geo.box[2]), geo.box[3]],
    ...(geo.armUp ? { armUp: pt(geo.armUp) } : {}),
    ...(geo.sideW !== undefined ? { sideW: geo.sideW * sx } : {}),
  };
  const back = parts(geo.back);
  const front = parts(geo.front);
  const marks = parts(geo.marks);
  if (back) out.back = back;
  if (front) out.front = front;
  if (marks) out.marks = marks;
  byKey.set(key, out);
  return out;
}
