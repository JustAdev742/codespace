import { syncParts, syncScoreMeter } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const quickDrawAdapter: ChaosAdapter = {
  modeId: 'quick-draw',
  // Reaching the target is a win the mode announces itself, so cheats stop one point short of it.
  meters: [syncScoreMeter('Points', { max: (_s, _id, ctx) => (Number(ctx.settings.target) > 0 ? Number(ctx.settings.target) - 1 : Number.MAX_SAFE_INTEGER) })],
  ...syncParts(),
  features: (settings) => (settings.penalty ? ['losses'] : []),
};
