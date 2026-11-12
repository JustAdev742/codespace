import { eq, sql } from 'drizzle-orm';
import type { AiAllowance } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { aiRequests, aiSettings } from '../../db/schema.ts';
import { AppError, conflict, tooMany } from '../../lib/errors.ts';
import type { AiModel } from './providers.ts';

/*
 * The allowance. Each account may make N helper requests in any rolling
 * window of H hours (20 in 5 by default), and the whole site a capped number
 * in any 24 hours, so a few people cannot use up a free key's own limit.
 * Staff change N, H and the cap on the AI staff page; the server counts and
 * decides, inside a lock, so parallel requests cannot slip past together.
 */

export interface AiSettings {
  perAccount: number;
  windowHours: number;
  /** The cap in force: the staff setting, or AI_DRAFTS_DAILY_LIMIT. */
  siteDailyCap: number;
  /** The staff setting alone; null when the configured default applies. */
  siteDailyCapSetting: number | null;
  disabledModels: string[];
}

export async function loadAiSettings(db: DbOrTx, deps: Pick<AppDeps, 'config'>): Promise<AiSettings> {
  const [row] = await db.select().from(aiSettings).where(eq(aiSettings.id, 'site'));
  return {
    perAccount: row?.perAccount ?? 20,
    windowHours: row?.windowHours ?? 5,
    siteDailyCap: row?.siteDailyCap ?? deps.config.AI_DRAFTS_DAILY_LIMIT,
    siteDailyCapSetting: row?.siteDailyCap ?? null,
    disabledModels: row?.disabledModels ?? [],
  };
}

/** Configured models staff have not switched off, in configuration order. */
export function enabledModels(deps: AppDeps, settings: Pick<AiSettings, 'disabledModels'>): AiModel[] {
  const off = new Set(settings.disabledModels);
  return (deps.ai ?? []).flatMap((p) => p.models).filter((m) => !off.has(m.id));
}

/** Requests that use up the allowance: everything but provider failures, which are not the person's doing. */
const COUNTED = sql`${aiRequests.outcome} <> 'failed'`;

export async function allowanceFor(db: DbOrTx, userId: string, settings: AiSettings): Promise<AiAllowance & { running: number }> {
  const since = sql`now() - make_interval(hours => ${settings.windowHours})`;
  const [row] = await db
    .select({
      used: sql<number>`count(*) filter (where ${COUNTED})::int`,
      oldest: sql<Date | null>`min(${aiRequests.createdAt}) filter (where ${COUNTED})`,
      running: sql<number>`count(*) filter (where ${aiRequests.outcome} = 'pending' and ${aiRequests.createdAt} > now() - interval '3 minutes')::int`,
    })
    .from(aiRequests)
    .where(sql`${aiRequests.userId} = ${userId} and ${aiRequests.createdAt} > ${since}`);
  const used = row?.used ?? 0;
  const remaining = Math.max(0, settings.perAccount - used);
  // The oldest counted request leaves the window first, and gives one request back.
  const oldest = row?.oldest ? new Date(row.oldest) : null;
  const nextAt = remaining < settings.perAccount && oldest ? new Date(oldest.getTime() + settings.windowHours * 3_600_000).toISOString() : null;
  return { limit: settings.perAccount, remaining, windowHours: settings.windowHours, nextAt, running: row?.running ?? 0 };
}

const timeText = (iso: string | null) => {
  if (!iso) return 'later';
  const mins = Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 60_000));
  return mins < 90 ? `in ${mins} minute${mins === 1 ? '' : 's'}` : `in about ${Math.round(mins / 60)} hours`;
};

/** Reserves one request for this account under a lock, or explains why not. */
export async function reserveRequest(deps: AppDeps, userId: string, task: string, ipHash: string | null): Promise<{ id: string; settings: AiSettings }> {
  return deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ludora.ai_requests'))`);
    const settings = await loadAiSettings(tx, deps);
    const mine = await allowanceFor(tx, userId, settings);
    if (mine.running) throw conflict('Your last helper request is still running. Wait for it to finish.');
    if (mine.remaining <= 0) throw tooMany(`You have used your ${settings.perAccount} helper requests for now. One more arrives ${timeText(mine.nextAt)}.`);
    const [site] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(aiRequests)
      .where(sql`${aiRequests.createdAt} > now() - interval '24 hours'`);
    if ((site?.n ?? 0) >= settings.siteDailyCap) throw new AppError(503, 'not_available', 'AI helpers have reached their daily limit on this site. Try again tomorrow.');
    const [row] = await tx.insert(aiRequests).values({ userId, task, ipHash }).returning({ id: aiRequests.id });
    return { id: row!.id, settings };
  });
}

export async function finishRequest(db: DbOrTx, id: string, result: { outcome: 'ok' | 'refused' | 'filtered' | 'failed'; provider?: string; model?: string; inputTokens?: number; outputTokens?: number }) {
  await db
    .update(aiRequests)
    .set({ outcome: result.outcome, provider: result.provider ?? null, model: result.model ?? null, inputTokens: result.inputTokens ?? null, outputTokens: result.outputTokens ?? null })
    .where(eq(aiRequests.id, id));
}
