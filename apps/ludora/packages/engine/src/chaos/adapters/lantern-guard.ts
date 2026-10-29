import { fieldMeter, streamParts } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const lanternGuardAdapter: ChaosAdapter = {
  modeId: 'lantern-guard',
  meters: [
    fieldMeter('currency', 'Gold', (s: any) => s.guards, 'gold'),
    // The gold in the Great Lantern's flare pot. Full is the most it holds, and a full pot is
    // charged, exactly as when the room feeds it; taking gold out of a full pot uncharges it.
    {
      key: 'flare',
      label: 'Great Lantern gold',
      scope: 'global',
      get: (s: any) => Number(s.flare?.pot ?? 0),
      set: (s: any, _id, v) => {
        if (!s.flare || s.result) return;
        s.flare.pot = v;
        s.flare.charged = v >= s.flare.cost;
      },
      max: (s: any) => Number(s.flare?.cost ?? 0),
    },
    // The lights still burning on the Great Lantern. Chaos never puts the last one out (the gloom
    // winning is the mode's moment) and never lights more than the lantern started with.
    {
      key: 'lights',
      label: 'Lights on the Great Lantern',
      scope: 'global',
      get: (s: any) => Number(s.lights ?? 0),
      set: (s: any, _id, v) => {
        if (s.result) return;
        s.lights = v;
      },
      min: () => 1,
      max: (s: any) => Number(s.maxLights ?? 0),
    },
  ],
  ...streamParts((s: any, id) => s.guards[id]?.stream),
};
