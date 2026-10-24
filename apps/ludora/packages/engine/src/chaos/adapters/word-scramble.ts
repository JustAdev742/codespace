import { fieldMeter, streamParts } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const wordScrambleAdapter: ChaosAdapter = {
  modeId: 'word-scramble',
  meters: [fieldMeter('score', 'Points', (s: any) => s.players, 'points')],
  ...streamParts((s: any, id) => (s.players[id]?.word ? s.players[id].stream : null)),
};
