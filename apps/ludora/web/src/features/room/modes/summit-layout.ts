/*
 * Where every ledge of Summit Scramble's mountain sits, shared by the 3D scene
 * and the 2D side view so both draw the same climb. No three.js here.
 *
 * The mountain is a broad cone. The path climbs its front face in
 * switchbacks: each stretch of ten ledges crosses the face, with a camp at
 * every turn, and the last stretch ends on the summit at the top of the face.
 * Units are metres; y is up, z points out of the face towards the viewer.
 */

/** Height of the summit ledge above the foot. */
export const CLIMB_H = 21;
/** The cone's radius at the foot, and the height its sides would meet at. */
export const BASE_R = 23;
export const CONE_TOP = 30;
/** How far across the face (as a share of its half-width) the switchbacks reach. */
const REACH = 0.7;
const STRETCH = 10;

export function radiusAt(y: number): number {
  return Math.max(0.5, BASE_R * (1 - y / CONE_TOP));
}

export interface Point {
  x: number;
  y: number;
  z: number;
}

/** Height of a ledge (fractions allowed, for moving between ledges). */
export function ledgeY(ledge: number, summit: number): number {
  return (Math.max(0, Math.min(summit, ledge)) / summit) * CLIMB_H;
}

/** Which way the path runs at a ledge: 1 to the right, -1 to the left. */
export function pathDirection(ledge: number, summit: number): 1 | -1 {
  const rows = Math.max(1, Math.round(summit / STRETCH));
  const row = Math.min(rows - 1, Math.floor(Math.max(0, ledge) / STRETCH));
  return row % 2 === 0 ? 1 : -1;
}

/** Across the face, at a ledge. */
export function ledgeX(ledge: number, summit: number): number {
  const l = Math.max(0, Math.min(summit, ledge));
  const rows = Math.max(1, Math.round(summit / STRETCH));
  const row = Math.min(rows - 1, Math.floor(l / STRETCH));
  const t = (l - row * STRETCH) / STRETCH;
  const dir = row % 2 === 0 ? 1 : -1;
  // Each stretch starts where the last one turned, at the edge it reached.
  const startY = ledgeY(row * STRETCH, summit);
  const endY = ledgeY((row + 1) * STRETCH, summit);
  const start = -dir * REACH * radiusAt(startY);
  // The last stretch finishes in the middle, on the summit.
  const end = row === rows - 1 ? 0 : dir * REACH * radiusAt(endY);
  // The turn at a camp is shared, so the end of one stretch is the start of the next.
  const from = row === 0 ? start : -dir * REACH * radiusAt(startY);
  return from + (end - from) * t;
}

/** The point on the face where a ledge sits (its top surface, at the front edge of the rock). */
export function ledgePoint(ledge: number, summit: number): Point {
  const y = ledgeY(ledge, summit);
  const x = ledgeX(ledge, summit);
  const r = radiusAt(y);
  const z = Math.sqrt(Math.max(0, r * r - x * x));
  return { x, y, z };
}
