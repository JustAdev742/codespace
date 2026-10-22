import { describe, expect, it } from 'vitest';
import { CATALOG, soloBlocker, teamsOnly } from '../src/catalog.ts';
import { resolveGameConfig } from '../src/registry.ts';

/*
 * soloBlocker decides what can be played alone: solo rooms, class assignments and
 * the assignment picker all use it. Team games need several players, so a mode
 * or variant the engine always splits into teams must be refused.
 */
const choices = CATALOG.flatMap((m) => [{ mode: m, variant: null }, ...m.variants.map((v) => ({ mode: m, variant: v }))]);

describe('playing alone', () => {
  it('refuses the team variants', () => {
    const teamVariants = [
      ['classic', 'classic-teams'],
      ['classic', 'classic-in-unison'],
      ['quick-draw', 'quick-draw-one-voice'],
      ['lantern-out', 'lantern-out-last-team'],
    ] as const;
    for (const [modeId, id] of teamVariants) expect(soloBlocker(modeId, id), id).toMatch(/is played in teams/);
  });

  it('marks as team-only exactly the modes and variants the engine always puts into teams', () => {
    for (const { mode, variant } of choices) {
      // The host asks for no teams; only the mode or variant can turn them on.
      const resolved = resolveGameConfig({ modeId: mode.meta.id, variantId: variant?.meta.id ?? null, common: { teamCount: 0 } });
      expect(resolved.ok).toBe(true);
      const teams = resolved.ok ? resolved.value.common.teamCount : 0;
      expect(teamsOnly(mode, variant), variant?.meta.id ?? mode.meta.id).toBe(teams > 0);
    }
  });

  it('never lets a team game through, and still allows the rest', () => {
    for (const { mode, variant } of choices) {
      const blocker = soloBlocker(mode.meta.id, variant?.meta.id ?? null);
      if (teamsOnly(mode, variant)) expect(blocker, variant?.meta.id ?? mode.meta.id).not.toBeNull();
    }
    expect(soloBlocker('classic', null)).toBeNull();
    expect(soloBlocker('classic', 'classic-lightning')).toBeNull();
    expect(soloBlocker('quick-draw', 'quick-draw-steady')).toBeNull();
    expect(soloBlocker('lantern-out', 'lantern-out-night-vigil')).toBeNull();
    expect(soloBlocker('comet-dash', null)).toBeNull();
    // The other reasons still apply.
    expect(soloBlocker('tug-of-war', null)).toMatch(/needs several players/);
    expect(soloBlocker('classic', 'classic-discussion')).toMatch(/waits for a host/);
    expect(soloBlocker('classic', null, { autoAdvance: false })).toMatch(/waits for a host/);
  });
});
