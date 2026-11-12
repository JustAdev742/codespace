import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CLIP_MAX_SECONDS, staffReasonSchema } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { uploadFiles, uploads } from '../../db/schema.ts';
import { requireAccount, requirePermission } from '../../http/context.ts';
import { ipKey } from '../../http/limits.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { audit, staff, staffLimit } from '../admin/common.ts';
import { AUDIO_MIME, readWav, sniffWav, WavError, writeWav } from './audio.ts';
import { IMAGE_EXT, IMAGE_MIME, MAX_IMAGE_SIDE, imageSize, sniffImage, stripMetadata } from './images.ts';
import { UPLOAD_FILE } from './service.ts';

/*
 * Question pictures and sound clips. Anyone who can make sets uploads PNG, JPEG, GIF or WebP
 * pictures up to 2 MB (the multipart limit in app.ts), and sound clips the editor has turned into
 * plain WAV files (audio.ts), up to CLIP_MAX_SECONDS long. The format comes from the file's own
 * bytes, so an SVG or HTML file named .png is refused; dimensions and lengths are capped; metadata
 * such as GPS positions is removed; files get random names. Staff can hide any upload, which
 * stops it being served or added to sets.
 *
 * Files are kept on disk (UPLOAD_DIR) or, with UPLOAD_STORE=db, in the database, where a host
 * that wipes its disk at every restart cannot lose them. In the database each account has a size
 * allowance and each file a smaller cap. Either way a file is served from /uploads/<name>, and
 * files on disk keep being served after a switch to the database.
 */

/** Plenty for many long sets with a picture on every question. */
export const MAX_UPLOADS_PER_ACCOUNT = 1000;
const MIME_BY_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', wav: AUDIO_MIME };
const idParam = z.object({ id: z.string().regex(/^[a-f0-9]{32}$/) });

const megabytes = (n: number) => `${(n / 1_000_000).toLocaleString('en-GB', { maximumFractionDigits: 1 })} MB`;

export async function uploadRoutes(app: FastifyInstance, deps: AppDeps) {
  const dir = resolve(process.cwd(), deps.config.UPLOAD_DIR);
  const inDb = deps.config.UPLOAD_STORE === 'db';
  const nope = () => notFound('No such file.');

  /** Bytes this account keeps in the database. */
  const usedInDb = async (ownerId: string): Promise<number> => {
    const [row] = await deps.db
      .select({ n: sql<number>`coalesce(sum(${uploads.bytes}), 0)::int` })
      .from(uploads)
      .innerJoin(uploadFiles, eq(uploadFiles.uploadId, uploads.id))
      .where(eq(uploads.ownerId, ownerId));
    return row?.n ?? 0;
  };

  app.post('/api/uploads', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requirePermission(req, 'sets.create');
    requireAccount(req);
    if (!req.isMultipart()) throw new AppError(400, 'validation_failed', 'Choose a picture or a sound to upload.');
    const file = await req.file();
    if (!file) throw new AppError(400, 'validation_failed', 'Choose a picture or a sound to upload.');
    let data: Buffer;
    try {
      data = await file.toBuffer();
    } catch {
      throw new AppError(413, 'validation_failed', 'Files can be up to 2 MB.');
    }
    let clean: Buffer;
    let mime: string;
    let ext: string;
    let width = 0;
    let height = 0;
    let seconds: number | null = null;
    if (sniffWav(data)) {
      let wav;
      try {
        wav = readWav(data);
      } catch (err) {
        throw new AppError(415, 'validation_failed', err instanceof WavError ? err.message : 'That sound file looks damaged.');
      }
      if (wav.seconds > CLIP_MAX_SECONDS + 0.05) throw new AppError(400, 'validation_failed', `Sound clips can be up to ${CLIP_MAX_SECONDS} seconds; this one is ${Math.round(wav.seconds)}. Trim it and try again.`);
      clean = writeWav(wav);
      mime = AUDIO_MIME;
      ext = 'wav';
      seconds = Math.round(wav.seconds * 100) / 100;
    } else {
      const kind = sniffImage(data);
      if (!kind) throw new AppError(415, 'validation_failed', 'Use a PNG, JPEG, GIF or WebP picture, or a sound recorded or chosen in the editor.');
      const size = imageSize(data, kind);
      if (!size || size.width < 1 || size.height < 1) throw new AppError(400, 'validation_failed', 'That image looks damaged. Try saving it again.');
      if (size.width > MAX_IMAGE_SIDE || size.height > MAX_IMAGE_SIDE) {
        throw new AppError(400, 'validation_failed', `Images can be up to ${MAX_IMAGE_SIDE} pixels on each side; this one is ${size.width} by ${size.height}.`);
      }
      clean = stripMetadata(data, kind);
      mime = IMAGE_MIME[kind];
      ext = IMAGE_EXT[kind];
      width = size.width;
      height = size.height;
    }
    const [mine] = await deps.db.select({ n: count() }).from(uploads).where(eq(uploads.ownerId, auth.user.id));
    if ((mine?.n ?? 0) >= MAX_UPLOADS_PER_ACCOUNT) throw new AppError(409, 'conflict', 'You have reached the limit for uploaded files. Delete some you no longer use in your uploads.');
    if (inDb) {
      if (clean.length > deps.config.UPLOAD_DB_FILE_BYTES) {
        throw new AppError(413, 'validation_failed', `Files can be up to ${megabytes(deps.config.UPLOAD_DB_FILE_BYTES)} here; this one is ${megabytes(clean.length)}. Use a smaller picture or a shorter clip.`);
      }
      const used = await usedInDb(auth.user.id);
      if (used + clean.length > deps.config.UPLOAD_DB_ACCOUNT_BYTES) {
        throw new AppError(409, 'conflict', `Your uploads would take more than your ${megabytes(deps.config.UPLOAD_DB_ACCOUNT_BYTES)} of space. Delete some you no longer use in your uploads, then try again.`);
      }
    }

    const id = randomBytes(16).toString('hex');
    const name = `${id}.${ext}`;
    const row = { id, ownerId: auth.user.id, mime, bytes: clean.length, width, height, sha256: createHash('sha256').update(clean).digest('hex') };
    if (inDb) {
      await deps.db.transaction(async (tx) => {
        await tx.insert(uploads).values(row);
        await tx.insert(uploadFiles).values({ uploadId: id, data: clean });
      });
    } else {
      await mkdir(dir, { recursive: true });
      // Write under a temporary name first, so a half-written file is never served.
      const part = join(dir, `.${name}.part`);
      await writeFile(part, clean, { flag: 'wx' });
      await rename(part, join(dir, name));
      await deps.db.insert(uploads).values(row);
    }
    return { url: `/uploads/${name}`, width, height, bytes: clean.length, ...(seconds !== null ? { seconds } : {}) };
  });

  /** The signed-in account's own uploads, newest first, and how much of the database allowance they use. */
  app.get('/api/uploads', async (req) => {
    const auth = requirePermission(req, 'sets.create');
    requireAccount(req);
    const rows = await deps.db
      .select({ id: uploads.id, mime: uploads.mime, bytes: uploads.bytes, width: uploads.width, height: uploads.height, createdAt: uploads.createdAt, hiddenAt: uploads.hiddenAt, inDb: sql<boolean>`${uploadFiles.uploadId} is not null` })
      .from(uploads)
      .leftJoin(uploadFiles, eq(uploadFiles.uploadId, uploads.id))
      .where(eq(uploads.ownerId, auth.user.id))
      .orderBy(desc(uploads.createdAt))
      .limit(200);
    const ext = (mime: string) => Object.entries(MIME_BY_EXT).find(([, m]) => m === mime)?.[0] ?? 'png';
    return {
      store: deps.config.UPLOAD_STORE,
      used: await usedInDb(auth.user.id),
      allowance: inDb ? deps.config.UPLOAD_DB_ACCOUNT_BYTES : null,
      fileCap: inDb ? deps.config.UPLOAD_DB_FILE_BYTES : 2_000_000,
      uploads: rows.map((r) => ({ id: r.id, url: `/uploads/${r.id}.${ext(r.mime)}`, kind: r.mime === AUDIO_MIME ? 'sound' : 'image', bytes: r.bytes, width: r.width, height: r.height, createdAt: r.createdAt.toISOString(), hidden: Boolean(r.hiddenAt) })),
    };
  });

  /** Deletes one of the account's own uploads. Someone else's answers as if it did not exist. */
  app.delete('/api/uploads/:id', { config: { rateLimit: { max: 120, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = requirePermission(req, 'sets.create');
    requireAccount(req);
    const { id } = parse(idParam, req.params);
    const [row] = await deps.db.delete(uploads).where(and(eq(uploads.id, id), eq(uploads.ownerId, auth.user.id))).returning({ id: uploads.id, mime: uploads.mime });
    if (!row) throw nope();
    const ext = Object.entries(MIME_BY_EXT).find(([, m]) => m === row.mime)?.[0];
    if (ext) await unlink(join(dir, `${id}.${ext}`)).catch(() => undefined);
    return { ok: true };
  });

  // Files are not under /api, so the global limit skips them; this one is per IP and generous,
  // since a whole class loads each question's picture at once.
  app.get('/uploads/:name', { config: { rateLimit: { max: 1200, timeWindow: '1 minute', keyGenerator: ipKey, allowList: () => false } } }, async (req, reply) => {
    const m = UPLOAD_FILE.exec((req.params as { name: string }).name);
    if (!m) throw nope();
    const [row] = await deps.db.select({ hiddenAt: uploads.hiddenAt, mime: uploads.mime, sha256: uploads.sha256 }).from(uploads).where(eq(uploads.id, m[1]!)).limit(1);
    if (!row || row.hiddenAt || row.mime !== MIME_BY_EXT[m[2]!]) throw nope();
    // The address never changes what it holds, so a browser that has it already gets "not modified".
    const etag = `"${row.sha256.slice(0, 32)}"`;
    reply
      .type(row.mime)
      .header('etag', etag)
      // A day, then checked again by its tag: cheap to keep, and a file staff hide stops showing within a day.
      .header('cache-control', 'public, max-age=86400')
      // Opened on its own, the file can run nothing.
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('x-content-type-options', 'nosniff')
      .header('content-disposition', 'inline');
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    const [stored] = await deps.db.select({ data: uploadFiles.data }).from(uploadFiles).where(eq(uploadFiles.uploadId, m[1]!)).limit(1);
    if (stored) return reply.header('content-length', stored.data.length).send(stored.data);
    const path = join(dir, `${m[1]}.${m[2]}`);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) throw nope();
    return reply.header('content-length', info.size).send(createReadStream(path));
  });

  app.post('/api/admin/uploads/:id/visibility', staffLimit(30), async (req) => {
    const auth = staff(req, 'content.moderate');
    const { id } = parse(idParam, req.params);
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
