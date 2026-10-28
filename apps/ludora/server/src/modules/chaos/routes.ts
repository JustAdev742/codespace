import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { CHAOS_CATEGORIES, chaosCatalog, comboCatalog } from '@ludora/engine/chaos';
import { LOOKS, TAUNTS } from '@ludora/engine/chaos-overlays';
import type { AppDeps } from '../../app.ts';
import { noStore, requireAuth } from '../../http/context.ts';
import { parse } from '../../lib/validate.ts';
import { chaosService } from './service.ts';

/*
 * The lantern routes: the secret sequence and, for accounts that finished
 * it, the cheat catalogue and the menu's code. Routes that only unlocked
 * accounts may use answer exactly like a route that does not exist, so
 * nobody can tell from the outside what is behind them.
 */

async function hidden(req: FastifyRequest, reply: FastifyReply, deps: AppDeps): Promise<boolean> {
  if (!req.auth || !(await chaosService(deps).isUnlocked(req.auth.user.id))) {
    await reply.callNotFound();
    return true;
  }
  return false;
}

export async function chaosRoutes(app: FastifyInstance, deps: AppDeps) {
  const chaos = chaosService(deps);
  const limited = (max: number) => ({ config: { rateLimit: { max, timeWindow: '1 minute', keyGenerator: (req: FastifyRequest) => (req.auth ? `lantern:${req.auth.user.id}` : `lantern-ip:${req.ip || 'gone'}`) } } });

  /** The rhythm the About page's lantern flickers in, as beats. A hint, not a key: the server checks every stage. */
  app.get('/api/lantern/flicker', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=3600');
    return { beats: chaos.beats };
  });

  app.post('/api/lantern/knock', limited(30), async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const body = parse(z.object({ gaps: z.array(z.number().min(0).max(5000)).max(16) }), req.body);
    return chaos.tracker.knock(auth.user.id, body.gaps);
  });

  app.post('/api/lantern/riddle', limited(20), async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const body = parse(z.object({ answer: z.string().max(60) }), req.body);
    const r = chaos.tracker.answer(auth.user.id, body.answer);
    if (r.ok) return { ok: true, ritual: r.ritual };
    if (r.reason === 'reset') return { ok: false, reset: true, message: 'The lantern goes dark. Start again from the beginning.' };
    if (r.reason === 'wrong') return { ok: false, message: 'The lantern flickers, but stays dim. That is not the one.' };
    return { ok: false, message: 'Nothing happens.' };
  });

  app.post('/api/lantern/light', limited(10), async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    if (!chaos.tracker.light(auth.user.id)) return { ok: false, message: 'Nothing happens.' };
    await chaos.setUnlocked(auth, true);
    return { ok: true };
  });

  app.get('/api/lantern/status', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    return { lit: await chaos.isUnlocked(auth.user.id), stage: chaos.tracker.stage(auth.user.id) };
  });

  /** Players can put the lantern out again; the sequence must then be repeated. */
  app.post('/api/lantern/forget', limited(5), async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    chaos.tracker.forget(auth.user.id);
    if (await chaos.isUnlocked(auth.user.id)) await chaos.setUnlocked(auth, false);
    return { ok: true };
  });

  /** The cheat catalogue (names, descriptions, costs, compatibility). Unlocked accounts only. */
  app.get('/api/lantern/book', async (req, reply) => {
    if (await hidden(req, reply, deps)) return reply;
    reply.header('cache-control', 'private, no-store');
    return { categories: CHAOS_CATEGORIES, cheats: chaosCatalog(), combos: comboCatalog(), looks: LOOKS, taunts: TAUNTS };
  });

  /** The menu's code, built separately from the public app and never served as a static file. */
  app.get('/api/lantern/book.js', async (req, reply) => {
    if (await hidden(req, reply, deps)) return reply;
    const file = resolve(process.cwd(), deps.config.WEB_PRIVATE_DIST, 'chaos-menu.js');
    let code: string;
    try {
      code = await readFile(file, 'utf8');
    } catch {
      return reply.code(503).send({ error: { code: 'unavailable', message: 'The menu has not been built on this server.' } });
    }
    reply.header('cache-control', 'private, no-store').type('text/javascript; charset=utf-8');
    return code;
  });
}
