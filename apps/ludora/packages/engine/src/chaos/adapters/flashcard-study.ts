import type { ChaosAdapter } from '../types.ts';

// Flashcards are a cooperative study session: no score or currency for cheats to move yet.
export const flashcardStudyAdapter: ChaosAdapter = {
  modeId: 'flashcard-study',
  meters: [],
};
