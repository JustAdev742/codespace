import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { aiDraftRequestSchema, aiRunRequestSchema, type AiAbout, type AiDraftResponse, type AiDraftStatus, type AiRunResponse, type AiStatus, type AiUnavailable, type Question } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { noStore, requireAccount, type AuthContext } from '../../http/context.ts';
import { ipKey } from '../../http/limits.ts';
import { hashIp } from '../../lib/crypto.ts';
import { AppError, badRequest, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { allFlags, isFlagOn } from '../flags/service.ts';
import { aiAdminRoutes } from './admin.ts';
import { allowanceFor, enabledModels, finishRequest, loadAiSettings, reserveRequest } from './allowance.ts';
import { modelOrder, RunError, runTask, type RunFailure } from './runner.ts';
import { getAiTask, listAiTasks, TaskInputError, TaskReject, type AiAudience } from './tasks.ts';
import './tasks/index.ts';

/*
 * AI helpers (D37, widened). Every request is one registered task, run on the
 * providers the server's environment configures. Who may use them: teacher
 * accounts, creators and staff when ai.helpers_teachers is on (drafting alone
 * also with the older ai.question_drafts flag), and student and player
 * accounts when ai.helpers_students is on. Never guests. Each account has an
 * allowance over a rolling window and the site a daily cap (allowance.ts);
 * addresses are rate limited as well.
 */

export const TEACHER_FLAG = 'ai.helpers_teachers';
export const STUDENT_FLAG = 'ai.helpers_students';
export const DRAFTS_FLAG = 'ai.question_drafts';
export const AI_FLAGS = [TEACHER_FLAG, STUDENT_FLAG, DRAFTS_FLAG] as const;

/** Teacher accounts, creators who publish public sets, and staff; everyone else signed in is a student or player. */
export function audienceOf(auth: AuthContext): AiAudience | null {
  if (auth.user.isGuest) return null;
  if (auth.user.accountType === 'teacher' || auth.permissions.has('sets.publish_public') || auth.permissions.has('staff.access')) return 'teacher';
  return 'student';
}

/** The tasks this person may use, or why none. */
export async function aiAccess(deps: AppDeps, auth: AuthContext): Promise<{ tasks: string[]; reason?: AiUnavailable }> {
  if (!(deps.ai ?? []).some((p) => p.models.length)) return { tasks: [], reason: 'not_configured' };
  const audience = audienceOf(auth);
  if (!audience) return { tasks: [], reason: 'not_allowed' };
  const on = audience === 'teacher' ? await isFlagOn(deps.db, TEACHER_FLAG, auth) : await isFlagOn(deps.db, STUDENT_FLAG, auth);
  const drafts = audience === 'teacher' && (await isFlagOn(deps.db, DRAFTS_FLAG, auth));
  const tasks = listAiTasks()
    .filter((t) => t.audience.includes(audience) && (on || (drafts && t.id === 'set.draft_questions')))
    .map((t) => t.id);
  if (tasks.length) return { tasks };
  // Teachers' helpers are on but none is for this person's kind of account.
  if (audience === 'student' && ((await isFlagOn(deps.db, TEACHER_FLAG, auth)) || (await isFlagOn(deps.db, DRAFTS_FLAG, auth)))) return { tasks: [], reason: 'not_allowed' };
  return { tasks: [], reason: 'not_enabled' };
}

const NOT_SET_UP = 'AI helpers are not set up on this server.';

const FAILURES: Record<RunFailure, { status: number; message: string }> = {
  refused: { status: 422, message: 'The AI would not help with that. Try different wording.' },
  filtered: { status: 422, message: "The suggestion did not pass Ludora's word filter, so it is not shown. Try again or change the wording." },
  incomplete: { status: 502, message: 'The suggestion was cut short. Try again, or ask for less.' },
  invalid: { status: 502, message: 'The suggestion came back in a form Ludora could not use. Try again.' },
  busy: { status: 503, message: 'The AI is busy right now. Try again in a minute, or pick another model.' },
  timeout: { status: 504, message: 'The AI took too long. Try again, or pick another model.' },
  unavailable: { status: 503, message: 'AI helpers are not working right now. Try again later.' },
};

const OUTCOME: Record<RunFailure, 'refused' | 'filtered' | 'failed'> = { refused: 'refused', filtered: 'filtered', incomplete: 'failed', invalid: 'failed', busy: 'failed', timeout: 'failed', unavailable: 'failed' };

/** Turns a run failure into the plain message for the person; the detail goes to the log only. */
function failure(err: RunError): AppError {
  const f = FAILURES[err.kind];
  const wait = err.kind === 'busy' && err.retryAfterSec ? ` Try again in ${err.retryAfterSec < 90 ? `${err.retryAfterSec} seconds` : `${Math.ceil(err.retryAfterSec / 60)} minutes`}, or pick another model.` : null;
  return new AppError(f.status, err.kind === 'refused' || err.kind === 'filtered' ? 'validation_failed' : 'not_available', wait ? f.message.replace(/ Try again.*$/, wait) : f.message);
}

interface RunOutcome {
  output: unknown;
  response: Omit<AiRunResponse, 'output'>;
}

/** The whole of one helper request: who may, the allowance, the run, and the record of it. */
async function run(deps: AppDeps, req: FastifyRequest, auth: AuthContext, taskId: string, rawInput: unknown, choice: { model?: string; fallback: boolean }): Promise<RunOutcome> {
  const task = getAiTask(taskId);
  const access = await aiAccess(deps, auth);
  if (access.reason === 'not_configured') throw new AppError(503, 'not_available', NOT_SET_UP);
  if (!task) throw notFound('There is no AI helper with that name.');
  if (access.reason === 'not_allowed') throw forbidden('AI helpers are not available to your account.');
  if (access.reason === 'not_enabled') throw new AppError(403, 'not_available', 'AI helpers are not switched on here.');
  if (!access.tasks.includes(taskId)) throw forbidden('This AI helper is not available to your account.');
  const input = parse(task.input, rawInput);
  const settings = await loadAiSettings(deps.db, deps);
  const enabled = enabledModels(deps, settings);
  if (choice.model && !enabled.some((m) => m.id === choice.model)) throw badRequest('That model is not available. Pick another.');
  const models = modelOrder(enabled, choice.model, choice.fallback);
  if (!models.length) throw new AppError(503, 'not_available', 'No AI model is switched on. Ask the people who run Ludora here.');

  const ctx = { deps, auth };
  let prepared: unknown;
  try {
    prepared = task.prepare ? await task.prepare(input, ctx) : input;
  } catch (err) {
    if (err instanceof TaskInputError) throw new AppError(err.status, err.status === 403 ? 'forbidden' : err.status === 404 ? 'not_found' : 'bad_request', err.message);
    if (err instanceof TaskReject) throw badRequest(err.message);
    throw err;
  }

  const { id } = await reserveRequest(deps, auth.user.id, task.id, hashIp(req.ip, deps.config.IP_HASH_KEY));
  try {
    const result = await runTask(task, prepared, models, ctx);
    await finishRequest(deps.db, id, { outcome: 'ok', provider: result.provider, model: result.model.id, ...result.usage });
    req.log.info({ userId: auth.user.id, task: task.id, model: result.model.id, dropped: result.dropped, removed: result.removed, ...result.usage }, 'ai helper');
    const allowance = await allowanceFor(deps.db, auth.user.id, settings);
    const { running: _running, ...left } = allowance;
    return { output: result.output, response: { model: result.model, removed: result.removed, dropped: result.dropped, allowance: left } };
  } catch (err) {
    const runError = err instanceof RunError ? err : null;
    await finishRequest(deps.db, id, { outcome: runError ? OUTCOME[runError.kind] : 'failed', ...(runError?.model ? { provider: runError.model.provider, model: runError.model.id } : {}), ...runError?.usage });
    if (!runError) throw err;
    req.log[runError.kind === 'unavailable' ? 'error' : 'warn']({ userId: auth.user.id, task: task.id, kind: runError.kind, detail: runError.message }, 'ai helper failed');
    throw failure(runError);
  }
}

export async function aiRoutes(app: FastifyInstance, deps: AppDeps) {
  // By address as well as by account: one address cannot run through many accounts' allowances.
  const addressLimit = { config: { rateLimit: { max: deps.config.AI_PER_ADDRESS_10_MIN, timeWindow: '10 minutes', keyGenerator: ipKey } } };

  app.get('/api/ai/status', async (req, reply): Promise<AiStatus> => {
    noStore(reply);
    const auth = requireAccount(req);
    const access = await aiAccess(deps, auth);
    const settings = await loadAiSettings(deps.db, deps);
    const { running: _running, ...allowance } = await allowanceFor(deps.db, auth.user.id, settings);
    const models = access.reason ? [] : enabledModels(deps, settings).map(({ id, label, provider }) => ({ id, label, provider }));
    const available = !access.reason && models.length > 0;
    return { available, ...(access.reason ? { reason: access.reason } : !models.length ? { reason: 'not_configured' as const } : {}), tasks: available ? access.tasks : [], models, allowance };
  });

  /** For the privacy page: whether helpers are on for anyone, and which providers receive the text. No sign-in needed. */
  app.get('/api/ai/about', async (): Promise<AiAbout> => {
    const settings = await loadAiSettings(deps.db, deps);
    const providers = [...new Set(enabledModels(deps, settings).map((m) => m.provider))];
    const flags = (await allFlags(deps.db)).filter((f) => (AI_FLAGS as readonly string[]).includes(f.key));
    const on = providers.length > 0 && flags.some((f) => f.enabled || f.rolloutPercent > 0 || f.roles.length > 0 || f.userIds.length > 0);
    return { on, providers: on ? providers : [] };
  });

  app.post('/api/ai/tasks/:task', addressLimit, async (req): Promise<AiRunResponse> => {
    const auth = requireAccount(req);
    const { task } = parse(z.object({ task: z.string().max(80) }), req.params);
    const body = parse(aiRunRequestSchema, req.body ?? {});
    const { output, response } = await run(deps, req, auth, task, body.input, { ...(body.model ? { model: body.model } : {}), fallback: body.fallback });
    return { output, ...response };
  });

  /* The set editor's draft dialog: the same task under its original addresses and shapes. */

  app.get('/api/ai/drafts/status', async (req, reply): Promise<AiDraftStatus> => {
    noStore(reply);
    const auth = requireAccount(req);
    const access = await aiAccess(deps, auth);
    const settings = await loadAiSettings(deps.db, deps);
    const left = await allowanceFor(deps.db, auth.user.id, settings);
    const ok = access.tasks.includes('set.draft_questions') && enabledModels(deps, settings).length > 0;
    return { available: ok, ...(ok ? {} : { reason: access.reason ?? 'not_configured' }), remainingToday: left.remaining, limitToday: left.limit };
  });

  app.post('/api/ai/drafts', addressLimit, async (req): Promise<AiDraftResponse> => {
    const auth = requireAccount(req);
    const extra = parse(z.object({ model: z.string().max(200).optional(), fallback: z.boolean().default(true) }), { model: (req.body as { model?: unknown } | null)?.model, fallback: (req.body as { fallback?: unknown } | null)?.fallback });
    const body = parse(aiDraftRequestSchema, req.body);
    if (audienceOf(auth) === 'student' && !(await aiAccess(deps, auth)).tasks.includes('set.draft_questions')) throw forbidden('AI drafts are for teacher accounts.');
    const { output, response } = await run(deps, req, auth, 'set.draft_questions', body, { ...(extra.model ? { model: extra.model } : {}), fallback: extra.fallback });
    return { questions: output as Question[], dropped: response.dropped, remainingToday: response.allowance.remaining, model: response.model, removed: response.removed };
  });

  await aiAdminRoutes(app, deps);
}

