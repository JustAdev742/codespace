import { commonSettingsSchema, createRng, type Rng } from '@ludora/shared';
import { GameRuntime } from '../src/runtime/runtime.ts';
import { parseSettings } from '../src/sdk/settings.ts';
import { prepareQuestions } from '../src/registry.ts';
import { makeTeams } from '../src/teams.ts';
import { glimGarden } from '../src/modes/glim-garden/index.ts';
import { variants, type Kind } from '../src/modes/glim-garden/meta.ts';
import { TRUE_SET } from './rule-helpers.ts';

/*
 * Glim Garden's numbers, measured: seeded classes of bot gardeners play whole
 * games with a chosen way of playing, at the pace of real pupils (a young
 * class reads slowly and answers fewer right). Used by the rule tests and by
 * the measured results in docs/features/garden.md.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Strategy = 'sensible' | 'flowers' | 'bushes' | 'trees' | 'selfish' | 'givers';
export type Pace = 'young' | 'older';

export interface SimClass {
  players: number;
  strategy?: Strategy | ((i: number) => Strategy);
  pace?: Pace;
  seed?: number;
  settings?: Record<string, unknown>;
  variant?: string;
  teams?: number;
  timeLimitSec?: number;
}

export interface SimOutcome {
  fireflies: number;
  glowing: number;
  /** Plots glowing after 5 minutes. */
  at300: number;
  goal: number;
  full: boolean;
  /** Game seconds when the (last) garden filled, or null. */
  fullAt: number | null;
  gameSec: number;
  drops: { plant: Record<Kind, number>; water: number; give: number };
  blooms: Record<Kind, number>;
  points: Record<string, number>;
  strategyOf: Record<string, Strategy>;
  outcome: string | undefined;
}

const PACE: Record<Pace, { skill: number; think: [number, number] }> = {
  // Five- and six-year-olds: slow to read, often helped, right a little over half the time.
  young: { skill: 0.6, think: [12_000, 26_000] },
  older: { skill: 0.8, think: [5_000, 13_000] },
};

function decide(v: any, me: string, strategy: Strategy, rng: Rng, now: number): any {
  const you = v.you;
  if (!you || you.drops <= 0) return null;
  if (strategy === 'sensible') return 'bot';
  const giftTo = you.giftTo as { id: string; why: string }[];
  const kind: Kind = strategy === 'flowers' ? 'flower' : strategy === 'trees' ? 'tree' : 'bush';
  if (strategy === 'givers') {
    if (giftTo.length) return { type: 'give', to: giftTo[0]!.id };
    if (you.canPlant) return { type: 'plant', kind: 'bush' };
    if (you.canWater) return { type: 'water' };
    return null;
  }
  // Growers (and the selfish) look after their own plot only.
  void me;
  void rng;
  void now;
  if (you.canPlant) return { type: 'plant', kind: strategy === 'selfish' ? 'bush' : kind };
  if (you.canWater) return { type: 'water' };
  return null;
}

export function simulateGarden(c: SimClass): SimOutcome {
  const seed = c.seed ?? 1;
  const pace = PACE[c.pace ?? 'older'];
  const variant = c.variant ? variants.find((v) => v.meta.id === c.variant)! : null;
  const common = commonSettingsSchema.parse({ ...glimGarden.defaults, ...variant?.common, teamCount: c.teams ?? variant?.common?.teamCount ?? 0, ...(c.timeLimitSec ? { timeLimitSec: c.timeLimitSec } : {}) });
  const settings = parseSettings(glimGarden.settings, { ...variant?.settings, ...c.settings });
  const teams = makeTeams(common.teamCount);
  const players = Array.from({ length: c.players }, (_, i) => ({ id: `p${String(i + 1).padStart(2, '0')}`, name: `Gardener ${i + 1}`, teamId: teams.length ? teams[i % teams.length]!.id : null, isBot: true }));
  const strategyOf: Record<string, Strategy> = {};
  players.forEach((p, i) => (strategyOf[p.id] = typeof c.strategy === 'function' ? c.strategy(i) : (c.strategy ?? 'sensible')));
  let t = 1_000_000;
  const rt = new GameRuntime({ mode: glimGarden, settings, common, questions: prepareQuestions(glimGarden, TRUE_SET, seed).questions, players, teams, seed, clock: { now: () => t }, strict: true, listener: {} });
  rt.start();
  const rng = createRng(seed * 31 + 5);
  const drops = { plant: { flower: 0, bush: 0, tree: 0 }, water: 0, give: 0 };
  const thinkMs = () => pace.think[0] + rng.int(0, pace.think[1] - pace.think[0]);
  const next = new Map(players.map((p) => [p.id, t + thinkMs()]));
  let fullAt: number | null = null;
  let at300 = 0;
  const limit = 40 * 60 * 1000;
  for (let guard = 0; rt.status === 'running' && guard < 500_000 && rt.gameNow() < limit; guard++) {
    const timerIn = rt.msUntilNextTimer();
    const nextT = Math.min(...next.values(), timerIn === null ? Infinity : t + timerIn);
    t = Math.max(t, nextT);
    rt.fireDueTimers();
    for (const p of players) {
      if (rt.status !== 'running') break;
      if (next.get(p.id)! > t) continue;
      const v: any = rt.view({ kind: 'player', playerId: p.id });
      let a = decide(v, p.id, strategyOf[p.id]!, rng, rt.gameNow());
      if (a === 'bot') a = rt.botAction(p.id, pace.skill, rng);
      if (a && a.type !== 'answer') {
        const r = rt.act(p.id, a);
        if (r.ok) {
          if (a.type === 'plant') drops.plant[a.kind as Kind]++;
          else if (a.type === 'water') drops.water++;
          else drops.give++;
        }
        next.set(p.id, t + 1200 + rng.int(0, 1200));
        continue;
      }
      const q = v.you?.question;
      // Every statement is true: a right answer is `true`, given with the class's skill.
      if (q) rt.act(p.id, { type: 'answer', iid: q.iid, answer: { type: 'truefalse', value: rng.next() < pace.skill } });
      next.set(p.id, t + thinkMs());
    }
    const st: any = rt.debugState();
    if (fullAt === null && st && st.gardens.every((g: any) => g.metAt !== null)) fullAt = rt.gameNow();
    if (rt.gameNow() <= 300_000) at300 = st.gardens.reduce((n: number, g: any) => n + g.glowing, 0);
  }
  const st: any = rt.debugState();
  if (rt.status === 'running') rt.end('host');
  const blooms = { flower: 0, bush: 0, tree: 0 };
  for (const p of Object.values(st.plots) as any[]) {
    blooms.flower += p.border[0];
    blooms.bush += p.border[1];
    blooms.tree += p.border[2];
  }
  const points: Record<string, number> = {};
  for (const [id, f] of Object.entries(st.folk) as [string, any][]) points[id] = f.points;
  return {
    at300,
    fireflies: st.gardens.reduce((n: number, g: any) => n + g.fireflies, 0),
    glowing: st.gardens.reduce((n: number, g: any) => n + g.glowing, 0),
    goal: st.gardens.reduce((n: number, g: any) => n + g.goal, 0),
    full: st.gardens.every((g: any) => g.metAt !== null),
    fullAt: fullAt === null ? null : Math.round(fullAt / 1000),
    gameSec: Math.round(rt.gameNow() / 1000),
    drops,
    blooms,
    points,
    strategyOf,
    outcome: rt.results?.outcome,
  };
}
