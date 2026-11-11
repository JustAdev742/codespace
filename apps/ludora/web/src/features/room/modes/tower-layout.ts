/*
 * Tower Together's picture geometry, shared by the 3D scene and the 2D view:
 * how a tower's pieces become drawn blocks, and where builders stand.
 *
 * A class of 60 builds thousands of floors, so floors are drawn to a scale
 * that fits a little past the target (or the tower, if taller) into the
 * same picture. Pieces too thin to see at that scale are merged into bands
 * that keep the mix of timber and stone; braces always get their own band.
 */

export type BlockKind = 'timber' | 'stone' | 'lantern';

export interface Block {
  kind: BlockKind;
  /** Bottom and top, in floors. */
  from: number;
  to: number;
  /** Whether it is the highest brace (the line nothing below can fall past). */
  top: boolean;
}

export interface TowerShape {
  height: number;
  base: number;
  kinds: string;
  brace: number;
  target: number;
}

const KIND: Record<string, BlockKind> = { T: 'timber', S: 'stone', L: 'lantern' };
const FLOORS: Record<BlockKind, number> = { timber: 2, stone: 1, lantern: 0 };

/** Floors the picture is scaled to: a little past the target, or the tower when taller. */
export function picturedFloors(height: number, target: number): number {
  return Math.max(target * 1.22, height * 1.1, 8);
}

/**
 * Blocks bottom up. `minFloors` is the thinnest block worth drawing: runs of
 * thinner pieces merge (into a timber band and a stone band). Braces stay separate bands.
 */
export function towerBlocks(t: TowerShape, minFloors: number): Block[] {
  const out: Block[] = [];
  if (t.base > 0) out.push({ kind: 'stone', from: 0, to: t.base, top: false });
  let at = t.base;
  let run: { from: number; to: number; floors: Record<BlockKind, number> } | null = null;
  const flush = () => {
    if (!run || run.to <= run.from) return;
    // A merged run shows its timber and its stone as two bands, in proportion, so a tall
    // tower still reads as the mix the class built.
    const { timber, stone } = run.floors;
    const split = run.from + timber;
    if (timber > 0) out.push({ kind: 'timber', from: run.from, to: split, top: false });
    if (stone > 0) out.push({ kind: 'stone', from: split, to: run.to, top: false });
    run = null;
  };
  for (let i = 0; i < t.kinds.length; i++) {
    const kind = KIND[t.kinds[i]!] ?? 'stone';
    if (kind === 'lantern') {
      flush();
      out.push({ kind, from: at, to: at, top: i === t.brace });
      continue;
    }
    const f = FLOORS[kind];
    run ??= { from: at, to: at, floors: { timber: 0, stone: 0, lantern: 0 } };
    run.to = at + f;
    run.floors[kind] += f;
    at += f;
    if (run.to - run.from >= minFloors) flush();
  }
  flush();
  return out;
}

/** A stable angle (radians) round the tower for a builder: where their Glim stands and their camera looks from. */
export function sideOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (((h >>> 0) % 360) / 360) * Math.PI * 2;
}

/** Builders round the scaffolding in this many places; builders in one place share a stacked name tag. */
export const SPOTS = 8;
export function spotOf(id: string): number {
  return Math.round((sideOf(id) / (Math.PI * 2)) * SPOTS) % SPOTS;
}
export function spotAngle(spot: number): number {
  return (spot / SPOTS) * Math.PI * 2;
}

/** Names for a stacked tag: everyone, or the first few and how many more. */
export function stackNames(names: string[], max = 5): string[] {
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  return sorted.length > max ? [...sorted.slice(0, max - 1), `and ${sorted.length - (max - 1)} more`] : sorted;
}

/** "1,234 floors". */
export const floorsText = (n: number) => `${Math.round(n).toLocaleString('en-GB')} ${Math.round(n) === 1 ? 'floor' : 'floors'}`;
