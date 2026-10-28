import { createRng } from '@ludora/shared';
import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for survival-run cheats. See chaos-scenarios.ts for what each field does. */

/** The runner answers now, right (skill 1) or wrong (skill 0), first moving on from a result screen if they are on one. */
export function runnerAnswers(sim: ChaosSim, id: string, right: boolean) {
  for (let i = 0; i < 2; i++) {
    if (sim.rt.status !== 'running' || !sim.rt.hasPlayer(id)) return;
    const action = sim.rt.botAction(id, right ? 1 : 0, createRng(23)) as { type?: string } | null;
    if (!action) return;
    sim.rt.act(id, action);
    if (action.type === 'answer') return;
  }
}

// Defined here, not imported: chaos-scenarios.ts loads this file while it is still loading itself.
const idleTarget: Post = (sim, _caster, _def, target) => void (target && sim.idle.add(target));
const casterRight: Post = (sim, caster) => runnerAnswers(sim, caster, true);
const casterWrong: Post = (sim, caster) => runnerAnswers(sim, caster, false);
const targetWrong: Post = (sim, _caster, _def, target) => target && runnerAnswers(sim, target, false);

const runner = (sim: ChaosSim, id: string) => (sim.state() as { runners: Record<string, { hearts: number; phase: string; stream: { correct: number } }> }).runners[id];
const running = (sim: ChaosSim, id: string) => sim.rt.status === 'running' && sim.rt.hasPlayer(id) && runner(sim, id)?.phase !== 'over';
/** The runner gives up a heart to a wrong answer if they have every heart and one to spare, so they have room for one. */
function makeRoom(sim: ChaosSim, id: string) {
  const r = runner(sim, id);
  const most = Math.max(Number(sim.rt.settings.hearts), Number(sim.rt.settings.heartCap));
  if (running(sim, id) && r && r.hearts >= most && r.hearts >= 2) runnerAnswers(sim, id, false);
}
const casterMakesRoom: Pre = (sim, caster) => makeRoom(sim, caster);
/** Every other runner misses once (if they can spare a heart): with second wind on, each then has a question waiting to come back. */
const othersMiss: Pre = (sim, caster) => {
  for (const id of sim.ids) if (id !== caster && running(sim, id) && runner(sim, id)!.hearts >= 2) runnerAnswers(sim, id, false);
};
/** The caster misses until they are down to their last heart. */
const casterToLastHeart: Pre = (sim, caster) => {
  for (let i = 0; i < 5 && running(sim, caster) && runner(sim, caster)!.hearts > 1; i++) runnerAnswers(sim, caster, false);
};
/** The target loses a heart if they have them all, then answers right until the run restores one. */
const targetEarnsRestore: Post = (sim, _caster, _def, target) => {
  if (!target) return;
  makeRoom(sim, target);
  for (let i = 0; i < 12 && running(sim, target); i++) {
    runnerAnswers(sim, target, true);
    if (runner(sim, target)!.stream.correct % 10 === 0) return;
  }
};

export const scenarios: ScenarioSet = {
  // Second wind is a run setting.
  settings: { 'survival-run': [{ secondWind: true }] },
  pre: {
    'survival-run.second-wind-swipe': othersMiss,
    'survival-run.heart-gift': othersMiss,
    'survival-run.heart-loan': casterMakesRoom,
    'survival-run.heart-shop': casterMakesRoom,
    'survival-run.heartstrings': casterMakesRoom,
    'survival-run.heart-duel': casterMakesRoom,
    'survival-run.safety-rope': casterToLastHeart,
  },
  post: {
    'survival-run.guardian-heart': casterWrong,
    'survival-run.lifesteal': casterRight,
    'survival-run.last-stand': casterRight,
    'survival-run.glass-heart': targetWrong,
    'survival-run.ticking-heart': idleTarget,
    'survival-run.heart-seal': targetEarnsRestore,
    'survival-run.heartstrings': targetWrong,
    'survival-run.heart-duel': casterRight,
    'survival-run.safety-rope': casterWrong,
    'survival-run.tempo-lock': casterRight,
  },
};
