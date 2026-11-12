import { describe, expect, it } from 'vitest';
import { createRng, parseBlueprint, STARTER_BLUEPRINTS, type Blueprint } from '@ludora/shared';
import { blueprintMode, type MadeView } from '../src/modes/made-game/index.ts';
import { simulateGame } from '../src/testing/harness.ts';
import { MIXED_SET, FLASHCARD_SET } from '../src/testing/fixtures.ts';
import { randomBlueprint, BREAKERS } from '../src/testing/blueprints.ts';
import { simulateMinded } from '../src/testing/minded.ts';
import type { GameMode, Viewer } from '../src/sdk/types.ts';

/*
 * The most important test of Mode Studio: hundreds of random valid blueprints played to the end
 * with bots. Every game must finish inside its own time limit without an error, scores stay
 * finite, no view holds an answer or another player's private state, and invalid blueprints are
 * refused with messages a person can act on.
 */

const ROW_KEYS = new Set(['playerId', 'name', 'teamId', 'score', 'lives', 'out', 'place']);
const PRIVATE_KEYS = ['grid', 'power', 'shield', 'double', 'frozen', 'picks', 'feedback', 'question'];

/** Walks a view for private keys outside `you`, and checks what `you` shows of the grid. */
function privateLeaks(view: MadeView, viewer: Viewer, state: { players: Record<string, { opened: boolean[] | null }> }): string[] {
  const out: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (!v || typeof v !== 'object') return;
    for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
      if (path === 'view' && key === 'you') continue;
      if (path === 'view' && key === 'game') continue;
      if (path === 'view' && key === 'sync') continue;
      if (PRIVATE_KEYS.includes(key)) out.push(`${path}.${key}`);
      walk(val, `${path}.${key}`);
    }
  };
  walk(view, 'view');
  for (const r of view.rows) for (const key of Object.keys(r)) if (!ROW_KEYS.has(key)) out.push(`row.${key}`);
  if (viewer.kind === 'host' && view.you) out.push('host has you');
  if (viewer.kind === 'player' && view.you?.grid) {
    const opened = state.players[viewer.playerId]?.opened ?? [];
    view.you.grid.forEach((v, i) => {
      if (!opened[i] && v !== null) out.push(`unopened square ${i} shown`);
    });
  }
  return out;
}

function checked(bp: Blueprint, problems: string[]): GameMode {
  const mode = blueprintMode(bp);
  return {
    ...mode,
    view(s, viewer, ctx) {
      const v = mode.view(s, viewer, ctx) as MadeView;
      for (const p of privateLeaks(v, viewer, s)) problems.push(p);
      for (const r of v.rows) if (!Number.isFinite(r.score)) problems.push(`row score ${r.score}`);
      if (v.you && !Number.isFinite(v.you.score)) problems.push('your score not finite');
      return v;
    },
  };
}

const GAMES = 400;

describe('made games: random blueprints played to the end', () => {
  it(`plays ${GAMES} random valid blueprints with bots, inside their time limits, with no leaks`, () => {
    const rng = createRng(20261112);
    const failures: string[] = [];
    const kinds = new Map<string, number>();
    let played = 0;
    let actions = 0;
    for (let i = 0; i < GAMES; i++) {
      const raw = randomBlueprint(rng);
      const parsed = parseBlueprint(raw);
      if (!parsed.ok) {
        failures.push(`#${i} refused: ${parsed.problems.map((p) => p.message).join(' / ')}`);
        continue;
      }
      const bp = parsed.blueprint;
      const problems: string[] = [];
      const players = rng.pick([1, 2, 3, 5, 8, 12]);
      const teams = bp.kind.type !== 'build' && rng.chance(0.3) ? rng.int(2, 3) : 0;
      const r = simulateGame({
        modeId: 'made-game',
        mode: checked(bp, problems),
        questions: rng.chance(0.15) ? FLASHCARD_SET : MIXED_SET,
        players,
        skill: rng.next(),
        seed: rng.int(1, 1e9),
        common: { teamCount: teams, shuffleQuestions: rng.chance(0.5) },
        churn: rng.chance(0.4),
        pauseAt: rng.chance(0.3) ? 15_000 : undefined,
        maxGameMs: bp.end.timeLimitSec * 1000 + 60_000,
      });
      played++;
      actions += r.actions;
      kinds.set(`${bp.kind.type}/${bp.pacing}`, (kinds.get(`${bp.kind.type}/${bp.pacing}`) ?? 0) + 1);
      const label = `#${i} ${bp.kind.type} ${bp.pacing} ${bp.end.type} (${players} players)`;
      if (r.errors.length) failures.push(`${label}: error ${String((r.errors[0]!.error as Error)?.message ?? r.errors[0]!.error)}`);
      if (r.stalled) failures.push(`${label}: did not finish`);
      if (r.gameMs > bp.end.timeLimitSec * 1000 + 1000) failures.push(`${label}: ran ${r.gameMs} ms, limit ${bp.end.timeLimitSec}s`);
      if (r.leaks.length) failures.push(`${label}: answer leak ${r.leaks[0]}`);
      if (problems.length) failures.push(`${label}: ${[...new Set(problems)].slice(0, 3).join(', ')}`);
      if (!r.results) failures.push(`${label}: no results`);
      for (const s of r.results?.standings ?? []) if (!Number.isFinite(s.score)) failures.push(`${label}: standing ${s.score}`);
    }
    expect(failures.slice(0, 15)).toEqual([]);
    expect(played).toBe(GAMES);
    // Every kind was played in both pacings, and the bots really played.
    expect(kinds.size).toBe(14);
    expect(actions).toBeGreaterThan(GAMES * 5);
  }, 600_000);

  it('plays every starting point with 1, 4 and 12 players, the same way twice from one seed', () => {
    for (const { id, blueprint } of STARTER_BLUEPRINTS) {
      expect(parseBlueprint(blueprint), id).toMatchObject({ ok: true });
      for (const players of [1, 4, 12]) {
        const run = () => simulateGame({ modeId: 'made-game', mode: blueprintMode(blueprint), questions: MIXED_SET, players, seed: 77, churn: players > 1 });
        const a = run();
        expect(a.errors, `${id} ${players}`).toEqual([]);
        expect(a.stalled, `${id} ${players}`).toBe(false);
        expect(a.leaks).toEqual([]);
        const b = run();
        expect(b.results?.standings.map((s) => [s.playerId, s.score])).toEqual(a.results?.standings.map((s) => [s.playerId, s.score]));
      }
    }
  }, 120_000);
});

describe('made games with practice bots that have minds', () => {
  it('a mixed class plays every starting point to the end, using power-ups and squares through the mind', () => {
    for (const { id, blueprint } of STARTER_BLUEPRINTS) {
      const r = simulateMinded({ modeId: 'made-game', mode: blueprintMode(blueprint), questions: MIXED_SET, level: 'mixed', players: 4, seed: 9 });
      expect(r.errors, id).toEqual([]);
      expect(r.stalled, id).toBe(false);
      expect(r.leaks, id).toEqual([]);
      expect(r.actions, id).toBeGreaterThan(4);
    }
  }, 120_000);
});

describe('made games: invalid blueprints are refused in words', () => {
  it('refuses each broken blueprint with a message that says what to change', () => {
    const rng = createRng(5);
    for (let i = 0; i < 60; i++) {
      const base = randomBlueprint(rng);
      for (const b of BREAKERS) {
        const r = parseBlueprint(b.apply(base));
        expect(r.ok, `${b.what} was accepted`).toBe(false);
        if (r.ok) continue;
        for (const p of r.problems) {
          expect(p.message.length, b.what).toBeGreaterThan(10);
          // Never zod's own words or a stack: a sentence for a person.
          expect(p.message, b.what).not.toMatch(/^(Invalid|Expected|Too (small|big))|undefined|\[object/);
          expect(p.message, b.what).toMatch(/[.]$/);
        }
      }
    }
  });
});
