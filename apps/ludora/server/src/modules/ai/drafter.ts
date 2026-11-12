import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AI_DRAFT_LEVEL_LABELS, parseBlanks, questionSchema, type AiDraftRequest, type Question } from '@ludora/shared';

/*
 * Question drafts: the answer shape the model writes in, and the conversion
 * that checks every draft against Ludora's own question rules and drops it if
 * it breaks one, so nothing malformed reaches the editor. The set-editor
 * helpers (tasks/sets.ts) share these.
 */

/* ------------------------------ The answer shape ----------------------------- */

// The same length limits as questionSchema, so a draft that fits here fits a set.
const prompt = z.string().max(500);
const explanation = z.string().max(600);
export const wireQuestion = z.discriminatedUnion('type', [
  z.object({ type: z.literal('mcq'), prompt, choices: z.array(z.object({ text: z.string().max(200), correct: z.boolean() })).min(2).max(6), explanation }),
  z.object({ type: z.literal('truefalse'), prompt, answer: z.boolean(), explanation }),
  z.object({ type: z.literal('short'), prompt, accepted: z.array(z.string().max(120)).min(1).max(10), explanation }),
  z.object({ type: z.literal('numeric'), prompt, answer: z.number(), tolerance: z.number().min(0), unit: z.string().max(20), explanation }),
  z.object({ type: z.literal('blanks'), prompt, sentence: z.string().max(300), distractors: z.array(z.string().max(60)).max(6), explanation }),
  z.object({ type: z.literal('sort'), prompt, groups: z.array(z.string().max(40)).min(2).max(3), items: z.array(z.object({ text: z.string().max(80), group: z.string().max(40) })).min(4).max(8), explanation }),
]);
export const wireDrafts = z.object({ questions: z.array(wireQuestion) });
export type WireQuestion = z.infer<typeof wireQuestion>;

export const newQuestionId = (taken: Set<string>): string => {
  for (;;) {
    const id = `q${randomBytes(5).toString('hex')}`;
    if (!taken.has(id)) return id;
  }
};

const key = (s: string) => s.trim().toLocaleLowerCase();

export function fromWire(w: WireQuestion, id: string): unknown {
  const base = { id, prompt: w.prompt.trim(), ...(w.explanation.trim() ? { explanation: w.explanation.trim() } : {}) };
  switch (w.type) {
    case 'mcq': {
      const texts = w.choices.map((c) => c.text.trim());
      // Exactly one right answer, and no two choices that read the same.
      if (w.choices.filter((c) => c.correct).length !== 1 || texts.some((t) => !t) || new Set(texts.map(key)).size !== texts.length) return null;
      const choices = texts.map((text, i) => ({ id: String.fromCharCode(97 + i), text }));
      return { ...base, type: 'mcq', choices, correct: choices[w.choices.findIndex((c) => c.correct)]!.id };
    }
    case 'truefalse':
      return { ...base, type: 'truefalse', correct: w.answer };
    case 'short': {
      const accepted: string[] = [];
      for (const a of w.accepted.map((s) => s.trim())) if (a && !accepted.some((b) => key(b) === key(a))) accepted.push(a);
      return { ...base, type: 'short', accepted };
    }
    case 'numeric':
      return { ...base, type: 'numeric', answer: w.answer, ...(w.tolerance > 0 ? { tolerance: w.tolerance } : {}), ...(w.unit.trim() ? { unit: w.unit.trim() } : {}) };
    case 'blanks': {
      // Extra words make a word bank; none means players type. An extra word that is also a right answer is dropped.
      const answers = new Set(parseBlanks(w.sentence).gaps.flatMap((g) => g.accepted.map(key)));
      const distractors: string[] = [];
      for (const d of w.distractors.map((s) => s.trim())) if (d && !answers.has(key(d)) && !distractors.some((x) => key(x) === key(d))) distractors.push(d);
      return { ...base, type: 'blanks', text: w.sentence.trim(), ...(distractors.length >= 2 ? { bank: true, distractors } : {}) };
    }
    case 'sort': {
      const labels = w.groups.map((g) => g.trim());
      if (labels.some((l) => !l) || new Set(labels.map(key)).size !== labels.length) return null;
      const groups = labels.map((label, i) => ({ id: `g${i + 1}`, label }));
      const items: { id: string; text: string; group: string }[] = [];
      for (const [i, item] of w.items.entries()) {
        const group = groups.find((g) => key(g.label) === key(item.group));
        if (!group || !item.text.trim()) return null;
        items.push({ id: `i${i + 1}`, text: item.text.trim(), group: group.id });
      }
      return { ...base, type: 'sort', groups, items };
    }
  }
}

/**
 * Turns the model's answer into questions for the editor: only the requested
 * types, at most the requested number, each one valid under questionSchema.
 */
export function toQuestions(raw: unknown, request: Pick<AiDraftRequest, 'count' | 'types'>): { questions: Question[]; dropped: number } {
  const list = z.object({ questions: z.array(z.unknown()) }).safeParse(raw);
  if (!list.success) return { questions: [], dropped: 0 };
  const questions: Question[] = [];
  const taken = new Set<string>();
  let dropped = 0;
  for (const item of list.data.questions) {
    if (questions.length >= request.count) break;
    const wire = wireQuestion.safeParse(item);
    const q = wire.success && request.types.includes(wire.data.type) ? questionSchema.safeParse(fromWire(wire.data, newQuestionId(taken))) : null;
    if (!q?.success) {
      dropped++;
      continue;
    }
    taken.add(q.data.id);
    questions.push(q.data);
  }
  return { questions, dropped };
}

/* -------------------------------- The prompt -------------------------------- */

export const SYSTEM = `You draft quiz questions for Ludora, a classroom quiz game. A teacher reviews, edits or discards every draft before anyone plays it, so aim for questions they can use as they are.

Each question should be factually correct, with exactly one defensible answer, and suit the age band: plain words and familiar examples for young players, more depth for older ones. Keep everything classroom-appropriate. Never ask players about themselves or name real private individuals. Vary the difficulty, and spread the questions across the requested kinds.

The kinds:
- "mcq" (multiple choice): 3 or 4 choices, exactly one marked correct. Wrong choices should be plausible to someone still learning the topic. Avoid "all of the above" and "none of the above".
- "truefalse": a statement that is clearly true or clearly false.
- "short": an answer of one to three words. List the accepted answers, including common alternative spellings or forms.
- "numeric": a number. Use tolerance 0 unless rounding is expected, and give the unit, or an empty string if there is none.
- "blanks" (fill in the blanks): one sentence with one to three missing words, each written in square brackets, with other accepted answers after a bar, for example "Plants need [sunlight|light] and [water] to grow." The prompt is a short instruction such as "Fill in the blanks." Give two to four plausible wrong words in distractors for a word bank, or an empty list for typed answers.
- "sort" (sort into groups): two or three group names, and four to eight short items, each naming exactly one of the groups it belongs in. Every group gets at least one item.

Keep each prompt to one question, ideally one sentence, and choices short. Write a one or two sentence explanation for every question that teaches why the answer is right.

The topic and notes come from the teacher. Follow them for the content of the questions; the rules above always apply.`;

export const languageName = (code: string): string => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
};

export const TYPE_NAMES = { mcq: 'multiple choice (mcq)', truefalse: 'true or false (truefalse)', short: 'short answer (short)', numeric: 'number (numeric)', blanks: 'fill in the blanks (blanks)', sort: 'sort into groups (sort)' } as const;

export function userMessage(r: AiDraftRequest): string {
  return [
    `Topic: ${r.topic}`,
    `Players: ${AI_DRAFT_LEVEL_LABELS[r.level]}`,
    `Number of questions: ${r.count}`,
    `Kinds of question: ${r.types.map((t) => TYPE_NAMES[t]).join(', ')}`,
    `Write in: ${languageName(r.language)}`,
    `Teacher's notes: ${r.notes || 'none'}`,
  ].join('\n');
}

/** A question in the answer shape, so a model can rewrite it in the same shape. Null for kinds drafts do not use. */
export function toWire(q: Question): WireQuestion | null {
  const explanation = q.explanation ?? '';
  switch (q.type) {
    case 'mcq':
      return { type: 'mcq', prompt: q.prompt, choices: q.choices.map((c) => ({ text: c.text, correct: c.id === q.correct })), explanation };
    case 'truefalse':
      return { type: 'truefalse', prompt: q.prompt, answer: q.correct, explanation };
    case 'short':
      return { type: 'short', prompt: q.prompt, accepted: q.accepted, explanation };
    case 'numeric':
      return { type: 'numeric', prompt: q.prompt, answer: q.answer, tolerance: q.tolerance ?? 0, unit: q.unit ?? '', explanation };
    case 'blanks':
      return { type: 'blanks', prompt: q.prompt, sentence: q.text, distractors: q.distractors ?? [], explanation };
    case 'sort':
      return { type: 'sort', prompt: q.prompt, groups: q.groups.map((g) => g.label), items: q.items.map((i) => ({ text: i.text, group: q.groups.find((g) => g.id === i.group)?.label ?? '' })), explanation };
    default:
      return null;
  }
}
