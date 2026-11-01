import { fieldMeter, streamParts } from './helpers.ts';
import type { ChaosAdapter, MeterDef } from '../types.ts';
import { LUCKY_MAX } from '../../modes/night-market/meta.ts';

/** A yes/no charm on a stall, as a 0/1 meter so cheats that move it can be undone. */
function charmMeter(key: string, label: string, field: 'shield' | 'sight', max: MeterDef['max'] = () => 1): MeterDef {
  return {
    key,
    label,
    scope: 'player',
    get: (s: any, id) => (s.stalls[id]?.[field] ? 1 : 0),
    set: (s: any, id, v) => {
      const st = s.stalls[id];
      if (st) st[field] = v > 0;
    },
    max,
  };
}

export const nightMarketAdapter: ChaosAdapter = {
  modeId: 'night-market',
  // Coins are the score here. Reaching the goal is announced by the mode, so cheats stop a coin short.
  meters: [
    fieldMeter('score', 'Coins', (s: any) => s.stalls, 'coins', {
      max: (s: any, _id, ctx) => (s.winner === null && Number(ctx.settings.goalCoins) > 0 ? Number(ctx.settings.goalCoins) - 1 : Number.MAX_SAFE_INTEGER),
    }),
    // Charms. Shields only exist with tricks on (there is nothing to block otherwise).
    charmMeter('shield', 'Shield', 'shield', (_s, _id, ctx) => (ctx.settings.tricks === false ? 0 : 1)),
    charmMeter('sight', 'Lantern Sight', 'sight'),
    fieldMeter('lucky', 'Lucky Streak', (s: any) => s.stalls, 'lucky', { max: () => LUCKY_MAX }),
  ],
  ...streamParts((s: any, id) => s.stalls[id]?.stream),
  features: (settings) => ['coins-are-score', ...(settings.tricks === false ? [] : ['tricks']), ...(settings.events === false ? [] : ['events'])],
};
