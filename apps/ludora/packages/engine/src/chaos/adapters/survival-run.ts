import { streamParts } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const survivalRunAdapter: ChaosAdapter = {
  modeId: 'survival-run',
  meters: [
    {
      key: 'score',
      label: 'Correct answers',
      scope: 'player',
      get: (s, id) => s.runners[id]?.stream.correct ?? 0,
      set: (s, id, v) => {
        const r = s.runners[id];
        if (r && r.phase !== 'over') r.stream.correct = v;
      },
    },
    {
      key: 'hearts',
      label: 'Hearts',
      scope: 'player',
      get: (s, id) => s.runners[id]?.hearts ?? 0,
      set: (s, id, v) => {
        const r = s.runners[id];
        if (r && r.phase !== 'over') r.hearts = v;
      },
      // Running out of hearts ends a run, which only a wrong answer can do.
      min: 1,
      max: () => 9,
    },
  ],
  ...streamParts((s, id) => (s.runners[id]?.phase === 'question' ? s.runners[id].stream : null)),
  isOut: (s, id) => s.runners[id]?.phase === 'over',
  features: ['hearts'],
};
