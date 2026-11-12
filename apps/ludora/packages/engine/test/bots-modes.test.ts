import { describe, expect, it } from 'vitest';
import { MODES } from '../src/modes/index.ts';
import { makeProfile } from '../src/bots/index.ts';
import { simulateMinded } from '../src/testing/minded.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';

/*
 * Every mode played by practice bots with minds, as the server's rooms drive them:
 * a mixed class plays to the end without an error, a stall or an answer leak,
 * and the results spread out; over several games, hard bots finish above easy ones.
 */

const ids = MODES.map((m) => m.meta.id);

describe('minded practice bots in every mode', () => {
  it('covers all thirty modes', () => {
    expect(ids).toHaveLength(30);
  });

  for (const id of ids) {
    it(`${id}: a mixed class finishes, results spread out, and hard beats easy`, () => {
      const mixed = simulateMinded({ modeId: id, questions: MIXED_SET, level: 'mixed', players: 4, seed: 21 });
      expect(mixed.errors).toEqual([]);
      expect(mixed.stalled).toBe(false);
      expect(mixed.leaks).toEqual([]);
      expect(mixed.actions).toBeGreaterThan(4);
      const scores = mixed.results!.standings.map((s) => s.score);
      expect(new Set(scores).size).toBeGreaterThan(1);

      // Two hard and two easy bots of the same personality, over several games: hard places higher.
      let hardRanks = 0;
      let easyRanks = 0;
      for (const seed of [1, 2, 3, 4]) {
        const profiles = [makeProfile('steady', 'hard', seed * 10 + 1), makeProfile('steady', 'easy', seed * 10 + 2), makeProfile('steady', 'hard', seed * 10 + 3), makeProfile('steady', 'easy', seed * 10 + 4)];
        const r = simulateMinded({ modeId: id, questions: MIXED_SET, profiles, seed });
        expect(r.errors).toEqual([]);
        expect(r.stalled).toBe(false);
        for (const s of r.results!.standings) {
          if (s.playerId === 'b1' || s.playerId === 'b3') hardRanks += s.rank;
          else easyRanks += s.rank;
        }
      }
      expect(hardRanks).toBeLessThan(easyRanks);
    }, 60_000);
  }
});
