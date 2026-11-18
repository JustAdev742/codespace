import { describe, expect, it } from 'vitest';
import { MODES } from '@ludora/engine';
import { TUTORIAL_LIMITS } from '@ludora/shared';
import { CALM_GENERAL, keyCodes, walkthroughSteps } from './walkthrough.ts';
import { SEEN_MAX, withSeen } from '../../lib/tutorials.ts';

const meta = (id: string) => MODES.find((m) => m.meta.id === id)!.meta;

describe('the walkthrough before a game', () => {
  it('is the mode’s own steps, its controls to try, and Ready', () => {
    const steps = walkthroughSteps({ meta: meta('lantern-rally'), calm: false });
    expect(steps.map((s) => s.kind)).toEqual(['rule', 'rule', 'rule', 'rule', 'controls', 'ready']);
    expect(steps[0]).toMatchObject({ title: 'Answer for boosts' });
    const controls = steps.find((s) => s.kind === 'controls');
    expect(controls?.kind === 'controls' && controls.controls.map((c) => c.label)).toEqual(['Steer left', 'Steer right', 'Boost', 'Auto-steer']);
  });

  it('is short for every mode: two to four steps before the extras', () => {
    for (const m of MODES) {
      const rules = walkthroughSteps({ meta: m.meta, calm: false }).filter((s) => s.kind === 'rule');
      expect(rules.length, m.meta.id).toBeGreaterThanOrEqual(TUTORIAL_LIMITS.minSteps);
      expect(rules.length, m.meta.id).toBeLessThanOrEqual(TUTORIAL_LIMITS.maxSteps);
    }
  });

  it('says what calm play changes in a calm room, and who chose it', () => {
    const rally = walkthroughSteps({ meta: meta('lantern-rally'), calm: true });
    const calm = rally.find((s) => s.kind === 'calm');
    expect(calm).toMatchObject({ title: 'Your teacher chose calm play', text: meta('lantern-rally').calmPlay });
    expect(walkthroughSteps({ meta: meta('classic'), calm: true, solo: true }).find((s) => s.kind === 'calm')).toMatchObject({ title: 'Calm play is on', text: CALM_GENERAL });
    expect(walkthroughSteps({ meta: meta('classic'), calm: false }).some((s) => s.kind === 'calm')).toBe(false);
  });

  it('says what a version changes', () => {
    const steps = walkthroughSteps({ meta: meta('classic'), variant: { title: 'Fading Lights', changes: 'Answers fade.' }, calm: false });
    expect(steps.find((s) => s.kind === 'version')).toMatchObject({ title: 'In Fading Lights', text: 'Answers fade.' });
  });

  it('makes steps for a game with no walkthrough of its own (a made game)', () => {
    const steps = walkthroughSteps({ meta: { title: 'My game', rules: ['Roll the dice. Then move.', 'Most coins wins.'] }, calm: false });
    expect(steps.map((s) => s.kind)).toEqual(['rule', 'rule', 'ready']);
  });

  it('reads the keys a control names', () => {
    expect(keyCodes('Left arrow')).toEqual(['ArrowLeft']);
    expect(keyCodes('B')).toEqual(['KeyB']);
    expect(keyCodes('Space')).toEqual(['Space']);
    expect(keyCodes('W, A, S, D or the arrow keys').sort()).toEqual(['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyA', 'KeyD', 'KeyS', 'KeyW']);
    expect(keyCodes(undefined)).toEqual([]);
  });
});

describe('walkthroughs seen', () => {
  it('adds each once, newest last, and keeps the newest few hundred', () => {
    expect(withSeen(['a', 'b'], 'a')).toEqual(['b', 'a']);
    expect(withSeen([], 'x')).toEqual(['x']);
    const many = Array.from({ length: SEEN_MAX }, (_, i) => `m${i}`);
    const next = withSeen(many, 'new');
    expect(next).toHaveLength(SEEN_MAX);
    expect(next.at(-1)).toBe('new');
    expect(next[0]).toBe('m1');
  });
});
