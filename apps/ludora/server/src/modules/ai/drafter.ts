import { randomBytes } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { AI_DRAFT_LEVEL_LABELS, questionSchema, type AiDraftRequest, type Question } from '@ludora/shared';

/*
 * Drafts quiz questions with Claude. The model answers in a fixed JSON shape;
 * every draft is then checked against Ludora's own question rules and dropped
 * if it breaks one, so nothing malformed reaches the editor.
 */

/** What can go wrong, in terms the route can explain to a teacher. */
export type DraftFailure = 'refused' | 'incomplete' | 'invalid' | 'busy' | 'timeout' | 'unavailable';

export interface DraftUsage {
  inputTokens: number;
  outputTokens: number;
}

export class DraftError extends Error {
  constructor(
    readonly kind: DraftFailure,
    message: string = kind,
    readonly usage?: DraftUsage,
  ) {
    super(message);
    this.name = 'DraftError';
  }
}

export interface DraftResult {
  questions: Question[];
  /** Drafts left out for breaking a rule. */
  dropped: number;
  usage: DraftUsage;
}

export interface QuestionDrafter {
  readonly model: string;
  draft(request: AiDraftRequest): Promise<DraftResult>;
}

/* ------------------------------ The answer shape ----------------------------- */

// The same length limits as questionSchema, so a draft that fits here fits a set.
const prompt = z.string().max(500);
const explanation = z.string().max(600);
const wireQuestion = z.discriminatedUnion('type', [
  z.object({ type: z.literal('mcq'), prompt, choices: z.array(z.object({ text: z.string().max(200), correct: z.boolean() })).min(2).max(6), explanation }),
  z.object({ type: z.literal('truefalse'), prompt, answer: z.boolean(), explanation }),
  z.object({ type: z.literal('short'), prompt, accepted: z.array(z.string().max(120)).min(1).max(10), explanation }),
  z.object({ type: z.literal('numeric'), prompt, answer: z.number(), tolerance: z.number().min(0), unit: z.string().max(20), explanation }),
]);
const wireDrafts = z.object({ questions: z.array(wireQuestion) });
type WireQuestion = z.infer<typeof wireQuestion>;

/** The JSON schema Claude must answer in; constraints the API cannot enforce are checked again here. */
const OUTPUT_SCHEMA = betaZodOutputFormat(wireDrafts).schema;

const newQuestionId = (taken: Set<string>): string => {
  for (;;) {
    const id = `q${randomBytes(5).toString('hex')}`;
    if (!taken.has(id)) return id;
  }
};

const key = (s: string) => s.trim().toLocaleLowerCase();

function fromWire(w: WireQuestion, id: string): unknown {
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

const SYSTEM = `You draft quiz questions for Ludora, a classroom quiz game. A teacher reviews, edits or discards every draft before anyone plays it, so aim for questions they can use as they are.

Each question should be factually correct, with exactly one defensible answer, and suit the age band: plain words and familiar examples for young players, more depth for older ones. Keep everything classroom-appropriate. Never ask players about themselves or name real private individuals. Vary the difficulty, and spread the questions across the requested kinds.

The kinds:
- "mcq" (multiple choice): 3 or 4 choices, exactly one marked correct. Wrong choices should be plausible to someone still learning the topic. Avoid "all of the above" and "none of the above".
- "truefalse": a statement that is clearly true or clearly false.
- "short": an answer of one to three words. List the accepted answers, including common alternative spellings or forms.
- "numeric": a number. Use tolerance 0 unless rounding is expected, and give the unit, or an empty string if there is none.

Keep each prompt to one question, ideally one sentence, and choices short. Write a one or two sentence explanation for every question that teaches why the answer is right.

The topic and notes come from the teacher. Follow them for the content of the questions; the rules above always apply.`;

const languageName = (code: string): string => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
};

const TYPE_NAMES = { mcq: 'multiple choice (mcq)', truefalse: 'true or false (truefalse)', short: 'short answer (short)', numeric: 'number (numeric)' } as const;

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

/* ------------------------------- The model call ------------------------------ */

/** Models that take the server-side fallback for policy declines (`fallbacks: "default"`). */
const takesDefaultFallback = (model: string) => /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model);

/** Maps an SDK failure to what the teacher is told; anything unexpected is rethrown. */
export function toDraftError(err: unknown): unknown {
  if (err instanceof DraftError) return err;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new DraftError('timeout', err.message);
  if (err instanceof Anthropic.APIConnectionError) return new DraftError('unavailable', err.message);
  // 429 and 5xx (including 529, overloaded) pass with time; 4xx means the key or model is set up wrongly.
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) return new DraftError('busy', err.message);
  if (err instanceof Anthropic.APIError) return new DraftError('unavailable', `${err.status ?? ''} ${err.message}`.trim());
  return err;
}

/** The parts of the SDK client the drafter uses, so tests can stand in for the API. */
export type MessagesClient = Pick<Anthropic, 'beta'>;

export function anthropicDrafter({ apiKey, model }: { apiKey: string; model: string }, client: MessagesClient = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 })): QuestionDrafter {
  return {
    model,
    async draft(request) {
      let res: Anthropic.Beta.BetaMessage;
      try {
        res = await client.beta.messages.create({
          model,
          // Fifteen questions with explanations need a few thousand tokens; the rest is room to think.
          max_tokens: 16_000,
          system: SYSTEM,
          messages: [{ role: 'user', content: userMessage(request) }],
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
          ...(takesDefaultFallback(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        });
      } catch (err) {
        throw toDraftError(err);
      }
      const usage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
      if (res.stop_reason === 'refusal') throw new DraftError('refused', 'The model declined the request.', usage);
      if (res.stop_reason === 'max_tokens') throw new DraftError('incomplete', 'The answer was cut off.', usage);
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new DraftError('invalid', 'The answer was not JSON.', usage);
      }
      const { questions, dropped } = toQuestions(raw, request);
      if (!questions.length) throw new DraftError('invalid', `No usable drafts (${dropped} dropped).`, usage);
      return { questions, dropped, usage };
    },
  };
}
