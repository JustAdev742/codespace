import { syncParts, syncScoreMeter } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const classicAdapter: ChaosAdapter = {
  modeId: 'classic',
  meters: [syncScoreMeter()],
  ...syncParts(),
  features: (settings) => (Number(settings.wrongPenalty) > 0 ? ['losses'] : []),
  isOut: (s, id) => s.out?.[id] !== undefined,
  // Knocked-out players come back; late joiners who are only watching (-1) do not.
  revive: (s, id) => {
    if (s.out?.[id] === undefined || s.out[id] === -1) return false;
    delete s.out[id];
    return true;
  },
};
