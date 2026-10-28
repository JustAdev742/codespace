import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for confidence cheats. See chaos-scenarios.ts for what each field does. */

type State = { phase: string; iid: string | null; answers: Record<string, unknown>; wagers: Record<string, number>; deadline: number; phaseEndsAt: number | null; scores: Record<string, number> };
const stateOf = (sim: ChaosSim) => sim.state() as State;

/** Play on in small steps until `ok` holds, with at least `minLeft` ms left in the phase. */
function until(sim: ChaosSim, ok: (s: State) => boolean, minLeft = 2500): boolean {
  for (let t = 0; t < 120_000 && sim.rt.status === 'running'; t += 100) {
    const s = stateOf(sim);
    const ends = s.phase === 'question' ? s.deadline : (s.phaseEndsAt ?? Infinity);
    if (ends - sim.now > minLeft && ok(s)) return true;
    sim.run(100);
  }
  return false;
}

const wagerOpen: Pre = (sim) => void until(sim, (s) => s.phase === 'wager');

/** Someone else calls a comet back, so there is a returning question to deflect. */
const cometQueued: Pre = (sim, caster) => {
  const other = sim.ids.find((id) => id !== caster && sim.rt.hasPlayer(id));
  until(sim, (s) => s.phase === 'wager' || s.phase === 'question');
  if (other) sim.cast(other, { cheatId: 'confidence.comet-return' });
};

/** The richest other player is certain and wrong, so they lose points when the question is scored. */
const someoneLosesWager: Post = (sim, caster) => {
  const scores = stateOf(sim).scores;
  const victim = sim.ids.filter((id) => id !== caster && (scores[id] ?? 0) > 0).sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))[0];
  if (!victim) return;
  sim.idle.add(victim);
  if (stateOf(sim).phase === 'wager') sim.rt.act(victim, { type: 'wager', level: 3 });
  if (until(sim, (s) => s.phase === 'question' && !s.answers[victim], 1000)) sim.rt.act(victim, { type: 'answer', iid: stateOf(sim).iid, answer: { type: 'short', text: 'not the answer' } });
  sim.idle.delete(victim);
};

export const scenarios: ScenarioSet = {
  settings: { confidence: [{ returning: true }] },
  pre: {
    'confidence.comet-deflect': cometQueued,
    'confidence.second-thoughts': (sim, caster) => void until(sim, (s) => s.phase === 'question' && !s.answers[caster], 4000),
    'confidence.whisper-campaign': wagerOpen,
    'confidence.nerve-shake-up': wagerOpen,
    // Cast while players are still choosing, so the scenario can make someone certain and wrong.
    'confidence.doubt-collector': wagerOpen,
  },
  post: { 'confidence.doubt-collector': someoneLosesWager },
};
