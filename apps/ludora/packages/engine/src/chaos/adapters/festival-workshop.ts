import { fieldMeter, streamParts } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const festivalWorkshopAdapter: ChaosAdapter = {
  modeId: 'festival-workshop',
  meters: [fieldMeter('score', 'Takings', (s: any) => s.workshops, 'takings', { integer: false }), fieldMeter('currency', 'Coins', (s: any) => s.workshops, 'coins')],
  ...streamParts((s: any, id) => s.workshops[id]?.stream),
};
