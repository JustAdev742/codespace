import { fieldMeter, streamParts } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const tugOfWarAdapter: ChaosAdapter = {
  modeId: 'tug-of-war',
  meters: [
    fieldMeter('score', 'Pulls', (s: any) => s.pullers, 'pulls'),
    {
      key: 'rope',
      label: 'Knot position',
      scope: 'global',
      get: (s) => s.pos,
      set: (s, _id, v) => {
        if (s.winner === null) s.pos = v;
      },
      // Pulling the knot over a line wins; chaos can drag it close, never over.
      min: (_s, _id, ctx) => 1 - Number(ctx.settings.ropeLength),
      max: (_s, _id, ctx) => Number(ctx.settings.ropeLength) - 1,
    },
  ],
  ...streamParts((s: any, id) => s.pullers[id]?.stream),
  features: ['rope'],
};
