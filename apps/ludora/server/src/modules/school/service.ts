import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { HouseEmblem, HouseView } from '@ludora/shared';
import type { Db, DbOrTx } from '../../db/client.ts';
import { classMembers, classSportDays, classes, houseCups, houseMembers, housePoints, houses, studentSportDays, users } from '../../db/schema.ts';
import { readPreferences } from '../users/preferences.ts';
import { notify } from '../notifications/service.ts';
import { schoolSettings } from './settings.ts';
import { addDays, cappedPoints, cupWinners, joinNames, rankTotals, schoolDay, schoolWeekday, weekStartDay } from './logic.ts';

/*
 * Houses and house points. A point is only ever written here, by the server: from a finished game
 * (persistGame calls awardGamePoints) or a merit. Each row names its source, so the same game or
 * merit can never pay twice, and game points stop at the school's daily cap per student.
 */

export type HouseRow = typeof houses.$inferSelect;

export const houseView = (h: HouseRow): HouseView => ({ id: h.id, name: h.name, hue: h.hue, emblem: h.emblem as HouseEmblem });

export async function activeHouses(db: DbOrTx): Promise<HouseRow[]> {
  return db.select().from(houses).where(isNull(houses.archivedAt)).orderBy(asc(houses.sort), asc(houses.createdAt));
}

/** Each listed player's active house, for avatars, rosters and team plans. */
export async function housesOf(db: DbOrTx, userIds: readonly string[]): Promise<Map<string, HouseRow>> {
  const out = new Map<string, HouseRow>();
  const ids = [...new Set(userIds)];
  if (!ids.length) return out;
  const rows = await db
    .select({ userId: houseMembers.userId, h: houses })
    .from(houseMembers)
    .innerJoin(houses, eq(houses.id, houseMembers.houseId))
    .where(and(inArray(houseMembers.userId, ids), isNull(houses.archivedAt)));
  for (const r of rows) out.set(r.userId, r.h);
  return out;
}

/** Whether a student is in one of this teacher's active classes. */
export async function teachesStudent(db: DbOrTx, teacherId: string, studentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: classes.id })
    .from(classes)
    .innerJoin(classMembers, and(eq(classMembers.classId, classes.id), eq(classMembers.userId, studentId)))
    .where(and(eq(classes.ownerId, teacherId), isNull(classes.archivedAt)))
    .limit(1);
  return Boolean(row);
}

export async function setHouse(db: DbOrTx, input: { userId: string; houseId: string | null; setBy: string | null; chosen: boolean }): Promise<void> {
  if (!input.houseId) {
    await db.delete(houseMembers).where(eq(houseMembers.userId, input.userId));
    return;
  }
  await db
    .insert(houseMembers)
    .values({ userId: input.userId, houseId: input.houseId, setBy: input.setBy, chosen: input.chosen })
    .onConflictDoUpdate({ target: houseMembers.userId, set: { houseId: input.houseId, setBy: input.setBy, chosen: input.chosen, createdAt: new Date(), welcomedAt: null } });
}

/* ------------------------------- house points ------------------------------ */

export interface GamePointsInput {
  gameId: string;
  assignment: boolean;
  players: { userId: string; correct: number }[];
}

/**
 * House points for a finished game: each player in a house earns points for their right answers,
 * up to what is left of today's cap. Returns a note per player for their results screen.
 */
export async function awardGamePoints(db: Db, input: GamePointsInput, now = new Date()): Promise<Map<string, { note: string; points: number; houseId: string }>> {
  const out = new Map<string, { note: string; points: number; houseId: string }>();
  const players = input.players.filter((p) => p.correct > 0);
  if (!players.length) return out;
  const memberOf = await housesOf(db, players.map((p) => p.userId));
  if (!memberOf.size) return out;
  const settings = await schoolSettings(db);
  const day = schoolDay(now, settings.timeZone);
  const reason = input.assignment ? 'assignment' : 'game';
  const prefs = await db.select({ id: users.id, preferences: users.preferences }).from(users).where(inArray(users.id, [...memberOf.keys()]));
  const yearOf = new Map(prefs.map((p) => [p.id, readPreferences(p.preferences).school.year]));
  for (const p of players) {
    const house = memberOf.get(p.userId);
    if (!house) continue;
    const result = await db.transaction(async (tx) => {
      // One player's points at a time, so two games ending together cannot both slip under the cap.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`house:${p.userId}`}))`);
      const [row] = await tx
        .select({ n: sql<number>`coalesce(sum(${housePoints.points}), 0)::int` })
        .from(housePoints)
        .where(and(eq(housePoints.userId, p.userId), eq(housePoints.day, day), inArray(housePoints.reason, ['game', 'assignment'])));
      const earned = row?.n ?? 0;
      const grant = cappedPoints(p.correct, settings.pointsPerCorrect, earned, settings.dailyCap);
      if (grant <= 0) return { grant: 0, capped: true };
      const ins = await tx
        .insert(housePoints)
        .values({ houseId: house.id, userId: p.userId, points: grant, reason, sourceId: input.gameId, yearGroup: yearOf.get(p.userId) ?? null, day })
        .onConflictDoNothing()
        .returning({ id: housePoints.id });
      return { grant: ins.length ? grant : 0, capped: grant < p.correct * settings.pointsPerCorrect };
    });
    if (result.grant > 0) {
      const note = `${result.grant} house point${result.grant === 1 ? '' : 's'} for ${house.name}.${result.capped ? ` That reaches today's limit of ${settings.dailyCap}.` : ''}`;
      out.set(p.userId, { note, points: result.grant, houseId: house.id });
    } else if (result.capped) {
      out.set(p.userId, { note: `You have earned today's ${settings.dailyCap} house points for ${house.name}. More tomorrow.`, points: 0, houseId: house.id });
    }
  }
  return out;
}

/** House points one game paid, by house, for the results screen. Totals only. */
export async function gameHouseTotals(db: DbOrTx, gameId: string) {
  const rows = await db
    .select({ houseId: housePoints.houseId, points: sql<number>`sum(${housePoints.points})::int`, players: sql<number>`count(distinct ${housePoints.userId})::int` })
    .from(housePoints)
    .where(and(eq(housePoints.sourceId, gameId), inArray(housePoints.reason, ['game', 'assignment'])))
    .groupBy(housePoints.houseId);
  const all = await activeHouses(db);
  const byId = new Map(rows.map((r) => [r.houseId, r]));
  return rankTotals(all.map((h) => ({ ...houseView(h), points: byId.get(h.id)?.points ?? 0, players: byId.get(h.id)?.players ?? 0 })));
}

/** Points per house between two school days (inclusive), every active house listed. */
export async function houseTotals(db: DbOrTx, from: string | null, to: string | null) {
  const where = and(from ? gte(housePoints.day, from) : undefined, to ? lte(housePoints.day, to) : undefined);
  const rows = await db.select({ houseId: housePoints.houseId, points: sql<number>`sum(${housePoints.points})::int` }).from(housePoints).where(where).groupBy(housePoints.houseId);
  const byId = new Map(rows.map((r) => [r.houseId, r.points]));
  const all = await activeHouses(db);
  return rankTotals(all.map((h) => ({ ...houseView(h), points: byId.get(h.id) ?? 0 })));
}

/** Points per school year between two days. Players who have not given a year are counted apart. */
export async function yearTotals(db: DbOrTx, from: string | null, to: string | null) {
  const where = and(from ? gte(housePoints.day, from) : undefined, to ? lte(housePoints.day, to) : undefined);
  const rows = await db
    .select({ year: housePoints.yearGroup, points: sql<number>`sum(${housePoints.points})::int`, players: sql<number>`count(distinct ${housePoints.userId})::int` })
    .from(housePoints)
    .where(where)
    .groupBy(housePoints.yearGroup);
  return rows
    .map((r) => ({ id: r.year === null ? 'none' : String(r.year), year: r.year, points: r.points, players: r.players }))
    .sort((a, b) => (a.year ?? 99) - (b.year ?? 99));
}

/** The window a standings view covers, in school days. */
export async function window(db: DbOrTx, period: 'week' | 'cup' | 'all', now = new Date()): Promise<{ from: string | null; to: string | null; cup: { id: string; name: string; startsOn: string; endsOn: string } | null }> {
  const { timeZone } = await schoolSettings(db);
  const today = schoolDay(now, timeZone);
  if (period === 'week') return { from: weekStartDay(today), to: addDays(weekStartDay(today), 6), cup: null };
  if (period === 'cup') {
    const cup = await currentCup(db, today);
    if (cup) return { from: cup.startsOn, to: cup.endsOn, cup: { id: cup.id, name: cup.name, startsOn: cup.startsOn, endsOn: cup.endsOn } };
  }
  return { from: null, to: null, cup: null };
}

/* --------------------------------- house cups ------------------------------- */

export async function currentCup(db: DbOrTx, today: string) {
  const [cup] = await db.select().from(houseCups).where(and(lte(houseCups.startsOn, today), gte(houseCups.endsOn, today))).orderBy(asc(houseCups.endsOn)).limit(1);
  return cup ?? null;
}

/**
 * Close every cup whose last day has passed: freeze its totals, name the winner, and tell every
 * house member. Runs whenever cups are read, so no timer is needed; a row lock keeps it to once.
 */
export async function closeFinishedCups(db: Db, now = new Date()): Promise<void> {
  const { timeZone } = await schoolSettings(db);
  const today = schoolDay(now, timeZone);
  const due = await db.select({ id: houseCups.id }).from(houseCups).where(and(isNull(houseCups.closedAt), sql`${houseCups.endsOn} < ${today}`));
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      const [cup] = await tx.select().from(houseCups).where(and(eq(houseCups.id, id), isNull(houseCups.closedAt))).for('update');
      if (!cup) return;
      const totals = await houseTotals(tx, cup.startsOn, cup.endsOn);
      const winners = cupWinners(totals);
      const winnerName = winners.length ? joinNames(winners.map((w) => w.name)) : null;
      await tx.update(houseCups).set({ totals, winnerName, closedAt: new Date() }).where(eq(houseCups.id, id));
      if (!winnerName) return;
      const members = await tx.select({ userId: houseMembers.userId }).from(houseMembers).limit(5000);
      for (const m of members) {
        await notify(tx, { userId: m.userId, kind: 'school', title: `${winnerName} ${winners.length > 1 ? 'share' : 'won'} the ${cup.name}`, body: 'See the final standings in School.', link: '/school', dedupeKey: `cup:${cup.id}` });
      }
    });
  }
}

/* --------------------------------- sport days ------------------------------- */

/** The weekdays each player wears sport uniform: their own timetable, or else their classes' together. */
export async function sportDaysOf(db: DbOrTx, userIds: readonly string[]): Promise<Map<string, { days: number[]; own: boolean }>> {
  const out = new Map<string, { days: number[]; own: boolean }>();
  const ids = [...new Set(userIds)];
  if (!ids.length) return out;
  const own = await db.select().from(studentSportDays).where(inArray(studentSportDays.userId, ids));
  for (const r of own) out.set(r.userId, { days: r.days, own: true });
  const rest = ids.filter((id) => !out.has(id));
  if (rest.length) {
    const rows = await db
      .select({ userId: classMembers.userId, days: classSportDays.days })
      .from(classMembers)
      .innerJoin(classSportDays, eq(classSportDays.classId, classMembers.classId))
      .innerJoin(classes, eq(classes.id, classMembers.classId))
      .where(and(inArray(classMembers.userId, rest), isNull(classes.archivedAt)));
    for (const r of rows) {
      const days = new Set([...(out.get(r.userId)?.days ?? []), ...r.days]);
      out.set(r.userId, { days: [...days].sort(), own: false });
    }
  }
  return out;
}

/** Which of these players wear sport uniform today, by the school's calendar. */
export async function sportToday(db: DbOrTx, userIds: readonly string[], now = new Date()): Promise<Set<string>> {
  const out = new Set<string>();
  if (!userIds.length) return out;
  const { timeZone } = await schoolSettings(db);
  const wd = schoolWeekday(now, timeZone);
  if (wd > 5) return out;
  for (const [id, s] of await sportDaysOf(db, userIds)) if (s.days.includes(wd)) out.add(id);
  return out;
}

/* ---------------------------------- history --------------------------------- */

export async function pastCups(db: DbOrTx) {
  const rows = await db.select().from(houseCups).where(sql`${houseCups.closedAt} is not null`).orderBy(desc(houseCups.endsOn)).limit(50);
  return rows.map((c) => ({ id: c.id, name: c.name, startsOn: c.startsOn, endsOn: c.endsOn, winnerName: c.winnerName, totals: (c.totals ?? []) as { id: string; name: string; hue: number; emblem: string; points: number; rank: number }[] }));
}
