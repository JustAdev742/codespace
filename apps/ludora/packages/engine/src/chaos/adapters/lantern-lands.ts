import { streamParts } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

const teamIndex = (s: any, teamId: string) => (s.teams as { id: string }[]).findIndex((t) => t.id === teamId);

/** Matches BONUS_METER_MAX in the mode: a team's bonus meter never holds more. */
const BONUS_MAX = 3;

export const lanternLandsAdapter: ChaosAdapter = {
  modeId: 'lantern-lands',
  meters: [
    {
      key: 'teamScore',
      label: 'Team points',
      scope: 'team',
      get: (s, id) => s.points[teamIndex(s, id)] ?? 0,
      set: (s, id, v) => {
        const i = teamIndex(s, id);
        if (i >= 0 && s.winners === null) s.points[i] = v;
      },
      // Reaching the points goal wins at once, which only a scoring may do: chaos stops one point short.
      max: (_s, _id, ctx) => (Number(ctx.settings.goalPoints) > 0 ? Number(ctx.settings.goalPoints) - 1 : Infinity),
    },
    {
      key: 'currency',
      label: 'Energy',
      scope: 'player',
      get: (s, id) => s.members[id]?.energy ?? 0,
      set: (s, id, v) => {
        if (s.members[id]) s.members[id].energy = v;
      },
      max: (_s, _id, ctx) => Number(ctx.settings.energyCap) + 1,
    },
    {
      // The team bonus meter the small team and underdog boosts fill; each whole unit pays 1 energy to the next teammate who answers right.
      key: 'bonus',
      label: 'Team bonus meter',
      scope: 'team',
      get: (s, id) => s.bonus[teamIndex(s, id)] ?? 0,
      set: (s, id, v) => {
        const i = teamIndex(s, id);
        if (i >= 0 && s.winners === null) s.bonus[i] = v;
      },
      max: () => BONUS_MAX,
      integer: false,
    },
  ],
  ...streamParts((s: any, id) => s.members[id]?.stream),
  features: (settings) => (settings.events === false ? [] : ['events']),
};
