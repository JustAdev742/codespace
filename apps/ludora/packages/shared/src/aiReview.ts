import { z } from 'zod';
import { staffReasonSchema } from './admin.ts';

/*
 * AI review of serious staff actions. When a site turns it on, a ban, a suspension and a large grant
 * go to an AI investigator first: it reads the account's records and approves or declines, with its
 * findings tied to the records it read. The server will not carry out the action without an approved
 * review of exactly that action, by the same staff member, used once.
 */

export const AI_REVIEW_KINDS = ['ban', 'suspend', 'grant', 'class_grant'] as const;
export type AiReviewKind = (typeof AI_REVIEW_KINDS)[number];

export const AI_REVIEW_STATUSES = ['running', 'approved', 'declined', 'failed', 'overridden'] as const;
export type AiReviewStatus = (typeof AI_REVIEW_STATUSES)[number];

/** A grant at or above these, in one change (a class grant: in total), is reviewed. Other currencies are not. */
export const AI_REVIEW_DEFAULT_THRESHOLDS: Readonly<Record<string, number>> = { sparks: 10_000, moonstones: 500 };

/** How long an approved review can be used for, and how long one may run before it is called failed. */
export const AI_REVIEW_VALID_MINUTES = 30;
export const AI_REVIEW_RUN_LIMIT_MINUTES = 5;

const uuid = z.string().uuid();
const currency = z.string().trim().min(1).max(32);

/** What a staff member asks to have reviewed: the same fields the action itself takes. */
export const aiReviewRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ban'), userId: uuid, reason: staffReasonSchema }),
  z.object({ kind: z.literal('suspend'), userId: uuid, reason: staffReasonSchema, durationHours: z.number().int().min(1).max(24 * 365).nullable() }),
  z.object({ kind: z.literal('grant'), userId: uuid, currency, amount: z.number().int().min(1).max(1_000_000), reason: staffReasonSchema }),
  z.object({ kind: z.literal('class_grant'), classId: uuid, currency, amountEach: z.number().int().min(1).max(100_000), reason: staffReasonSchema }),
]);
export type AiReviewRequest = z.infer<typeof aiReviewRequestSchema>;

/**
 * The first check, before any AI is asked: a reason that is not words at all ("ihfjosifjsdoifjso",
 * "aaaaaaa", "x x x") is declined straight away. It is only a floor: whether a real-looking reason
 * is good enough, and true, is the investigator's to judge.
 */
export function reasonProblem(reason: string): string | null {
  const text = reason.trim();
  const words = text.toLowerCase().match(/[\p{L}]{2,}/gu) ?? [];
  const distinct = new Set(words);
  if (text.length < 15 || distinct.size < 3) return 'Write the reason in a sentence or two: what happened, and where staff can see it.';
  // One character repeated, or one long run of letters with no spaces, is someone typing to get past the box.
  if (/(.)\1{5,}/u.test(text) || words.some((w) => w.length > 24)) return 'That does not read as a reason. Say what happened, in words.';
  return null;
}

/** The investigator's answer. Every finding names the records it rests on, by the ids the records came with. */
export const aiReviewVerdictSchema = z.object({
  decision: z.enum(['approve', 'decline']),
  reasonQuality: z.enum(['clear', 'vague', 'meaningless', 'contradicted_by_records']),
  summary: z.string().trim().min(1).max(1200),
  findings: z.array(z.object({ point: z.string().trim().min(1).max(400), evidence: z.array(z.string().max(80)).max(12) })).max(12),
  concerns: z.array(z.string().trim().min(1).max(400)).max(10),
  suggestion: z.string().trim().max(400).nullable(),
});
export type AiReviewVerdict = z.infer<typeof aiReviewVerdictSchema>;

/** Where a review's answer came from. */
export type AiReviewSource = 'ai' | 'first_check' | 'override';

/** A review as staff see it. */
export interface AiReviewView {
  id: string;
  kind: AiReviewKind;
  status: AiReviewStatus;
  source: AiReviewSource | null;
  request: AiReviewRequest;
  targetName: string;
  actorName: string;
  verdict: AiReviewVerdict | null;
  /** Why a review failed, in words: the key is missing, the API did not answer... */
  error: string | null;
  override: { byName: string; reason: string } | null;
  model: string | null;
  createdAt: string;
  finishedAt: string | null;
  usedAt: string | null;
  /** Until when an approved review can be used. */
  validUntil: string | null;
}

export const AI_REVIEW_KIND_LABEL: Record<AiReviewKind, string> = { ban: 'Ban', suspend: 'Suspension', grant: 'Grant', class_grant: 'Class grant' };
