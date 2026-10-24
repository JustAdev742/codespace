import { fieldMeter, streamParts } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const timeAttackAdapter: ChaosAdapter = {
  modeId: 'time-attack',
  meters: [fieldMeter('score', 'Points', (s: any) => s.runs, 'score')],
  ...streamParts((s: any, id) => (s.runs[id] && !s.runs[id].over ? s.runs[id].stream : null)),
  isOut: (s, id) => Boolean(s.runs[id]?.over),
};
