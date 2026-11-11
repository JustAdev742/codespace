import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { lessonBodySchema, lessonStepSchema, questionSchema, roomCodeSchema, roomOptionsSchema, type LessonBody, type LessonStep } from '@ludora/shared';
import { getMode, getVariant, prepareQuestions } from '@ludora/engine';
import type { AppDeps } from '../../app.ts';
import type { Db } from '../../db/client.ts';
import { classMembers, classes, lessonRuns, lessons, questionSets, users } from '../../db/schema.ts';
import { noStore, requireAccount, type AuthContext } from '../../http/context.ts';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { loadClass, teacherClass } from '../classes/access.ts';
import { loadSetForPlay, setAccess } from '../sets/access.ts';
import { isModePlayableBy } from '../modes/service.ts';
import { notify } from '../notifications/service.ts';
import { MAX_ROOMS_PER_HOST } from '../../realtime/manager.ts';
import type { Room } from '../../realtime/room.ts';
import { TEMPLATES, languageProblem, modeTitle, stepId, stepMinutes, stepTitle, type Tally, type TemplateId } from './model.ts';
import { LessonRun, screenFor, type RunGame, type RunState } from './run.ts';

/*
 * Lessons: a teacher's ordered steps, run in one room. Every route is for a teacher account and
 * checks on the server that the caller owns the lesson; anyone else gets the same 404 as for a
 * lesson that does not exist (a student gets a 403 saying lessons are for teachers). Plan notes
 * leave the server only on the owner's own lesson routes, never in a room.
 */

type LessonRow = typeof lessons.$inferSelect;
const idParams = z.object({ id: z.string().uuid() });
const isoDate = z.iso.datetime({ offset: true });

/** Lesson routes are for teacher accounts. */
function teacherAuth(req: Parameters<typeof requireAccount>[0]): AuthContext {
  const auth = requireAccount(req);
  if (auth.user.accountType !== 'teacher') throw forbidden('Lessons are planned with a teacher account. You can switch to one in Settings.');
  return auth;
}

function lessonId(params: unknown): string {
  const r = idParams.safeParse(params);
  if (!r.success) throw notFound('That lesson does not exist.');
  return r.data.id;
}

/** The caller's own lesson, or a 404 that says nothing about anyone else's. */
async function owned(db: Db, id: string, auth: AuthContext): Promise<LessonRow> {
  const [row] = await db.select().from(lessons).where(and(eq(lessons.id, id), eq(lessons.ownerId, auth.user.id))).limit(1);
  if (!row) throw notFound('That lesson does not exist.');
  return row;
}

/** Stored steps, re-checked: anything that no longer parses is left out rather than breaking the page. */
function stepsOf(row: LessonRow): LessonStep[] {
  return ((row.steps as unknown[]) ?? []).flatMap((s) => {
    const r = lessonStepSchema.safeParse(s);
    return r.success ? [r.data] : [];
  });
}

function bodyOf(row: LessonRow): LessonBody {
  return { title: row.title, goals: (row.goals as string[]) ?? [], standings: row.standings, steps: stepsOf(row) };
}

/** Refuse what a class could not read or play: rude words, unknown modes, and modes played alone. */
function checkBody(body: LessonBody) {
  const problem = languageProblem(body);
  if (problem) throw badRequest(problem.message, { [problem.field]: problem.message });
  for (const [i, s] of body.steps.entries()) {
    if (s.kind !== 'game') continue;
    const variant = s.variantId ? getVariant(s.variantId) : undefined;
    const mode = getMode(variant?.meta.modeId ?? s.modeId);
    if (!mode || (s.variantId && !variant)) throw badRequest(`Step ${i + 1}: that game mode does not exist.`, { [`steps.${i}`]: 'Choose another game mode.' });
    if (mode.meta.pacing === 'solo') throw badRequest(`Step ${i + 1}: ${mode.meta.title} is played alone, so it cannot be a step in a lesson.`, { [`steps.${i}`]: 'Choose a mode the class plays together.' });
  }
}

/** Each set a lesson uses: its title, size and whether this teacher may play it. */
async function setsFor(db: Db, steps: LessonStep[], auth: AuthContext) {
  const ids = [...new Set(steps.flatMap((s) => (s.kind === 'game' && s.setId ? [s.setId] : [])))];
  const rows = ids.length ? await db.select().from(questionSets).where(inArray(questionSets.id, ids)) : [];
  const out = new Map<string, { title: string; questionCount: number; playable: boolean; homeworkMode: string }>();
  for (const r of rows) out.set(r.id, { title: r.title, questionCount: r.questionCount, playable: (await setAccess(db, r, auth)).view, homeworkMode: homeworkMode(r.questions) });
  return out;
}

/** The mode homework from a lesson is played in: Time Attack, or flashcards for a set too short for it. */
function homeworkMode(raw: unknown): string {
  const questions = ((raw as unknown[]) ?? []).flatMap((q) => {
    const r = questionSchema.safeParse(q);
    return r.success ? [r.data] : [];
  });
  return prepareQuestions(getMode('time-attack')!, questions, 0).problem ? 'flashcard-study' : 'time-attack';
}

async function describe(db: Db, row: LessonRow, auth: AuthContext, manager: AppDeps['rooms']) {
  const steps = stepsOf(row);
  const sets = await setsFor(db, steps, auth);
  const info = steps.map((s) => {
    const set = s.kind === 'game' && s.setId ? sets.get(s.setId) : undefined;
    const minutes = stepMinutes(s, set?.questionCount ?? null);
    const problem = s.kind !== 'game' ? null : !s.setId ? 'Choose a question set.' : !set ? 'Its question set was deleted. Choose another.' : !set.playable ? 'Its question set is private to its owner. Choose another, or ask them for a copy.' : null;
    return { title: stepTitle(s, set?.title ?? null), modeTitle: s.kind === 'game' ? modeTitle(s.modeId, s.variantId) : null, setTitle: set?.title ?? null, questionCount: set?.questionCount ?? null, minutes, problem };
  });
  const [cls] = row.classId ? await db.select({ name: classes.name }).from(classes).where(eq(classes.id, row.classId)).limit(1) : [];
  const [run] = await db.select().from(lessonRuns).where(and(eq(lessonRuns.lessonId, row.id), eq(lessonRuns.hostUserId, auth.user.id))).orderBy(desc(lessonRuns.startedAt)).limit(1);
  const live = liveRoom(manager, row.id);
  return {
    lesson: { id: row.id, ...bodyOf(row), classId: row.classId, className: cls?.name ?? null, startsAt: row.startsAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString() },
    info,
    totalMinutes: info.reduce((n, s) => n + s.minutes, 0),
    lastRun: run ? { id: run.id, index: run.stepIndex, finished: Boolean(run.finishedAt), startedAt: run.startedAt.toISOString(), games: (run.games as RunGame[]).length } : null,
    liveCode: live?.code ?? null,
  };
}

/** The open room running this lesson, if there is one. */
function liveRoom(manager: AppDeps['rooms'], id: string): Room | undefined {
  return manager.list().find((r) => !r.isClosed() && r.lesson instanceof LessonRun && r.lesson.lessonId === id);
}

/** Saves of runs, one after another per run, so an older state never lands after a newer one. */
const saving = new Map<string, Promise<unknown>>();
export async function lessonSavesIdle(): Promise<void> {
  await Promise.allSettled(saving.values());
}

function saver(deps: AppDeps, runId: string) {
  return (state: RunState) => {
    const before = saving.get(runId) ?? Promise.resolve();
    const next = before
      .then(() =>
        deps.db
          .update(lessonRuns)
          .set({ stepIndex: state.index, standings: state.tally, games: state.games, updatedAt: new Date(), ...(state.finished ? { finishedAt: new Date() } : {}) })
          .where(eq(lessonRuns.id, runId)),
      )
      .catch((err) => deps.log?.error({ err, runId }, 'lesson run save failed'));
    saving.set(runId, next);
    void next.finally(() => {
      if (saving.get(runId) === next) saving.delete(runId);
    });
  };
}

const summarise = (steps: LessonStep[], sets: Map<string, { title: string }>) => steps.map((s) => ({ title: stepTitle(s, s.kind === 'game' && s.setId ? (sets.get(s.setId)?.title ?? null) : null), kind: s.kind }));

/** Load a game step's set for a room, saying which step a refusal is about. */
async function stepGame(db: Db, step: Extract<LessonStep, { kind: 'game' }>, index: number, auth: AuthContext) {
  if (!step.setId) throw conflict(`Step ${index + 1} needs a question set.`);
  try {
    const { set, questions } = await loadSetForPlay(db, step.setId, auth);
    return { set: { id: set.id, title: set.title, questions }, modeId: getVariant(step.variantId ?? '')?.meta.modeId ?? step.modeId, variantId: step.variantId, settings: step.settings, common: step.common };
  } catch (err) {
    if (err instanceof AppError) throw new AppError(err.status, err.code, `Step ${index + 1}: ${err.message}`);
    throw err;
  }
}

export async function lessonRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;
  const manager = deps.rooms;

  app.get('/api/lessons/templates', async (req) => {
    teacherAuth(req);
    return { templates: Object.entries(TEMPLATES).map(([id, t]) => ({ id, title: t.title, description: t.description, steps: t.body().steps.length })) };
  });

  app.get('/api/lessons', async (req, reply) => {
    noStore(reply);
    const auth = teacherAuth(req);
    const rows = await db.select().from(lessons).where(eq(lessons.ownerId, auth.user.id)).orderBy(desc(lessons.updatedAt)).limit(200);
    const classNames = new Map((rows.some((r) => r.classId) ? await db.select({ id: classes.id, name: classes.name }).from(classes).where(inArray(classes.id, rows.flatMap((r) => (r.classId ? [r.classId] : [])))) : []).map((c) => [c.id, c.name]));
    const allSteps = rows.flatMap((r) => stepsOf(r));
    const sets = await setsFor(db, allSteps, auth);
    return {
      lessons: rows.map((r) => {
        const steps = stepsOf(r);
        return {
          id: r.id,
          title: r.title,
          steps: steps.length,
          games: steps.filter((s) => s.kind === 'game').length,
          minutes: steps.reduce((n, s) => n + stepMinutes(s, s.kind === 'game' && s.setId ? (sets.get(s.setId)?.questionCount ?? null) : null), 0),
          className: r.classId ? (classNames.get(r.classId) ?? null) : null,
          startsAt: r.startsAt?.toISOString() ?? null,
          updatedAt: r.updatedAt.toISOString(),
        };
      }),
    };
  });

  const createSchema = z.object({
    template: z.enum(Object.keys(TEMPLATES) as [TemplateId, ...TemplateId[]]).optional(),
    title: z.string().trim().min(1).max(80).optional(),
    /** A first step, from "Add to a lesson" on a set's page or the Host page. */
    step: lessonStepSchema.optional(),
  });

  app.post('/api/lessons', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (req) => {
    const auth = teacherAuth(req);
    const body = parse(createSchema, req.body);
    const base: LessonBody = body.template ? TEMPLATES[body.template].body() : { title: 'New lesson', goals: [], standings: true, steps: [] };
    if (body.title) base.title = body.title;
    if (body.step) base.steps.push({ ...body.step, id: stepId() });
    checkBody(base);
    const [row] = await db.insert(lessons).values({ ownerId: auth.user.id, title: base.title, goals: base.goals, standings: base.standings, steps: base.steps }).returning({ id: lessons.id });
    return { id: row!.id };
  });

  app.get('/api/lessons/:id', async (req, reply) => {
    noStore(reply);
    const auth = teacherAuth(req);
    return describe(db, await owned(db, lessonId(req.params), auth), auth, manager);
  });

  app.put('/api/lessons/:id', { config: { rateLimit: { max: 300, timeWindow: '1 hour' } } }, async (req) => {
    const auth = teacherAuth(req);
    const row = await owned(db, lessonId(req.params), auth);
    const body = parse(lessonBodySchema, req.body);
    if (new Set(body.steps.map((s) => s.id)).size !== body.steps.length) throw badRequest('Two steps have the same id. Reload the page and try again.');
    checkBody(body);
    await db.update(lessons).set({ title: body.title, goals: body.goals, standings: body.standings, steps: body.steps, updatedAt: new Date() }).where(eq(lessons.id, row.id));
    return describe(db, (await owned(db, row.id, auth)), auth, manager);
  });

  app.post('/api/lessons/:id/duplicate', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (req) => {
    const auth = teacherAuth(req);
    const row = await owned(db, lessonId(req.params), auth);
    const body = bodyOf(row);
    const title = `${body.title.slice(0, 73)} (copy)`;
    const [copy] = await db.insert(lessons).values({ ownerId: auth.user.id, title, goals: body.goals, standings: body.standings, steps: body.steps }).returning({ id: lessons.id });
    return { id: copy!.id };
  });

  app.delete('/api/lessons/:id', async (req) => {
    const auth = teacherAuth(req);
    const row = await owned(db, lessonId(req.params), auth);
    await db.delete(lessons).where(eq(lessons.id, row.id));
    return { ok: true };
  });

  /** "Add to a lesson": one step on the end of a lesson. */
  app.post('/api/lessons/:id/steps', { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } }, async (req) => {
    const auth = teacherAuth(req);
    const row = await owned(db, lessonId(req.params), auth);
    const step = parse(lessonStepSchema, req.body);
    const body = bodyOf(row);
    if (body.steps.length >= 20) throw conflict('That lesson already has 20 steps, the most a lesson can have.');
    body.steps.push({ ...step, id: stepId() });
    checkBody(body);
    await db.update(lessons).set({ steps: body.steps, updatedAt: new Date() }).where(eq(lessons.id, row.id));
    return { ok: true, steps: body.steps.length };
  });

  /**
   * Share by username: the other teacher gets their own copy, without your plan notes or schedule.
   * An unknown name, a student and a guest all get the same answer, so nothing else about an account
   * can be learned from it.
   */
  app.post('/api/lessons/:id/share', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const auth = teacherAuth(req);
    const row = await owned(db, lessonId(req.params), auth);
    const { username } = parse(z.object({ username: z.string().trim().min(1).max(40) }), req.body);
    const [to] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, username.toLowerCase()), eq(users.accountType, 'teacher'), eq(users.isGuest, false), eq(users.status, 'active')))
      .limit(1);
    if (!to || to.id === auth.user.id) throw notFound(to ? 'That is your own username. Use Duplicate to make a copy for yourself.' : 'No teacher with that username.');
    const body = bodyOf(row);
    const steps = body.steps.map((s) => ({ ...s, note: '' }));
    const [copy] = await db.insert(lessons).values({ ownerId: to.id, title: body.title, goals: body.goals, standings: body.standings, steps }).returning({ id: lessons.id });
    await notify(db, { userId: to.id, kind: 'invite', title: `${auth.user.displayName} shared a lesson with you`, body: `"${body.title}" is in your lessons now, as your own copy.`, link: `/lessons/${copy!.id}`, actorId: auth.user.id });
    return { ok: true };
  });

  /** Schedule: a class and a start time. It only shows on the class page; the teacher still opens and starts the room. */
  app.put('/api/lessons/:id/schedule', async (req) => {
    const auth = teacherAuth(req);
    const row = await owned(db, lessonId(req.params), auth);
    const body = parse(z.object({ classId: z.string().uuid().nullable(), startsAt: isoDate.nullable() }), req.body);
    if (!body.classId || !body.startsAt) {
      await db.update(lessons).set({ classId: null, startsAt: null, updatedAt: new Date() }).where(eq(lessons.id, row.id));
      return { ok: true };
    }
    await teacherClass(db, body.classId, auth, 'Only the class teacher can schedule a lesson for this class.', { active: true });
    const at = new Date(body.startsAt);
    if (at.getTime() < Date.now() - 60 * 60_000) throw badRequest('That time has already passed. Choose a time from now on.', { startsAt: 'Choose a time from now on.' });
    if (at.getTime() > Date.now() + 366 * 86_400_000) throw badRequest('Schedule a lesson up to a year ahead.', { startsAt: 'Choose a time within a year.' });
    await db.update(lessons).set({ classId: body.classId, startsAt: at, updatedAt: new Date() }).where(eq(lessons.id, row.id));
    return { ok: true };
  });

  /** A class's scheduled lessons, for its page: the teacher and its members. A Join code only once the teacher has opened the room. */
  app.get('/api/lessons/class/:id', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id } = parse(idParams, req.params);
    const { teacher } = await loadClass(db, id, auth);
    const rows = await db
      .select({ id: lessons.id, title: lessons.title, startsAt: lessons.startsAt })
      .from(lessons)
      .where(and(eq(lessons.classId, id), gte(lessons.startsAt, new Date(Date.now() - 6 * 60 * 60_000))))
      .orderBy(asc(lessons.startsAt))
      .limit(10);
    return {
      lessons: rows.map((r) => {
        const room = liveRoom(manager, r.id);
        const code = room && room.classId === id ? room.code : null;
        return { ...(teacher ? { id: r.id } : {}), title: r.title, startsAt: r.startsAt!.toISOString(), roomCode: code };
      }),
    };
  });

  /** Open a room for the lesson (or carry on from where the class stopped). The teacher then starts each game. */
  app.post('/api/lessons/:id/run', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = teacherAuth(req);
    const row = await owned(db, lessonId(req.params), auth);
    const { carryOn } = parse(z.object({ carryOn: z.boolean().default(false) }), req.body ?? {});
    const steps = stepsOf(row);
    if (!steps.some((s) => s.kind === 'game')) throw conflict('Add a game to the lesson before you run it.');
    const missing = steps.findIndex((s) => s.kind === 'game' && !s.setId);
    if (missing >= 0) throw conflict(`Step ${missing + 1} needs a question set.`);
    const live = liveRoom(manager, row.id);
    if (live && live.hostUserId === auth.user.id) return { code: live.code };
    if (manager.hostedBy(auth.user.id).filter((r) => !r.solo && r.status !== 'ended').length >= MAX_ROOMS_PER_HOST) {
      throw conflict(`You already have ${MAX_ROOMS_PER_HOST} games open, the most you can have at once. Close one in Your open games, then try again.`);
    }

    // Carry on: the latest unfinished run, from the step it reached (or the next one, if that game was played).
    let run: typeof lessonRuns.$inferSelect | undefined;
    let start = 0;
    if (carryOn) {
      [run] = await db.select().from(lessonRuns).where(and(eq(lessonRuns.lessonId, row.id), eq(lessonRuns.hostUserId, auth.user.id), isNull(lessonRuns.finishedAt))).orderBy(desc(lessonRuns.startedAt)).limit(1);
      if (!run) throw conflict('There is no lesson to carry on. Start it from the beginning.');
      start = run.stepIndex + ((run.games as RunGame[]).some((g) => g.index === run!.stepIndex) ? 1 : 0);
      start = Math.min(start, steps.length - 1);
    }

    // A scheduled lesson is hosted for its class, if the teacher still teaches it: only its members can join.
    let cls: { id: string; name: string; members: string[]; extra: Record<string, number> } | null = null;
    if (row.classId) {
      const c = await teacherClass(db, row.classId, auth, 'Only the class teacher can host for this class.').catch(() => null);
      if (c && !c.archivedAt) {
        const members = await db.select({ u: classMembers.userId, extra: classMembers.extraTime }).from(classMembers).where(eq(classMembers.classId, c.id));
        cls = { id: c.id, name: c.name, members: members.map((m) => m.u), extra: Object.fromEntries(members.filter((m) => m.extra > 0).map((m) => [m.u, m.extra / 100])) };
      }
    }

    // The room is set up with the first game from the starting step on (a slide shows over it until then).
    const firstAt = steps.findIndex((s, i) => i >= start && s.kind === 'game');
    const gameIndex = firstAt >= 0 ? firstAt : steps.findIndex((s) => s.kind === 'game');
    const gameStep = steps[gameIndex] as Extract<LessonStep, { kind: 'game' }>;
    const game = await stepGame(db, gameStep, gameIndex, auth);
    await isModePlayableBy(deps, auth, game.modeId, game.variantId);
    const sets = await setsFor(db, steps, auth);

    let room: Room;
    try {
      room = manager.create({
        hostUserId: auth.user.id,
        hostName: auth.user.displayName,
        modeId: game.modeId,
        variantId: game.variantId,
        settings: game.settings,
        common: game.common,
        options: roomOptionsSchema.parse({}),
        set: game.set,
        solo: false,
        ...(cls ? { classId: cls.id, classMembers: cls.members, classTitle: cls.name, classExtraTime: cls.extra } : {}),
      });
    } catch (err) {
      throw new AppError(400, 'validation_failed', `Step ${gameIndex + 1}: ${(err as Error).message}`);
    }
    if (!run) {
      [run] = await db.insert(lessonRuns).values({ lessonId: row.id, hostUserId: auth.user.id, classId: cls?.id ?? null, stepIndex: start }).returning();
    }
    const lesson = new LessonRun({
      lessonId: row.id,
      runId: run!.id,
      classId: cls?.id ?? null,
      title: row.title,
      goals: (row.goals as string[]) ?? [],
      standingsOn: row.standings,
      steps: summarise(steps, sets),
      index: start,
      tally: (run!.standings as Tally[]) ?? [],
      games: (run!.games as RunGame[]) ?? [],
      screen: screenFor(steps[start]!, Date.now()),
      save: saver(deps, run!.id),
    });
    room.lesson = lesson;
    lesson.moveTo(start, lesson.screen, lesson.steps);
    return { code: room.code, runId: run!.id };
  });

  /** "Next: <step>" from the room's results (or a slide): the same players carry on in the same room. */
  app.post('/api/lessons/rooms/:code/next', { config: { rateLimit: { max: 120, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = teacherAuth(req);
    const code = parse(roomCodeSchema, (req.params as { code: string }).code);
    const room = manager.get(code);
    const run = room?.lesson;
    if (!room || room.hostUserId !== auth.user.id || !(run instanceof LessonRun)) throw notFound('That lesson room has closed.');
    const row = await owned(db, run.lessonId, auth);
    if (room.status === 'running' || room.status === 'paused') throw conflict('Finish this game first.');
    if (run.finished) throw conflict('The lesson has finished.');
    const steps = stepsOf(row);
    const next = run.index + 1;
    if (next >= steps.length) {
      run.finish();
      room.goToLessonStep(null);
      return { ok: true, finished: true };
    }
    const step = steps[next]!;
    const sets = await setsFor(db, steps, auth);
    if (step.kind === 'game') {
      const game = await stepGame(db, step, next, auth);
      await isModePlayableBy(deps, auth, game.modeId, game.variantId);
      // The screen comes off first, so the room can be set up as a game.
      const r = room.goToLessonStep(game);
      if (!r.ok) throw conflict(`Step ${next + 1}: ${r.error.message}`);
    } else {
      const r = room.goToLessonStep(null);
      if (!r.ok) throw conflict(r.error.message);
    }
    run.moveTo(next, screenFor(step, Date.now()), summarise(steps, sets));
    room.scheduleBroadcast();
    return { ok: true, finished: false, index: next };
  });

  app.get('/api/lessons/:id/runs', async (req, reply) => {
    noStore(reply);
    const auth = teacherAuth(req);
    const row = await owned(db, lessonId(req.params), auth);
    const runs = await db.select().from(lessonRuns).where(and(eq(lessonRuns.lessonId, row.id), eq(lessonRuns.hostUserId, auth.user.id))).orderBy(desc(lessonRuns.startedAt)).limit(50);
    return { runs: runs.map((r) => ({ id: r.id, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null, index: r.stepIndex, games: (r.games as RunGame[]).length })) };
  });

  /** One report for a run of the lesson: each game (linking to its own report), the lesson standings and the goals. */
  app.get('/api/lessons/runs/:id', async (req, reply) => {
    noStore(reply);
    const auth = teacherAuth(req);
    const { id } = parse(idParams, req.params);
    const [run] = await db.select().from(lessonRuns).where(and(eq(lessonRuns.id, id), eq(lessonRuns.hostUserId, auth.user.id))).limit(1);
    if (!run) throw notFound('That lesson report does not exist.');
    const row = await owned(db, run.lessonId, auth);
    const steps = stepsOf(row);
    const sets = await setsFor(db, steps, auth);
    const games = run.games as RunGame[];
    const sessions = games.length ? await db.execute<{ id: string; mode_id: string; player_count: number; set_id: string | null }>(sql`select id, mode_id, player_count, set_id from game_sessions where id in (${sql.join(games.map((g) => sql`${g.gameId}::uuid`), sql`, `)})`) : { rows: [] };
    const byId = new Map(sessions.rows.map((s) => [s.id, s]));
    const tally = [...((run.standings as Tally[]) ?? [])].sort((a, b) => b.points - a.points);
    return {
      lesson: { id: row.id, title: row.title, goals: (row.goals as string[]) ?? [], standingsOn: row.standings },
      run: { id: run.id, startedAt: run.startedAt.toISOString(), finishedAt: run.finishedAt?.toISOString() ?? null, index: run.stepIndex, classId: run.classId },
      steps: summarise(steps, sets),
      games: games.map((g) => {
        const s = byId.get(g.gameId);
        return { index: g.index, title: g.title, gameId: s ? g.gameId : null, players: s?.player_count ?? null, modeTitle: s ? modeTitle(s.mode_id, null) : null };
      }),
      // The sets of the lesson's games, for homework.
      sets: [...new Map(steps.flatMap((s) => (s.kind === 'game' && s.setId && sets.get(s.setId)?.playable ? [[s.setId, { id: s.setId, title: sets.get(s.setId)!.title, modeId: sets.get(s.setId)!.homeworkMode }] as const] : []))).values()],
      standings: tally.map((t, i) => ({ name: t.name, points: t.points, rank: tally.findIndex((x) => x.points === t.points) + 1 || i + 1 })),
    };
  });
}
