import { syncParts, syncScoreMeter } from './helpers.ts';
import type { ChaosAdapter, MeterDef } from '../types.ts';

const lanterns: MeterDef = {
  key: 'lanterns',
  label: 'Lanterns lit',
  scope: 'player',
  get: (s, id) => s.lanterns[id] ?? 0,
  set: (s, id, v) => {
    if (!(id in s.lanterns)) return;
    s.lanterns[id] = v;
    if (v > 0) delete s.outAt[id];
  },
  // Chaos can blow out lanterns but never the last one: going out is the mode's call.
  min: 1,
  max: () => 9,
};

export const lanternOutAdapter: ChaosAdapter = {
  modeId: 'lantern-out',
  meters: [syncScoreMeter(), lanterns],
  ...syncParts(),
  isOut: (s, id) => (s.lanterns[id] ?? 0) <= 0,
  revive: (s, id) => {
    if ((s.lanterns[id] ?? 0) > 0 || s.leftAt[id] !== undefined) return false;
    s.lanterns[id] = 1;
    delete s.outAt[id];
    return true;
  },
  features: ['lanterns'],
};
