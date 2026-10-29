import { MOVE, TAG, type RingCircle } from '@ludora/engine/glow-tag';
import { headingTo, wrapAngle } from '@ludora/engine/glow-tag-arena';

/** Where you stand and which way you face. */
export interface Spot {
  x: number;
  z: number;
  h: number;
}

/** Someone the description can name. */
export interface ParkPlayer {
  name: string;
  x: number;
  z: number;
}

/** Which way a point lies from where you stand and face: "straight ahead", "on your left", "behind you". */
export function directionWords(me: Spot, x: number, z: number): string {
  // Turning left raises your heading, so a point at a positive angle is on your left.
  const a = wrapAngle(headingTo(me.x, me.z, x, z) - me.h);
  const deg = (Math.abs(a) * 180) / Math.PI;
  const side = a > 0 ? 'left' : 'right';
  if (deg <= 25) return 'straight ahead';
  if (deg <= 70) return `ahead on your ${side}`;
  if (deg <= 115) return `on your ${side}`;
  if (deg <= 155) return `behind you on your ${side}`;
  return 'behind you';
}

/** How far, in the game's own terms: in range of a tag, near, or far off. */
function distanceWords(d: number): string {
  // The same reach the Tag button uses.
  if (d <= TAG.range - 0.3) return 'in tagging range';
  if (d <= TAG.range * 2) return 'near';
  return 'far off';
}

/**
 * Whether the nearest stretch of the ring's edge is inside the park. The first ring reaches past the
 * corners, so the walls keep everyone in it: no warning then.
 */
function edgeInPark(me: Spot, ring: RingCircle, d: number, half: number): boolean {
  if (d === 0) return false;
  const ex = ring.x + ((me.x - ring.x) * ring.r) / d;
  const ez = ring.z + ((me.z - ring.z) * ring.r) / d;
  return Math.abs(ex) < half && Math.abs(ez) < half;
}

const count = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/**
 * What the park picture shows, for screen readers: how many rivals are glowing (in Lights Out, how many
 * you can see), the nearest one and which way they are, and where you are against the ring.
 * `me` is null when you are not in the park (dimmed, out or watching). `size` is the park's width.
 */
export function parkWords({ me, rivals, ring, size, lightsOut, teams }: { me: Spot | null; rivals: readonly ParkPlayer[]; ring: RingCircle | null; size: number; lightsOut: boolean; teams: boolean }): string {
  const who = teams ? count(rivals.length, 'rival', 'rivals') : count(rivals.length, 'other player', 'other players');
  const parts = [
    rivals.length === 0
      ? lightsOut
        ? 'Nobody is close enough to see.'
        : `No ${teams ? 'rivals are' : 'other players are'} glowing.`
      : `${who} ${rivals.length === 1 ? 'is' : 'are'} ${lightsOut ? 'close enough to see' : 'glowing'}.`,
  ];
  if (!me) return parts.join(' ');
  let nearest: { p: ParkPlayer; d: number } | null = null;
  for (const p of rivals) {
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    if (!nearest || d < nearest.d) nearest = { p, d };
  }
  if (nearest) parts.push(`Nearest: ${nearest.p.name}, ${directionWords(me, nearest.p.x, nearest.p.z)}, ${distanceWords(nearest.d)}.`);
  if (ring) {
    const d = Math.hypot(me.x - ring.x, me.z - ring.z);
    if (d > ring.r) parts.push(`You are outside the ring. The way back in is ${directionWords(me, ring.x, ring.z)}.`);
    // Under two seconds' walk from the edge.
    else if (ring.r - d < MOVE.speed * 2 && edgeInPark(me, ring, d, size / 2)) parts.push('You are inside the ring, near its edge.');
    else parts.push('You are inside the ring.');
  }
  return parts.join(' ');
}
