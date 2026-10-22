import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { aiDraftRequestSchema, type AiDraftResponse, type AiDraftStatus, type AiDraftUnavailable } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { aiDraftRequests } from '../../db/schema.ts';
import { requireAccount, type AuthContext } from '../../http/context.ts';
import { AppError, conflict, forbidden, tooMany } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { isFlagOn } from '../flags/service.ts';
import { DraftError, type DraftFailure, type DraftUsage } from './drafter.ts';

/*
 * AI question drafts (D37). Teachers, creators and staff describe a topic and
 * get draft questions back for the set editor, where they review every one
 * before saving. Off unless the ai.question_drafts flag is on for the person
 * and the server has an Anthropic API key. Each account gets a daily allowance
 * and the site a daily cap, both counted over a rolling 24 hours.
 */

export const AI_DRAFTS_PER_ACCOUNT_DAILY = 30;

/** Teachers, creators who publish public sets, and staff. Never guests or under-13s. */
function mayDraft(auth: AuthContext): boolean {
  if (auth.user.isGuest || auth.user.ageBand === 'under13') return false;
  return auth.user.accountType === 'teacher' || auth.permissions.has('sets.publish_public') || auth.permissions.has('staff.access');
}

async function unavailable(deps: AppDeps, auth: AuthContext): Promise<AiDraftUnavailable | null> {
  if (!mayDraft(auth)) return 'not_allowed';
  if (!(await isFlagOn(deps.db, 'ai.question_drafts', auth))) return 'not_enabled';
  if (!deps.drafter) return 'not_configured';
  return null;
}

/** Requests in the last 24 hours: this account's, everyone's, and this account's still running. */
async function usage(db: DbOrTx, userId: string) {
  const mine = sql`${aiDraftRequests.userId} = ${userId}`;
  const [row] = await db
    .select({
      mine: sql<number>`count(*) filter (where ${mine})::int`,
      all: sql<number>`count(*)::int`,
      running: sql<number>`count(*) filter (where ${mine} and ${aiDraftRequests.outcome} = 'pending' and ${aiDraftRequests.createdAt} > now() - interval '3 minutes')::int`,
    })
    .from(aiDraftRequests)
    .where(sql`${aiDraftRequests.createdAt} > now() - interval '24 hours'`);
  return row ?? { mine: 0, all: 0, running: 0 };
}

const FAILURES: Record<DraftFailure, { status: number; message: string }> = {
  refused: { status: 422, message: 'Claude would not draft questions for that. Try a different topic or wording.' },
  incomplete: { status: 502, message: 'The drafts were cut short. Ask for fewer questions.' },
  invalid: { status: 502, message: 'The drafts came back in a form Ludora could not use. Try again.' },
  busy: { status: 503, message: 'Drafting is busy right now. Try again in a minute.' },
  timeout: { status: 504, message: 'Drafting took too long. Try again, or ask for fewer questions.' },
  unavailable: { status: 503, message: 'AI drafts are not working right now. Try again later.' },
};

export async function aiRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/ai/drafts/status', async (req): Promise<AiDraftStatus> => {
    const auth = requireAccount(req);
    const reason = await unavailable(deps, auth);
    const used = await usage(deps.db, auth.user.id);
    return { available: reason === null, ...(reason ? { reason } : {}), remainingToday: Math.max(0, AI_DRAFTS_PER_ACCOUNT_DAILY - used.mine), limitToday: AI_DRAFTS_PER_ACCOUNT_DAILY };
  });

  app.post('/api/ai/drafts', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req): Promise<AiDraftResponse> => {
    const auth = requireAccount(req);
    const reason = await unavailable(deps, auth);
    if (reason === 'not_allowed') throw forbidden('AI drafts are for teacher accounts.');
    if (reason === 'not_enabled') throw new AppError(403, 'not_available', 'AI drafts are not switched on here.');
    const drafter = deps.drafter;
    if (!drafter) throw new AppError(503, 'not_available', 'AI drafts are not set up on this server.');
    const body = parse(aiDraftRequestSchema, req.body);

    // Reserve the request under a lock, so parallel requests cannot slip past the limits together.
    const { id, mine } = await deps.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ludora.ai_drafts'))`);
      const used = await usage(tx, auth.user.id);
      if (used.running) throw conflict('Your last request is still drafting. Wait for it to finish.');
      if (used.mine >= AI_DRAFTS_PER_ACCOUNT_DAILY) throw tooMany(`You can ask for drafts ${AI_DRAFTS_PER_ACCOUNT_DAILY} times a day. Try again tomorrow.`);
      if (used.all >= deps.config.AI_DRAFTS_DAILY_LIMIT) throw new AppError(503, 'not_available', 'Drafting has reached its daily limit on this site. Try again tomorrow.');
      const [row] = await tx.insert(aiDraftRequests).values({ userId: auth.user.id, model: drafter.model, requested: body.count }).returning({ id: aiDraftRequests.id });
      return { id: row!.id, mine: used.mine + 1 };
    });

    const record = (outcome: 'ok' | 'refused' | 'failed', returned: number, used?: DraftUsage) =>
      deps.db
        .update(aiDraftRequests)
        .set({ outcome, returned, inputTokens: used?.inputTokens ?? null, outputTokens: used?.outputTokens ?? null })
        .where(eq(aiDraftRequests.id, id));

    try {
      const result = await drafter.draft(body);
      await record('ok', result.questions.length, result.usage);
      req.log.info({ userId: auth.user.id, requested: body.count, returned: result.questions.length, dropped: result.dropped, ...result.usage }, 'ai drafts');
      return { questions: result.questions, dropped: result.dropped, remainingToday: Math.max(0, AI_DRAFTS_PER_ACCOUNT_DAILY - mine) };
    } catch (err) {
      const draftError = err instanceof DraftError ? err : null;
      await record(draftError?.kind === 'refused' ? 'refused' : 'failed', 0, draftError?.usage);
      if (!draftError) throw err;
      // A key or model problem needs the operator, not the teacher: log the detail, show the plain message.
      req.log[draftError.kind === 'unavailable' ? 'error' : 'warn']({ userId: auth.user.id, kind: draftError.kind, detail: draftError.message }, 'ai drafts failed');
      const failure = FAILURES[draftError.kind];
      throw new AppError(failure.status, draftError.kind === 'refused' ? 'validation_failed' : 'not_available', failure.message);
    }
  });
}
