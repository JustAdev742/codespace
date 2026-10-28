import { fieldMeter } from './helpers.ts';
import type { ChaosAdapter } from '../types.ts';

export const lanternMatchAdapter: ChaosAdapter = {
  modeId: 'lantern-match',
  meters: [
    fieldMeter('score', 'Pairs', (s: any) => s.players, 'pairs'),
    // Misses break ties (fewer is better) and, with Careful Match, every few cost a pair.
    fieldMeter('misses', 'Misses', (s: any) => s.players, 'misses'),
  ],
  // 'fresh boards': clearing a board deals the next one. In Lantern Sprint clearing a board ends the game instead.
  // (The menu says why a cheat is missing as "this game has no <feature>".)
  features: (settings) => (settings.sprint ? ['cards'] : ['cards', 'fresh boards']),
};
