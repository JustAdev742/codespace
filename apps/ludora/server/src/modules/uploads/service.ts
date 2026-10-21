import { inArray } from 'drizzle-orm';
import type { Media, Question } from '@ludora/shared';
import type { DbOrTx } from '../../db/client.ts';
import { uploads } from '../../db/schema.ts';
import { AppError } from '../../lib/errors.ts';

/** An upload's public address: a random 32-character hex name and the format's extension. */
export const UPLOAD_URL = /^\/uploads\/([a-f0-9]{32})\.(png|jpg|gif|webp)$/;
export const UPLOAD_FILE = /^([a-f0-9]{32})\.(png|jpg|gif|webp)$/;

function mediaRefs(questions: readonly Question[]): { url: string; field: string }[] {
  const refs: { url: string; field: string }[] = [];
  const add = (m: Media | undefined, field: string) => {
    if (m?.url.startsWith('/uploads/')) refs.push({ url: m.url, field });
  };
  questions.forEach((q, i) => {
    add(q.media, `questions.${i}.media`);
    if ('choices' in q) q.choices.forEach((c, j) => add(c.media, `questions.${i}.choices.${j}.media`));
  });
  return refs;
}

/**
 * A set may only show images that were uploaded to Ludora and that staff have
 * not hidden. Built-in art (/art/...) needs no check.
 */
export async function assertUploadsUsable(db: DbOrTx, questions: readonly Question[]): Promise<void> {
  const refs = mediaRefs(questions);
  if (!refs.length) return;
  const fields: Record<string, string> = {};
  const ids = new Map<string, string[]>();
  for (const r of refs) {
    const m = UPLOAD_URL.exec(r.url);
    if (!m) fields[r.field] = 'That image is not a Ludora upload. Upload it again.';
    else ids.set(m[1]!, [...(ids.get(m[1]!) ?? []), r.field]);
  }
  if (ids.size) {
    const rows = await db.select({ id: uploads.id, hiddenAt: uploads.hiddenAt }).from(uploads).where(inArray(uploads.id, [...ids.keys()]));
    const usable = new Set(rows.filter((r) => !r.hiddenAt).map((r) => r.id));
    for (const [id, where] of ids) if (!usable.has(id)) for (const f of where) fields[f] = 'This image is missing or was removed. Upload it again or remove it.';
  }
  const first = Object.values(fields)[0];
  if (first) throw new AppError(400, 'validation_failed', first, fields);
}
