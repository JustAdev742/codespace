import type { Answer, Question } from '@ludora/shared';

/**
 * An answer in words, as the player gave it, so the host's end-of-game report can name the most
 * common wrong answer ("Paris", "False", "12 cm"). Null for answers that do not reduce to a few
 * words (ordering, matching, flashcards) and for question types this does not know.
 */
export function answerText(q: Question, a: Answer): string | null {
  try {
    if (q.type === 'mcq' && a.type === 'mcq') return q.choices.find((c) => c.id === a.choiceId)?.text || null;
    if (q.type === 'multi' && a.type === 'multi') {
      const picked = q.choices.filter((c) => a.choiceIds.includes(c.id)).map((c) => c.text);
      return picked.length ? picked.join(', ') : null;
    }
    if (a.type === 'truefalse') return a.value ? 'True' : 'False';
    if (a.type === 'short') return a.text.replace(/\s+/g, ' ').trim().slice(0, 80) || null;
    if (q.type === 'numeric' && a.type === 'numeric') return `${a.value}${q.unit ? ` ${q.unit}` : ''}`;
  } catch {
    return null;
  }
  return null;
}
