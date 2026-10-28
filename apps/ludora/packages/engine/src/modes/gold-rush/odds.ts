/*
 * The chances of every find, worked out in one place: the mode draws from
 * these numbers and players see exactly the same ones. Browser-safe.
 */
import {
  CAVE_IN,
  CAVE_IN_MAX,
  FIND_GOLD,
  FIND_WEIGHTS,
  GROUND,
  PROPS_CUT,
  RICH_LEAD_FROM,
  RISK_SCALE,
  type FindKind,
  type GoldEventId,
  type GroundKind,
  type RiskLevel,
} from './meta.ts';

export interface DigMoment {
  ground: GroundKind;
  risk: RiskLevel;
  claimJumping: boolean;
  /** The level the next dig reaches (1 is the first). */
  level: number;
  props: number;
  event: GoldEventId | null;
  /** The next find is doubled (a quartz vein). */
  vein: boolean;
}

export interface OddsRow {
  kind: FindKind;
  /** Percent, 0 to 100. Rows add up to 100. */
  percent: number;
  /** Gold the find can hold, before a vein's doubling is shown: [least, most]. Null when it holds none. */
  gold: [number, number] | null;
}

/** The deepest level a ground's tables reach; digging further keeps drawing from it. */
export function tableLevel(ground: GroundKind, level: number): number {
  return Math.max(1, Math.min(level, GROUND[ground].levels));
}

/** Chance of a cave-in on the next dig, in percent. */
export function caveInPercent(m: DigMoment): number {
  if (!GROUND[m.ground].caveIns || m.event === 'steady') return 0;
  const table = CAVE_IN[m.ground === 'deep' ? 'deep' : 'standard'];
  const base = table[tableLevel(m.ground, m.level) - 1] ?? table[table.length - 1]!;
  const scaled = Math.min(CAVE_IN_MAX, base * RISK_SCALE[m.risk]);
  return scaled * (1 - (PROPS_CUT[Math.min(m.props, PROPS_CUT.length - 1)] ?? 0));
}

/** How much a find is multiplied by at this moment: deep ground, events and a vein. */
export function goldMultiplier(m: DigMoment): number {
  let k = GROUND[m.ground].size;
  if (m.event === 'fever') k *= 2;
  if (m.event === 'richLead' && m.level >= RICH_LEAD_FROM) k *= 1.5;
  if (m.vein) k *= 2;
  return k;
}

/** Gold range for a find kind at a moment, or null for finds that hold none. */
export function goldRange(kind: FindKind, m: DigMoment): [number, number] | null {
  if (kind !== 'dust' && kind !== 'nugget' && kind !== 'bonanza' && kind !== 'vein' && kind !== 'relic') return null;
  const g = FIND_GOLD[kind];
  const level = tableLevel(m.ground, m.level);
  const base = (g.base + g.perLevel * level) * goldMultiplier(m);
  return [Math.max(1, Math.round(base * g.spread[0])), Math.max(1, Math.round(base * g.spread[1]))];
}

/** Relative weights of the non-cave-in finds at a moment. */
export function findWeights(m: DigMoment): Partial<Record<FindKind, number>> {
  const level = tableLevel(m.ground, m.level);
  let band = FIND_WEIGHTS[0]!;
  for (const b of FIND_WEIGHTS) if (level >= b.from) band = b;
  const w: Partial<Record<FindKind, number>> = { ...band.weights };
  if (level < GROUND[m.ground].bonanzaFrom) {
    w.nugget = (w.nugget ?? 0) + (w.bonanza ?? 0);
    delete w.bonanza;
  }
  if (!m.claimJumping && w.map) {
    w.dust = (w.dust ?? 0) + w.map;
    delete w.map;
  }
  return w;
}

/** Every outcome of the next dig with its chance. */
export function digOdds(m: DigMoment): OddsRow[] {
  const cave = caveInPercent(m);
  const w = findWeights(m);
  const total = Object.values(w).reduce((n, x) => n + (x ?? 0), 0);
  const rows: OddsRow[] = (Object.entries(w) as [FindKind, number][])
    .filter(([, x]) => x > 0)
    .map(([kind, x]) => ({ kind, percent: ((100 - cave) * x) / total, gold: goldRange(kind, m) }));
  if (cave > 0) rows.push({ kind: 'cavein', percent: cave, gold: null });
  return rows.sort((a, b) => b.percent - a.percent);
}

/** The average gold of the next dig (ignoring what a cave-in loses), for players who like to work it out. */
export function averageFind(m: DigMoment): number {
  return digOdds(m).reduce((n, r) => n + (r.gold ? ((r.gold[0] + r.gold[1]) / 2) * (r.percent / 100) : 0), 0);
}

