import { parseBlanks, type Question } from '@ludora/shared';
import { editDistance, normalizeAnswerText } from '../questions/grade.ts';

/*
 * How hard a question looks, from the question alone: its type, how much there
 * is to read, how many choices, how big the numbers are and how alike the
 * choices are. 0 is trivial, 1 is very hard. A practice bot of a given ability
 * misses hard questions more than easy ones.
 */

const BASE: Record<Question['type'], number> = {
  truefalse: 0.2,
  mcq: 0.32,
  poll: 0,
  flashcard: 0.4,
  multi: 0.5,
  numeric: 0.45,
  short: 0.52,
  blanks: 0.48,
  order: 0.5,
  match: 0.45,
  sort: 0.45,
};

/** Words in a piece of text. */
export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** How alike two answers are, 0 (nothing in common) to 1 (the same). Numbers compare by size, words by spelling. */
export function similarity(a: string, b: string): number {
  const x = normalizeAnswerText(a);
  const y = normalizeAnswerText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const nx = Number(x.replace(/ /g, ''));
  const ny = Number(y.replace(/ /g, ''));
  if (Number.isFinite(nx) && Number.isFinite(ny) && /\d/.test(x) && /\d/.test(y)) {
    return 1 / (1 + Math.abs(nx - ny) / Math.max(1, Math.abs(ny)) * 4);
  }
  const spelling = 1 - editDistance(x, y) / Math.max(x.length, y.length);
  // Answers that start the same, or are the same length, are easy to mix up.
  let prefix = 0;
  while (prefix < Math.min(x.length, y.length) && x[prefix] === y[prefix]) prefix++;
  const lengths = Math.min(x.length, y.length) / Math.max(x.length, y.length);
  return Math.max(0, Math.min(1, spelling * 0.6 + Math.min(1, prefix / 4) * 0.25 + lengths * 0.15));
}

/** All the words a player reads before answering. */
export function readingWords(q: Question): number {
  let n = wordCount(q.prompt);
  switch (q.type) {
    case 'mcq':
    case 'multi':
    case 'poll':
      for (const c of q.choices) n += wordCount(c.text);
      break;
    case 'order':
      for (const i of q.items) n += wordCount(i.text);
      break;
    case 'match':
      for (const p of q.pairs) n += wordCount(p.left) + wordCount(p.right);
      break;
    case 'sort':
      for (const i of q.items) n += wordCount(i.text);
      for (const g of q.groups) n += wordCount(g.label);
      break;
    case 'blanks':
      n += wordCount(q.text) + (q.distractors?.length ?? 0);
      break;
    case 'flashcard':
      n += wordCount(q.back);
      break;
    default:
      break;
  }
  return n;
}

function digitsOf(n: number): number {
  return String(Math.abs(Math.round(n))).length;
}

export function estimateDifficulty(q: Question): number {
  let d = BASE[q.type];
  if (q.type === 'poll') return 0;
  // Long prompts take more holding in mind.
  const words = wordCount(q.prompt);
  d += Math.min(0.12, Math.max(0, words - 12) * 0.006);
  switch (q.type) {
    case 'mcq':
    case 'multi': {
      d += (q.choices.length - 4) * 0.03;
      const right = q.type === 'mcq' ? [q.correct] : q.correct;
      const rightText = q.choices.filter((c) => right.includes(c.id)).map((c) => c.text);
      const wrongText = q.choices.filter((c) => !right.includes(c.id)).map((c) => c.text);
      if (rightText.length && wrongText.length) {
        let sum = 0;
        for (const r of rightText) for (const w of wrongText) sum += similarity(r, w);
        d += (sum / (rightText.length * wrongText.length)) * 0.2;
      }
      if (q.type === 'multi') d += Math.max(0, q.correct.length - 2) * 0.04;
      break;
    }
    case 'numeric': {
      d += Math.max(0, digitsOf(q.answer) - 2) * 0.05;
      if (!Number.isInteger(q.answer)) d += 0.1;
      if (q.answer < 0) d += 0.06;
      if (q.tolerance) d -= Math.min(0.1, (q.tolerance / Math.max(1, Math.abs(q.answer))) * 0.5);
      break;
    }
    case 'short':
      d += Math.min(0.12, Math.max(0, (q.accepted[0]?.length ?? 0) - 6) * 0.012);
      if (q.accepted.length > 1) d -= 0.04;
      break;
    case 'order':
      d += (q.items.length - 3) * 0.06;
      break;
    case 'match':
      d += (q.pairs.length - 3) * 0.05;
      break;
    case 'sort':
      d += (q.items.length - 4) * 0.03 + (q.groups.length - 2) * 0.06;
      break;
    case 'blanks':
      d += (parseBlanks(q.text).gaps.length - 1) * 0.07;
      if (q.bank) d -= 0.1;
      break;
    default:
      break;
  }
  if (q.difficulty === 'easy') d -= 0.12;
  if (q.difficulty === 'hard') d += 0.15;
  return Math.max(0.02, Math.min(0.95, d));
}
