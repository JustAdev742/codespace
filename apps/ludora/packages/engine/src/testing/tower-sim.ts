import { createRng, type Rng } from '@ludora/shared';
import { GameRuntime } from '../runtime/runtime.ts';
import { prepareQuestions } from '../registry.ts';
import { parseSettings } from '../sdk/settings.ts';
import { commonSettingsSchema } from '@ludora/shared';
import { makeTeams } from '../teams.ts';
import { choosePiece, towerTogether } from '../modes/tower-together/index.ts';
import type { PieceKind } from '../modes/tower-together/meta.ts';
import { MIXED_SET } from './fixtures.ts';

/*
 * Tower Together's balance check: seeded classes of bots that all play one way
 * (read the gauge, ignore it, or always place the same piece) build a tower
 * through a whole night, so the target and the numbers can be measured.
 * Used by the rules test (small samples) and `scripts/tower-sim.ts` (the
 * figures in docs/features/tower.md).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Strategy = 'sensible' | 'random' | 'timber' | 'stone' | 'greedy' | 'height';

/** How a class that plays one way picks a piece, from what every player sees. */
function pick(strategy: Strategy, view: any, rng: Rng): PieceKind | null {
  const ok = (k: PieceKind) => view.you.effects.find((e: any) => e.kind === k)?.ok === true;
  const first = (...ks: PieceKind[]) => ks.find(ok) ?? null;
  switch (strategy) {
    case 'sensible':
      return choosePiece(view, rng.next());
    case 'random': {
      // Ignores the gauge and the wind: any piece, at random.
      const ks = (['timber', 'stone', 'lantern'] as const).filter(ok);
      return ks.length ? ks[rng.int(0, ks.length - 1)]! : null;
    }
    case 'timber':
      return first('timber', 'stone');
    case 'stone':
      return first('stone');
    case 'greedy':
      // Ignores the gauge: timber for height, and a brace whenever one fits.
      return first('lantern', 'timber', 'stone');
    case 'height':
      // Ignores the gauge: mostly timber, some stone and braces, never timed.
      return rng.next() < 0.2 ? first('lantern', 'stone') : rng.next() < 0.7 ? first('timber', 'stone') : first('stone');
  }
}

export interface SimOutcome {
  height: number;
  target: number;
  stars: number;
  falls: number;
  fallen: number;
  pieces: number;
  won: boolean;
  /** Pieces of each kind placed by the class. */
  placed: Record<PieceKind, number>;
}

/**
 * One night with `players` bots playing `strategy`, answering right `skill` of
 * the time at the pace of the mode's practice bots.
 */
export function simulateTower(o: { players: number; strategy: Strategy; seed: number; skill?: number; settings?: Record<string, unknown>; common?: Record<string, unknown> }): SimOutcome {
  const settings = parseSettings(towerTogether.settings, o.settings ?? {});
  const common = commonSettingsSchema.parse({ ...towerTogether.defaults, ...o.common });
  const teams = makeTeams(common.teamCount);
  const prepared = prepareQuestions(towerTogether, MIXED_SET.filter((q) => q.type !== 'flashcard'), o.seed);
  const players = Array.from({ length: o.players }, (_, i) => ({ id: `p${i + 1}`, name: `Bot ${i + 1}`, teamId: teams.length ? teams[i % teams.length]!.id : null, isBot: true }));
  let t = 1_000_000;
  const rt = new GameRuntime({ mode: towerTogether, settings, common, questions: prepared.questions, players, teams, seed: o.seed, clock: { now: () => t }, strict: true });
  const rng = createRng(o.seed * 31 + 7);
  const skill = o.skill ?? 0.7;
  if (!rt.start().ok) throw new Error('did not start');
  const next = new Map(players.map((p) => [p.id, t + rt.botDelay(p.id, rng)]));
  for (let guard = 0; rt.status !== 'ended' && guard < 2_000_000; guard++) {
    const timerIn = rt.msUntilNextTimer();
    const at = Math.min(...next.values(), timerIn === null ? Infinity : t + timerIn);
    t = Math.max(t, at);
    rt.fireDueTimers();
    for (const p of players) {
      if (rt.status !== 'running') break;
      if (next.get(p.id)! > t) continue;
      const view: any = rt.view({ kind: 'player', playerId: p.id });
      let a: unknown = null;
      if (view?.you?.held > 0) {
        const kind = pick(o.strategy, view, rng);
        if (kind) a = { type: 'place', kind };
      }
      if (!a && view?.you?.question) a = rt.botAction(p.id, skill, rng);
      if (a && (a as { type: string }).type === 'place' && view?.you?.held === 0) a = null;
      if (a) rt.act(p.id, a);
      next.set(p.id, t + rt.botDelay(p.id, rng));
    }
  }
  const s: any = rt.debugState();
  const tower = Object.values(s.towers)[0] as any;
  const placed = { timber: 0, stone: 0, lantern: 0 };
  for (const b of Object.values(s.builders) as any[]) for (const k of ['timber', 'stone', 'lantern'] as const) placed[k] += b.placed[k];
  const steps = [1, 1.25, 1.5].map((k) => Math.ceil(tower.target * k));
  return {
    height: tower.height,
    target: tower.target,
    stars: steps.filter((x) => tower.height >= x).length,
    falls: tower.falls,
    fallen: tower.fallen,
    pieces: placed.timber + placed.stone + placed.lantern,
    won: tower.height >= tower.target,
    placed,
  };
}

/** Many seeded nights of one class size and strategy, summed up. */
export function sampleTower(o: { players: number; strategy: Strategy; seeds: number; firstSeed?: number; skill?: number; settings?: Record<string, unknown> }) {
  const runs: SimOutcome[] = [];
  for (let i = 0; i < o.seeds; i++) runs.push(simulateTower({ ...o, seed: (o.firstSeed ?? 1) + i }));
  const mean = (f: (r: SimOutcome) => number) => runs.reduce((n, r) => n + f(r), 0) / runs.length;
  return {
    runs,
    winRate: mean((r) => (r.won ? 1 : 0)),
    meanShare: mean((r) => r.height / r.target),
    meanStars: mean((r) => r.stars),
    meanFalls: mean((r) => r.falls),
    meanPieces: mean((r) => r.pieces),
    target: runs[0]!.target,
  };
}
