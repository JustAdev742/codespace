import { z } from 'zod';

/**
 * Question content model. Shared by the editor (web), the API (server) and
 * the grader (engine). Every string here is user content and is rendered as
 * plain text, never as HTML.
 */

export const QUESTION_TYPES = [
  'mcq',
  'multi',
  'truefalse',
  'short',
  'numeric',
  'order',
  'match',
  'flashcard',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'Multiple choice',
  multi: 'Select all that apply',
  truefalse: 'True or false',
  short: 'Type the answer',
  numeric: 'Number answer',
  order: 'Put in order',
  match: 'Match pairs',
  flashcard: 'Flashcard',
};

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const SUBJECTS = [
  'math',
  'science',
  'english',
  'vocabulary',
  'geography',
  'history',
  'languages',
  'computing',
  'arts',
  'music',
  'health',
  'general',
] as const;
export type Subject = (typeof SUBJECTS)[number];

export const SUBJECT_LABELS: Record<Subject, string> = {
  math: 'Maths',
  science: 'Science',
  english: 'English',
  vocabulary: 'Vocabulary',
  geography: 'Geography',
  history: 'History',
  languages: 'World languages',
  computing: 'Computing',
  arts: 'Art & design',
  music: 'Music',
  health: 'Health & PE',
  general: 'General knowledge',
};

/** Images may only come from our own upload store or built-in art, never arbitrary URLs. */
export const MEDIA_URL_PATTERN = /^\/(uploads|art)\/[A-Za-z0-9._/-]{1,200}$/;

export const mediaSchema = z.object({
  kind: z.literal('image'),
  url: z.string().regex(MEDIA_URL_PATTERN, 'Images must be uploaded to Ludora'),
  alt: z.string().trim().max(300),
});
export type Media = z.infer<typeof mediaSchema>;

const idSchema = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const text = (max: number) => z.string().trim().min(1).max(max);

const choiceSchema = z.object({
  id: idSchema,
  text: z.string().trim().max(200),
  media: mediaSchema.optional(),
});

const base = {
  id: idSchema,
  prompt: text(500),
  media: mediaSchema.optional(),
  explanation: z.string().trim().max(600).optional(),
  timeLimitSec: z.number().int().min(5).max(300).optional(),
  points: z.number().int().min(0).max(10_000).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
};

export const mcqSchema = z.object({
  ...base,
  type: z.literal('mcq'),
  choices: z.array(choiceSchema).min(2).max(6),
  correct: idSchema,
});
export const multiSchema = z.object({
  ...base,
  type: z.literal('multi'),
  choices: z.array(choiceSchema).min(2).max(8),
  correct: z.array(idSchema).min(1).max(8),
});
export const trueFalseSchema = z.object({ ...base, type: z.literal('truefalse'), correct: z.boolean() });
export const shortSchema = z.object({
  ...base,
  type: z.literal('short'),
  accepted: z.array(text(120)).min(1).max(10),
  caseSensitive: z.boolean().optional(),
  fuzzy: z.boolean().optional(),
});
export const numericSchema = z.object({
  ...base,
  type: z.literal('numeric'),
  answer: z.number().finite(),
  tolerance: z.number().finite().min(0).optional(),
  unit: z.string().trim().max(20).optional(),
});
export const orderSchema = z.object({
  ...base,
  type: z.literal('order'),
  /** Listed in the correct order. Players see them shuffled. */
  items: z.array(z.object({ id: idSchema, text: text(120) })).min(2).max(8),
});
export const matchSchema = z.object({
  ...base,
  type: z.literal('match'),
  pairs: z.array(z.object({ id: idSchema, left: text(120), right: text(120) })).min(2).max(8),
});
export const flashcardSchema = z.object({ ...base, type: z.literal('flashcard'), back: text(300) });

export const questionSchema = z
  .discriminatedUnion('type', [
    mcqSchema,
    multiSchema,
    trueFalseSchema,
    shortSchema,
    numericSchema,
    orderSchema,
    matchSchema,
    flashcardSchema,
  ])
  .superRefine((q, ctx) => {
    const dupes = (ids: string[]) => new Set(ids).size !== ids.length;
    if (q.type === 'mcq' || q.type === 'multi') {
      const ids = q.choices.map((c) => c.id);
      if (dupes(ids)) ctx.addIssue({ code: 'custom', message: 'Choice ids must be unique', path: ['choices'] });
      const correct = q.type === 'mcq' ? [q.correct] : q.correct;
      if (!correct.every((c) => ids.includes(c)))
        ctx.addIssue({ code: 'custom', message: 'The correct answer must be one of the choices', path: ['correct'] });
      if (q.choices.some((c) => !c.text && !c.media))
        ctx.addIssue({ code: 'custom', message: 'Every choice needs text or an image', path: ['choices'] });
      if (q.type === 'multi' && dupes(q.correct))
        ctx.addIssue({ code: 'custom', message: 'Correct choices are listed twice', path: ['correct'] });
    }
    if (q.type === 'order' && dupes(q.items.map((i) => i.id)))
      ctx.addIssue({ code: 'custom', message: 'Item ids must be unique', path: ['items'] });
    if (q.type === 'match' && dupes(q.pairs.map((p) => p.id)))
      ctx.addIssue({ code: 'custom', message: 'Pair ids must be unique', path: ['pairs'] });
  });
export type Question = z.infer<typeof questionSchema>;
export type QuestionOf<T extends QuestionType> = Extract<Question, { type: T }>;

/** What a player submits. Validated against the question type by the grader. */
export const answerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('mcq'), choiceId: idSchema }),
  z.object({ type: z.literal('multi'), choiceIds: z.array(idSchema).max(8) }),
  z.object({ type: z.literal('truefalse'), value: z.boolean() }),
  z.object({ type: z.literal('short'), text: z.string().max(200) }),
  z.object({ type: z.literal('numeric'), value: z.number().finite() }),
  z.object({ type: z.literal('order'), itemIds: z.array(idSchema).max(8) }),
  z.object({ type: z.literal('match'), pairs: z.record(idSchema, idSchema) }),
  z.object({ type: z.literal('flashcard'), knew: z.boolean() }),
]);
export type Answer = z.infer<typeof answerSchema>;

/** A question as a player sees it: no answers, choices in presentation order. */
export type PublicQuestion =
  | { type: 'mcq' | 'multi'; prompt: string; media?: Media; choices: { id: string; text: string; media?: Media }[]; selectCount?: number }
  | { type: 'truefalse'; prompt: string; media?: Media }
  | { type: 'short'; prompt: string; media?: Media }
  | { type: 'numeric'; prompt: string; media?: Media; unit?: string }
  | { type: 'order'; prompt: string; media?: Media; items: { id: string; text: string }[] }
  | { type: 'match'; prompt: string; media?: Media; left: { id: string; text: string }[]; right: { id: string; text: string }[] }
  | { type: 'flashcard'; prompt: string; media?: Media };

/** The correct answer, revealed after a question closes. */
export type AnswerReveal =
  | { type: 'mcq'; correct: string }
  | { type: 'multi'; correct: string[] }
  | { type: 'truefalse'; correct: boolean }
  | { type: 'short'; accepted: string[] }
  | { type: 'numeric'; answer: number; tolerance: number; unit?: string }
  | { type: 'order'; itemIds: string[] }
  | { type: 'match'; pairs: Record<string, string> }
  | { type: 'flashcard'; back: string };

export const VISIBILITIES = ['private', 'unlisted', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const SET_COVER_GLYPHS = ['atom', 'globe', 'book', 'calculator', 'palette', 'music', 'leaf', 'flask', 'landmark', 'languages', 'cpu', 'heart', 'star', 'puzzle'] as const;
export type SetCoverGlyph = (typeof SET_COVER_GLYPHS)[number];

export const questionSetInputSchema = z.object({
  title: text(80),
  description: z.string().trim().max(500).default(''),
  subject: z.enum(SUBJECTS),
  gradeBand: z.string().trim().max(30).optional(),
  language: z.string().trim().min(2).max(10).default('en'),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  visibility: z.enum(VISIBILITIES).default('private'),
  cover: z.object({ glyph: z.enum(SET_COVER_GLYPHS), hue: z.number().int().min(0).max(359) }).optional(),
  questions: z
    .array(questionSchema)
    .min(1, 'Add at least one question')
    .max(250, 'A set can hold up to 250 questions')
    .superRefine((qs, ctx) => {
      const ids = qs.map((q) => q.id);
      if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Question ids must be unique' });
    }),
});
export type QuestionSetInput = z.infer<typeof questionSetInputSchema>;
