import type { ChaosAdapter } from '../types.ts';

// Glimgo standings come from the marks on each card, so there is no plain score meter.
export const glimgoAdapter: ChaosAdapter = {
  modeId: 'glimgo',
  meters: [
    {
      // Read-only: a mark is a square on a card, not a number, so cheats change cards directly and recompute
      // progress the way the mode does. The meter lets the chaos layer rank players by marks.
      key: 'marks',
      label: 'Marked squares',
      scope: 'player',
      get: (s, id) => s.progress?.[id]?.marks ?? 0,
      set: () => {},
      min: (s, id) => s.progress?.[id]?.marks ?? 0,
      max: (s, id) => s.progress?.[id]?.marks ?? 0,
    },
  ],
  features: (settings) => [...(Number(settings.lockoutSeconds ?? 5) > 0 ? ['lockout'] : []), ...(settings.luckyStars ? ['lucky-stars'] : [])],
};
