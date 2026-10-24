import { fieldMeter } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const gloomGiantAdapter: ChaosAdapter = {
  modeId: 'gloom-giant',
  meters: [
    fieldMeter('score', 'Damage', (s: any) => s.fighters, 'damage'),
    {
      key: 'giantHp',
      label: 'Giant health',
      scope: 'global',
      get: (s) => s.hp,
      set: (s, _id, v) => {
        if (s.result === null) s.hp = v;
      },
      // Defeating the giant is the players' moment; chaos can wound it, never finish it.
      min: 1,
      max: (s) => s.maxHp,
    },
  ],
  stream: (s, id) => s.fighters[id]?.stream ?? null,
  question: (s, id) => s.fighters[id]?.stream?.iid ?? null,
  features: ['giant'],
};
