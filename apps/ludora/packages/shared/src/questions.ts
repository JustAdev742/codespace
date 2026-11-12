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
  'poll',
  'blanks',
  'sort',
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
  poll: 'Poll',
  blanks: 'Fill in the blanks',
  sort: 'Sort into groups',
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

/*
 * Sound on a question or a choice. Three sources, none of which lets a player send a free
 * voice message to another: words the device speaks (only the text is stored), a sound from
 * the app's own bank (made in code, web/src/lib/sound/bank.ts), or a short clip uploaded to
 * Ludora (a cleaned WAV file, see server/src/modules/uploads/audio.ts). Each needs a caption:
 * the text players see when they cannot hear it, as a picture needs its description.
 */

/** The app's own sounds a question or a set's feel can use. Built in code, no samples. */
export const SOUND_BANK_IDS = [
  'fx-correct',
  'fx-wrong',
  'fx-fanfare',
  'fx-win',
  'fx-coin',
  'fx-level-up',
  'fx-reveal',
  'fx-go',
  'fx-power-up',
  'fx-lose',
  'fx-alarm',
  'fx-dice',
  'note-c4',
  'note-d4',
  'note-e4',
  'note-f4',
  'note-g4',
  'note-a4',
  'note-b4',
  'note-c5',
  'interval-minor-third',
  'interval-major-third',
  'interval-fourth',
  'interval-fifth',
  'interval-octave',
  'chord-major',
  'chord-minor',
  'rhythm-four-beats',
  'rhythm-waltz',
  'rhythm-gallop',
  'rhythm-offbeat',
  'tone-high',
  'tone-low',
  'tone-rising',
  'tone-falling',
  'tone-three-beeps',
] as const;
export type SoundBankId = (typeof SOUND_BANK_IDS)[number];

/** Languages "Say it" can speak in, as BCP 47 tags the browser's voices use. */
export const SPEECH_LANGS = ['en-GB', 'en-US', 'fr-FR', 'es-ES', 'de-DE', 'it-IT', 'pt-PT', 'nl-NL', 'pl-PL', 'cy-GB', 'ga-IE', 'zh-CN', 'ja-JP', 'ko-KR', 'ar-SA', 'hi-IN', 'ru-RU', 'tr-TR'] as const;
export type SpeechLang = (typeof SPEECH_LANGS)[number];

/** A clip players hear: an upload that the server cleaned into a WAV file. */
export const CLIP_URL_PATTERN = /^\/uploads\/[a-f0-9]{32}\.wav$/;
/** The longest clip a question can carry. Listening questions want a word, a phrase, a few bars. */
export const CLIP_MAX_SECONDS = 20;

const caption = z.string().trim().min(1, 'Write a caption: what players who cannot hear it read instead.').max(200);

export const soundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('speech'), text: z.string().trim().min(1, 'Type what the device should say.').max(300), lang: z.enum(SPEECH_LANGS), caption }),
  z.object({ kind: z.literal('bank'), id: z.enum(SOUND_BANK_IDS), caption }),
  z.object({ kind: z.literal('clip'), url: z.string().regex(CLIP_URL_PATTERN, 'Sound clips must be uploaded to Ludora'), seconds: z.number().min(0.1).max(CLIP_MAX_SECONDS), caption }),
]);
export type Sound = z.infer<typeof soundSchema>;

const idSchema = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const text = (max: number) => z.string().trim().min(1).max(max);

const choiceSchema = z.object({
  id: idSchema,
  text: z.string().trim().max(200),
  media: mediaSchema.optional(),
  sound: soundSchema.optional(),
  /** A "why" note for a wrong choice, shown at the reveal to the players who picked it. */
  why: z.string().trim().min(1).max(200).optional(),
});

const base = {
  id: idSchema,
  prompt: text(500),
  media: mediaSchema.optional(),
  /** Something players hear: a listening question plays it before they answer. */
  sound: soundSchema.optional(),
  explanation: z.string().trim().max(600).optional(),
  /** A hint a player can open while the question is up. What opening it costs, if anything, is the mode's to decide. */
  hint: z.string().trim().min(1).max(200).optional(),
  timeLimitSec: z.number().int().min(5).max(300).optional(),
  points: z.number().int().min(0).max(10_000).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  /** Points for this question count double, whatever the mode's scoring. */
  doublePoints: z.boolean().optional(),
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
/** A poll has no right answer and scores nothing: the reveal shows how the room split. */
export const pollSchema = z.object({
  ...base,
  type: z.literal('poll'),
  choices: z.array(choiceSchema).min(2).max(6),
});

/**
 * Gaps in a fill-in-the-blanks sentence are written in square brackets, with
 * other accepted answers after a bar: "Plants need [sunlight|light] and [water]."
 */
export const BLANK_PATTERN = /\[([^[\]]*)\]/g;
export const BLANKS_MIN = 1;
export const BLANKS_MAX = 3;

export interface BlankGap {
  /** Accepted answers, the first being the one shown at the reveal and put in a word bank. */
  accepted: string[];
}

/** The sentence split into its text pieces (one more than the gaps) and its gaps. */
export function parseBlanks(text: string): { pieces: string[]; gaps: BlankGap[] } {
  const pieces: string[] = [];
  const gaps: BlankGap[] = [];
  let last = 0;
  for (const m of text.matchAll(BLANK_PATTERN)) {
    pieces.push(text.slice(last, m.index));
    gaps.push({ accepted: m[1]!.split('|').map((a) => a.trim()).filter(Boolean) });
    last = m.index! + m[0].length;
  }
  pieces.push(text.slice(last));
  return { pieces, gaps };
}

export const blanksSchema = z
  .object({
    ...base,
    type: z.literal('blanks'),
    /** The sentence, gaps in [square brackets]. */
    text: text(300),
    /** Players pick from a word bank (the right words plus `distractors`) instead of typing. */
    bank: z.boolean().optional(),
    distractors: z.array(text(60)).max(6).optional(),
    caseSensitive: z.boolean().optional(),
  });

export const SORT_GROUPS = { min: 2, max: 3 } as const;
export const SORT_ITEMS = { min: 4, max: 8 } as const;

export const sortSchema = z.object({
  ...base,
  type: z.literal('sort'),
  groups: z.array(z.object({ id: idSchema, label: text(40) })).min(SORT_GROUPS.min).max(SORT_GROUPS.max),
  /** Each item names the group it belongs in. Players see the items shuffled. */
  items: z.array(z.object({ id: idSchema, text: text(80), group: idSchema })).min(SORT_ITEMS.min).max(SORT_ITEMS.max),
});

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
    pollSchema,
    blanksSchema,
    sortSchema,
  ])
  .superRefine((q, ctx) => {
    const dupes = (ids: string[]) => new Set(ids).size !== ids.length;
    if (q.type === 'poll') {
      if (dupes(q.choices.map((c) => c.id))) ctx.addIssue({ code: 'custom', message: 'Choice ids must be unique', path: ['choices'] });
      if (q.choices.some((c) => !c.text && !c.media && !c.sound)) ctx.addIssue({ code: 'custom', message: 'Every choice needs text, an image or a sound', path: ['choices'] });
    }
    if (q.type === 'blanks') {
      const { gaps } = parseBlanks(q.text);
      if (gaps.length < BLANKS_MIN || gaps.length > BLANKS_MAX)
        ctx.addIssue({ code: 'custom', message: `Put ${BLANKS_MIN} to ${BLANKS_MAX} gaps in the sentence, each in [square brackets]`, path: ['text'] });
      if (gaps.some((g) => g.accepted.length === 0)) ctx.addIssue({ code: 'custom', message: 'Every gap needs its answer inside the brackets', path: ['text'] });
      if (gaps.some((g) => g.accepted.some((a) => a.length > 60))) ctx.addIssue({ code: 'custom', message: 'Keep each answer in a gap to 60 characters', path: ['text'] });
      if (/[[\]]/.test(q.text.replace(BLANK_PATTERN, ''))) ctx.addIssue({ code: 'custom', message: 'A bracket is not closed', path: ['text'] });
      const right = new Set(gaps.flatMap((g) => g.accepted.map((a) => a.toLowerCase())));
      if ((q.distractors ?? []).some((d) => right.has(d.trim().toLowerCase()))) ctx.addIssue({ code: 'custom', message: 'An extra word for the bank is also a right answer', path: ['distractors'] });
    }
    if (q.type === 'sort') {
      const groups = q.groups.map((g) => g.id);
      if (dupes(groups)) ctx.addIssue({ code: 'custom', message: 'Group ids must be unique', path: ['groups'] });
      if (dupes(q.items.map((i) => i.id))) ctx.addIssue({ code: 'custom', message: 'Item ids must be unique', path: ['items'] });
      if (q.items.some((i) => !groups.includes(i.group))) ctx.addIssue({ code: 'custom', message: 'Every item must go in one of the groups', path: ['items'] });
      else if (groups.some((g) => !q.items.some((i) => i.group === g))) ctx.addIssue({ code: 'custom', message: 'Every group needs at least one item', path: ['groups'] });
    }
    if (q.type === 'mcq' || q.type === 'multi') {
      const ids = q.choices.map((c) => c.id);
      if (dupes(ids)) ctx.addIssue({ code: 'custom', message: 'Choice ids must be unique', path: ['choices'] });
      const correct = q.type === 'mcq' ? [q.correct] : q.correct;
      if (!correct.every((c) => ids.includes(c)))
        ctx.addIssue({ code: 'custom', message: 'The correct answer must be one of the choices', path: ['correct'] });
      if (q.choices.some((c) => !c.text && !c.media && !c.sound))
        ctx.addIssue({ code: 'custom', message: 'Every choice needs text, an image or a sound', path: ['choices'] });
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

/** A question's Points field is measured against this: 2,000 counts twice a usual question, 500 half, 0 nothing. */
export const POINTS_USUAL = 1000;

/** What a question's Points field does to the mode's own score for it. */
export function pointsWeight(points: number | undefined): number {
  return points === undefined ? 1 : Math.max(0, points) / POINTS_USUAL;
}

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
  z.object({ type: z.literal('poll'), choiceId: idSchema }),
  z.object({ type: z.literal('blanks'), values: z.array(z.string().max(80)).max(BLANKS_MAX) }),
  z.object({ type: z.literal('sort'), placement: z.record(idSchema, idSchema) }),
]);
export type Answer = z.infer<typeof answerSchema>;

/** A choice as a player sees it: a token for an id, and what the author put on it. */
export type PublicChoice = { id: string; text: string; media?: Media; sound?: Sound };

/**
 * A question as a player sees it: no answers, choices in presentation order. `double`: its points count double.
 * `points`: what its author made it worth, where 1,000 is a usual question (only in modes that score it, see POINTS_USUAL).
 */
export type PublicQuestion = { double?: true; points?: number; sound?: Sound; hint?: string } & (
  | { type: 'mcq'; prompt: string; media?: Media; choices: PublicChoice[] }
  | { type: 'multi'; prompt: string; media?: Media; choices: PublicChoice[]; selectCount?: number }
  | { type: 'truefalse'; prompt: string; media?: Media }
  | { type: 'short'; prompt: string; media?: Media }
  | { type: 'numeric'; prompt: string; media?: Media; unit?: string }
  | { type: 'order'; prompt: string; media?: Media; items: { id: string; text: string }[] }
  | { type: 'match'; prompt: string; media?: Media; left: { id: string; text: string }[]; right: { id: string; text: string }[] }
  | { type: 'flashcard'; prompt: string; media?: Media }
  | { type: 'poll'; prompt: string; media?: Media; choices: PublicChoice[] }
  /** `pieces` are the sentence around the gaps (one more than the gaps); `bank` is shuffled, when players pick words. */
  | { type: 'blanks'; prompt: string; media?: Media; pieces: string[]; bank?: string[] }
  | { type: 'sort'; prompt: string; media?: Media; groups: { id: string; label: string }[]; items: { id: string; text: string }[] });

/** The correct answer, revealed after a question closes. */
export type AnswerReveal =
  /** `whys`: the author's note on why a wrong choice is wrong, by choice, for the players who picked it. */
  | { type: 'mcq'; correct: string; whys?: Record<string, string> }
  | { type: 'multi'; correct: string[]; whys?: Record<string, string> }
  | { type: 'truefalse'; correct: boolean }
  | { type: 'short'; accepted: string[] }
  | { type: 'numeric'; answer: number; tolerance: number; unit?: string }
  | { type: 'order'; itemIds: string[] }
  | { type: 'match'; pairs: Record<string, string> }
  | { type: 'flashcard'; back: string }
  | { type: 'poll' }
  | { type: 'blanks'; answers: string[] }
  | { type: 'sort'; placement: Record<string, string> };

export const VISIBILITIES = ['private', 'unlisted', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const SET_COVER_GLYPHS = ['atom', 'globe', 'book', 'calculator', 'palette', 'music', 'leaf', 'flask', 'landmark', 'languages', 'cpu', 'heart', 'star', 'puzzle'] as const;
export type SetCoverGlyph = (typeof SET_COVER_GLYPHS)[number];

/** Backdrops the big screen can show (web/src/features/room/game/Backdrop.tsx draws them). */
export const SET_BACKDROPS = ['floodlights', 'hills', 'harbour', 'aurora', 'rooftops', 'forest', 'plain'] as const;
export type SetBackdrop = (typeof SET_BACKDROPS)[number];

/** How long players get to read: a fixed pace, or worked out from the questions themselves. */
export const READING_TIMES = ['short', 'normal', 'long', 'auto'] as const;
export type ReadingTime = (typeof READING_TIMES)[number];

/**
 * The set's own feel in games played from it: sounds for right, wrong and winning (from the
 * bank), a backdrop for the big screen, and an accent colour. A player's comfort settings and a
 * school's look still win, and the host can change any of it in the room.
 */
export const setFeelSchema = z.object({
  right: z.enum(SOUND_BANK_IDS).optional(),
  wrong: z.enum(SOUND_BANK_IDS).optional(),
  win: z.enum(SOUND_BANK_IDS).optional(),
  backdrop: z.enum(SET_BACKDROPS).optional(),
  accent: z.number().int().min(0).max(359).optional(),
});
export type SetFeel = z.infer<typeof setFeelSchema>;

export const setDefaultsSchema = z.object({
  randomCount: z.number().int().min(1).max(250).optional(),
  shuffleAnswers: z.boolean().optional(),
  /** How long players get to read each question; hosting fills in its time from this. */
  readingTime: z.enum(READING_TIMES).optional(),
  /** One or two modes the author made the set for. Hosting lists them first. */
  modes: z.array(z.string().regex(/^[a-z0-9-]{1,40}$/)).max(2).optional(),
  feel: setFeelSchema.optional(),
});
export type SetDefaults = z.infer<typeof setDefaultsSchema>;

/** Year levels offered for a set (stored in gradeBand); a set saved with other text keeps it. */
export const YEAR_LEVELS = ['Reception', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6', 'Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12', 'Year 13', 'Adult'] as const;

/**
 * A set's cover: a glyph on a colour, and optionally a picture the author uploaded, with a
 * description for players who cannot see it. The glyph and colour stay as the fallback.
 */
export const setCoverSchema = z.object({
  glyph: z.enum(SET_COVER_GLYPHS),
  hue: z.number().int().min(0).max(359),
  image: z
    .object({
      kind: z.literal('image'),
      url: z.string().regex(MEDIA_URL_PATTERN, 'Images must be uploaded to Ludora'),
      alt: z.string().trim().min(1, 'Describe the cover picture for players who cannot see it.').max(300),
    })
    .optional(),
});
export type SetCoverValue = z.infer<typeof setCoverSchema>;

export const questionSetInputSchema = z.object({
  title: text(80),
  description: z.string().trim().max(500).default(''),
  subject: z.enum(SUBJECTS),
  gradeBand: z.string().trim().max(30).optional(),
  language: z.string().trim().min(2).max(10).default('en'),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  visibility: z.enum(VISIBILITIES).default('private'),
  cover: setCoverSchema.optional(),
  topic: z.string().trim().max(60).optional(),
  /** What a game of this set does unless the host changes it: ask a random number of the questions, shuffle the answers. */
  defaults: setDefaultsSchema.optional(),
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
