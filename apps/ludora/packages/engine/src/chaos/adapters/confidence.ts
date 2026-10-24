import type { ChaosAdapter } from '../types.ts';

export const confidenceAdapter: ChaosAdapter = {
  modeId: 'confidence',
  meters: [
    {
      key: 'score',
      label: 'Points',
      scope: 'player',
      get: (s, id) => s.scores[id] ?? 0,
      set: (s, id, v) => {
        if (id in s.scores) s.scores[id] = v;
      },
      // Wagers can take a score below zero.
      min: -1_000_000_000,
    },
  ],
  question: (s) => (s.phase === 'question' ? s.iid : null),
  features: ['losses'],
};
