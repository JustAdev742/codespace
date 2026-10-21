import type { FastifyInstance } from 'fastify';
import { CATALOG } from '@ludora/engine/catalog';
import type { AppDeps } from '../../app.ts';
import { isFlagOn } from '../flags/service.ts';
import { modeVisibility } from './service.ts';

/** The mode catalogue with publication overrides applied for this viewer. */
export async function modeRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/modes', async (req) => {
    const vis = await modeVisibility(deps.db);
    const staff = Boolean(req.auth?.permissions.has('modes.manage'));
    const beta = staff || (await isFlagOn(deps.db, 'modes.beta', req.auth));
    const modes = CATALOG.filter((m) => staff || vis.get(m.meta.id) !== 'hidden')
      .filter((m) => beta || m.meta.status !== 'beta')
      .map((m) => ({
        meta: m.meta,
        settings: m.settings,
        featured: vis.get(m.meta.id) === 'featured',
        hidden: vis.get(m.meta.id) === 'hidden',
        variants: m.variants
          .filter((v) => staff || vis.get(v.meta.id) !== 'hidden')
          .filter((v) => beta || v.meta.status !== 'beta')
          .map((v) => ({ ...v, hidden: vis.get(v.meta.id) === 'hidden' })),
      }));
    return { modes, betaVisible: beta };
  });
}
