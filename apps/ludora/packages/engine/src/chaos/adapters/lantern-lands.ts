import { streamParts } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

const teamIndex = (s: any, teamId: string) => (s.teams as { id: string }[]).findIndex((t) => t.id === teamId);

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
  ],
  ...streamParts((s: any, id) => s.members[id]?.stream),
};
