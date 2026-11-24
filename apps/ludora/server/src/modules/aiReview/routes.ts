import Anthropic from '@anthropic-ai/sdk';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  AI_REVIEW_RUN_LIMIT_MINUTES,
  AI_REVIEW_VALID_MINUTES,
  aiReviewRequestSchema,
  realGrantCap,
  reasonProblem,
  staffReasonSchema,
  type AiReviewRequest,
  type AiReviewVerdict,
  type AiReviewView,
} from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { aiReviewSettings, aiReviews, classes, users } from '../../db/schema.ts';
import { noStore, type AuthContext } from '../../http/context.ts';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { assertCanActOn, audit, loadUser, staff, staffLimit } from '../admin/common.ts';
import { Evidence } from './evidence.ts';
import { investigate, InvestigationFailed, type CaseText, type ReviewClient } from './investigator.ts';
import { keyHint, sealKey } from './secret.ts';
import { loadReviewSettings, reviewApiKey } from './settings.ts';

/*
 * AI review routes: start a review, read one, list recent ones, override a decline (super
 * administrators only), and the settings (on or off, model, thresholds, the API key). A review runs in
 * the background after it is started; the page asks for it until it has finished.
 */

type ReviewRow = typeof aiReviews.$inferSelect;

/** Reviews still running in this process, so tests (and a graceful stop) can wait for them. */
const inFlight = new Set<Promise<void>>();
export async function reviewsSettled(): Promise<void> {
  while (inFlight.size) await Promise.allSettled(inFlight);
}

function defaultClient(apiKey: string): ReviewClient {
  return new Anthropic({ apiKey, timeout: 180_000, maxRetries: 2 });
}

/** Reading reviews and settings: anyone who may moderate or grant, or read the AI page. */
function reader(req: FastifyRequest): AuthContext {
  for (const p of ['flags.manage', 'system.view', 'users.moderate', 'economy.grant'] as const) {
    try {
      return staff(req, p);
    } catch {
      /* try the next */
    }
  }
  throw forbidden();
}

function isSuperadmin(auth: AuthContext): boolean {
  return auth.roles.includes('superadmin');
}

async function targetName(deps: AppDeps, r: AiReviewRequest): Promise<string> {
  if (r.kind === 'class_grant') {
    const [c] = await deps.db.select({ name: classes.name }).from(classes).where(eq(classes.id, r.classId)).limit(1);
    if (!c) throw notFound('No class with that id.');
    return c.name;
  }
  const [u] = await deps.db.select({ username: users.username, displayName: users.displayName }).from(users).where(eq(users.id, r.userId)).limit(1);
  if (!u) throw notFound('No account with that id.');
  return u.username ?? u.displayName;
}

async function views(deps: AppDeps, rows: ReviewRow[]): Promise<AiReviewView[]> {
  const ids = [...new Set(rows.flatMap((r) => [r.actorId, r.overriddenBy].filter((x): x is string => Boolean(x))))];
  const names = new Map((ids.length ? await deps.db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, ids)) : []).map((u) => [u.id, u.name]));
  const out: AiReviewView[] = [];
  for (const r of rows) {
    const request = r.request as AiReviewRequest;
    const usable = (r.status === 'approved' || r.status === 'overridden') && !r.usedAt && r.finishedAt;
    out.push({
      id: r.id,
      kind: r.kind as AiReviewView['kind'],
      status: r.status as AiReviewView['status'],
      source: (r.source as AiReviewView['source']) ?? null,
      request,
      targetName: await targetName(deps, request).catch(() => 'a removed account'),
      actorName: names.get(r.actorId) ?? 'a removed account',
      verdict: (r.verdict as AiReviewVerdict | null) ?? null,
      error: r.error,
      override: r.overriddenBy || r.overrideReason ? { byName: (r.overriddenBy && names.get(r.overriddenBy)) || 'a super administrator', reason: r.overrideReason ?? '' } : null,
      model: r.model,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      usedAt: r.usedAt?.toISOString() ?? null,
      validUntil: usable ? new Date(r.finishedAt!.getTime() + AI_REVIEW_VALID_MINUTES * 60_000).toISOString() : null,
    });
  }
  return out;
}

/** A review that has been "running" for longer than any review takes did not finish (a restart, a crash). */
async function settleStale(deps: AppDeps, row: ReviewRow): Promise<ReviewRow> {
  if (row.status !== 'running' || Date.now() - row.createdAt.getTime() < AI_REVIEW_RUN_LIMIT_MINUTES * 60_000) return row;
  const [r] = await deps.db.update(aiReviews).set({ status: 'failed', error: 'The review did not finish. Start it again.', finishedAt: new Date() }).where(and(eq(aiReviews.id, row.id), eq(aiReviews.status, 'running'))).returning();
  return r ?? row;
}

async function run(deps: AppDeps, row: ReviewRow, caseText: CaseText): Promise<void> {
  const settings = await loadReviewSettings(deps.db, deps.config);
  const key = await reviewApiKey(deps.db, deps.config);
  try {
    if (!key) throw new InvestigationFailed('No API key is set. A super administrator can add one on the staff AI page.');
    const client = (deps.reviewClient ?? defaultClient)(key);
    const evidence = new Evidence(deps.db, { reviewId: row.id, request: row.request as AiReviewRequest, actorId: row.actorId });
    const out = await investigate(client, settings.model, evidence, caseText);
    await deps.db
      .update(aiReviews)
      .set({ status: out.verdict.decision === 'approve' ? 'approved' : 'declined', source: 'ai', verdict: out.verdict, model: settings.model, inputTokens: out.inputTokens, outputTokens: out.outputTokens, finishedAt: new Date() })
      .where(eq(aiReviews.id, row.id));
  } catch (err) {
    const message = err instanceof InvestigationFailed ? err.message : 'The review failed unexpectedly.';
    if (!(err instanceof InvestigationFailed)) deps.log?.error({ err, review: row.id }, 'ai review failed');
    await deps.db.update(aiReviews).set({ status: 'failed', error: message, model: settings.model, finishedAt: new Date() }).where(eq(aiReviews.id, row.id));
  }
}

export async function aiReviewRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  /* --------------------------------- reviews --------------------------------- */

  app.post('/api/admin/reviews', staffLimit(10), async (req) => {
    const request = parse(aiReviewRequestSchema, req.body);
    const auth = staff(req, request.kind === 'ban' || request.kind === 'suspend' ? 'users.moderate' : 'economy.grant');
    const settings = await loadReviewSettings(db, deps.config);
    if (!settings.enabled) throw conflict('AI review is switched off on this site.');
    // The same checks the action itself makes about who may act on whom, so no review is spent on an action that would be refused anyway.
    if (request.kind !== 'class_grant') {
      const target = await loadUser(db, request.userId);
      if (target.user.id === auth.user.id) throw forbidden('You cannot take this action on your own account.');
      if (request.kind === 'ban' || request.kind === 'suspend') assertCanActOn(auth, target, 'moderate this account');
    }
    const name = await targetName(deps, request);
    const base = { actorId: auth.user.id, kind: request.kind, targetType: request.kind === 'class_grant' ? 'class' : 'user', targetId: request.kind === 'class_grant' ? request.classId : request.userId, request };

    // The first check: a reason that is not words at all is declined without asking the AI.
    const problem = reasonProblem(request.reason);
    if (problem) {
      const verdict: AiReviewVerdict = { decision: 'decline', reasonQuality: 'meaningless', summary: problem, findings: [], concerns: [], suggestion: null };
      const [row] = await db.insert(aiReviews).values({ ...base, status: 'declined', source: 'first_check', verdict, finishedAt: new Date() }).returning();
      return { review: (await views(deps, [row!]))[0] };
    }

    const [row] = await db.insert(aiReviews).values({ ...base, status: 'running', model: settings.model }).returning();
    const grantContext =
      request.kind === 'grant' || request.kind === 'class_grant' ? { cap: realGrantCap(request.currency), threshold: settings.thresholds[request.currency] ?? 0 } : undefined;
    const job = run(deps, row!, { request, targetName: name, grantContext }).finally(() => inFlight.delete(job));
    inFlight.add(job);
    return { review: (await views(deps, [row!]))[0] };
  });

  app.get('/api/admin/reviews/:id', async (req, reply) => {
    noStore(reply);
    const auth = reader(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const [found] = await db.select().from(aiReviews).where(eq(aiReviews.id, id)).limit(1);
    if (!found) throw notFound('No review with that id.');
    if (found.actorId !== auth.user.id && !auth.permissions.has('system.view') && !auth.permissions.has('flags.manage')) throw notFound('No review with that id.');
    return { review: (await views(deps, [await settleStale(deps, found)]))[0] };
  });

  app.get('/api/admin/reviews', async (req, reply) => {
    noStore(reply);
    const auth = reader(req);
    const q = parse(z.object({ before: z.string().datetime().optional() }), req.query);
    const everyone = auth.permissions.has('system.view') || auth.permissions.has('flags.manage');
    const rows = await db
      .select()
      .from(aiReviews)
      .where(and(everyone ? undefined : eq(aiReviews.actorId, auth.user.id), q.before ? lt(aiReviews.createdAt, new Date(q.before)) : undefined))
      .orderBy(desc(aiReviews.createdAt))
      .limit(30);
    const [cost] = await db
      .select({ input: sql<number>`coalesce(sum(${aiReviews.inputTokens}), 0)::int`, output: sql<number>`coalesce(sum(${aiReviews.outputTokens}), 0)::int`, n: sql<number>`count(*)::int` })
      .from(aiReviews)
      .where(sql`${aiReviews.createdAt} > now() - interval '30 days'`);
    return { reviews: await views(deps, rows), last30Days: { reviews: cost?.n ?? 0, inputTokens: cost?.input ?? 0, outputTokens: cost?.output ?? 0 } };
  });

  /**
   * A super administrator can let a declined or failed review's action go ahead, with a written
   * reason, for when the AI is unavailable or wrong and the action cannot wait. Recorded in the audit log.
   */
  app.post('/api/admin/reviews/:id/override', staffLimit(10), async (req) => {
    const auth = staff(req, 'roles.assign');
    if (!isSuperadmin(auth)) throw forbidden('Only a super administrator can override a review.');
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(z.object({ reason: staffReasonSchema }), req.body);
    const problem = reasonProblem(body.reason);
    if (problem || body.reason.trim().length < 30) throw new AppError(400, 'validation_failed', problem ?? 'Explain why the action cannot wait for a review that approves it (at least 30 characters).', { reason: problem ?? 'At least 30 characters.' });
    const review = await db.transaction(async (tx) => {
      const [r] = (await tx.execute(sql`select * from ${aiReviews} where id = ${id} for update`)).rows as { status: string; used_at: unknown; kind: string; target_id: string }[];
      if (!r) throw notFound('No review with that id.');
      if (r.status !== 'declined' && r.status !== 'failed') throw conflict('Only a declined or failed review can be overridden.');
      if (r.used_at) throw conflict('That review was already used.');
      const [updated] = await tx.update(aiReviews).set({ status: 'overridden', source: 'override', overriddenBy: auth.user.id, overrideReason: body.reason.trim(), finishedAt: new Date() }).where(eq(aiReviews.id, id)).returning();
      await audit(deps, req, tx, { actor: auth, action: 'ai_review.override', targetType: 'ai_review', targetId: id, targetName: `${r.kind} ${r.target_id}`, reason: body.reason, before: { status: r.status }, after: { status: 'overridden' } });
      return updated!;
    });
    return { review: (await views(deps, [review]))[0] };
  });

  /* --------------------------------- settings --------------------------------- */

  const describe = async (auth: AuthContext) => {
    const s = await loadReviewSettings(db, deps.config);
    return { settings: { ...s, canChange: auth.permissions.has('flags.manage'), canChangeKey: isSuperadmin(auth) } };
  };

  app.get('/api/admin/ai/review', async (req, reply) => {
    noStore(reply);
    return describe(reader(req));
  });

  app.put('/api/admin/ai/review', staffLimit(10), async (req) => {
    const auth = staff(req, 'flags.manage');
    const body = parse(
      z.object({
        enabled: z.boolean(),
        model: z.string().trim().regex(/^[a-z0-9][a-z0-9.-]{2,80}$/, 'A model id, for example claude-opus-5-5.').nullable(),
        thresholds: z.record(z.string().regex(/^[a-z_]{1,32}$/), z.number().int().min(1).max(1_000_000)),
        reason: staffReasonSchema,
      }),
      req.body,
    );
    const before = await loadReviewSettings(db, deps.config);
    if (body.enabled && before.keySource === 'none') throw conflict('Add an API key before switching AI review on.');
    // Switching review off is a big step for safety: a super administrator's call.
    if (before.enabled && !body.enabled && !isSuperadmin(auth)) throw forbidden('Only a super administrator can switch AI review off.');
    await db.transaction(async (tx) => {
      await tx
        .insert(aiReviewSettings)
        .values({ id: 'site', enabled: body.enabled, model: body.model, thresholds: body.thresholds, updatedBy: auth.user.id })
        .onConflictDoUpdate({ target: aiReviewSettings.id, set: { enabled: body.enabled, model: body.model, thresholds: body.thresholds, updatedBy: auth.user.id, updatedAt: new Date() } });
      await audit(deps, req, tx, {
        actor: auth,
        action: 'ai_review.settings',
        targetType: 'ai_review',
        targetId: 'site',
        reason: body.reason,
        before: { enabled: before.enabled, model: before.modelSetting, thresholds: before.thresholds },
        after: { enabled: body.enabled, model: body.model, thresholds: body.thresholds },
      });
    });
    return describe(auth);
  });

  app.put('/api/admin/ai/review/key', staffLimit(5), async (req) => {
    const auth = staff(req, 'roles.assign');
    if (!isSuperadmin(auth)) throw forbidden('Only a super administrator can change the API key.');
    const body = parse(z.object({ key: z.string().trim().regex(/^sk-ant-[A-Za-z0-9_-]{20,300}$/, 'That does not look like an Anthropic API key (they start with sk-ant-).'), reason: staffReasonSchema }), req.body);
    const hint = keyHint(body.key);
    await db.transaction(async (tx) => {
      await tx
        .insert(aiReviewSettings)
        .values({ id: 'site', keyCipher: sealKey(body.key, deps.config.IP_HASH_KEY), keyHint: hint, updatedBy: auth.user.id })
        .onConflictDoUpdate({ target: aiReviewSettings.id, set: { keyCipher: sealKey(body.key, deps.config.IP_HASH_KEY), keyHint: hint, updatedBy: auth.user.id, updatedAt: new Date() } });
      // The key itself is never written to the log: only its last four characters.
      await audit(deps, req, tx, { actor: auth, action: 'ai_review.key_saved', targetType: 'ai_review', targetId: 'site', reason: body.reason, after: { keyHint: hint } });
    });
    return describe(auth);
  });

  app.post('/api/admin/ai/review/key/remove', staffLimit(5), async (req) => {
    const auth = staff(req, 'roles.assign');
    if (!isSuperadmin(auth)) throw forbidden('Only a super administrator can change the API key.');
    const body = parse(z.object({ reason: staffReasonSchema }), req.body);
    await db.transaction(async (tx) => {
      await tx.update(aiReviewSettings).set({ keyCipher: null, keyHint: null, updatedBy: auth.user.id, updatedAt: new Date() }).where(eq(aiReviewSettings.id, 'site'));
      await audit(deps, req, tx, { actor: auth, action: 'ai_review.key_removed', targetType: 'ai_review', targetId: 'site', reason: body.reason });
    });
    return describe(auth);
  });

  /** One tiny request to check the key and model work. */
  app.post('/api/admin/ai/review/test', staffLimit(5), async (req) => {
    staff(req, 'flags.manage');
    const settings = await loadReviewSettings(db, deps.config);
    const key = await reviewApiKey(db, deps.config);
    if (!key) throw conflict('No API key is set.');
    const client = (deps.reviewClient ?? defaultClient)(key);
    try {
      await client.beta.messages.create({ model: settings.model, max_tokens: 64, output_config: { effort: 'low' }, messages: [{ role: 'user', content: 'Reply with the word OK.' }] });
      return { ok: true, model: settings.model };
    } catch (err) {
      const message =
        err instanceof Anthropic.AuthenticationError
          ? 'The key was not accepted.'
          : err instanceof Anthropic.NotFoundError
            ? `The model ${settings.model} was not found.`
            : err instanceof Anthropic.PermissionDeniedError
              ? 'The key is not allowed to use this model.'
              : err instanceof Anthropic.APIConnectionError
                ? 'Could not reach api.anthropic.com.'
                : err instanceof Anthropic.APIError
                  ? `The API answered with an error (${err.status ?? 'unknown'}).`
                  : 'The test failed.';
      return { ok: false, model: settings.model, message };
    }
  });

}
