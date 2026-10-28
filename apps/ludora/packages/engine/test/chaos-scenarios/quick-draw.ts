import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Pre, Post, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for quick-draw cheats. See chaos-scenarios.ts for what each field does. */

type Sync = { phase: string; iid: string | null; answers: Record<string, unknown>; deadline: number };
const syncOf = (sim: ChaosSim) => (sim.state() as { sync: Sync }).sync;

/** Play on in small steps until a question is open that `ok` accepts, with a few seconds still on its clock. */
function until(sim: ChaosSim, ok: (s: Sync) => boolean): boolean {
  for (let t = 0; t < 90_000 && sim.rt.status === 'running'; t += 50) {
    const s = syncOf(sim);
    if (s.phase === 'question' && s.iid && s.deadline - sim.now > 4000 && ok(s)) return true;
    sim.run(50);
  }
  return false;
}

/** `id` answers the next question they can, wrong. */
function missAs(sim: ChaosSim, id: string, ok: (s: Sync) => boolean = (s) => !s.answers[id]) {
  if (until(sim, ok)) sim.rt.act(id, { type: 'answer', iid: syncOf(sim).iid, answer: { type: 'short', text: 'not the answer' } });
}

/** The target answers wrong while the effect runs. */
const targetMisses: Post = (sim, _caster, _def, target) => {
  if (target) missAs(sim, target);
};

/** A teammate of the caster answers wrong while the caster has not answered yet, locking the team out (One Voice). */
const mateMisses: Pre = (sim, caster) => {
  const team = sim.rt.playerList().find((p) => p.id === caster)?.teamId;
  const mate = sim.rt.playerList().find((p) => p.id !== caster && p.teamId === team)?.id;
  if (mate) missAs(sim, mate, (s) => !s.answers[mate] && !s.answers[caster]);
};

export const scenarios: ScenarioSet = {
  settings: { 'quick-draw': [{ teamTry: true }] },
  pre: {
    'quick-draw.reholster': (sim, caster) => missAs(sim, caster),
    'quick-draw.posse-pardon': mateMisses,
  },
  post: {
    'quick-draw.shaky-trigger': targetMisses,
    'quick-draw.buzzard-bounty': targetMisses,
  },
};
