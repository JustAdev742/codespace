import { inArray } from 'drizzle-orm';
import type { Media, Question, Sound } from '@ludora/shared';
import type { DbOrTx } from '../../db/client.ts';
import { uploads } from '../../db/schema.ts';
import { AppError } from '../../lib/errors.ts';

/** An upload's public address: a random 32-character hex name and the format's extension. */
export const UPLOAD_URL = /^\/uploads\/([a-f0-9]{32})\.(png|jpg|gif|webp|wav)$/;
export const UPLOAD_FILE = /^([a-f0-9]{32})\.(png|jpg|gif|webp|wav)$/;

function mediaRefs(questions: readonly Question[]): { url: string; field: string }[] {
  const refs: { url: string; field: string }[] = [];
  const add = (m: Media | undefined, field: string) => {
    if (m?.url.startsWith('/uploads/')) refs.push({ url: m.url, field });
  };
  const clip = (sound: Sound | undefined, field: string) => {
    if (sound?.kind === 'clip') refs.push({ url: sound.url, field });
  };
  questions.forEach((q, i) => {
    add(q.media, `questions.${i}.media`);
    clip(q.sound, `questions.${i}.sound`);
    if ('choices' in q)
      q.choices.forEach((c, j) => {
        add(c.media, `questions.${i}.choices.${j}.media`);
        clip(c.sound, `questions.${i}.choices.${j}.sound`);
      });
  });
  return refs;
}

/**
 * A set may only show images that were uploaded to Ludora and that staff have
 * not hidden. Built-in art (/art/...) needs no check.
 */
export async function assertUploadsUsable(db: DbOrTx, questions: readonly Question[], extra: readonly { field: string; url: string }[] = []): Promise<void> {
  const refs = [...mediaRefs(questions), ...extra.filter((r) => r.url.startsWith('/uploads/'))];
  if (!refs.length) return;
  const fields: Record<string, string> = {};
  const ids = new Map<string, string[]>();
  for (const r of refs) {
    const m = UPLOAD_URL.exec(r.url);
    if (!m) fields[r.field] = r.field.endsWith('.sound') ? 'That sound clip is not a Ludora upload. Record or upload it again.' : 'That image is not a Ludora upload. Upload it again.';
    else ids.set(m[1]!, [...(ids.get(m[1]!) ?? []), r.field]);
  }
  if (ids.size) {
    const rows = await db.select({ id: uploads.id, hiddenAt: uploads.hiddenAt }).from(uploads).where(inArray(uploads.id, [...ids.keys()]));
    const usable = new Set(rows.filter((r) => !r.hiddenAt).map((r) => r.id));
    for (const [id, where] of ids) if (!usable.has(id)) for (const f of where) fields[f] = f.endsWith('.sound') ? 'This sound clip is missing or was removed. Record or upload it again, or remove it.' : 'This image is missing or was removed. Upload it again or remove it.';
  }
  const first = Object.values(fields)[0];
  if (first) throw new AppError(400, 'validation_failed', first, fields);
}
