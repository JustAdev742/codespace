import type { Media, Question } from '@ludora/shared';

/*
 * "The correct answer as text" for any authored question. Shared by the
 * modes that turn questions into cards or puzzles (Flashcard Study, Lantern
 * Match, Word Scramble).
 *
 * These helpers take the authored question, which carries its answers, so
 * they are for engine code only. Put the text they return in a view only
 * once the answer may be shown; never put the question object itself in one.
 */

type Choice = { id: string; text: string; media?: Media | undefined };

const choiceText = (c: Choice | undefined) => (c ? c.text || c.media?.alt || '' : '');

/** The correct answer as one line of text. */
export function answerText(q: Question): string {
  switch (q.type) {
    case 'mcq':
      return choiceText(q.choices.find((c) => c.id === q.correct));
    case 'multi':
      return q.choices
        .filter((c) => q.correct.includes(c.id))
        .map(choiceText)
        .filter(Boolean)
        .join(', ');
    case 'short':
      return q.accepted[0] ?? '';
    case 'numeric':
      return `${q.answer}${q.unit ? ` ${q.unit}` : ''}`;
    case 'truefalse':
      return q.correct ? 'True' : 'False';
    case 'flashcard':
      return q.back;
    case 'order':
      return q.items.map((i) => i.text).join(', ');
    case 'match':
      return q.pairs.map((p) => `${p.left} → ${p.right}`).join(', ');
  }
}

/** The answer as it would appear on a card: its text, plus the picture when the correct choice is an image. */
export function answerFace(q: Question): { text: string; media?: Media } {
  const text = answerText(q);
  if (q.type === 'mcq') {
    const media = q.choices.find((c) => c.id === q.correct)?.media;
    if (media) return { text: q.choices.find((c) => c.id === q.correct)?.text ?? '', media };
  }
  return { text };
}
