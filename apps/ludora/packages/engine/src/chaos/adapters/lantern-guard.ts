import { fieldMeter, streamParts } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const lanternGuardAdapter: ChaosAdapter = {
  modeId: 'lantern-guard',
  meters: [fieldMeter('currency', 'Gold', (s: any) => s.guards, 'gold')],
  ...streamParts((s: any, id) => s.guards[id]?.stream),
};
