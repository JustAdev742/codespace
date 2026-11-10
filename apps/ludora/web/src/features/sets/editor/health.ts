/**
 * The set health check: duplicate questions, missing right answers, answers
 * too long for an answer tile, pictures with no description, and which game
 * modes can use the set (and why not the others). Pure: no React, no DOM.
 */
import { questionSchema, type Question, type QuestionType } from '@ludora/shared';
import { CATALOG } from '@ludora/engine/catalog';
import { adaptQuestions } from '@ludora/engine/questions';
import { createRng } from '@ludora/shared';
import { toCandidate, type DraftQuestion } from './model.ts';

export type HealthKind = 'duplicate' | 'answer' | 'long' | 'picture' | 'unfinished';

export interface HealthIssue {
  kind: HealthKind;
  /** The draft question it is about (the first of a pair for duplicates). */
  questionId: string;
  number: number;
  message: string;
}

export interface ModeFit {
  id: string;
  title: string;
  ok: boolean;
  /** How many questions it can show, and what happens to the rest. */
  shown: number;
  converted: number;
  reason: string | null;
}

export interface Health {
  issues: HealthIssue[];
  modes: ModeFit[];
}

/** Longer than this and an answer tile on a phone wraps to several lines or shrinks its text. */
export const TILE_CHARS = 60;

const norm = (s: string) => s.toLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();

function missingAnswer(d: DraftQuestion): boolean {
  switch (d.type) {
    case 'mcq':
    case 'multi':
      return !d.correct.some((id) => d.choices.some((c) => c.id === id && (c.text.trim() || c.media)));
    case 'truefalse':
      return d.truth === null;
    case 'short':
      return !d.accepted.some((a) => a.text.trim());
    case 'numeric':
      return !d.answer.trim();
    case 'flashcard':
      return !d.back.trim();
    case 'blanks':
      return !/\[[^\]]+\]/.test(d.sentence);
    case 'sort':
      return d.items.some((i) => i.text.trim() && !i.group);
    default:
      return false;
  }
}

export function checkHealth(drafts: readonly DraftQuestion[]): Health {
  const issues: HealthIssue[] = [];
  const seen = new Map<string, number>();
  drafts.forEach((d, i) => {
    const n = i + 1;
    const key = `${d.type}|${norm(d.prompt)}${d.type === 'blanks' ? `|${norm(d.sentence)}` : ''}`;
    if (norm(d.prompt)) {
      const first = seen.get(key);
      if (first !== undefined) issues.push({ kind: 'duplicate', questionId: d.id, number: n, message: `Question ${n} repeats question ${first}.` });
      else seen.set(key, n);
    }
    if (missingAnswer(d)) issues.push({ kind: 'answer', questionId: d.id, number: n, message: d.type === 'sort' ? `Question ${n} has an item with no group.` : `Question ${n} has no right answer marked.` });
    if (d.type === 'mcq' || d.type === 'multi' || d.type === 'poll') {
      const long = d.choices.findIndex((c) => c.text.trim().length > TILE_CHARS);
      if (long >= 0) issues.push({ kind: 'long', questionId: d.id, number: n, message: `Question ${n}, choice ${String.fromCharCode(65 + long)}, is ${d.choices[long]!.text.trim().length} characters: long for an answer tile on a phone. Up to ${TILE_CHARS} reads best.` });
    }
    if ((d.media && !d.media.alt.trim()) || d.choices.some((c) => c.media && !c.media.alt.trim())) issues.push({ kind: 'picture', questionId: d.id, number: n, message: `Question ${n} has a picture with no description. Players who cannot see it need one, and a public set needs one for every picture.` });
  });

  const questions: Question[] = [];
  drafts.forEach((d, i) => {
    const r = questionSchema.safeParse(toCandidate(d).question);
    if (r.success) questions.push(r.data);
    else if (!issues.some((x) => x.questionId === d.id && x.kind === 'answer')) issues.push({ kind: 'unfinished', questionId: d.id, number: i + 1, message: `Question ${i + 1} is not finished yet, so no game can use it.` });
  });

  const modes = CATALOG.filter((m) => m.meta.status !== 'planned').map((m) => {
    const r = adaptQuestions(questions, m.meta.questionTypes as QuestionType[], createRng(1));
    const need = m.meta.minQuestions;
    const ok = r.questions.length >= need;
    let reason: string | null = null;
    if (!ok) reason = `Needs at least ${need} questions it can show; ${r.questions.length === 0 ? 'none' : `only ${r.questions.length}`} of these can be.${r.skipped[0] ? ` ${r.skipped[0].reason}` : ''}`;
    else if (r.skipped.length) reason = `Leaves out ${r.skipped.length === 1 ? '1 question' : `${r.skipped.length} questions`}: ${r.skipped[0]!.reason}`;
    return { id: m.meta.id, title: m.meta.title, ok, shown: r.questions.length, converted: r.converted, reason };
  });
  return { issues, modes };
}
