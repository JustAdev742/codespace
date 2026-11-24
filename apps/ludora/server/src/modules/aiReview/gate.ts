import { eq, sql } from 'drizzle-orm';
import { AI_REVIEW_VALID_MINUTES, type AiReviewRequest } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { aiReviews } from '../../db/schema.ts';
import type { AuthContext } from '../../http/context.ts';
import { AppError } from '../../lib/errors.ts';
import { grantNeedsReview, loadReviewSettings } from './settings.ts';

/*
 * The gate in front of a serious staff action. Each action route calls it inside its own transaction,
 * just before it changes anything. When AI review is on and the action needs one, the action goes
 * ahead only with an approved (or overridden) review of exactly this action, asked for by the same
 * staff member, finished in the last AI_REVIEW_VALID_MINUTES minutes and not used before. The review
 * is marked used in the same transaction, so a rolled-back action leaves it usable and one review
 * never carries two actions.
 */

/** The parts of a request that must match: what, to whom, how much or how long, and the exact reason. */
export function requestKey(r: AiReviewRequest): string {
  const base = { kind: r.kind, reason: r.reason.trim() };
  switch (r.kind) {
    case 'ban':
      return JSON.stringify({ ...base, userId: r.userId });
    case 'suspend':
      return JSON.stringify({ ...base, userId: r.userId, durationHours: r.durationHours ?? null });
    case 'grant':
      return JSON.stringify({ ...base, userId: r.userId, currency: r.currency, amount: r.amount });
    case 'class_grant':
      return JSON.stringify({ ...base, classId: r.classId, currency: r.currency, amountEach: r.amountEach });
  }
}

/** Whether this action needs a review on this site right now. `total` is a class grant's whole amount. */
export async function reviewNeeded(db: DbOrTx, deps: Pick<AppDeps, 'config'>, request: AiReviewRequest, total?: number): Promise<boolean> {
  const settings = await loadReviewSettings(db, deps.config);
  if (!settings.enabled) return false;
  if (request.kind === 'ban' || request.kind === 'suspend') return true;
  if (request.kind === 'grant') return grantNeedsReview(settings, request.currency, request.amount);
  return grantNeedsReview(settings, request.currency, total ?? request.amountEach);
}

/**
 * Throws `review_required` unless the action may go ahead. Returns the id of the review it used, or
 * null when no review was needed.
 */
export async function useReview(tx: DbOrTx, deps: Pick<AppDeps, 'config'>, auth: AuthContext, request: AiReviewRequest, reviewId: string | undefined, total?: number): Promise<string | null> {
  if (!(await reviewNeeded(tx, deps, request, total))) return null;
  if (!reviewId) {
    throw new AppError(409, 'review_required', 'This action needs an AI review first. Start one: the reviewer reads the records and approves or declines.');
  }
  const [row] = (await tx.execute(sql`select * from ${aiReviews} where id = ${reviewId} for update`)).rows as {
    actor_id: string;
    status: string;
    request: AiReviewRequest;
    finished_at: Date | string | null;
    used_at: Date | string | null;
  }[];
  const refuse = (message: string) => new AppError(409, 'review_required', message);
  if (!row || row.actor_id !== auth.user.id) throw refuse('That review is not yours. Start a review of this action.');
  if (row.status !== 'approved' && row.status !== 'overridden') throw refuse('That review did not approve this action.');
  if (row.used_at) throw refuse('That review was already used. Start a new one.');
  const finished = row.finished_at ? new Date(row.finished_at).getTime() : 0;
  if (Date.now() - finished > AI_REVIEW_VALID_MINUTES * 60_000) throw refuse(`That review is more than ${AI_REVIEW_VALID_MINUTES} minutes old. Start a new one.`);
  if (requestKey(row.request) !== requestKey(request)) throw refuse('That review was for a different action, amount or reason. Start a review of exactly this one.');
  await tx.update(aiReviews).set({ usedAt: new Date() }).where(eq(aiReviews.id, reviewId));
  return reviewId;
}
