import type { Question } from '@ludora/shared';

/** The right answer to a question, in a few words, for a list of suggestions. Pure. */
export function answerText(q: Question): string {
  switch (q.type) {
    case 'mcq':
      return q.choices.find((c) => c.id === q.correct)?.text ?? '';
    case 'multi':
      return q.choices
        .filter((c) => q.correct.includes(c.id))
        .map((c) => c.text)
        .join(', ');
    case 'truefalse':
      return q.correct ? 'True' : 'False';
    case 'short':
      return q.accepted.join(' or ');
    case 'numeric':
      return `${q.answer}${q.unit ? ` ${q.unit}` : ''}`;
    case 'order':
      return q.items.map((i) => i.text).join(', then ');
    case 'match':
      return q.pairs.map((p) => `${p.left} = ${p.right}`).join('; ');
    case 'flashcard':
      return q.back;
    case 'poll':
      return 'No right answer';
    case 'blanks':
      return [...q.text.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]!.split('|')[0]).join(', ');
    case 'sort':
      return q.groups.map((g) => `${g.label}: ${q.items.filter((i) => i.group === g.id).map((i) => i.text).join(', ')}`).join('; ');
  }
}
