/**
 * Find and replace across a whole set: prompts, answers, choices, items, pairs, groups, gap
 * sentences, explanations, hints and why notes. Plain text, never a pattern, so a question mark
 * or a bracket is found as itself. Ids are never touched. Pure: no React, no DOM.
 */
import type { DraftQuestion } from './model.ts';

export interface FindOptions {
  matchCase: boolean;
}

function pattern(find: string, o: FindOptions): RegExp | null {
  if (!find) return null;
  return new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), o.matchCase ? 'g' : 'gi');
}

/** Every text field of a question, as getters and setters over a copy. */
function fields(d: DraftQuestion, change: (s: string) => string): DraftQuestion {
  return {
    ...d,
    prompt: change(d.prompt),
    explanation: change(d.explanation),
    hint: change(d.hint ?? ''),
    back: change(d.back),
    sentence: change(d.sentence),
    unit: change(d.unit),
    distractors: change(d.distractors),
    choices: d.choices.map((c) => ({ ...c, text: change(c.text), ...(c.why !== undefined ? { why: change(c.why) } : {}) })),
    accepted: d.accepted.map((a) => ({ ...a, text: change(a.text) })),
    items: d.items.map((i) => ({ ...i, text: change(i.text) })),
    pairs: d.pairs.map((p) => ({ ...p, left: change(p.left), right: change(p.right) })),
    groups: d.groups.map((g) => ({ ...g, text: change(g.text) })),
  };
}

export function findMatches(drafts: readonly DraftQuestion[], find: string, o: FindOptions): { total: number; byQuestion: { id: string; number: number; count: number }[] } {
  const re = pattern(find, o);
  const byQuestion: { id: string; number: number; count: number }[] = [];
  let total = 0;
  if (!re) return { total, byQuestion };
  drafts.forEach((d, i) => {
    let count = 0;
    fields(d, (s) => {
      count += s.match(re)?.length ?? 0;
      return s;
    });
    if (count) {
      byQuestion.push({ id: d.id, number: i + 1, count });
      total += count;
    }
  });
  return { total, byQuestion };
}

/** The questions with every match replaced; questions with no match come back as they were. */
export function replaceAll(drafts: readonly DraftQuestion[], find: string, replace: string, o: FindOptions): DraftQuestion[] {
  const re = pattern(find, o);
  if (!re) return drafts.slice();
  return drafts.map((d) => {
    let hit = false;
    const next = fields(d, (s) => {
      const out = s.replace(re, () => replace);
      if (out !== s) hit = true;
      return out;
    });
    return hit ? next : d;
  });
}
