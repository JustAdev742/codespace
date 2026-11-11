import { parseBlanks, type Answer, type Question } from '@ludora/shared';
import { blankMatches } from '../questions/grade.ts';

const MAX = 80;
const clip = (s: string) => (s.length > MAX ? `${s.slice(0, MAX - 1)}…` : s);
const nth = (n: number) => {
  const v = n % 100;
  return `${n}${['th', 'st', 'nd', 'rd'][(v - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][v] ?? 'th'}`;
};

/**
 * An answer in words, as the player gave it, so the host's end-of-game report can name the most
 * common wrong answer ("Paris", "False", "12 cm"). For ordering, matching, sorting and gap-fill
 * questions it names the first mistake in words a teacher can read ("Mars put 2nd, not 4th",
 * "France matched with Berlin", "Whale sorted into Fish", "Gap 2: rain"), so players who made the
 * same mistake are counted together even when the rest of their answers differ. Null for a right
 * answer of those types, for flashcards and polls, and for question types this does not know.
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
    if (q.type === 'order' && a.type === 'order') {
      const at = a.itemIds.findIndex((id, i) => q.items[i]?.id !== id);
      if (at < 0) return null;
      const item = q.items.find((i) => i.id === a.itemIds[at]);
      const belongs = q.items.findIndex((i) => i.id === a.itemIds[at]);
      return item ? clip(`${item.text} put ${nth(at + 1)}, not ${nth(belongs + 1)}`) : null;
    }
    if (q.type === 'match' && a.type === 'match') {
      const wrong = q.pairs.find((p) => a.pairs[p.id] !== undefined && a.pairs[p.id] !== p.id);
      if (!wrong) return null;
      const chosen = q.pairs.find((p) => p.id === a.pairs[wrong.id]);
      return chosen ? clip(`${wrong.left} matched with ${chosen.right}`) : null;
    }
    if (q.type === 'sort' && a.type === 'sort') {
      const wrong = q.items.find((i) => a.placement[i.id] !== undefined && a.placement[i.id] !== i.group);
      if (!wrong) return null;
      const group = q.groups.find((g) => g.id === a.placement[wrong.id]);
      return group ? clip(`${wrong.text} sorted into ${group.label}`) : null;
    }
    if (q.type === 'blanks' && a.type === 'blanks') {
      const { gaps } = parseBlanks(q.text);
      const at = gaps.findIndex((g, i) => !blankMatches(g.accepted, a.values[i] ?? '', { caseSensitive: q.caseSensitive, exact: Boolean(q.bank) }));
      if (at < 0) return null;
      const typed = (a.values[at] ?? '').replace(/\s+/g, ' ').trim();
      return clip(gaps.length === 1 ? typed || 'Left empty' : `Gap ${at + 1}: ${typed || 'left empty'}`);
    }
  } catch {
    return null;
  }
  return null;
}
