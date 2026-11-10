import { parseBlanks, type Question } from '@ludora/shared';

/** A question's right answer in words, for the set page, the share page and the answer key. */
export function answerText(q: Question): string {
  switch (q.type) {
    case 'mcq':
      return q.choices.find((c) => c.id === q.correct)?.text ?? '';
    case 'multi':
      return q.choices.filter((c) => q.correct.includes(c.id)).map((c) => c.text).join(', ');
    case 'truefalse':
      return q.correct ? 'True' : 'False';
    case 'short':
      return q.accepted.join(' or ');
    case 'numeric':
      return `${q.answer}${q.unit ? ` ${q.unit}` : ''}`;
    case 'order':
      return q.items.map((i) => i.text).join(', then ');
    case 'match':
      return q.pairs.map((p) => `${p.left} to ${p.right}`).join('; ');
    case 'flashcard':
      return q.back;
    case 'poll':
      return 'No right answer (a poll)';
    case 'blanks':
      return parseBlanks(q.text).gaps.map((g) => g.accepted.join(' or ')).join(', then ');
    case 'sort':
      return q.groups.map((g) => `${g.label}: ${q.items.filter((i) => i.group === g.id).map((i) => i.text).join(', ')}`).join('; ');
  }
}
