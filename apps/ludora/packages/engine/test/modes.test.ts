import { describe, expect, it } from 'vitest';
import { MODES, VARIANTS } from '../src/modes/index.ts';
import { CATALOG } from '../src/catalog.ts';
import { simulateGame } from '../src/testing/harness.ts';
import { MIXED_SET, FLASHCARD_SET } from '../src/testing/fixtures.ts';

/*
 * The conformance suite: every playable mode and variant must launch, play
 * to the end with bots and produce results, without errors or answer leaks.
 */

const playable = MODES.filter((m) => m.meta.status !== 'planned');

describe('catalogue', () => {
  it('lists exactly the modes that have logic, with unique ids', () => {
    expect(CATALOG.map((c) => c.meta.id).sort()).toEqual(MODES.map((m) => m.meta.id).sort());
    const ids = [...MODES.map((m) => m.meta.id), ...VARIANTS.map((v) => v.meta.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('gives every mode the metadata the catalogue needs', () => {
    for (const m of MODES) {
      expect(m.meta.title.length, m.meta.id).toBeGreaterThan(2);
      expect(m.meta.description.length, m.meta.id).toBeGreaterThan(40);
      expect(m.meta.rules.length, m.meta.id).toBeGreaterThan(1);
      expect(m.meta.players.min).toBeLessThanOrEqual(m.meta.players.max);
      expect(m.meta.questionTypes.length).toBeGreaterThan(0);
    }
    for (const v of VARIANTS) expect(MODES.some((m) => m.meta.id === v.meta.modeId), v.meta.id).toBe(true);
  });
});

for (const mode of playable) {
  describe(`mode: ${mode.meta.title}`, () => {
    const counts = [...new Set([mode.meta.players.min, Math.min(4, mode.meta.players.max), Math.min(12, mode.meta.players.max)])];
    for (const players of counts) {
      it(`plays to the end with ${players} player${players === 1 ? '' : 's'}`, () => {
        const r = simulateGame({ modeId: mode.meta.id, questions: MIXED_SET, players, seed: players * 31 });
        expect(r.errors.map((e) => `${e.where}: ${String(e.error)}`)).toEqual([]);
        expect(r.stalled).toBe(false);
        expect(r.leaks).toEqual([]);
        expect(r.results?.standings).toHaveLength(players);
        expect(r.results?.standings[0]?.rank).toBe(1);
        expect(r.results?.endedBy).toBe('mode');
      });
    }
    it('survives pauses, disconnects, a late joiner and a player leaving', () => {
      const r = simulateGame({ modeId: mode.meta.id, questions: MIXED_SET, players: Math.min(6, mode.meta.players.max), seed: 77, churn: true, pauseAt: 15_000 });
      expect(r.errors.map((e) => `${e.where}: ${String(e.error)}`)).toEqual([]);
      expect(r.stalled).toBe(false);
      expect(r.leaks).toEqual([]);
    });
    it('plays a flashcard-only set after adapting it', () => {
      const r = simulateGame({ modeId: mode.meta.id, questions: FLASHCARD_SET, players: Math.min(3, mode.meta.players.max), seed: 5 });
      expect(r.errors).toEqual([]);
      expect(r.stalled).toBe(false);
    });
    if (mode.meta.teams !== 'none') {
      it('plays with teams', () => {
        const r = simulateGame({ modeId: mode.meta.id, questions: MIXED_SET, players: 6, common: { teamCount: 2 }, seed: 11 });
        expect(r.errors).toEqual([]);
        expect(r.stalled).toBe(false);
        expect(r.results?.teamStandings).toHaveLength(2);
      });
    }
    it('plays the same way twice with the same seed', () => {
      const a = simulateGame({ modeId: mode.meta.id, questions: MIXED_SET, players: 3, seed: 99 });
      const b = simulateGame({ modeId: mode.meta.id, questions: MIXED_SET, players: 3, seed: 99 });
      expect(a.results?.standings.map((s) => [s.playerId, s.score])).toEqual(b.results?.standings.map((s) => [s.playerId, s.score]));
    });
  });
}

for (const variant of VARIANTS.filter((v) => v.meta.status !== 'planned')) {
  it(`variant: ${variant.meta.title} plays to the end`, () => {
    const mode = MODES.find((m) => m.meta.id === variant.meta.modeId)!;
    const r = simulateGame({ modeId: mode.meta.id, variantId: variant.meta.id, questions: MIXED_SET, players: Math.min(5, mode.meta.players.max), seed: 3 });
    expect(r.errors.map((e) => `${e.where}: ${String(e.error)}`)).toEqual([]);
    expect(r.stalled).toBe(false);
    expect(r.leaks).toEqual([]);
  });
}
