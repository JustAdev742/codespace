import { syncParts, syncScoreMeter } from './helpers.ts';
import type { ChaosAdapter, MeterDef } from '../types.ts';

/** Wrong answers a player has given this game. Read-only: packs watch it (delta hooks) to react to a miss. */
const misses: MeterDef = {
  key: 'misses',
  label: 'Wrong answers',
  scope: 'player',
  get: (s, id) => s.misses?.[id] ?? 0,
  set: () => {},
};

export const quickDrawAdapter: ChaosAdapter = {
  modeId: 'quick-draw',
  // Reaching the target is a win the mode announces itself, so cheats stop one point short of it.
  meters: [syncScoreMeter('Points', { max: (_s, _id, ctx) => (Number(ctx.settings.target) > 0 ? Number(ctx.settings.target) - 1 : Number.MAX_SAFE_INTEGER) }), misses],
  ...syncParts(),
  features: (settings) => [...(settings.penalty ? ['losses'] : []), ...(settings.teamTry ? ['teamtry'] : [])],
};
