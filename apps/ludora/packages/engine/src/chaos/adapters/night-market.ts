import { fieldMeter, streamParts } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const nightMarketAdapter: ChaosAdapter = {
  modeId: 'night-market',
  // Coins are the score here. Reaching the goal is announced by the mode, so cheats stop a coin short.
  meters: [
    fieldMeter('score', 'Coins', (s: any) => s.stalls, 'coins', {
      max: (s: any, _id, ctx) => (s.winner === null && Number(ctx.settings.goalCoins) > 0 ? Number(ctx.settings.goalCoins) - 1 : Number.MAX_SAFE_INTEGER),
    }),
  ],
  ...streamParts((s: any, id) => s.stalls[id]?.stream),
  features: ['coins-are-score'],
};
