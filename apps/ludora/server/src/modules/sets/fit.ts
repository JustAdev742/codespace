import { createRng, setProfile, type Question, type QuestionType, type SetDefaults, type SetProfile } from '@ludora/shared';
import { CATALOG } from '@ludora/engine/catalog';
import { adaptQuestions } from '@ludora/engine/questions';

/*
 * How well each game mode fits a set, worked out on the server so hosts who cannot see a set's
 * answers (a public set by someone else) still get the ranking. Only counts and reasons go out,
 * never a question or an answer.
 */

export interface ModeFitView {
  id: string;
  /** Questions the mode can show, as they are or in another form. */
  shown: number;
  converted: number;
  skipped: number;
  /** Too few questions it can show to play at all. */
  playable: boolean;
  /** The fewest questions the mode needs. */
  min: number;
  /** Why the first left-out question was left out. */
  reason: string | null;
}

export function modeFits(questions: readonly Question[]): ModeFitView[] {
  return CATALOG.filter((m) => m.meta.status !== 'planned').map((m) => {
    const r = adaptQuestions(questions, m.meta.questionTypes as QuestionType[], createRng(1));
    return { id: m.meta.id, shown: r.questions.length, converted: r.converted, skipped: r.skipped.length, playable: r.questions.length >= m.meta.minQuestions, min: m.meta.minQuestions, reason: r.skipped[0]?.reason ?? null };
  });
}

export function setFit(questions: readonly Question[], defaults: unknown): { profile: SetProfile; fit: ModeFitView[] } {
  return { profile: setProfile({ questions, defaults: (defaults ?? null) as SetDefaults | null }), fit: modeFits(questions) };
}
