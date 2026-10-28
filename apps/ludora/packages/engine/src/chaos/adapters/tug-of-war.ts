import { fieldMeter, streamParts } from './helpers.ts';
import type { ChaosAdapter, MeterDef } from '../types.ts';

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** A count the mode keeps that chaos may watch (its delta hooks see who it changed for) but never write: min and max are both the current value. */
function watchMeter(key: string, label: string, read: (s: any, id: string) => number): MeterDef {
  return { key, label, scope: 'player', get: (s, id) => read(s, id), set: () => {}, min: (s, id) => read(s, id), max: (s, id) => read(s, id) };
}

export const tugOfWarAdapter: ChaosAdapter = {
  modeId: 'tug-of-war',
  meters: [
    fieldMeter('score', 'Pulls', (s: any) => s.pullers, 'pulls'),
    {
      key: 'rope',
      label: 'Knot position',
      scope: 'global',
      get: (s) => s.pos,
      set: (s, _id, v) => {
        if (s.winner === null) s.pos = round6(v);
      },
      // Pulls move the knot by fractions of a space (a bigger side pulls less), so the knot is not a whole number.
      integer: false,
      // Pulling the knot over a line wins; chaos can drag it close, never over.
      min: (_s, _id, ctx) => 1 - Number(ctx.settings.ropeLength),
      max: (_s, _id, ctx) => Number(ctx.settings.ropeLength) - 1,
    },
    {
      // The current run of correct answers (Heave doubles every third one). Never more than the player's correct answers.
      key: 'streak',
      label: 'Streak',
      scope: 'player',
      get: (s, id) => s.pullers[id]?.stream.streak ?? 0,
      set: (s, id, v) => {
        const st = s.pullers[id]?.stream;
        if (!st) return;
        st.streak = v;
        st.bestStreak = Math.max(st.bestStreak, v);
      },
      max: (s, id) => s.pullers[id]?.stream.correct ?? 0,
    },
    watchMeter('wrongAnswers', 'Wrong answers', (s, id) => {
      const st = s.pullers[id]?.stream;
      return st ? st.answered - st.correct : 0;
    }),
  ],
  ...streamParts((s: any, id) => s.pullers[id]?.stream),
  features: (st) => [
    'rope',
    ...(st.heave ? ['heave'] : []),
    ...(st.slack ? ['slack'] : []),
    ...(st.underdog ? ['underdog'] : []),
  ],
};
