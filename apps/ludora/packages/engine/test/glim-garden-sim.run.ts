import { simulateGarden, type Pace, type Strategy } from './glim-garden-sim.ts';
const arg = process.argv[2] ?? 'goal';
const seeds = Array.from({ length: Number(process.env.SEEDS ?? 6) }, (_, i) => i + 1);
function row(label: string, f: (seed: number) => ReturnType<typeof simulateGarden>) {
  const rs = seeds.map(f);
  const full = rs.filter((r) => r.full).length;
  const at = rs.filter((r) => r.fullAt !== null).map((r) => r.fullAt!);
  const d = rs.reduce((a, r) => ({ p: a.p + r.drops.plant.flower + r.drops.plant.bush + r.drops.plant.tree, w: a.w + r.drops.water, g: a.g + r.drops.give }), { p: 0, w: 0, g: 0 });
  const tot = d.p + d.w + d.g || 1;
  const avg = (f: (r: (typeof rs)[number]) => number) => rs.reduce((n, r) => n + f(r), 0) / rs.length;
  const pts = avg((r) => Object.values(r.points).reduce((a, b) => a + b, 0) / Object.keys(r.points).length);
  console.log(`${label.padEnd(30)} goal ${String(rs[0]!.goal).padStart(3)} glow5m ${avg((r) => r.at300).toFixed(1).padStart(5)} glow ${avg((r) => r.glowing).toFixed(1).padStart(5)} ff ${avg((r) => r.fireflies).toFixed(0).padStart(4)} full ${full}/${rs.length} at ${at.length ? Math.round(at.reduce((a, b) => a + b, 0) / at.length) : '-'}s pts/player ${pts.toFixed(1)} plant ${Math.round((d.p / tot) * 100)}% water ${Math.round((d.w / tot) * 100)}% give ${Math.round((d.g / tot) * 100)}%`);
  return rs;
}
if (arg === 'goal') for (const pace of ['young', 'older'] as Pace[]) for (const n of [1, 5, 30, 60]) for (const size of (process.argv[3] ?? 'usual').split(',')) row(`${pace} ${n} ${size}`, (seed) => simulateGarden({ players: n, pace, seed, settings: { size } }));
if (arg === 'strat') {
  const S: Strategy[] = ['sensible', 'flowers', 'bushes', 'trees', 'selfish', 'givers'];
  for (const [label, base] of [['older 30, 6 min', { players: 30, pace: 'older' as Pace }], ['young 30, 6 min', { players: 30, pace: 'young' as Pace }], ['older solo, 6 min', { players: 1, pace: 'older' as Pace }], ['young solo, 6 min', { players: 1, pace: 'young' as Pace }]] as const)
    for (const s of S) row(`${label} ${s}`, (seed) => simulateGarden({ ...base, seed, strategy: s }));
}
if (arg === 'mixed') {
  // Half the class plays one way, half sensibly: who scores more, and does the class do better?
  for (const s of ['flowers', 'bushes', 'trees', 'selfish', 'givers'] as Strategy[]) {
    const rs = row(`older 30 half ${s}`, (seed) => simulateGarden({ players: 30, pace: 'older', seed, strategy: (i) => (i % 2 ? s : 'sensible') }));
    const by = (st: string) => rs.reduce((n, r) => n + Object.entries(r.points).filter(([id]) => r.strategyOf[id] === st).reduce((a, [, p]) => a + p, 0) / 15, 0) / rs.length;
    console.log(`   points: ${s} ${by(s).toFixed(1)}  sensible ${by('sensible').toFixed(1)}`);
  }
}
if (arg === 'big') for (const [pace, n] of [['older', 5], ['older', 30], ['older', 60], ['young', 30]] as const) row(`${pace} ${n} big`, (seed) => simulateGarden({ players: n, pace, seed, settings: { size: 'big' } }));
