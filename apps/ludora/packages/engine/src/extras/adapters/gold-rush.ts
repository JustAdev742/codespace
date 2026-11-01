import { fieldMeter, streamParts } from './helpers.ts';
import type { ChaosAdapter, MeterDef } from '../types.ts';
import { GROUND, MAX_DIGS, type GroundKind } from '../../modes/gold-rush/meta.ts';

const levels = (settings: Record<string, unknown>) => GROUND[(settings.ground as GroundKind) ?? 'standard'].levels;

/** A quartz vein waiting to double the next find, as a 0/1 meter so cheats that give or take one can be undone. */
const veinMeter: MeterDef = {
  key: 'vein',
  label: 'Quartz vein',
  scope: 'player',
  get: (s: any, id) => (s.miners[id]?.vein ? 1 : 0),
  set: (s: any, id, v) => {
    const m = s.miners[id];
    if (m) m.vein = v > 0;
  },
  max: () => 1,
};

export const goldRushAdapter: ChaosAdapter = {
  modeId: 'gold-rush',
  meters: [
    // Banked gold is the score. Reaching the goal is announced by the mode, so cheats stop a nugget short.
    fieldMeter('score', 'Banked gold', (s: any) => s.miners, 'banked', {
      max: (s: any, _id, ctx) => (s.winner === null && Number(ctx.settings.goalGold) > 0 ? Number(ctx.settings.goalGold) - 1 : Number.MAX_SAFE_INTEGER),
    }),
    fieldMeter('cart', 'Gold in the cart', (s: any) => s.miners, 'cart'),
    fieldMeter('digs', 'Digs', (s: any) => s.miners, 'digs', { max: () => MAX_DIGS }),
    // A shaft can be pushed a little past the bottom level; the tables keep drawing from the last one.
    fieldMeter('depth', 'Depth', (s: any) => s.miners, 'depth', { max: (_s, _id, ctx) => levels(ctx.settings) }),
    veinMeter,
  ],
  ...streamParts((s: any, id) => s.miners[id]?.stream),
  features: (settings) => [
    'gold-is-score',
    ...(settings.claimJumping === false ? [] : ['claim-jumping']),
    ...(settings.events === false ? [] : ['events']),
    ...(GROUND[(settings.ground as GroundKind) ?? 'standard'].caveIns ? ['cave-ins'] : []),
  ],
};
