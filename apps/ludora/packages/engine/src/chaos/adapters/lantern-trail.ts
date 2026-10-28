import { fieldMeter, streamParts } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const lanternTrailAdapter: ChaosAdapter = {
  modeId: 'lantern-trail',
  meters: [
    // Golden Lanterns rank players; collecting the goal is the mode's win, so cheats stop one short.
    fieldMeter('score', 'Golden Lanterns', (s: any) => s.walkers, 'lanterns', {
      max: (s: any, _id, ctx) => (s.champion === null && Number(ctx.settings.goalLanterns) > 0 ? Number(ctx.settings.goalLanterns) - 1 : 99),
    }),
    fieldMeter('currency', 'Coins', (s: any) => s.walkers, 'coins'),
  ],
  ...streamParts((s: any, id) => s.walkers[id]?.stream),
  // The host's switches, so the pack's cheats about room events, gloom puddles and trick cards
  // only show up in games that have them (Kind Night turns tricks and puddles off).
  features: (st) => [...(st.events !== false ? ['room events'] : []), ...(st.puddles !== false ? ['gloom puddles'] : []), ...(st.tricks !== false ? ['trick cards'] : [])],
};
