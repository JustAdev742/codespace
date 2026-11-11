import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { SchoolTeams } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { classMembers, classes, houseMembers, tournamentMatches } from '../../db/schema.ts';
import type { AuthContext } from '../../http/context.ts';
import { conflict, notFound } from '../../lib/errors.ts';
import type { Room, TeamPlan } from '../../realtime/room.ts';
import type { EngineResults } from '@ludora/engine';
import { activeHouses, awardGamePoints } from './service.ts';
import { hostableMatch, recordMatch } from './compete.ts';

/*
 * School teams for live games, and what a finished game means for the school. The room only
 * receives a plan (team names, colours and who is in which); every decision is made here, on the
 * server, from the database: a house match uses each student's house, class against class uses
 * class membership, and a tournament match uses its two entrants.
 */

const SIDE_HUES = [210, 20];

export async function schoolTeamPlan(deps: AppDeps, auth: AuthContext, spec: SchoolTeams): Promise<TeamPlan> {
  const { db } = deps;
  if (spec.by === 'houses') {
    const list = await activeHouses(db);
    if (list.length < 2) throw conflict('A house match needs at least 2 houses. School staff set them up in School.');
    const teams = list.map((h, i) => ({ id: `h${i + 1}`, name: h.name, hue: h.hue }));
    const idOf = new Map(list.map((h, i) => [h.id, `h${i + 1}`]));
    const members = await db.select().from(houseMembers).where(inArray(houseMembers.houseId, list.map((h) => h.id)));
    return { teams, teamOf: Object.fromEntries(members.map((m) => [m.userId, idOf.get(m.houseId)!])) };
  }
  if (spec.by === 'classes') {
    const rows = await db.select().from(classes).where(and(inArray(classes.id, spec.classIds), eq(classes.ownerId, auth.user.id), isNull(classes.archivedAt)));
    if (rows.length !== 2) throw notFound('Choose two of your own classes.');
    const ordered = spec.classIds.map((id) => rows.find((r) => r.id === id)!);
    const members = await db.select().from(classMembers).where(inArray(classMembers.classId, spec.classIds));
    const teamOf: Record<string, string> = {};
    for (const m of members) if (!teamOf[m.userId]) teamOf[m.userId] = `c${spec.classIds.indexOf(m.classId) + 1}`;
    return { teams: ordered.map((c, i) => ({ id: `c${i + 1}`, name: c.name, hue: SIDE_HUES[i]! })), teamOf };
  }
  const { match, a, b } = await hostableMatch(db, spec.matchId, auth);
  const teamOf: Record<string, string> = {};
  const sides = [a, b];
  for (const [i, e] of sides.entries()) {
    if (!e.classId) continue;
    const members = await db.select({ userId: classMembers.userId }).from(classMembers).where(eq(classMembers.classId, e.classId));
    for (const m of members) if (!teamOf[m.userId]) teamOf[m.userId] = i === 0 ? 'ma' : 'mb';
  }
  return { teams: [{ id: 'ma', name: a.name, hue: SIDE_HUES[0]! }, { id: 'mb', name: b.name, hue: SIDE_HUES[1]! }], teamOf, matchId: match.id };
}

/**
 * After a game is saved: house points for each player in a house (notes for their results), and,
 * for a tournament match, the result. Never throws: a school problem must not hold up rewards.
 */
export async function recordSchoolGame(deps: AppDeps, room: Room, results: EngineResults, gameId: string): Promise<Map<string, string>> {
  const notes = new Map<string, string>();
  try {
    if (!room.solo || room.assignmentId) {
      const players = results.standings
        .filter((s) => !s.isBot)
        .flatMap((s) => {
          const who = room.roster.get(s.playerId);
          if (!who?.userId || who.isGuest) return [];
          const right = new Set(results.answers.filter((a) => a.playerId === s.playerId && a.correct && (a.kind ?? 'answer') !== 'self').map((a) => a.qid));
          return [{ userId: who.userId, correct: right.size }];
        });
      for (const [userId, r] of await awardGamePoints(deps.db, { gameId, assignment: Boolean(room.assignmentId), players })) notes.set(userId, r.note);
    }
    const matchId = room.teamPlan?.matchId;
    if (matchId && results.endedBy !== 'error' && results.teamStandings?.length) {
      const score = (id: string) => results.teamStandings!.find((t) => t.teamId === id)?.score ?? 0;
      const a = score('ma');
      const b = score('mb');
      const [m] = await deps.db.select().from(tournamentMatches).where(eq(tournamentMatches.id, matchId)).limit(1);
      if (m && !m.playedAt && m.a !== null && m.b !== null && a !== b) {
        await recordMatch(deps.db, matchId, { winner: a > b ? m.a : m.b, aScore: Math.round(a), bScore: Math.round(b), gameId });
      }
    }
  } catch (err) {
    deps.log?.error({ err, gameId }, 'school record failed');
  }
  return notes;
}
