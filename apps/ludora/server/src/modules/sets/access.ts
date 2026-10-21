import { eq } from 'drizzle-orm';
import { questionSchema, type Question } from '@ludora/shared';
import type { DbOrTx } from '../../db/client.ts';
import { questionSets } from '../../db/schema.ts';
import type { AuthContext } from '../../http/context.ts';
import { forbidden, notFound } from '../../lib/errors.ts';

export type SetRow = typeof questionSets.$inferSelect;

/** Whether this viewer may see (and therefore play) a set. */
export function canView(set: SetRow, auth: AuthContext | null): boolean {
  if (set.hiddenAt) return Boolean(auth && (auth.permissions.has('content.moderate') || set.ownerId === auth.user.id));
  if (set.visibility === 'public' || set.visibility === 'unlisted') return true;
  return Boolean(auth && set.ownerId === auth.user.id);
}

export function canEdit(set: SetRow, auth: AuthContext | null): boolean {
  return Boolean(auth && set.ownerId && set.ownerId === auth.user.id);
}

export async function loadSet(db: DbOrTx, id: string): Promise<SetRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await db.select().from(questionSets).where(eq(questionSets.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Load a set for a game, re-validating every stored question so bad data never reaches a room. */
export async function loadSetForPlay(db: DbOrTx, id: string, auth: AuthContext | null): Promise<{ set: SetRow; questions: Question[] }> {
  const set = await loadSet(db, id);
  if (!set) throw notFound('That question set does not exist.');
  if (!canView(set, auth)) throw forbidden('That question set is private.');
  const questions: Question[] = [];
  for (const raw of (set.questions as unknown[]) ?? []) {
    const r = questionSchema.safeParse(raw);
    if (r.success) questions.push(r.data);
  }
  return { set, questions };
}

