import type { Question } from '@ludora/shared';
import { reversible } from '../../src/modes/flashcard-study/index.ts';
import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Pre, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for flashcard-study cheats. See chaos-scenarios.ts for what each field does. */

type Card = { qid: string; flipped: boolean };
const cardOf = (sim: ChaosSim, id: string): Card | null => (sim.state() as { students: Record<string, { card: Card | null }> }).students[id]?.card ?? null;
const question = (sim: ChaosSim, qid: string) => (sim.rt as unknown as { questionMap: Map<string, Question> }).questionMap.get(qid)!;

/** Play on in small steps (up to 30 seconds) until the caster has a face-down card on the table that `ok` accepts. */
const faceDown =
  (ok: (q: Question) => boolean): Pre =>
  (sim, caster) => {
    for (let t = 0; t < 30_000 && sim.rt.status === 'running'; t += 100) {
      const card = cardOf(sim, caster);
      if (card && !card.flipped && ok(question(sim, card.qid))) return;
      sim.run(100);
    }
  };

export const scenarios: ScenarioSet = {
  // Flashcards have no meters, so the suite casts late in the session. Quick Recall needs box 1 cards
  // still to grade: trying the casters in reverse order starts with the player furthest from done.
  casters: { 'flashcard-study.quick-recall': 'richest' },
  pre: {
    'flashcard-study.turn-around': faceDown(reversible),
    'flashcard-study.tip-of-the-tongue': faceDown((q) => q.type !== 'truefalse'),
  },
  reactive: ['flashcard-study.quick-recall', 'flashcard-study.safety-net', 'flashcard-study.rapid-review'],
  screen: ['flashcard-study.tip-of-the-tongue'],
};
