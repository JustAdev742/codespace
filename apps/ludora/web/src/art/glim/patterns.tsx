import type { ReactNode } from 'react';
import type { GlimArt } from '@ludora/shared';
import type { BodyGeometry, GlimColors } from './bodies.ts';
import { circle, fmt as f, sparkle } from './geometry.ts';

/*
 * Body patterns, drawn inside the body outline (the caller clips them).
 * Positions come from the body's bounding box and keep clear of the face.
 */

/** Patterns too fine to read on a tiny avatar. */
export const FINE_PATTERNS: ReadonlySet<GlimArt['pattern']> = new Set(['freckles', 'bubbles', 'sprinkles', 'constellation', 'circuit']);

/** A cap over the top of the box with a wavy, dripping lower edge (icing, ink, snow). */
function dripCap([x0, y0, x1, y1]: readonly [number, number, number, number], depth: number, drips: readonly number[]): string {
  const w = x1 - x0;
  const edge = y0 + (y1 - y0) * depth;
  const step = w / drips.length;
  let d = `M${f(x0 - 6)} ${f(y0 - 6)}H${f(x1 + 6)}V${f(edge)}`;
  for (let i = drips.length - 1; i >= 0; i--) {
    const xa = x0 + step * (i + 1);
    const xb = x0 + step * i;
    const deep = edge + drips[i]! * 9;
    d += `C${f(xa - step * 0.1)} ${f(edge + 2)} ${f(xa - step * 0.18)} ${f(deep)} ${f(xa - step * 0.5)} ${f(deep)}C${f(xb + step * 0.18)} ${f(deep)} ${f(xb + step * 0.1)} ${f(edge + 2)} ${f(xb)} ${f(edge)}`;
  }
  return `${d}H${f(x0 - 6)}Z`;
}

export function Pattern({ kind, geo, c }: { kind: GlimArt['pattern']; geo: BodyGeometry; c: GlimColors }): ReactNode {
  const [x0, y0, x1, y1] = geo.box;
  const w = x1 - x0;
  const h = y1 - y0;
  const { x: fx, y: fy } = geo.face;
  const g = geo.eyeGap;
  // A point in the box, from fractions of its width and height.
  const at = (u: number, v: number): [number, number] => [x0 + u * w, y0 + v * h];
  const below = Math.max(fy + 22, y0 + h * 0.8);
  switch (kind) {
    case 'spots': {
      const spots: [number, number, number][] = [
        [0.08, 0.36, 0.09],
        [0.93, 0.52, 0.1],
        [0.2, 0.86, 0.075],
        [0.78, 0.17, 0.065],
        [0.66, 0.94, 0.07],
        [0.33, 0.1, 0.05],
      ];
      return <path d={spots.map(([u, v, r]) => circle(...at(u, v), r * w)).join('')} fill={c.accent} />;
    }
    case 'stripes': {
      const sw = Math.max(5, w * 0.075);
      const top = y0 + h * 0.15;
      return (
        <path
          d={`M${f(x0 - 4)} ${f(top + 4)}Q${f(fx)} ${f(top - 6)} ${f(x1 + 4)} ${f(top + 4)}M${f(x0 - 4)} ${f(below)}Q${f(fx)} ${f(below - 8)} ${f(x1 + 4)} ${f(below)}M${f(x0 - 4)} ${f(below + sw * 1.9)}Q${f(fx)} ${f(below + sw * 1.9 - 8)} ${f(x1 + 4)} ${f(below + sw * 1.9)}`}
          fill="none"
          stroke={c.accent}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      );
    }
    case 'bands': {
      const sw = Math.max(5.5, w * 0.085);
      const top = y0 + h * 0.13;
      return (
        <path
          d={`M${f(x0 - 4)} ${f(top + 4)}Q${f(fx)} ${f(top - 6)} ${f(x1 + 4)} ${f(top + 4)}M${f(x0 - 4)} ${f(below)}Q${f(fx)} ${f(below - 8)} ${f(x1 + 4)} ${f(below)}`}
          fill="none"
          stroke={c.ink}
          strokeWidth={sw}
          strokeLinecap="round"
          opacity={0.82}
        />
      );
    }
    case 'belly': {
      const by = fy + (y1 - fy) * 0.62;
      return <ellipse cx={fx} cy={by} rx={Math.min(w * 0.3, 22)} ry={Math.min((y1 - fy) * 0.42, 15)} fill={c.belly} />;
    }
    case 'freckles': {
      const d = [-1, 1]
        .flatMap((dir) =>
          [
            [g - 3, 8.2],
            [g + 1.5, 9.8],
            [g + 5.5, 7.6],
          ].map(([dx, dy]) => circle(fx + dir * dx!, fy + dy!, 1.25)),
        )
        .join('');
      return <path d={d} fill={c.outline} opacity={0.5} />;
    }
    case 'stars': {
      const stars: [number, number, number][] = [
        [0.12, 0.34, 4.4],
        [0.88, 0.26, 3.4],
        [0.9, 0.66, 4.8],
        [0.18, 0.84, 3.2],
        [0.6, 0.93, 3.6],
        [0.36, 0.12, 2.8],
      ];
      return <path d={stars.map(([u, v, r]) => sparkle(...at(u, v), r, 0.28)).join('')} fill={c.glow} />;
    }
    case 'patch': {
      const px = fx + g + 4;
      const py = fy - 9;
      return <path d={`M${f(px - 10)} ${f(py - 6)}C${f(px - 6)} ${f(py - 18)} ${f(px + 14)} ${f(py - 20)} ${f(px + 20)} ${f(py - 8)}C${f(px + 26)} ${f(py + 4)} ${f(px + 16)} ${f(py + 16)} ${f(px + 4)} ${f(py + 14)}C${f(px - 6)} ${f(py + 12)} ${f(px - 14)} ${f(py + 4)} ${f(px - 10)} ${f(py - 6)}Z`} fill={c.accent} />;
    }
    case 'drip':
      return <path d={dripCap(geo.box, 0.3, [0.55, 1.35, 0.4, 1.1, 0.7])} fill={c.accent} />;
    case 'snowcap': {
      // Fresh snow on top: white, with a cool shadow line along its soft lower edge.
      const d = dripCap(geo.box, 0.26, [0.5, 0.9, 0.35, 0.8, 0.45]);
      return (
        <>
          <path d={d} fill="hsl(205 70% 82%)" transform="translate(0 1.6)" />
          <path d={d} fill="hsl(200 60% 98%)" />
        </>
      );
    }
    case 'tabby': {
      const top = y0 + h * 0.06;
      const d = `M${f(fx)} ${f(top)}V${f(top + 12)}M${f(fx - 7)} ${f(top + 1)}L${f(fx - 5.5)} ${f(top + 9)}M${f(fx + 7)} ${f(top + 1)}L${f(fx + 5.5)} ${f(top + 9)}M${f(x0 - 2)} ${f(fy + 2)}H${f(x0 + 9)}M${f(x0 - 2)} ${f(fy + 9)}H${f(x0 + 8)}M${f(x1 + 2)} ${f(fy + 2)}H${f(x1 - 9)}M${f(x1 + 2)} ${f(fy + 9)}H${f(x1 - 8)}`;
      return <path d={d} fill="none" stroke={c.deep} strokeWidth={4} strokeLinecap="round" />;
    }
    case 'split':
      return <path d={`M${f(fx + 2)} ${f(y0 - 6)}C${f(fx - 10)} ${f(y0 + h * 0.35)} ${f(fx + 12)} ${f(y0 + h * 0.62)} ${f(fx)} ${f(y1 + 6)}H${f(x1 + 8)}V${f(y0 - 6)}Z`} fill={c.accent} />;
    case 'circuit': {
      const L = x0 + 3;
      const R = x1 - 3;
      const d = `M${f(L - 4)} ${f(fy - 14)}H${f(L + 8)}L${f(L + 13)} ${f(fy - 19)}M${f(R + 4)} ${f(fy + 16)}H${f(R - 7)}L${f(R - 12)} ${f(fy + 21)}M${f(fx - 10)} ${f(y1 + 4)}V${f(y1 - 9)}L${f(fx - 5)} ${f(y1 - 14)}M${f(R + 4)} ${f(y0 + h * 0.22)}H${f(R - 8)}`;
      const nodes = `${circle(L + 14.5, fy - 20.5, 2.2)}${circle(R - 13.5, fy + 22.5, 2.2)}${circle(fx - 4, y1 - 15, 2.2)}${circle(R - 9.5, y0 + h * 0.22, 2.2)}`;
      return (
        <>
          <path d={d} fill="none" stroke={c.glow} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
          <path d={nodes} fill={c.glow} />
        </>
      );
    }
    case 'bubbles': {
      const bubbles: [number, number, number][] = [
        [0.12, 0.3, 4.6],
        [0.2, 0.18, 2.6],
        [0.88, 0.42, 3.8],
        [0.84, 0.28, 2.2],
        [0.16, 0.8, 3.2],
        [0.78, 0.86, 4.2],
      ];
      const glints = bubbles
        .map(([u, v, r]) => {
          const [bx, by] = at(u, v);
          return `M${f(bx - r * 0.5)} ${f(by - r * 0.15)}Q${f(bx - r * 0.45)} ${f(by - r * 0.5)} ${f(bx - r * 0.1)} ${f(by - r * 0.55)}`;
        })
        .join('');
      return (
        <g fill="none" stroke="#fff" strokeWidth={1.7} opacity={0.75}>
          <path d={bubbles.map(([u, v, r]) => circle(...at(u, v), r)).join('')} />
          <path d={glints} strokeWidth={1.2} />
        </g>
      );
    }
    case 'constellation': {
      const pts = [at(0.14, 0.4), at(0.24, 0.16), at(0.48, 0.07), at(0.74, 0.14), at(0.9, 0.36)];
      return (
        <>
          <path d={`M${pts.map(([px, py]) => `${f(px)} ${f(py)}`).join('L')}`} fill="none" stroke={c.glow} strokeWidth={1.3} strokeDasharray="2.2 2.2" opacity={0.85} />
          <path d={pts.map(([px, py], i) => (i % 2 ? circle(px, py, 2) : sparkle(px, py, 3.6, 0.3))).join('')} fill={c.glow} />
        </>
      );
    }
    case 'sprinkles': {
      const bits: [number, number, number, string][] = [
        [0.12, 0.34, 30, c.glow],
        [0.86, 0.3, -40, 'hsl(330 90% 76%)'],
        [0.9, 0.62, 60, c.accent],
        [0.16, 0.78, -20, 'hsl(190 85% 70%)'],
        [0.32, 0.12, 80, 'hsl(330 90% 76%)'],
        [0.7, 0.9, 10, c.glow],
        [0.66, 0.1, -60, 'hsl(190 85% 70%)'],
      ];
      return (
        <g strokeLinecap="round" strokeWidth={2.6}>
          {bits.map(([u, v, r, col], i) => {
            const [bx, by] = at(u, v);
            const dx = Math.cos((r * Math.PI) / 180) * 2.6;
            const dy = Math.sin((r * Math.PI) / 180) * 2.6;
            return <path key={i} d={`M${f(bx - dx)} ${f(by - dy)}L${f(bx + dx)} ${f(by + dy)}`} stroke={col} />;
          })}
        </g>
      );
    }
    case 'none':
    default:
      return null;
  }
}
