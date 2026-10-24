import { fieldMeter } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const skyLanternsAdapter: ChaosAdapter = {
  modeId: 'sky-lanterns',
  meters: [fieldMeter('score', 'Points', (s: any) => s.flyers, 'score')],
  stream: (s, id) => s.flyers[id]?.stream ?? null,
  question: (s, id) => s.flyers[id]?.stream?.iid ?? null,
};
