import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { staffReasonSchema } from '@ludora/shared';
import { CELEBRATIONS, isoDay, parseDay, sydneyDate, windowOf, type SeasonOverrides } from '@ludora/content/seasons';
import type { AppDeps } from '../../app.ts';
import { noStore } from '../../http/context.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { clearSeasonCache, currentSeason, saveSeasonOverrides, seasonOverrides } from '../events/season.ts';
import { audit, staff, staffLimit } from './common.ts';

/*
 * The seasonal calendar for staff. Celebrations come round by themselves;
 * staff only step in when a real event's dates differ from the usual rule
 * (Book Week moved a week) or a celebration should be left out one year.
 * Every change is for one year, needs a reason and is audited.
 */

const patchSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  start: z.string().max(10).optional(),
  end: z.string().max(10).optional(),
  off: z.boolean().optional(),
  reset: z.boolean().optional(),
  reason: staffReasonSchema,
});

const span = (a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }) => (Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000;

export async function adminSeasonRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  app.get('/api/admin/season', async (req, reply) => {
    noStore(reply);
    staff(req, 'events.manage');
    const { year } = parse(z.object({ year: z.coerce.number().int().min(2020).max(2100).optional() }), req.query);
    const y = year ?? sydneyDate(new Date()).y;
    const overrides = await seasonOverrides(db);
    return {
      today: await currentSeason(db),
      year: y,
      celebrations: CELEBRATIONS.map((c) => {
        const k = `${c.id}:${y}`;
        const usual = windowOf(c, y);
        const w = windowOf(c, y, overrides);
        return {
          id: c.id,
          name: c.name,
          tagline: c.tagline,
          priority: c.priority,
          usual: usual ? { start: isoDay(usual.start), end: isoDay(usual.end) } : null,
          window: w ? { start: isoDay(w.start), end: isoDay(w.end) } : null,
          changed: k in overrides ? (overrides[k] === null ? 'off' : 'moved') : null,
        };
      }),
    };
  });

  /** Move a celebration for one year, leave it out that year, or put it back to the usual dates. */
  app.patch('/api/admin/season/:id', staffLimit(20), async (req) => {
    const auth = staff(req, 'events.manage');
    const { id } = parse(z.object({ id: z.string().max(40) }), req.params);
    const c = CELEBRATIONS.find((x) => x.id === id);
    if (!c) throw notFound('No celebration with that id.');
    const body = parse(patchSchema, req.body);
    const k = `${c.id}:${body.year}`;
    const kinds = [body.start !== undefined || body.end !== undefined, body.off === true, body.reset === true].filter(Boolean).length;
    if (kinds !== 1) throw new AppError(400, 'validation_failed', 'Send new dates, or off, or reset: one of them.');

    let next: { start: { y: number; m: number; d: number }; end: { y: number; m: number; d: number } } | null | undefined;
    if (body.reset) next = undefined;
    else if (body.off) next = null;
    else {
      const start = parseDay(body.start ?? '');
      const end = parseDay(body.end ?? '');
      if (!start || !end) throw new AppError(400, 'validation_failed', 'Dates are YYYY-MM-DD.', { ...(start ? {} : { start: 'Pick a start date.' }), ...(end ? {} : { end: 'Pick an end date.' }) });
      if (start.y !== body.year || end.y !== body.year) throw new AppError(400, 'validation_failed', `Both dates have to be in ${body.year}.`);
      const days = span(start, end);
      if (days < 0) throw new AppError(400, 'validation_failed', 'The end has to be on or after the start.', { end: 'The end has to be on or after the start.' });
      if (days > 30) throw new AppError(400, 'validation_failed', 'A celebration lasts a month at most.', { end: 'A celebration lasts a month at most.' });
      next = { start, end };
    }

    return db.transaction(async (tx) => {
      const overrides = await seasonOverrides(tx);
      const before = k in overrides ? overrides[k] : 'usual';
      const updated: SeasonOverrides = { ...overrides };
      if (next === undefined) delete updated[k];
      else updated[k] = next;
      // Drop changes for years long gone, so the stored value stays small.
      const thisYear = sydneyDate(new Date()).y;
      for (const key of Object.keys(updated)) if (Number(key.split(':')[1]) < thisYear - 1) delete updated[key];
      await saveSeasonOverrides(tx, updated, auth.user.id);
      await audit(deps, req, tx, {
        actor: auth,
        action: 'season.update',
        targetType: 'celebration',
        targetId: k,
        targetName: `${c.name} ${body.year}`,
        reason: body.reason,
        before: { window: before },
        after: { window: next === undefined ? 'usual' : next },
      });
      clearSeasonCache();
      return { ok: true };
    });
  });
}
