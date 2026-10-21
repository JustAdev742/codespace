import type { Answer, AnswerReveal, PublicQuestion, Question } from '@ludora/shared';
import type { Rng } from '@ludora/shared';

/*
 * Players never see authored ids. Each presented part gets a positional
 * token (c0, c1 ... for choices, i0 ... for order items, l0/r0 ... for the
 * two sides of a match), and the engine translates tokens back to ids before
 * grading. Otherwise ids such as "correct" or matching pair ids on both sides
 * of a match question would leak the answer to anyone reading the payload.
 */

/** Ids of the parts a question shows in a shuffled order, if any. */
export function shuffleableIds(q: Question): string[] | null {
  switch (q.type) {
    case 'mcq':
    case 'multi':
      return q.choices.map((c) => c.id);
    case 'order':
      return q.items.map((i) => i.id);
    case 'match':
      return q.pairs.map((p) => p.id);
    default:
      return null;
  }
}

/**
 * Presentation order for a question: authored ids in the order shown.
 * Order and match questions are always shuffled, since showing them in
 * stored order would give the answer away.
 */
export function presentationOrder(q: Question, rng: Rng, shuffleChoices: boolean): string[] | null {
  const ids = shuffleableIds(q);
  if (!ids) return null;
  const mustShuffle = q.type === 'order' || q.type === 'match';
  if (!mustShuffle && !shuffleChoices) return ids;
  let order = rng.shuffle(ids);
  const solved = (o: string[]) => o.every((id, k) => id === ids[k]);
  for (let i = 0; mustShuffle && ids.length > 1 && i < 5 && solved(order); i++) order = rng.shuffle(ids);
  if (mustShuffle && ids.length > 1 && solved(order)) order = [...ids.slice(1), ids[0]!];
  return order;
}

const prefix = (q: Question) => (q.type === 'order' ? 'i' : q.type === 'match' ? 'r' : 'c');

function tokenMaps(q: Question, order: string[] | null) {
  const ids = order ?? shuffleableIds(q) ?? [];
  const p = prefix(q);
  const toToken = new Map(ids.map((id, i) => [id, `${p}${i}`]));
  const fromToken = new Map(ids.map((id, i) => [`${p}${i}`, id]));
  return { toToken, fromToken };
}

function matchLeftMaps(q: Extract<Question, { type: 'match' }>) {
  const toToken = new Map(q.pairs.map((pair, i) => [pair.id, `l${i}`]));
  const fromToken = new Map(q.pairs.map((pair, i) => [`l${i}`, pair.id]));
  return { toToken, fromToken };
}

function arrange<T extends { id: string }>(items: readonly T[], order: string[] | null): T[] {
  if (!order) return items.slice();
  const byId = new Map(items.map((i) => [i.id, i]));
  return order.map((id) => byId.get(id)).filter((x): x is T => Boolean(x));
}

/** The question as a player sees it: tokens instead of ids, and nothing that reveals the answer. */
export function toPublicQuestion(q: Question, order: string[] | null): PublicQuestion {
  const common = { prompt: q.prompt, ...(q.media ? { media: q.media } : {}) };
  const { toToken } = tokenMaps(q, order);
  const tok = (id: string) => toToken.get(id) ?? id;
  switch (q.type) {
    case 'mcq':
    case 'multi': {
      const choices = arrange(q.choices, order).map(({ id, text, media }) => ({ id: tok(id), text, ...(media ? { media } : {}) }));
      return q.type === 'mcq' ? { type: 'mcq', ...common, choices } : { type: 'multi', ...common, choices, selectCount: q.correct.length };
    }
    case 'truefalse':
      return { type: 'truefalse', ...common };
    case 'short':
      return { type: 'short', ...common };
    case 'numeric':
      return { type: 'numeric', ...common, ...(q.unit ? { unit: q.unit } : {}) };
    case 'order':
      return { type: 'order', ...common, items: arrange(q.items, order).map(({ id, text }) => ({ id: tok(id), text })) };
    case 'match': {
      const left = matchLeftMaps(q).toToken;
      return {
        type: 'match',
        ...common,
        left: q.pairs.map((p) => ({ id: left.get(p.id)!, text: p.left })),
        right: arrange(q.pairs, order).map((p) => ({ id: tok(p.id), text: p.right })),
      };
    }
    case 'flashcard':
      return { type: 'flashcard', ...common };
  }
}

const UNKNOWN = '__unknown__';

/** Translate a submitted answer from tokens to authored ids. Unknown tokens grade as wrong. */
export function answerFromTokens(q: Question, order: string[] | null, a: Answer): Answer {
  const { fromToken } = tokenMaps(q, order);
  const id = (t: string) => fromToken.get(t) ?? UNKNOWN;
  switch (a.type) {
    case 'mcq':
      return { type: 'mcq', choiceId: id(a.choiceId) };
    case 'multi':
      return { type: 'multi', choiceIds: a.choiceIds.map(id) };
    case 'order':
      return { type: 'order', itemIds: a.itemIds.map(id) };
    case 'match': {
      if (q.type !== 'match') return a;
      const left = matchLeftMaps(q).fromToken;
      const pairs: Record<string, string> = {};
      for (const [l, r] of Object.entries(a.pairs)) {
        const leftId = left.get(l);
        if (leftId) pairs[leftId] = id(r);
      }
      return { type: 'match', pairs };
    }
    default:
      return a;
  }
}

/** Translate an answer from authored ids to tokens (bots use this to answer like a player would). */
export function answerToTokens(q: Question, order: string[] | null, a: Answer): Answer {
  const { toToken } = tokenMaps(q, order);
  const tok = (i: string) => toToken.get(i) ?? i;
  switch (a.type) {
    case 'mcq':
      return { type: 'mcq', choiceId: tok(a.choiceId) };
    case 'multi':
      return { type: 'multi', choiceIds: a.choiceIds.map(tok) };
    case 'order':
      return { type: 'order', itemIds: a.itemIds.map(tok) };
    case 'match': {
      if (q.type !== 'match') return a;
      const left = matchLeftMaps(q).toToken;
      return { type: 'match', pairs: Object.fromEntries(Object.entries(a.pairs).map(([l, r]) => [left.get(l) ?? l, tok(r)])) };
    }
    default:
      return a;
  }
}

/** Translate a reveal from authored ids to the tokens this player saw. */
export function revealToTokens(q: Question, order: string[] | null, r: AnswerReveal): AnswerReveal {
  const { toToken } = tokenMaps(q, order);
  const tok = (i: string) => toToken.get(i) ?? i;
  switch (r.type) {
    case 'mcq':
      return { type: 'mcq', correct: tok(r.correct) };
    case 'multi':
      return { type: 'multi', correct: r.correct.map(tok) };
    case 'order':
      return { type: 'order', itemIds: r.itemIds.map(tok) };
    case 'match': {
      if (q.type !== 'match') return r;
      const left = matchLeftMaps(q).toToken;
      return { type: 'match', pairs: Object.fromEntries(Object.entries(r.pairs).map(([l, rr]) => [left.get(l) ?? l, tok(rr)])) };
    }
    default:
      return r;
  }
}
