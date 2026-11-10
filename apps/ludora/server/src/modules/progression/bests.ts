import { and, eq, ne, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { gameParticipants, gameSessions } from '../../db/schema.ts';

/**
 * A line for the results screen when a game beats the player's best score in that mode.
 * Nothing on a first game in a mode (every score would be a best) or a score of zero.
 */
export async function personalBestNote(tx: DbOrTx, userId: string, gameId: string, modeTitle: string): Promise<string | null> {
  const [mine] = await tx
    .select({ score: gameParticipants.score, label: gameParticipants.label, modeId: gameSessions.modeId })
    .from(gameParticipants)
    .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
    .where(and(eq(gameParticipants.gameId, gameId), eq(gameParticipants.userId, userId)))
    .orderBy(sql`${gameParticipants.score} desc`)
    .limit(1);
  if (!mine || mine.score <= 0) return null;
  const [prev] = await tx
    .select({ best: sql<number | null>`max(${gameParticipants.score})::float8`, games: sql<number>`count(*)::int` })
    .from(gameParticipants)
    .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
    .where(and(eq(gameParticipants.userId, userId), eq(gameSessions.modeId, mine.modeId), ne(gameParticipants.gameId, gameId)));
  if (!prev?.games || prev.best === null || mine.score <= Number(prev.best)) return null;
  return `New personal best in ${modeTitle}: ${mine.label}.`;
}
