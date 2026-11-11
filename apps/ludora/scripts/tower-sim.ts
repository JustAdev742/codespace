/*
 * Tower Together's balance table: seeded bot classes of several sizes, each
 * playing one way through whole nights. Prints the share of nights that reach
 * the target and the average height against it. The figures in
 * docs/features/tower.md come from this.
 *
 *   npx tsx scripts/tower-sim.ts [seeds] [wind] [sizes]     (defaults: 40 normal 1,5,30,60)
 */
import { sampleTower, type Strategy } from '../packages/engine/src/testing/tower-sim.ts';

const seeds = Number(process.argv[2] ?? 40);
const wind = process.argv[3] ?? 'normal';
const strategies: Strategy[] = ['sensible', 'random', 'height', 'greedy', 'timber', 'stone'];
const sizes = (process.argv[4] ?? "1,5,30,60").split(",").map(Number);

console.log(`wind ${wind}, ${seeds} seeded nights each, bots right 70% of the time`);
console.log(['class', 'target', ...strategies.map((s) => s.padStart(18))].join(' '));
for (const n of sizes) {
  const cells: string[] = [];
  let target = 0;
  for (const strategy of strategies) {
    const r = sampleTower({ players: n, strategy, seeds: n >= 60 ? Math.max(6, Math.round(seeds / 5)) : n >= 30 ? Math.max(8, Math.round(seeds / 3)) : seeds, settings: { gusts: wind } });
    target = r.target;
    cells.push(`${String(Math.round(r.winRate * 100)).padStart(3)}% ${(r.meanShare * 100).toFixed(0).padStart(3)}% f${r.meanFalls.toFixed(1)}`.padStart(18));
  }
  console.log([String(n).padStart(5), String(target).padStart(6), ...cells].join(' '));
}
console.log('cells: nights reaching the target, mean height as a share of the target, mean falls');
