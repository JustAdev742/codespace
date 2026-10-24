import { streamParts } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const cometDashAdapter: ChaosAdapter = {
  modeId: 'comet-dash',
  meters: [
    {
      key: 'score',
      label: 'Spaces',
      scope: 'player',
      get: (s, id) => s.racers[id]?.pos ?? 0,
      set: (s, id, v) => {
        const r = s.racers[id];
        if (r && r.place === null) r.pos = v;
      },
      // Crossing the line is the mode's to decide (it hands out places), so cheats stop a space short.
      max: (s, id, ctx) => (s.racers[id]?.place !== null && s.racers[id] ? s.racers[id].pos : Number(ctx.settings.distance) - 1),
    },
  ],
  ...streamParts((s, id) => s.racers[id]?.stream),
};
