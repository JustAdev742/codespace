import { and, isNotNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.ts';
import { sessions } from '../../db/schema.ts';

/*
 * Keeping no more than Ludora needs. Sign-ins that ended over a week ago go
 * (with the hashed IP address and browser name stored on them). So do guest
 * accounts nobody can get back into: a guest has no password, so once its
 * last sign-in has gone the account is unreachable. Only guests at least 30
 * days old are removed; game results they were part of stay, unnamed.
 */

export const SESSION_KEEP_DAYS = 7;
export const GUEST_KEEP_DAYS = 30;
const EVERY_MS = 6 * 3_600_000;

export async function purgeStale(db: Db): Promise<{ sessions: number; guests: number }> {
  const cutoff = sql`now() - make_interval(days => ${SESSION_KEEP_DAYS})`;
  const ended = await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, cutoff), and(isNotNull(sessions.revokedAt), lt(sessions.revokedAt, cutoff))))
    .returning({ id: sessions.id });
  const guests = await db.execute(sql`
    delete from users u
    where u.is_guest and u.created_at < now() - make_interval(days => ${GUEST_KEEP_DAYS})
      and not exists (select 1 from sessions s where s.user_id = u.id)
    returning u.id`);
  return { sessions: ended.length, guests: guests.rows.length };
}

/** Runs the purge shortly after start and every six hours; returns a stop function. */
export function scheduleRetention(db: Db, log: { warn: (obj: unknown, msg: string) => void }): () => void {
  const run = () => void purgeStale(db).catch((err) => log.warn({ err }, 'retention purge failed'));
  const first = setTimeout(run, 60_000);
  const every = setInterval(run, EVERY_MS);
  first.unref();
  every.unref();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
