import { describe, expect, it } from 'vitest';
import { COMMON_FIELDS } from '@ludora/shared';
import { MODES, VARIANTS } from '../src/modes/index.ts';
import { parseSettings } from '../src/sdk/settings.ts';
import { simulateGame, type SimulateResult } from '../src/testing/harness.ts';
import { FLASHCARD_SET, MIXED_SET } from '../src/testing/fixtures.ts';

/*
 * Every variant in the catalogue, beyond the five-player run in
 * modes.test.ts: it must play with the fewest players its mode allows (one,
 * for every mode that can be played solo), survive a pause, a disconnect, a
 * late joiner and a leaver on a flashcard-only set, and replay identically
 * from the same seed. Its metadata must describe a real preset.
 */

const playable = VARIANTS.filter((v) => v.meta.status !== 'planned');
const modeOf = (modeId: string) => MODES.find((m) => m.meta.id === modeId)!;
const problems = (r: SimulateResult) => r.errors.map((e) => `${e.where}: ${String(e.error)}`);

describe('variant metadata', () => {
  it('has unique ids and titles, and ids that start with the mode id', () => {
    const ids = [...MODES.map((m) => m.meta.id), ...VARIANTS.map((v) => v.meta.id)];
    expect(new Set(ids).size).toBe(ids.length);
    const titles = [...MODES.map((m) => m.meta.title), ...VARIANTS.map((v) => v.meta.title)];
    expect(titles.filter((t, i) => titles.indexOf(t) !== i)).toEqual([]);
    for (const v of VARIANTS) expect(v.meta.id.startsWith(`${v.meta.modeId}-`), v.meta.id).toBe(true);
  });

  it('says what changes and presets only settings the mode has', () => {
    for (const v of VARIANTS) {
      const mode = modeOf(v.meta.modeId);
      expect(v.meta.changes.length, v.meta.id).toBeGreaterThan(40);
      expect(v.meta.tagline.length, v.meta.id).toBeGreaterThan(10);
      const keys = new Set(mode.settings.map((f) => f.key));
      for (const k of Object.keys(v.settings ?? {})) expect(keys.has(k), `${v.meta.id} presets ${k}`).toBe(true);
      for (const k of v.locked ?? []) {
        const common = (COMMON_FIELDS as readonly string[]).includes(k);
        expect(keys.has(k) || (common && mode.meta.common.fields.includes(k as never)), `${v.meta.id} locks ${k}`).toBe(true);
        expect(k in (v.settings ?? {}) || k in (v.common ?? {}), `${v.meta.id} locks ${k} without presetting it`).toBe(true);
      }
      // Presets survive the same clamping the server applies.
      expect(parseSettings(mode.settings, v.settings), v.meta.id).toMatchObject(v.settings ?? {});
    }
  });

  it('changes at least one rule: every variant presets a setting that differs from the mode default', () => {
    for (const v of VARIANTS) {
      const mode = modeOf(v.meta.modeId);
      const defaults = parseSettings(mode.settings, {});
      const changed = Object.entries(v.settings ?? {}).filter(([k, value]) => defaults[k] !== value);
      // Team Classic is the one variant that is only a team split.
      const teamsOnly = (v.common?.teamCount ?? 0) >= 2 && !changed.length;
      expect(changed.length > 0 || teamsOnly, v.meta.id).toBe(true);
    }
  });
});

for (const v of playable) {
  const mode = modeOf(v.meta.modeId);
  const min = mode.meta.players.min;
  describe(`variant: ${v.meta.title} (${v.meta.id})`, () => {
    it(`plays to the end with ${min} player${min === 1 ? '' : 's'}`, () => {
      const r = simulateGame({ modeId: mode.meta.id, variantId: v.meta.id, questions: MIXED_SET, players: min, seed: 23 });
      expect(problems(r)).toEqual([]);
      expect(r.stalled).toBe(false);
      expect(r.leaks).toEqual([]);
      expect(r.results?.endedBy).toBe('mode');
      expect(r.results?.standings).toHaveLength(min);
    });

    it('survives churn on a flashcard-only set', () => {
      const r = simulateGame({ modeId: mode.meta.id, variantId: v.meta.id, questions: FLASHCARD_SET, players: Math.min(4, mode.meta.players.max), seed: 41, churn: true, pauseAt: 15_000 });
      expect(problems(r)).toEqual([]);
      expect(r.stalled).toBe(false);
      expect(r.leaks).toEqual([]);
    });

    it('plays the same way twice with the same seed', () => {
      const players = Math.min(3, mode.meta.players.max);
      const a = simulateGame({ modeId: mode.meta.id, variantId: v.meta.id, questions: MIXED_SET, players, seed: 57 });
      const b = simulateGame({ modeId: mode.meta.id, variantId: v.meta.id, questions: MIXED_SET, players, seed: 57 });
      expect(a.results?.standings.map((s) => [s.playerId, s.score, s.label])).toEqual(b.results?.standings.map((s) => [s.playerId, s.score, s.label]));
      expect(a.results?.summary).toBe(b.results?.summary);
      expect(a.gameMs).toBe(b.gameMs);
    });
  });
}
