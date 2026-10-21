import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { staffReasonSchema } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { uploads } from '../../db/schema.ts';
import { requireAccount, requirePermission } from '../../http/context.ts';
import { ipKey } from '../../http/limits.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { audit, staff, staffLimit } from '../admin/common.ts';
import { IMAGE_EXT, IMAGE_MIME, MAX_IMAGE_SIDE, imageSize, sniffImage, stripMetadata } from './images.ts';
import { UPLOAD_FILE } from './service.ts';

/*
 * Question images. Anyone who can make sets uploads PNG, JPEG, GIF or WebP up
 * to 2 MB (the multipart limit in app.ts). The format comes from the file's
 * own bytes, so an SVG or HTML file named .png is refused; dimensions are
 * capped; metadata such as GPS positions is removed; files get random names.
 * Staff can hide an upload, which stops it being served or added to sets.
 */

/** Plenty for many long sets with an image on every question. */
export const MAX_UPLOADS_PER_ACCOUNT = 1000;
const MIME_BY_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

export async function uploadRoutes(app: FastifyInstance, deps: AppDeps) {
  const dir = resolve(process.cwd(), deps.config.UPLOAD_DIR);
  const nope = () => notFound('No such image.');

  app.post('/api/uploads', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requirePermission(req, 'sets.create');
    requireAccount(req);
    if (!req.isMultipart()) throw new AppError(400, 'validation_failed', 'Choose an image to upload.');
    const file = await req.file();
    if (!file) throw new AppError(400, 'validation_failed', 'Choose an image to upload.');
    let data: Buffer;
    try {
      data = await file.toBuffer();
    } catch {
      throw new AppError(413, 'validation_failed', 'Images can be up to 2 MB.');
    }
    const kind = sniffImage(data);
    if (!kind) throw new AppError(415, 'validation_failed', 'Use a PNG, JPEG, GIF or WebP image.');
    const size = imageSize(data, kind);
    if (!size || size.width < 1 || size.height < 1) throw new AppError(400, 'validation_failed', 'That image looks damaged. Try saving it again.');
    if (size.width > MAX_IMAGE_SIDE || size.height > MAX_IMAGE_SIDE) {
      throw new AppError(400, 'validation_failed', `Images can be up to ${MAX_IMAGE_SIDE} pixels on each side; this one is ${size.width} by ${size.height}.`);
    }
    const [mine] = await deps.db.select({ n: count() }).from(uploads).where(eq(uploads.ownerId, auth.user.id));
    if ((mine?.n ?? 0) >= MAX_UPLOADS_PER_ACCOUNT) throw new AppError(409, 'conflict', 'You have reached the limit for uploaded images.');

    const clean = stripMetadata(data, kind);
    const id = randomBytes(16).toString('hex');
    const name = `${id}.${IMAGE_EXT[kind]}`;
    await mkdir(dir, { recursive: true });
    // Write under a temporary name first, so a half-written file is never served.
    const part = join(dir, `.${name}.part`);
    await writeFile(part, clean, { flag: 'wx' });
    await rename(part, join(dir, name));
    await deps.db.insert(uploads).values({ id, ownerId: auth.user.id, mime: IMAGE_MIME[kind], bytes: clean.length, width: size.width, height: size.height, sha256: createHash('sha256').update(clean).digest('hex') });
    return { url: `/uploads/${name}`, width: size.width, height: size.height, bytes: clean.length };
  });

  // Images are not under /api, so the global limit skips them; this one is per IP and generous,
  // since a whole class loads each question's image at once.
  app.get('/uploads/:name', { config: { rateLimit: { max: 1200, timeWindow: '1 minute', keyGenerator: ipKey, allowList: () => false } } }, async (req, reply) => {
    const m = UPLOAD_FILE.exec((req.params as { name: string }).name);
    if (!m) throw nope();
    const [row] = await deps.db.select({ hiddenAt: uploads.hiddenAt }).from(uploads).where(eq(uploads.id, m[1]!)).limit(1);
    if (!row || row.hiddenAt) throw nope();
    const path = join(dir, `${m[1]}.${m[2]}`);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) throw nope();
    return reply
      .type(MIME_BY_EXT[m[2]!]!)
      .header('content-length', info.size)
      // A day, not forever: a hidden image should stop showing soon after staff hide it.
      .header('cache-control', 'public, max-age=86400')
      // Opened on its own, the file can run nothing.
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('content-disposition', 'inline')
      .send(createReadStream(path));
  });

  app.post('/api/admin/uploads/:id/visibility', staffLimit(30), async (req) => {
    const auth = staff(req, 'content.moderate');
    const { id } = parse(z.object({ id: z.string().regex(/^[a-f0-9]{32}$/) }), req.params);
    const body = parse(z.object({ hidden: z.boolean(), reason: staffReasonSchema }), req.body);
    return deps.db.transaction(async (tx) => {
      const [before] = await tx.select().from(uploads).where(eq(uploads.id, id)).for('update');
      if (!before) throw nope();
      const [after] = await tx
        .update(uploads)
        .set(body.hidden ? { hiddenAt: new Date(), hiddenBy: auth.user.id } : { hiddenAt: null, hiddenBy: null })
        .where(eq(uploads.id, id))
        .returning();
      await audit(deps, req, tx, { actor: auth, action: body.hidden ? 'upload.hide' : 'upload.restore', targetType: 'upload', targetId: id, reason: body.reason, before, after });
      return { ok: true, hidden: body.hidden };
    });
  });
}
