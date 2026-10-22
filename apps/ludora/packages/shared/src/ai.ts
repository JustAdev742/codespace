import { z } from 'zod';
import type { Question } from './questions.ts';

/*
 * AI question drafts: a teacher describes a topic and Claude drafts questions
 * for it. Drafts land in the set editor like an import, so the teacher reviews
 * and edits every one before saving; nothing is saved or played straight away.
 */

/** Question types drafts can use: the ones a teacher can check at a glance. */
export const AI_DRAFT_TYPES = ['mcq', 'truefalse', 'short', 'numeric'] as const;
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
}
