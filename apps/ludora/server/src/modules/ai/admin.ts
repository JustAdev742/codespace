import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { staffReasonSchema } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { aiFailures, aiRequests, aiSettings } from '../../db/schema.ts';
import { noStore, type AuthContext } from '../../http/context.ts';
import { notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { audit, staff, staffLimit } from '../admin/common.ts';
import { loadAiSettings } from './allowance.ts';

/*
 * The staff AI page: the providers and models the environment configures
 * (never their keys), which are switched on, the allowance settings, today's
 * use and recent failures by provider. Reading needs system.view or
 * flags.manage; changing anything needs flags.manage, a reason, and is
 * written to the audit log.
 */

/** Either permission reads the page. */
function reader(req: FastifyRequest): AuthContext {
  try {
    return staff(req, 'flags.manage');
  } catch {
    return staff(req, 'system.view');
  }
}

export async function aiAdminRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/admin/ai', async (req, reply) => {
    noStore(reply);
    const auth = reader(req);
    const settings = await loadAiSettings(deps.db, deps);
    const off = new Set(settings.disabledModels);
    const day = sql`now() - interval '24 hours'`;
    const [today] = await deps.db
      .select({
        total: sql<number>`count(*)::int`,
        ok: sql<number>`count(*) filter (where ${aiRequests.outcome} = 'ok')::int`,
        failed: sql<number>`count(*) filter (where ${aiRequests.outcome} = 'failed')::int`,
        refused: sql<number>`count(*) filter (where ${aiRequests.outcome} in ('refused','filtered'))::int`,
        people: sql<number>`count(distinct ${aiRequests.userId})::int`,
      })
      .from(aiRequests)
      .where(sql`${aiRequests.createdAt} > ${day}`);
    const byTask = await deps.db
      .select({ task: aiRequests.task, n: sql<number>`count(*)::int` })
      .from(aiRequests)
      .where(sql`${aiRequests.createdAt} > ${day}`)
      .groupBy(aiRequests.task)
      .orderBy(sql`count(*) desc`);
    const failures = await deps.db
      .select({ provider: aiFailures.provider, model: aiFailures.model, kind: aiFailures.kind, n: sql<number>`count(*)::int`, last: sql<Date>`max(${aiFailures.createdAt})` })
      .from(aiFailures)
      .where(sql`${aiFailures.createdAt} > now() - interval '7 days'`)
      .groupBy(aiFailures.provider, aiFailures.model, aiFailures.kind)
      .orderBy(sql`max(${aiFailures.createdAt}) desc`)
      .limit(50);
    return {
      canChange: auth.permissions.has('flags.manage'),
      providers: (deps.ai ?? []).map((p) => ({ name: p.name, kind: p.kind, host: p.host, models: p.models.map((m) => ({ id: m.id, label: m.label, model: m.model, enabled: !off.has(m.id) })) })),
      settings: { perAccount: settings.perAccount, windowHours: settings.windowHours, siteDailyCap: settings.siteDailyCap, siteDailyCapSetting: settings.siteDailyCapSetting, defaultSiteDailyCap: deps.config.AI_DRAFTS_DAILY_LIMIT },
      today: { ...(today ?? { total: 0, ok: 0, failed: 0, refused: 0, people: 0 }), byTask },
      failures: failures.map((f) => ({ ...f, last: new Date(f.last).toISOString() })),
    };
  });

  app.put('/api/admin/ai/settings', staffLimit(20), async (req) => {
    const auth = staff(req, 'flags.manage');
    const body = parse(
      z.object({
        perAccount: z.number().int().min(0, 'Use 0 or more.').max(1000, 'Use 1,000 or fewer.'),
        windowHours: z.number().int().min(1, 'Use at least 1 hour.').max(168, 'Use at most 168 hours (a week).'),
        siteDailyCap: z.number().int().min(0).max(1_000_000).nullable(),
        reason: staffReasonSchema,
      }),
      req.body,
    );
    const { reason, ...next } = body;
    return deps.db.transaction(async (tx) => {
      const before = await loadAiSettings(tx, deps);
      await tx
        .insert(aiSettings)
        .values({ id: 'site', ...next, updatedBy: auth.user.id })
        .onConflictDoUpdate({ target: aiSettings.id, set: { ...next, updatedAt: new Date(), updatedBy: auth.user.id } });
      await audit(deps, req, tx, { actor: auth, action: 'ai.settings', targetType: 'ai', targetId: 'settings', reason, before: { perAccount: before.perAccount, windowHours: before.windowHours, siteDailyCap: before.siteDailyCapSetting }, after: next });
      return { ok: true };
    });
  });

  app.put('/api/admin/ai/models', staffLimit(30), async (req) => {
    const auth = staff(req, 'flags.manage');
    const body = parse(z.object({ id: z.string().min(1).max(200), enabled: z.boolean(), reason: staffReasonSchema }), req.body);
    const known = (deps.ai ?? []).flatMap((p) => p.models).find((m) => m.id === body.id);
    if (!known) throw notFound('No configured model has that id.');
    return deps.db.transaction(async (tx) => {
      const before = await loadAiSettings(tx, deps);
      const disabled = body.enabled ? before.disabledModels.filter((id) => id !== body.id) : [...new Set([...before.disabledModels, body.id])];
      await tx
        .insert(aiSettings)
        .values({ id: 'site', disabledModels: disabled, updatedBy: auth.user.id })
        .onConflictDoUpdate({ target: aiSettings.id, set: { disabledModels: disabled, updatedAt: new Date(), updatedBy: auth.user.id } });
      await audit(deps, req, tx, { actor: auth, action: body.enabled ? 'ai.model_on' : 'ai.model_off', targetType: 'ai_model', targetId: body.id, targetName: known.label, reason: body.reason });
      return { ok: true };
    });
  });
}

