import { expect, it } from 'vitest';
import { simulateGame } from '../src/testing/harness.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { templateRace } from '../src/modes/_template/index.ts';

// Keeps the template honest: it is copied as the starting point for new modes.
it('the mode template plays to the end', () => {
  const r = simulateGame({ modeId: templateRace.meta.id, mode: templateRace, questions: MIXED_SET, players: 4, churn: true, pauseAt: 10_000 });
  expect(r.errors).toEqual([]);
  expect(r.stalled).toBe(false);
  expect(r.leaks).toEqual([]);
  expect(r.results?.standings).toHaveLength(5);
});
