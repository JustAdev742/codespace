import { and, eq } from 'drizzle-orm';
import { questionSchema, type Question } from '@ludora/shared';
import type { DbOrTx } from '../../db/client.ts';
import { questionSets, setEditors } from '../../db/schema.ts';
import type { AuthContext } from '../../http/context.ts';
import { forbidden, notFound } from '../../lib/errors.ts';

export type SetRow = typeof questionSets.$inferSelect;

/** Whether this viewer may see (and therefore play) a set. A set in the bin is seen only through the bin. */
export function canView(set: SetRow, auth: AuthContext | null): boolean {
  if (set.deletedAt) return false;
  if (set.hiddenAt) return Boolean(auth && (auth.permissions.has('content.moderate') || set.ownerId === auth.user.id));
  if (set.visibility === 'public' || set.visibility === 'unlisted') return true;
  return Boolean(auth && set.ownerId === auth.user.id);
}

/** The owner: the only one who may delete, share, publish or choose co-editors. */
export function canEdit(set: SetRow, auth: AuthContext | null): boolean {
  return Boolean(auth && set.ownerId && set.ownerId === auth.user.id && !set.deletedAt);
}

export async function isCoEditor(db: DbOrTx, setId: string, userId: string): Promise<boolean> {
  const rows = await db.select({ u: setEditors.userId }).from(setEditors).where(and(eq(setEditors.setId, setId), eq(setEditors.userId, userId))).limit(1);
  return rows.length > 0;
}

export interface SetAccess {
  view: boolean;
  /** May change the questions and details (the owner or a co-editor). */
  edit: boolean;
  owner: boolean;
}

/** What this viewer may do with a set, co-editors included. Checked on the server for every request. */
export async function setAccess(db: DbOrTx, set: SetRow, auth: AuthContext | null): Promise<SetAccess> {
  const owner = canEdit(set, auth);
  if (owner) return { view: true, edit: true, owner: true };
  const co = Boolean(auth && !set.deletedAt && !set.hiddenAt && (await isCoEditor(db, set.id, auth.user.id)));
  return { view: co || canView(set, auth), edit: co, owner: false };
}

export async function loadSet(db: DbOrTx, id: string): Promise<SetRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await db.select().from(questionSets).where(eq(questionSets.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Load a set for a game, re-validating every stored question so bad data never reaches a room. */
export async function loadSetForPlay(db: DbOrTx, id: string, auth: AuthContext | null): Promise<{ set: SetRow; questions: Question[] }> {
  const set = await loadSet(db, id);
  if (!set || set.deletedAt) throw notFound('That question set does not exist.');
  if (!(await setAccess(db, set, auth)).view) throw forbidden('That question set is private.');
  return { set, questions: applyDefaults(validQuestions(set), set.defaults) };
}

/**
 * The set's own game defaults: a random selection of its questions (in set order) and choices
 * stored in a random order. Applied as a game is set up, so each game deals afresh.
 */
export function applyDefaults(questions: Question[], defaults: unknown, random: () => number = Math.random): Question[] {
  const d = (defaults ?? {}) as { randomCount?: unknown; shuffleAnswers?: unknown };
  let out = questions;
  const n = typeof d.randomCount === 'number' && Number.isInteger(d.randomCount) ? d.randomCount : 0;
  if (n > 0 && n < out.length) {
    const keep = new Set(shuffled(out.map((_, i) => i), random).slice(0, n));
    out = out.filter((_, i) => keep.has(i));
  }
  if (d.shuffleAnswers === true) out = out.map((q) => (q.type === 'mcq' || q.type === 'multi' || q.type === 'poll' ? { ...q, choices: shuffled(q.choices, random) } : q));
  return out;
}

function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** The stored questions that still pass the rules. */
export function validQuestions(set: Pick<SetRow, 'questions'>): Question[] {
  const questions: Question[] = [];
  for (const raw of (set.questions as unknown[]) ?? []) {
    const r = questionSchema.safeParse(raw);
    if (r.success) questions.push(r.data);
  }
  return questions;
}
