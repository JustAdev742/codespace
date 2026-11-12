import { z } from 'zod';
import type { Question } from './questions.ts';

/*
 * AI question drafts: a teacher describes a topic and Claude drafts questions
 * for it. Drafts land in the set editor like an import, so the teacher reviews
 * and edits every one before saving; nothing is saved or played straight away.
 */

/**
 * Question types drafts can use: the ones a teacher can check at a glance. Polls are left out:
 * a poll asks for opinions, and drafts never ask players about themselves.
 */
export const AI_DRAFT_TYPES = ['mcq', 'truefalse', 'short', 'numeric', 'blanks', 'sort'] as const;
export type AiDraftType = (typeof AI_DRAFT_TYPES)[number];

/** Age bands; the wording and difficulty of drafts follow the band. */
export const AI_DRAFT_LEVELS = ['5-7', '7-9', '9-11', '11-14', '14-16', '16+'] as const;
export type AiDraftLevel = (typeof AI_DRAFT_LEVELS)[number];
export const AI_DRAFT_LEVEL_LABELS: Record<AiDraftLevel, string> = {
  '5-7': 'Ages 5 to 7',
  '7-9': 'Ages 7 to 9',
  '9-11': 'Ages 9 to 11',
  '11-14': 'Ages 11 to 14',
  '14-16': 'Ages 14 to 16',
  '16+': 'Ages 16 and up',
};

/** Most questions one request may ask for. */
export const AI_DRAFT_MAX = 15;

export const aiDraftRequestSchema = z.object({
  topic: z.string().trim().min(3, 'Say what the questions should be about.').max(200, 'Keep the topic under 200 characters.'),
  level: z.enum(AI_DRAFT_LEVELS),
  count: z.number().int().min(1).max(AI_DRAFT_MAX),
  types: z
    .array(z.enum(AI_DRAFT_TYPES))
    .min(1, 'Choose at least one kind of question.')
    .max(AI_DRAFT_TYPES.length)
    .transform((t) => [...new Set(t)]),
  language: z.string().trim().min(2).max(10).default('en'),
  notes: z.string().trim().max(500, 'Keep the notes under 500 characters.').optional(),
});
export type AiDraftRequest = z.infer<typeof aiDraftRequestSchema>;

/** Why drafting is unavailable to someone, when it is. */
export type AiDraftUnavailable = 'not_enabled' | 'not_configured' | 'not_allowed';

export interface AiDraftStatus {
  available: boolean;
  reason?: AiDraftUnavailable;
  /** Requests left in the rolling 24 hours, and the daily allowance. */
  remainingToday: number;
  limitToday: number;
}

export interface AiDraftResponse {
  questions: Question[];
  /** Drafts that broke Ludora's question rules and were left out. */
  dropped: number;
  remainingToday: number;
  /** The model that wrote the drafts, when the server says. */
  model?: AiModelOption;
  /** Email addresses and phone numbers taken out before sending. */
  removed?: number;
}

/* ------------------------------- AI helpers ------------------------------- */

/*
 * AI helpers: small, fixed jobs inside the making tools (improve a question's
 * wording, outline a lesson, suggest a game mode). Each job is a registered
 * task on the server with its own input and output rules; the browser only
 * ever sends a task's own fields, never instructions for the model.
 */

/** The tasks Ludora itself registers. Other areas may register more on the server. */
export const AI_TASK_IDS = [
  'set.draft_questions',
  'question.improve',
  'question.wrong_answers',
  'question.explain',
  'question.difficulty',
  'set.age_version',
  'set.describe',
  'lesson.outline',
  'lesson.slide',
  'lesson.discussion',
  'game.suggest_mode',
  'any.name_describe',
] as const;
export type AiTaskId = (typeof AI_TASK_IDS)[number];

/** A model the owner configured and staff left switched on, by its plain name. */
export interface AiModelOption {
  /** Stable id, "provider/model". */
  id: string;
  label: string;
  provider: string;
}

/** Helper requests a person may make in a rolling window, and when the next one comes back. */
export interface AiAllowance {
  limit: number;
  remaining: number;
  windowHours: number;
  /** When one more request becomes available again; null while some are left or none are used. */
  nextAt: string | null;
}

export type AiUnavailable = 'not_configured' | 'not_allowed' | 'not_enabled';

export interface AiStatus {
  available: boolean;
  reason?: AiUnavailable;
  /** The tasks this person may use. */
  tasks: string[];
  models: AiModelOption[];
  allowance: AiAllowance;
}

export interface AiRunResponse<T = unknown> {
  output: T;
  /** The model that answered. */
  model: AiModelOption;
  /** Email addresses and phone numbers taken out of the text before it was sent. */
  removed: number;
  /** Parts of the answer left out for breaking Ludora's rules. */
  dropped: number;
  allowance: AiAllowance;
}

/** What the privacy page says: whether helpers are on and which providers receive the text. */
export interface AiAbout {
  on: boolean;
  providers: string[];
}

/** The body of a helper request: the task's own fields, the model the person picked, and whether another may stand in. */
export const aiRunRequestSchema = z.object({
  input: z.unknown(),
  model: z.string().max(200).optional(),
  fallback: z.boolean().default(true),
});
