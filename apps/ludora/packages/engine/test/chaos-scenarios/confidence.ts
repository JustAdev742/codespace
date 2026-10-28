import { createRng, type Question } from '@ludora/shared';
import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for confidence cheats. See chaos-scenarios.ts for what each field does. */

type State = {
  phase: string;
  round: number;
  order: string[];
  iid: string | null;
  answers: Record<string, unknown>;
  wagers: Record<string, number>;
  deadline: number;
  phaseEndsAt: number | null;
  scores: Record<string, number>;
};
const stateOf = (sim: ChaosSim) => sim.state() as State;
const question = (sim: ChaosSim, qid: string) => (sim.rt as unknown as { questionMap: Map<string, Question> }).questionMap.get(qid)!;

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

/** `id` answers the question, right or wrong, once it is open (playing by hand while it waits). */
function answerAs(sim: ChaosSim, id: string, right: boolean) {
  if (!until(sim, (s) => s.phase === 'question' && !s.answers[id], 1000)) return;
  const action = right ? sim.rt.botAction(id, 1, createRng(3)) : { type: 'answer', iid: stateOf(sim).iid, answer: { type: 'short', text: 'not the answer' } };
  if (action) sim.rt.act(id, action);
}

/** Play `fn` with these players kept idle, then let them play again. */
function byHand(sim: ChaosSim, ids: string[], fn: () => void) {
  const idle = new Set(sim.idle);
  for (const id of ids) sim.idle.add(id);
  fn();
  sim.idle.clear();
  for (const id of idle) sim.idle.add(id);
}

/** Wait for the scoring of the question being played. */
const untilScored = (sim: ChaosSim) => void until(sim, (s) => s.phase === 'reveal', -Infinity);

/** The caster is guessing and answers wrong. */
const casterGuessesWrong: Post = (sim, caster) =>
  byHand(sim, [caster], () => {
    if (stateOf(sim).phase === 'wager') sim.rt.act(caster, { type: 'wager', level: 1 });
    answerAs(sim, caster, false);
  });

/** The caster answers wrong and the player they chose answers right. */
const casterWrongTargetRight: Post = (sim, caster, _def, target) => {
  if (!target) return;
  byHand(sim, [caster, target], () => {
    answerAs(sim, target, true);
    answerAs(sim, caster, false);
  });
};

/** Only the caster answers, and right, so everyone else misses the question. */
const casterAloneRight: Post = (sim, caster) =>
  byHand(sim, sim.ids, () => {
    answerAs(sim, caster, true);
    untilScored(sim);
  });

/** The upcoming question has choices to preview. */
const wagerOnChoices: Pre = (sim) => void until(sim, (s) => s.phase === 'wager' && ['mcq', 'multi'].includes(question(sim, s.order[s.round]!).type));

/** The caster is certain, so their confidence differs from most other players' for a swap. */
const casterCertain: Pre = (sim, caster) => {
  if (until(sim, (s) => s.phase === 'wager')) sim.rt.act(caster, { type: 'wager', level: 3 });
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
    'confidence.danger-round': wagerOpen,
    'confidence.read-the-room': wagerOpen,
    'confidence.sneak-preview': wagerOnChoices,
    'confidence.honest-guess': wagerOpen,
    'confidence.phone-a-friend': wagerOpen,
    'confidence.against-the-crowd': wagerOpen,
    'confidence.side-bet': wagerOpen,
    'confidence.called-it': wagerOpen,
    'confidence.confidence-swap': casterCertain,
  },
  post: {
    'confidence.doubt-collector': someoneLosesWager,
    'confidence.danger-round': someoneLosesWager,
    'confidence.honest-guess': casterGuessesWrong,
    'confidence.phone-a-friend': casterWrongTargetRight,
    'confidence.against-the-crowd': casterAloneRight,
  },
  // A wrong call costs something only to a player with points.
  casters: { 'confidence.called-it': 'richest' },
  screen: ['confidence.read-the-room', 'confidence.sneak-preview', 'confidence.scout-report'],
};
