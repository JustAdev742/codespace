import { fieldMeter } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const lanternMatchAdapter: ChaosAdapter = {
  modeId: 'lantern-match',
  meters: [fieldMeter('score', 'Pairs', (s: any) => s.players, 'pairs')],
};
