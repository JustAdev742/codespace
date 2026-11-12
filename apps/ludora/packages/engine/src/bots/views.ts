import { parseBlanks, type Question } from '@ludora/shared';

/** A question a player can see, as found in their view. */
export interface SeenQuestion {
  iid: string;
  deadline: number | null;
  index?: number;
  total?: number;
}

/**
 * The questions in a player's view: anything shaped like a QuestionView (an
 * instance id and the time it was shown), wherever the mode put it. Only what
 * the player sees, so a bot never learns more than a person would.
 */
export function findQuestionViews(view: unknown, depth = 0, out: SeenQuestion[] = []): SeenQuestion[] {
  if (view === null || typeof view !== 'object' || depth > 5) return out;
  if (Array.isArray(view)) {
    if (view.length <= 40) for (const v of view) findQuestionViews(v, depth + 1, out);
    return out;
  }
  const o = view as Record<string, unknown>;
  if (typeof o.iid === 'string' && typeof o.shownAt === 'number' && 'q' in o) {
    out.push({
      iid: o.iid,
      deadline: typeof o.deadline === 'number' ? o.deadline : null,
      ...(typeof o.index === 'number' ? { index: o.index } : {}),
      ...(typeof o.total === 'number' ? { total: o.total } : {}),
    });
    return out;
  }
  for (const v of Object.values(o)) if (v !== null && typeof v === 'object') findQuestionViews(v, depth + 1, out);
  return out;
}

/** The typed answers in a game: the words a bot reaches for when it does not know one. */
export function botAnswerPool(questions: readonly Question[]): string[] {
  const out = new Set<string>();
  for (const q of questions) {
    if (q.type === 'short') out.add(q.accepted[0]!);
    if (q.type === 'blanks') for (const g of parseBlanks(q.text).gaps) if (g.accepted[0]) out.add(g.accepted[0]);
    if (q.type === 'mcq') for (const c of q.choices) if (c.text && c.text.length <= 40) out.add(c.text);
  }
  return [...out].slice(0, 300);
}
