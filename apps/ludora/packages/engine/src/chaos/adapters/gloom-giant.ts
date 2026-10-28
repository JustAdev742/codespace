import { fieldMeter } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const gloomGiantAdapter: ChaosAdapter = {
  modeId: 'gloom-giant',
  meters: [
    fieldMeter('score', 'Damage', (s: any) => s.fighters, 'damage'),
    {
      key: 'giantHp',
      label: 'Giant health',
      scope: 'global',
      get: (s) => s.hp,
      set: (s, _id, v, ctx) => {
        if (s.result !== null) return;
        s.hp = v;
        // The mode enrages the giant the moment it drops below half health; a cheat that wounds it does the same.
        if (!s.enraged && s.hp < s.maxHp / 2) {
          s.enraged = true;
          ctx.feed('The Gloom Giant is enraged! Wrong answers now cost 2 shield.', { tone: 'bad' });
        }
      },
      // Defeating the giant is the players' moment; chaos can wound it, never finish it.
      min: 1,
      max: (s) => s.maxHp,
    },
    {
      key: 'shield',
      label: 'Shield',
      scope: 'global',
      get: (s) => s.shield,
      set: (s, _id, v) => {
        if (s.result !== null) return;
        s.shield = v;
        // As when the mode mends it: back out of danger, a new crack is announced again.
        if (v > 2) s.cracked = false;
      },
      // A broken shield loses the battle, which is never a cheat's doing; mending never goes past the starting strength.
      min: 1,
      max: (s) => s.shieldMax,
    },
    {
      // The current run of correct answers (3 or more adds 1 damage). Never more than the player's correct answers.
      key: 'streak',
      label: 'Streak',
      scope: 'player',
      get: (s, id) => s.fighters[id]?.stream.streak ?? 0,
      set: (s, id, v) => {
        const st = s.fighters[id]?.stream;
        if (!st) return;
        st.streak = v;
        st.bestStreak = Math.max(st.bestStreak, v);
      },
      max: (s, id) => s.fighters[id]?.stream.correct ?? 0,
    },
    {
      // Wrong answers (each one lets the giant strike). Read-only: chaos watches it to see who missed, but never writes it.
      key: 'misses',
      label: 'Misses',
      scope: 'player',
      get: (s, id) => s.fighters[id]?.misses ?? 0,
      set: () => {},
      min: (s, id) => s.fighters[id]?.misses ?? 0,
      max: (s, id) => s.fighters[id]?.misses ?? 0,
    },
  ],
  stream: (s, id) => s.fighters[id]?.stream ?? null,
  question: (s, id) => s.fighters[id]?.stream?.iid ?? null,
  features: (st) => ['giant', ...(st.regen ? ['regen'] : [])],
};
