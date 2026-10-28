import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for tug-of-war cheats. See chaos-scenarios.ts for what each field does. */

/** The target gets their current question wrong (a flashcard answer never fits these questions), so a cheat that punishes wrong answers has one to act on. */
export const answersWrong: Post = (sim, _caster, _def, target) => {
  if (!target) return;
  const q = (sim.rt.view({ kind: 'player', playerId: target }) as { you?: { question?: { iid: string } | null } } | null)?.you?.question;
  if (q) sim.rt.act(target, { type: 'answer', iid: q.iid, answer: { type: 'flashcard', knew: false } });
};

const sideOf = (sim: ChaosSim, id: string): string | undefined => sim.state().pullers[id]?.side;

/** Players pulling on the other side from `id`. */
const otherSide = (sim: ChaosSim, id: string) => sim.ids.filter((x) => sim.rt.hasPlayer(x) && sideOf(sim, x) !== undefined && sideOf(sim, x) !== sideOf(sim, id));

/** Someone on the side the knot leans away from resets it, so it sits in the middle and there is a tie to break. */
const knotToMiddle: Pre = (sim) => {
  const pos = sim.state().pos as number;
  if (Math.abs(pos) <= 1) return;
  const behind = pos > 0 ? 'left' : 'right';
  for (const id of sim.ids.filter((x) => sim.rt.hasPlayer(x) && sideOf(sim, x) === behind)) if (sim.cast(id, { cheatId: 'tug-of-war.reset' }).ok) return;
};

/** The challenged opponent stops answering, so the contest has a winner. */
const targetStops: Post = (sim, _caster, _def, target) => {
  if (target) sim.idle.add(target);
};

/** Someone on the other side yanks the knot their way, which a knot guard refuses. */
const otherSideYanks: Post = (sim, caster) => {
  for (const id of otherSide(sim, caster)) if (sim.cast(id, { cheatId: 'tug-of-war.yank' }).ok) return;
};

export const scenarios: ScenarioSet = {
  // Heave, Slippery Rope and Underdog Grip cheats need those rules on.
  settings: { 'tug-of-war': [{ heave: true, slack: true, underdog: true }] },
  pre: { 'tug-of-war.tiebreaker': knotToMiddle },
  post: {
    'tug-of-war.butterfingers': answersWrong,
    'tug-of-war.domino-slip': answersWrong,
    'tug-of-war.pulling-contest': targetStops,
    'tug-of-war.knot-guard': otherSideYanks,
  },
  effects: ['tug-of-war.knot-guard'],
};
