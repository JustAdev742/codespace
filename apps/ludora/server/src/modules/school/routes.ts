import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { HOUSE_EMBLEMS, MAX_HOUSES, houseCupInputSchema, houseInputSchema, meritInputSchema, schoolSettingsPatchSchema, schoolSettingsSchema, sportDaysSchema } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { classMembers, classSportDays, classes, gameSessions, houseCups, houseMembers, housePoints, houses, merits, questionSets, studentSportDays, tournaments, users } from '../../db/schema.ts';
import { noStore, requireAccount, requireAuth, type AuthContext } from '../../http/context.ts';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { audit, staff, staffLimit } from '../admin/common.ts';
import { teacherClass } from '../classes/access.ts';
import { readPreferences } from '../users/preferences.ts';
import { loadAvatars } from '../profiles/avatar.ts';
import { notify } from '../notifications/service.ts';
import { schoolSettings, saveSchoolSettings } from './settings.ts';
import { addDays, schoolDay, weekStartDay } from './logic.ts';
import { activeHouses, closeFinishedCups, currentCup, gameHouseTotals, houseTotals, houseView, housesOf, pastCups, setHouse, sportDaysOf, sportToday, teachesStudent, window, yearTotals } from './service.ts';

/*
 * The School pages' API. Who may do what is decided here, on every request:
 * - school staff (the `school_staff` role, or administrators: `school.manage`) run houses, cups,
 *   settings, notices and events; `school.view` sees school-wide usage;
 * - a teacher puts students in their own classes into houses, gives them merits and sets their
 *   class's sport days;
 * - a student may choose their house once, only when the school allows it.
 * Everything school-wide is totals and display names, never account details.
 */

const uuid = z.string().uuid();
const canManage = (auth: AuthContext | null) => Boolean(auth && !auth.user.isGuest && auth.permissions.has('school.manage'));
const isTeacher = (auth: AuthContext) => auth.user.accountType === 'teacher' && !auth.user.isGuest;

async function requireHouse(deps: AppDeps, id: string) {
  const [h] = await deps.db.select().from(houses).where(and(eq(houses.id, id), isNull(houses.archivedAt))).limit(1);
  if (!h) throw notFound('That house does not exist any more. Reload the page.');
  return h;
}

/** A student account a teacher or school staff may put in a house: registered, not a teacher. */
async function loadStudent(deps: AppDeps, id: string) {
  const [u] = await deps.db.select({ id: users.id, displayName: users.displayName, isGuest: users.isGuest, accountType: users.accountType }).from(users).where(eq(users.id, id)).limit(1);
  if (!u || u.isGuest) throw notFound('No student with that id.');
  return u;
}

/** Teachers act only on students in their own active classes; school staff on any student. Others: not found. */
async function assertCanTeach(deps: AppDeps, auth: AuthContext, studentId: string) {
  if (canManage(auth)) return;
  if (isTeacher(auth) && (await teachesStudent(deps.db, auth.user.id, studentId))) return;
  throw notFound('No student with that id in your classes.');
}

export async function schoolRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  /* ----------------------------- the whole school ----------------------------- */

  /** Houses, the rules students need to know, and what this viewer may do. */
  app.get('/api/school', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const [settings, list, mine] = await Promise.all([schoolSettings(db), activeHouses(db), housesOf(db, [auth.user.id])]);
    const house = mine.get(auth.user.id);
    return {
      houses: list.map(houseView),
      settings: { houseChoice: settings.houseChoice, dailyCap: settings.dailyCap, pointsPerCorrect: settings.pointsPerCorrect, meritPoints: settings.meritPoints, values: settings.values, timeZone: settings.timeZone, meritsPerTeacherPerDay: settings.meritsPerTeacherPerDay },
      me: { house: house ? houseView(house) : null, canChoose: settings.houseChoice && !house && !auth.user.isGuest && auth.user.accountType !== 'teacher' },
      can: { manage: canManage(auth), viewUsage: !auth.user.isGuest && auth.permissions.has('school.view'), teach: isTeacher(auth) },
    };
  });

  /** The viewer's own school things: house, whether to show the welcome, sport days. */
  app.get('/api/school/me', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    if (auth.user.isGuest) return { house: null, welcome: false, sportDays: [], ownSportDays: false, sportToday: false };
    const [row] = await db.select({ m: houseMembers, h: houses }).from(houseMembers).innerJoin(houses, eq(houses.id, houseMembers.houseId)).where(and(eq(houseMembers.userId, auth.user.id), isNull(houses.archivedAt))).limit(1);
    const sport = (await sportDaysOf(db, [auth.user.id])).get(auth.user.id);
    const today = await sportToday(db, [auth.user.id]);
    return { house: row ? houseView(row.h) : null, welcome: Boolean(row && !row.m.welcomedAt), sportDays: sport?.days ?? [], ownSportDays: Boolean(sport?.own), sportToday: today.has(auth.user.id) };
  });

  app.post('/api/school/me/welcomed', async (req) => {
    const auth = requireAccount(req);
    await db.update(houseMembers).set({ welcomedAt: new Date() }).where(and(eq(houseMembers.userId, auth.user.id), isNull(houseMembers.welcomedAt)));
    return { ok: true };
  });

  /** A student chooses their house, once, when the school allows it. */
  app.post('/api/school/me/house', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const auth = requireAccount(req);
    const { houseId } = parse(z.object({ houseId: uuid }), req.body);
    const settings = await schoolSettings(db);
    if (!settings.houseChoice) throw forbidden('Your teacher puts you in your house at this school.');
    if (auth.user.accountType === 'teacher') throw forbidden('Houses are for students.');
    const house = await requireHouse(deps, houseId);
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`house-choice:${auth.user.id}`}))`);
      const [existing] = await tx.select().from(houseMembers).where(eq(houseMembers.userId, auth.user.id)).limit(1);
      if (existing) throw conflict('You already have a house. Ask your teacher if it needs to change.');
      await setHouse(tx, { userId: auth.user.id, houseId: house.id, setBy: auth.user.id, chosen: true });
    });
    return { ok: true, house: houseView(house) };
  });

  app.put('/api/school/me/sport-days', async (req) => {
    const auth = requireAccount(req);
    const { days } = parse(z.object({ days: sportDaysSchema.nullable() }), req.body);
    if (days === null) await db.delete(studentSportDays).where(eq(studentSportDays.userId, auth.user.id));
    else await db.insert(studentSportDays).values({ userId: auth.user.id, days }).onConflictDoUpdate({ target: studentSportDays.userId, set: { days, updatedAt: new Date() } });
    return { ok: true };
  });

  /** House and year group standings for this week, the current cup, or all time. Totals only. */
  app.get('/api/school/standings', async (req, reply) => {
    noStore(reply);
    requireAuth(req);
    const { period } = parse(z.object({ period: z.enum(['week', 'cup', 'all']).default('week') }), req.query);
    await closeFinishedCups(db);
    const w = await window(db, period);
    const [houseRows, years] = await Promise.all([houseTotals(db, w.from, w.to), yearTotals(db, w.from, w.to)]);
    return { period, from: w.from, to: w.to, cup: w.cup, houses: houseRows, years };
  });

  /** The current cup (if any) and every past one, with its winner and final totals. */
  app.get('/api/school/cups', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    await closeFinishedCups(db);
    const { timeZone } = await schoolSettings(db);
    const today = schoolDay(new Date(), timeZone);
    const current = await currentCup(db, today);
    const upcoming = await db.select().from(houseCups).where(sql`${houseCups.startsOn} > ${today}`).orderBy(asc(houseCups.startsOn)).limit(10);
    return {
      current: current ? { id: current.id, name: current.name, startsOn: current.startsOn, endsOn: current.endsOn, standings: await houseTotals(db, current.startsOn, current.endsOn) } : null,
      upcoming: upcoming.map((c) => ({ id: c.id, name: c.name, startsOn: c.startsOn, endsOn: c.endsOn })),
      past: await pastCups(db),
      canManage: canManage(auth),
    };
  });

  app.post('/api/school/cups', staffLimit(20), async (req) => {
    const auth = staff(req, 'school.manage');
    const body = parse(houseCupInputSchema, req.body);
    const overlap = await db.select({ id: houseCups.id }).from(houseCups).where(and(sql`${houseCups.startsOn} <= ${body.endsOn}`, sql`${houseCups.endsOn} >= ${body.startsOn}`)).limit(1);
    if (overlap.length) throw conflict('Another cup runs on some of those days. Cups cannot overlap.', { startsOn: 'Overlaps another cup.' });
    const { timeZone } = await schoolSettings(db);
    if (body.endsOn < schoolDay(new Date(), timeZone)) throw new AppError(400, 'validation_failed', 'That cup would already be over.', { endsOn: 'Choose a last day from today on.' });
    const cup = await db.transaction(async (tx) => {
      const [row] = await tx.insert(houseCups).values({ ...body, createdBy: auth.user.id }).returning();
      await audit(deps, req, tx, { actor: auth, action: 'school.cup.create', targetType: 'house_cup', targetId: row!.id, targetName: row!.name, after: body });
      return row!;
    });
    return { cup: { id: cup.id, name: cup.name, startsOn: cup.startsOn, endsOn: cup.endsOn } };
  });

  app.delete('/api/school/cups/:id', staffLimit(20), async (req) => {
    const auth = staff(req, 'school.manage');
    const { id } = parse(z.object({ id: uuid }), req.params);
    await db.transaction(async (tx) => {
      const [cup] = await tx.select().from(houseCups).where(eq(houseCups.id, id)).limit(1);
      if (!cup) throw notFound('That cup does not exist.');
      if (cup.closedAt) throw conflict('A finished cup stays in the hall of fame.');
      await tx.delete(houseCups).where(eq(houseCups.id, id));
      await audit(deps, req, tx, { actor: auth, action: 'school.cup.delete', targetType: 'house_cup', targetId: id, targetName: cup.name, before: { startsOn: cup.startsOn, endsOn: cup.endsOn } });
    });
    return { ok: true };
  });

  /** Past house cups and tournament winners. Names and totals only. */
  app.get('/api/school/hall-of-fame', async (req, reply) => {
    noStore(reply);
    requireAuth(req);
    await closeFinishedCups(db);
    const done = await db
      .select({ id: tournaments.id, name: tournaments.name, format: tournaments.format, winnerName: tournaments.winnerName, finishedAt: tournaments.finishedAt })
      .from(tournaments)
      .where(sql`${tournaments.finishedAt} is not null and ${tournaments.winnerName} is not null`)
      .orderBy(desc(tournaments.finishedAt))
      .limit(50);
    return { cups: await pastCups(db), tournaments: done.map((t) => ({ ...t, finishedAt: t.finishedAt!.toISOString() })) };
  });

  /** House points one finished game paid, by house. Totals only, for the results screen. */
  app.get('/api/school/games/:id/houses', async (req, reply) => {
    noStore(reply);
    requireAuth(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const houseRows = await gameHouseTotals(db, id);
    return { houses: houseRows.some((h) => h.points > 0) ? houseRows : [] };
  });

  /* --------------------------------- staff ---------------------------------- */

  app.get('/api/school/settings', async (req, reply) => {
    noStore(reply);
    staff(req, 'school.manage');
    const all = await db.select().from(houses).orderBy(asc(houses.sort), asc(houses.createdAt));
    const counts = await db.select({ houseId: houseMembers.houseId, n: sql<number>`count(*)::int` }).from(houseMembers).groupBy(houseMembers.houseId);
    const n = new Map(counts.map((c) => [c.houseId, c.n]));
    return { settings: await schoolSettings(db), houses: all.map((h) => ({ ...houseView(h), archived: Boolean(h.archivedAt), members: n.get(h.id) ?? 0 })), emblems: HOUSE_EMBLEMS };
  });

  app.patch('/api/school/settings', staffLimit(20), async (req) => {
    const auth = staff(req, 'school.manage');
    const parsed = parse(schoolSettingsPatchSchema, req.body);
    // Only the fields sent: the schema's defaults must not put the other settings back.
    const sent = new Set(Object.keys((req.body ?? {}) as object));
    const patch = Object.fromEntries(Object.entries(parsed).filter(([k]) => sent.has(k)));
    const before = await schoolSettings(db);
    const next = schoolSettingsSchema.parse({ ...before, ...patch });
    await db.transaction(async (tx) => {
      await saveSchoolSettings(tx, next, auth.user.id);
      await audit(deps, req, tx, { actor: auth, action: 'school.settings', targetType: 'school', targetId: 'settings', before, after: next });
    });
    return { settings: next };
  });

  app.post('/api/school/houses', staffLimit(20), async (req) => {
    const auth = staff(req, 'school.manage');
    const body = parse(houseInputSchema, req.body);
    const list = await activeHouses(db);
    if (list.length >= MAX_HOUSES) throw conflict(`A school can have ${MAX_HOUSES} houses at most, so a house match can seat them all.`);
    if (list.some((h) => h.name.toLowerCase() === body.name.toLowerCase())) throw conflict('There is already a house with that name.', { name: 'Already used.' });
    const house = await db.transaction(async (tx) => {
      const [row] = await tx.insert(houses).values({ ...body, sort: list.length }).returning();
      await audit(deps, req, tx, { actor: auth, action: 'school.house.create', targetType: 'house', targetId: row!.id, targetName: row!.name, after: body });
      return row!;
    });
    return { house: houseView(house) };
  });

  app.patch('/api/school/houses/:id', staffLimit(30), async (req) => {
    const auth = staff(req, 'school.manage');
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(houseInputSchema.partial(), req.body);
    const house = await requireHouse(deps, id);
    if (body.name && (await activeHouses(db)).some((h) => h.id !== id && h.name.toLowerCase() === body.name!.toLowerCase())) throw conflict('There is already a house with that name.', { name: 'Already used.' });
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(houses).set(body).where(eq(houses.id, id)).returning();
      await audit(deps, req, tx, { actor: auth, action: 'school.house.update', targetType: 'house', targetId: id, targetName: row!.name, before: houseView(house), after: houseView(row!) });
      return row!;
    });
    return { house: houseView(updated) };
  });

  /** Retire a house: its members are left without one and its points stay in past cups. */
  app.delete('/api/school/houses/:id', staffLimit(10), async (req) => {
    const auth = staff(req, 'school.manage');
    const { id } = parse(z.object({ id: uuid }), req.params);
    const house = await requireHouse(deps, id);
    await db.transaction(async (tx) => {
      await tx.update(houses).set({ archivedAt: new Date() }).where(eq(houses.id, id));
      await tx.delete(houseMembers).where(eq(houseMembers.houseId, id));
      await audit(deps, req, tx, { actor: auth, action: 'school.house.archive', targetType: 'house', targetId: id, targetName: house.name });
    });
    return { ok: true };
  });

  /** Students without a house, and in each house, for school staff to sort. Display names only. */
  app.get('/api/school/students', async (req, reply) => {
    noStore(reply);
    staff(req, 'school.manage');
    const q = parse(z.object({ q: z.string().trim().max(40).default(''), unhoused: z.coerce.boolean().default(false) }), req.query);
    const rows = await db
      .select({ id: users.id, displayName: users.displayName, houseId: houseMembers.houseId })
      .from(users)
      .leftJoin(houseMembers, eq(houseMembers.userId, users.id))
      .where(and(eq(users.isGuest, false), sql`${users.accountType} <> 'teacher'`, eq(users.status, 'active'), q.q ? sql`${users.displayName} ilike ${`%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}` : undefined, q.unhoused ? isNull(houseMembers.houseId) : undefined))
      .orderBy(asc(users.displayName))
      .limit(60);
    return { students: rows };
  });

  /* --------------------------------- teachers -------------------------------- */

  /** A teacher's class with each student's house and the class's sport days. */
  app.get('/api/school/classes/:id', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const cls = await teacherClass(db, id, auth, 'Only the class teacher can sort houses for this class.');
    const members = await db
      .select({ id: users.id, displayName: users.displayName, accountType: users.accountType })
      .from(classMembers)
      .innerJoin(users, eq(users.id, classMembers.userId))
      .where(eq(classMembers.classId, cls.id))
      .orderBy(asc(users.displayName));
    const students = members.filter((m) => m.accountType !== 'teacher');
    const houseOf = await housesOf(db, students.map((s) => s.id));
    const avatars = await loadAvatars(db, students.map((s) => s.id));
    const [sport] = await db.select().from(classSportDays).where(eq(classSportDays.classId, cls.id)).limit(1);
    const settings = await schoolSettings(db);
    const today = schoolDay(new Date(), settings.timeZone);
    const [given] = await db.select({ n: sql<number>`count(*)::int` }).from(merits).where(and(eq(merits.teacherId, auth.user.id), eq(merits.day, today)));
    return {
      class: { id: cls.id, name: cls.name },
      students: students.map((s) => ({ id: s.id, displayName: s.displayName, houseId: houseOf.get(s.id)?.id ?? null, avatar: avatars.get(s.id) ?? null })),
      sportDays: sport?.days ?? [],
      merits: { givenToday: given?.n ?? 0, limit: settings.meritsPerTeacherPerDay, values: settings.values, points: settings.meritPoints },
    };
  });

  app.put('/api/school/classes/:id/sport-days', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const cls = await teacherClass(db, id, auth, 'Only the class teacher can set its sport days.', { active: true });
    const { days } = parse(z.object({ days: sportDaysSchema }), req.body);
    if (!days.length) await db.delete(classSportDays).where(eq(classSportDays.classId, cls.id));
    else await db.insert(classSportDays).values({ classId: cls.id, days }).onConflictDoUpdate({ target: classSportDays.classId, set: { days, updatedAt: new Date() } });
    return { ok: true, days };
  });

  /** Put a student in a house (or take them out). Their teacher or school staff only. */
  app.put('/api/school/students/:id/house', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { houseId } = parse(z.object({ houseId: uuid.nullable() }), req.body);
    const student = await loadStudent(deps, id);
    await assertCanTeach(deps, auth, student.id);
    if (student.accountType === 'teacher') throw conflict('Houses are for students.');
    const house = houseId ? await requireHouse(deps, houseId) : null;
    await setHouse(db, { userId: student.id, houseId: house?.id ?? null, setBy: auth.user.id, chosen: false });
    return { ok: true, house: house ? houseView(house) : null };
  });

  /* ---------------------------------- merits --------------------------------- */

  /** A merit for one of the school's values. House points only: never currency, items or a game advantage. */
  app.post('/api/school/merits', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const auth = requireAccount(req);
    if (!isTeacher(auth) && !canManage(auth)) throw forbidden('Merits are given by teachers.');
    const body = parse(meritInputSchema, req.body);
    if (body.studentId === auth.user.id) throw forbidden('You cannot give yourself a merit.');
    const student = await loadStudent(deps, body.studentId);
    await assertCanTeach(deps, auth, student.id);
    const settings = await schoolSettings(db);
    const value = settings.values.find((v) => v.toLowerCase() === body.value.toLowerCase());
    if (!value) throw new AppError(400, 'validation_failed', 'Choose one of the school values.', { value: 'Not one of the school values.' });
    const today = schoolDay(new Date(), settings.timeZone);
    const house = (await housesOf(db, [student.id])).get(student.id) ?? null;
    const merit = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`merits:${auth.user.id}`}))`);
      const [given] = await tx.select({ n: sql<number>`count(*)::int` }).from(merits).where(and(eq(merits.teacherId, auth.user.id), eq(merits.day, today)));
      if ((given?.n ?? 0) >= settings.meritsPerTeacherPerDay) throw new AppError(429, 'rate_limited', `You have given today's ${settings.meritsPerTeacherPerDay} merits. You can give more tomorrow.`);
      const [row] = await tx.insert(merits).values({ studentId: student.id, teacherId: auth.user.id, teacherName: auth.user.displayName, value, note: body.note, day: today }).returning();
      if (house && settings.meritPoints > 0) {
        const [prefs] = await tx.select({ p: users.preferences }).from(users).where(eq(users.id, student.id)).limit(1);
        await tx.insert(housePoints).values({ houseId: house.id, userId: student.id, points: settings.meritPoints, reason: 'merit', sourceId: row!.id, yearGroup: readPreferences(prefs?.p).school.year, day: today });
      }
      await notify(tx, { userId: student.id, kind: 'school', title: `${auth.user.displayName} gave you a merit for ${value}`, body: house && settings.meritPoints ? `${settings.meritPoints} house points for ${house.name}.${body.note ? ` ${body.note}` : ''}` : body.note, link: '/school', dedupeKey: `merit:${row!.id}` });
      return row!;
    });
    return { ok: true, merit: { id: merit.id, value, points: house ? settings.meritPoints : 0, house: house ? houseView(house) : null } };
  });

  /**
   * A student's merits: counts by value for anyone who can see their public profile; the notes
   * and who gave them only for the student, their teachers and school staff.
   */
  app.get('/api/school/students/:id/merits', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: uuid }), req.params);
    const [u] = await db.select({ id: users.id, preferences: users.preferences, isGuest: users.isGuest }).from(users).where(eq(users.id, id)).limit(1);
    if (!u || u.isGuest) throw notFound('No player with that id.');
    const close = auth.user.id === id || canManage(auth) || (isTeacher(auth) && (await teachesStudent(db, auth.user.id, id)));
    if (!close && readPreferences(u.preferences).privacy.profileVisibility !== 'public') return { total: 0, byValue: [], recent: [], hidden: true };
    const counts = await db.select({ value: merits.value, n: sql<number>`count(*)::int` }).from(merits).where(eq(merits.studentId, id)).groupBy(merits.value).orderBy(desc(sql`count(*)`));
    const recent = close ? await db.select().from(merits).where(eq(merits.studentId, id)).orderBy(desc(merits.createdAt)).limit(10) : [];
    return {
      total: counts.reduce((a, c) => a + c.n, 0),
      byValue: counts,
      recent: recent.map((m) => ({ id: m.id, value: m.value, note: m.note, teacherName: m.teacherName, createdAt: m.createdAt.toISOString() })),
      hidden: false,
    };
  });

  /* ---------------------------------- usage ---------------------------------- */

  /** How the school uses Ludora: games per week, active classes, most-played sets. Totals only. */
  app.get('/api/school/usage', async (req, reply) => {
    noStore(reply);
    staff(req, 'school.view');
    const { timeZone } = await schoolSettings(db);
    const today = schoolDay(new Date(), timeZone);
    const firstWeek = addDays(weekStartDay(today), -7 * 7);
    const since = new Date(`${firstWeek}T00:00:00Z`);
    const week = sql<string>`to_char(date_trunc('week', ${gameSessions.endedAt} at time zone ${timeZone}), 'YYYY-MM-DD')`;
    const perWeek = await db
      .select({ week, games: sql<number>`count(*)::int`, players: sql<number>`coalesce(sum(${gameSessions.playerCount}), 0)::int` })
      .from(gameSessions)
      .where(and(gte(gameSessions.endedAt, since), eq(gameSessions.isSolo, false)))
      .groupBy(sql`1`);
    const byWeek = new Map(perWeek.map((r) => [r.week, r]));
    const weeks = Array.from({ length: 8 }, (_, i) => addDays(firstWeek, i * 7)).map((w) => ({ week: w, games: byWeek.get(w)?.games ?? 0, players: byWeek.get(w)?.players ?? 0 }));
    const month = new Date(Date.now() - 30 * 86_400_000);
    const [active] = await db
      .select({ n: sql<number>`count(distinct ${gameSessions.classId})::int` })
      .from(gameSessions)
      .where(and(gte(gameSessions.endedAt, new Date(Date.now() - 7 * 86_400_000)), sql`${gameSessions.classId} is not null`));
    const [activeMonth] = await db.select({ n: sql<number>`count(distinct ${gameSessions.classId})::int` }).from(gameSessions).where(and(gte(gameSessions.endedAt, month), sql`${gameSessions.classId} is not null`));
    const [allClasses] = await db.select({ n: sql<number>`count(*)::int` }).from(classes).where(isNull(classes.archivedAt));
    const topSets = await db
      .select({ setId: gameSessions.setId, title: gameSessions.setTitle, games: sql<number>`count(*)::int`, players: sql<number>`coalesce(sum(${gameSessions.playerCount}), 0)::int` })
      .from(gameSessions)
      .leftJoin(questionSets, eq(questionSets.id, gameSessions.setId))
      .where(gte(gameSessions.endedAt, month))
      .groupBy(gameSessions.setId, gameSessions.setTitle)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    const [housed] = await db.select({ n: sql<number>`count(*)::int` }).from(houseMembers);
    return { weeks, activeClasses: { week: active?.n ?? 0, month: activeMonth?.n ?? 0, total: allClasses?.n ?? 0 }, topSets, housed: housed?.n ?? 0 };
  });

  /* ------------------------------- class lists ------------------------------- */

  /** The classes a teacher teaches, for pickers on the School pages. */
  app.get('/api/school/my-classes', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const rows = await db
      .select({ id: classes.id, name: classes.name, members: sql<number>`(select count(*)::int from ${classMembers} where ${classMembers.classId} = ${classes.id})` })
      .from(classes)
      .where(and(eq(classes.ownerId, auth.user.id), isNull(classes.archivedAt)))
      .orderBy(asc(classes.name));
    return { classes: rows };
  });
}
