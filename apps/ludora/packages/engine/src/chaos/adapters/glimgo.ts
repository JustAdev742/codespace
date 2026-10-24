import type { ChaosAdapter } from '../types.ts';

// Glimgo standings come from the marks on each card, so there is no plain score meter.
export const glimgoAdapter: ChaosAdapter = {
  modeId: 'glimgo',
  meters: [],
};
