import { memo } from 'react';
import { PAINT_SIZE, decodePaint } from '@ludora/shared';
import { fmt as f } from './geometry.ts';

/*
 * Painter data drawn as SVG: the grid laid over a box, each colour as ONE path of merged horizontal
 * runs, so a full grid is at most five elements however busy it is (sixty Glims in a lobby stay
 * cheap). Ludora picks the colours from the design's own palette; the data only says which.
 */

export type PaintPalette = readonly [string, string, string, string, string];

/** An ellipse kept clear (cells inside it are drawn faint), so markings never hide a face. */
export interface ClearZone {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/**
 * Paths per colour: horizontal runs of each colour as rectangles, overlapping a hair so no seams
 * show. The first five are the colours; the next five are the same colours for cells whose centre
 * is inside the clear zone, which are drawn faint.
 */
export function paintPaths(paint: string, box: readonly [number, number, number, number], clear?: ClearZone): string[] | null {
  const cells = decodePaint(paint);
  if (!cells) return null;
  const [x0, y0, x1, y1] = box;
  const cw = (x1 - x0) / PAINT_SIZE;
  const ch = (y1 - y0) / PAINT_SIZE;
  const d = ['', '', '', '', '', '', '', '', '', ''];
  const inZone = (c: number, r: number) => {
    if (!clear) return false;
    const dx = (x0 + (c + 0.5) * cw - clear.x) / clear.rx;
    const dy = (y0 + (r + 0.5) * ch - clear.y) / clear.ry;
    return dx * dx + dy * dy < 1;
  };
  for (let r = 0; r < PAINT_SIZE; r++) {
    for (let c = 0; c < PAINT_SIZE; ) {
      const v = cells[r * PAINT_SIZE + c]!;
      const zone = inZone(c, r);
      let e = c + 1;
      while (e < PAINT_SIZE && cells[r * PAINT_SIZE + e] === v && inZone(e, r) === zone) e++;
      if (v) {
        const x = x0 + c * cw - 0.15;
        const y = y0 + r * ch - 0.15;
        d[v - 1 + (zone ? 5 : 0)] += `M${f(x)} ${f(y)}h${f((e - c) * cw + 0.3)}v${f(ch + 0.3)}h${f(-(e - c) * cw - 0.3)}Z`;
      }
      c = e;
    }
  }
  return d;
}

export const PaintLayer = memo(function PaintLayer({ paint, box, palette, clear }: { paint: string; box: readonly [number, number, number, number]; palette: PaintPalette; clear?: ClearZone | undefined }) {
  const paths = paintPaths(paint, box, clear);
  if (!paths) return null;
  return (
    <g data-paint="">
      {paths.map((d, i) => (d ? <path key={i} d={d} fill={palette[i % 5]} opacity={i >= 5 ? 0.22 : undefined} /> : null))}
    </g>
  );
});
