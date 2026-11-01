import { fieldMeter } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';
import { oilCapacity, STORM_CHANCE_CAP } from '../../modes/sky-lanterns/index.ts';

/** Festival finale: the coming change brings the gale and never a storm, so its forecast must stay at 0. */
function finaleNext(s: any, settings: Record<string, unknown>): boolean {
  return settings.windPattern === 'finale' && (s.wind.changeAt === null || s.wind.changeAt + Number(settings.windChangeSec) * 1000 >= s.endsAt);
}

export const skyLanternsAdapter: ChaosAdapter = {
  modeId: 'sky-lanterns',
  meters: [
    fieldMeter('score', 'Points', (s: any) => s.flyers, 'score'),
    // The oil can holds two lanterns' worth; the mode spills anything more.
    fieldMeter('oil', 'Oil', (s: any) => s.flyers, 'oil', { max: (_s, _id, ctx) => oilCapacity(Number(ctx.settings.lanternCost)) }),
    fieldMeter('ground', 'Lanterns waiting', (s: any) => s.flyers, 'ground'),
    {
      key: 'stormChance',
      label: 'Storm chance',
      scope: 'global',
      get: (s) => s.stormChance,
      set: (s, _id, v) => {
        s.stormChance = v;
      },
      // Without storms there is no chance of one, and the festival finale's last change never storms.
      max: (s, _id, ctx) => (ctx.settings.storms && !finaleNext(s, ctx.settings) ? STORM_CHANCE_CAP : 0),
    },
    {
      // How many times the wind has changed. Read-only: its delta hooks fire in the very transaction the wind changes in.
      key: 'windChanges',
      label: 'Wind changes',
      scope: 'global',
      get: (s) => s.wind.changes,
      set: () => {},
      min: (s) => s.wind.changes,
      max: (s) => s.wind.changes,
    },
    {
      // Wrong answers. Read-only: chaos watches it to see who answered wrong, but never writes it.
      key: 'wrongAnswers',
      label: 'Wrong answers',
      scope: 'player',
      get: (s, id) => {
        const st = s.flyers[id]?.stream;
        return st ? st.answered - st.correct : 0;
      },
      set: () => {},
      min: (s, id) => {
        const st = s.flyers[id]?.stream;
        return st ? st.answered - st.correct : 0;
      },
      max: (s, id) => {
        const st = s.flyers[id]?.stream;
        return st ? st.answered - st.correct : 0;
      },
    },
  ],
  stream: (s, id) => s.flyers[id]?.stream ?? null,
  question: (s, id) => s.flyers[id]?.stream?.iid ?? null,
  features: (st) => ['lanterns', ...(st.storms ? ['storms'] : [])],
};
