import { fieldMeter, syncParts } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

/** Matches CHARGE_CAP and HEALTH_OPTIONS in the mode's meta. */
const CHARGE_CAP = 3;
const HEALTH_OPTIONS = [60, 100, 150];

const maxHealth = (settings: Record<string, unknown>) => {
  const n = Number(settings.health);
  return HEALTH_OPTIONS.includes(n) ? n : 100;
};

/** The side a player holds in a duel that is still being fought, if any. */
function liveSide(s: any, id: string): { health: number } | null {
  const duelId = s.fighters?.[id]?.duel;
  const d = duelId ? s.duels.find((x: any) => x.id === duelId) : undefined;
  if (!d || d.over) return null;
  return d.sides[0].id === id ? d.sides[0] : d.sides[1].id === id ? d.sides[1] : null;
}

export const glimDuelsAdapter: ChaosAdapter = {
  modeId: 'glim-duels',
  meters: [
    fieldMeter('score', 'Points', (s: any) => s.fighters, 'points'),
    {
      // Health of the player's Glim in a duel still being fought. Chaos never knocks a Glim out (only a hit may), so it stops at 1.
      key: 'health',
      label: 'Glim health',
      scope: 'player',
      get: (s, id) => {
        const duelId = s.fighters?.[id]?.duel;
        const d = duelId ? s.duels.find((x: any) => x.id === duelId) : undefined;
        const side = d ? (d.sides[0].id === id ? d.sides[0] : d.sides[1].id === id ? d.sides[1] : null) : null;
        return side?.health ?? 0;
      },
      set: (s, id, v) => {
        const side = liveSide(s, id);
        if (side) side.health = v;
      },
      min: (s, id) => (liveSide(s, id) ? 1 : 0),
      max: (_s, _id, ctx) => maxHealth(ctx.settings),
    },
    {
      // Charge for powers: each hit adds 1, up to the cap. Nothing to hold when powers are off.
      ...fieldMeter('charge', 'Charge', (s: any) => s.fighters, 'charge'),
      max: (_s, _id, ctx) => (ctx.settings.powers === false ? 0 : CHARGE_CAP),
    },
    // Damage landed over the whole game (a standings tiebreak). Lasting cheats watch it to know when a player lands a hit.
    fieldMeter('dealt', 'Damage dealt', (s: any) => s.fighters, 'dealt'),
  ],
  ...syncParts(),
  features: (settings) => (settings.powers === false ? [] : ['powers']),
};
