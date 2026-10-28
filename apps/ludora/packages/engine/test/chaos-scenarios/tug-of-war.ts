import type { Post, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for tug-of-war cheats. See chaos-scenarios.ts for what each field does. */

/** The target gets their current question wrong (a flashcard answer never fits these questions), so a cheat that punishes wrong answers has one to act on. */
export const answersWrong: Post = (sim, _caster, _def, target) => {
  if (!target) return;
  const q = (sim.rt.view({ kind: 'player', playerId: target }) as { you?: { question?: { iid: string } | null } } | null)?.you?.question;
  if (q) sim.rt.act(target, { type: 'answer', iid: q.iid, answer: { type: 'flashcard', knew: false } });
};

export const scenarios: ScenarioSet = {
  // Heave, Slippery Rope and Underdog Grip cheats need those rules on.
  settings: { 'tug-of-war': [{ heave: true, slack: true, underdog: true }] },
  post: { 'tug-of-war.butterfingers': answersWrong },
};
