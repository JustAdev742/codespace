import type { ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for flashcard-study cheats. See chaos-scenarios.ts for what each field does. */
export const scenarios: ScenarioSet = {
  // Flashcards have no meters, so the suite casts late in the session. Quick Recall needs box 1 cards
  // still to grade: trying the casters in reverse order starts with the player furthest from done.
  casters: { 'flashcard-study.quick-recall': 'richest' },
  reactive: ['flashcard-study.quick-recall', 'flashcard-study.safety-net'],
};
