import type { ChaosAdapter, MeterDef } from '../types.ts';

/**
 * How many players have been scored for the current question. Read-only: it
 * jumps when a question is scored (and drops to 0 when the next one starts),
 * so packs can watch it (delta hooks) to act at the moment of scoring.
 */
const scored: MeterDef = {
  key: 'scored',
  label: 'Players scored this question',
  scope: 'global',
  get: (s) => Object.keys(s.outcomes ?? {}).length,
  set: () => {},
};

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
      // A wrong wager takes points away, but the mode never takes a score below 0.
      min: 0,
    },
    scored,
  ],
  question: (s) => (s.phase === 'question' ? s.iid : null),
  features: (settings) => (settings.returning ? ['losses', 'returning'] : ['losses']),
};
