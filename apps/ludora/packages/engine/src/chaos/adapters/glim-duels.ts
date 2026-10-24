import { fieldMeter, syncParts } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const glimDuelsAdapter: ChaosAdapter = {
  modeId: 'glim-duels',
  meters: [fieldMeter('score', 'Points', (s: any) => s.fighters, 'points')],
  ...syncParts(),
};
