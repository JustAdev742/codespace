import { describe, expect, it } from 'vitest';
import { createRng, fromCode, mergeCode, normaliseBlueprint, parseBlueprint, STARTER_BLUEPRINTS, toCode } from '@ludora/shared';
import { blueprintMode } from '../src/modes/made-game/index.ts';
import { simulateGame } from '../src/testing/harness.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { randomBlueprint } from '../src/testing/blueprints.ts';

/*
 * Game code and blueprints are two views of one game. Writing any valid blueprint as code and
 * reading it back gives the same game (in its plain form), and the plain form plays exactly the
 * same as the original.
 */

const ROUND_TRIPS = 1000;

describe('game code round trip', () => {
  it(`toCode then fromCode gives the same blueprint for ${ROUND_TRIPS} random valid blueprints (with and without rules) and every starting point`, () => {
    const rng = createRng(777);
    let tried = 0;
    let withRules = 0;
    const failures: string[] = [];
    const all = [...STARTER_BLUEPRINTS.map((s) => s.blueprint), ...Array.from({ length: ROUND_TRIPS }, () => randomBlueprint(rng))];
    for (const raw of all) {
      const parsed = parseBlueprint(raw);
      if (!parsed.ok) continue;
      tried++;
      if (parsed.blueprint.rules?.length) withRules++;
      const code = toCode(parsed.blueprint);
      const back = fromCode(code);
      if (!back.ok) {
        failures.push(`${back.problems.map((p) => p.message).join(' / ')}\n${code}`);
        continue;
      }
      const want = normaliseBlueprint(parsed.blueprint);
      if (JSON.stringify(back.blueprint) !== JSON.stringify(want)) failures.push(`differs:\n${code}\n${JSON.stringify(back.blueprint)}\n${JSON.stringify(want)}`);
      // Normalising twice changes nothing, and code of the plain form is the same code.
      expect(toCode(want)).toBe(code);
    }
    expect(failures.slice(0, 3)).toEqual([]);
    expect(tried).toBeGreaterThanOrEqual(ROUND_TRIPS);
    expect(withRules).toBeGreaterThan(ROUND_TRIPS * 0.4);
  });

  it('the plain form of a blueprint plays exactly the same as the blueprint', () => {
    const rng = createRng(31);
    for (let i = 0; i < 80; i++) {
      const parsed = parseBlueprint(randomBlueprint(rng));
      if (!parsed.ok) continue;
      const seed = rng.int(1, 1e9);
      const players = rng.pick([1, 3, 5]);
      const run = (bp: typeof parsed.blueprint) => {
        const r = simulateGame({ modeId: 'made-game', mode: blueprintMode(bp), questions: MIXED_SET, players, seed, maxGameMs: bp.end.timeLimitSec * 1000 + 60_000 });
        return { ms: r.gameMs, summary: r.results?.summary, standings: r.results?.standings.map((s) => [s.playerId, s.score, s.label]) };
      };
      expect(run(normaliseBlueprint(parsed.blueprint)), `#${i}`).toEqual(run(parsed.blueprint));
    }
  }, 120_000);

  it('a form change rewrites the code but keeps comments, blank lines and order', () => {
    const rng = createRng(9);
    for (let i = 0; i < 200; i++) {
      const a = parseBlueprint(randomBlueprint(rng));
      const b = parseBlueprint(randomBlueprint(rng));
      if (!a.ok || !b.ok) continue;
      const code = `# my notes\n${toCode(a.blueprint)}\n# the end`;
      const merged = mergeCode(code, b.blueprint);
      const back = fromCode(merged);
      expect(back.ok, merged).toBe(true);
      if (back.ok) expect(back.blueprint).toEqual(normaliseBlueprint(b.blueprint));
      expect(merged.startsWith('# my notes\n')).toBe(true);
      expect(merged.trimEnd().endsWith('# the end')).toBe(true);
    }
  });
});
