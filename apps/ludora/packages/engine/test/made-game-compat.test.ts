import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createRng, parseBlueprint, STARTER_BLUEPRINTS, type Blueprint } from '@ludora/shared';
import { blueprintMode } from '../src/modes/made-game/index.ts';
import { simulateGame } from '../src/testing/harness.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { randomBlueprint } from '../src/testing/blueprints.ts';

/*
 * Blueprints saved before game code and rules existed must still load and play exactly the same.
 * The fixture was recorded from the interpreter as it was before rules were added (run with
 * RECORD_MADE_GAME_COMPAT=1 to record it again, which should never be needed): each blueprint,
 * kept as it was then, with the standings, summary and length of a seeded game.
 */

const FIXTURE = fileURLToPath(new URL('./fixtures/made-game-before-rules.json', import.meta.url));

interface Recorded {
  blueprint: Blueprint;
  players: number;
  seed: number;
  gameMs: number;
  summary: string | null;
  standings: [string, number, string][];
}

function play(bp: Blueprint, players: number, seed: number): Omit<Recorded, 'blueprint' | 'players' | 'seed'> {
  const r = simulateGame({ modeId: 'made-game', mode: blueprintMode(bp), questions: MIXED_SET, players, seed, maxGameMs: bp.end.timeLimitSec * 1000 + 60_000 });
  return { gameMs: r.gameMs, summary: r.results?.summary ?? null, standings: (r.results?.standings ?? []).map((s) => [s.playerId, s.score, s.label]) };
}

function record(): Recorded[] {
  const rng = createRng(4242);
  const out: Recorded[] = [];
  const bps = [...STARTER_BLUEPRINTS.map((s) => s.blueprint), ...Array.from({ length: 60 }, () => randomBlueprint(rng))];
  for (const bp of bps) {
    const parsed = parseBlueprint(bp);
    if (!parsed.ok) continue;
    const players = rng.pick([1, 3, 6]);
    const seed = rng.int(1, 1e9);
    out.push({ blueprint: parsed.blueprint, players, seed, ...play(parsed.blueprint, players, seed) });
  }
  return out;
}

describe('made games saved before game code', () => {
  if (process.env.RECORD_MADE_GAME_COMPAT) {
    it('records the fixture', () => {
      writeFileSync(FIXTURE, `${JSON.stringify(record())}\n`);
    });
    return;
  }
  const recorded = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Recorded[];

  it('every saved blueprint is still valid, unchanged by the check', () => {
    expect(recorded.length).toBeGreaterThanOrEqual(60);
    for (const r of recorded) {
      const parsed = parseBlueprint(r.blueprint);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.blueprint).toEqual(r.blueprint);
    }
  });

  it('every saved blueprint plays exactly as it did, from the same seed', () => {
    for (const [i, r] of recorded.entries()) {
      expect(play(r.blueprint, r.players, r.seed), `#${i} ${r.blueprint.name}`).toEqual({ gameMs: r.gameMs, summary: r.summary, standings: r.standings });
    }
  }, 120_000);
});
