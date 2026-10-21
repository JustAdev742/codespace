import { createRng, type CommonSettings, type Question } from '@ludora/shared';
import { GameRuntime, type EngineResults } from '../runtime/runtime.ts';
import { prepareQuestions, resolveGameConfig, type GameConfig, type Resolved } from '../registry.ts';
import { parseSettings } from '../sdk/settings.ts';
import type { GameMode, ModeVariant } from '../sdk/types.ts';
import { commonSettingsSchema } from '@ludora/shared';
import { makeTeams } from '../teams.ts';

export { makeTeams };

/*
 * Plays a whole game with bots on a fake clock. Every mode and variant in
 * the catalogue is run through this in the test suite, which is what
 * "playable" means in the catalogue: it launched, it was played, it ended,
 * and it produced results, with no errors along the way.
 */

export interface SimulateOptions {
  modeId: string;
  variantId?: string;
  /** Test a mode (and optional variant) that is not registered yet. */
  mode?: GameMode;
  variant?: ModeVariant;
  questions: readonly Question[];
  players: number;
  /** Chance each bot answers correctly. */
  skill?: number;
  seed?: number;
  settings?: Record<string, unknown>;
  common?: Partial<CommonSettings>;
  /** Give up (and report a stall) after this much game time. */
  maxGameMs?: number;
  /** Disconnect and reconnect some players mid-game. */
  churn?: boolean;
  /** Pause the game for a while partway through. */
  pauseAt?: number;
}

export interface SimulateResult {
  results: EngineResults | null;
  gameMs: number;
  actions: number;
  rejected: number;
  errors: { where: string; error: unknown }[];
  leaks: string[];
  stalled: boolean;
}


/** Finds authored question objects (with their answers) inside a view, which must never happen. */
export function findAnswerLeaks(view: unknown, path = 'view'): string[] {
  if (view === null || typeof view !== 'object') return [];
  const leaks: string[] = [];
  const obj = view as Record<string, unknown>;
  if ('prompt' in obj && ['correct', 'accepted', 'back', 'answer', 'pairs'].some((k) => k in obj)) leaks.push(path);
  for (const [k, v] of Object.entries(obj)) leaks.push(...findAnswerLeaks(v, `${path}.${k}`));
  return leaks;
}

/** The same merging rules as resolveGameConfig, for a mode object that is not in the registry yet. */
function resolveUnregistered(mode: GameMode, variant: ModeVariant | null, settings: Record<string, unknown>, common: Record<string, unknown>): Resolved<GameConfig> {
  const locked = [...(variant?.locked ?? [])];
  const parsed = commonSettingsSchema.safeParse({ ...mode.defaults, ...variant?.common, ...common });
  if (!parsed.success) return { ok: false, message: 'Some game settings are out of range.' };
  const c = parsed.data;
  if (mode.meta.teams === 'none') c.teamCount = 0;
  if (mode.meta.teams === 'required' && c.teamCount < 2) c.teamCount = 2;
  return { ok: true, value: { mode, variant, settings: parseSettings(mode.settings, { ...variant?.settings, ...settings }), common: c, locked } };
}

export function simulateGame(opts: SimulateOptions): SimulateResult {
  const seed = opts.seed ?? 1234;
  const resolved = opts.mode
    ? resolveUnregistered(opts.mode, opts.variant ?? null, opts.settings ?? {}, opts.common ?? {})
    : resolveGameConfig({ modeId: opts.modeId, variantId: opts.variantId ?? null, settings: opts.settings ?? {}, common: opts.common ?? {} });
  if (!resolved.ok) throw new Error(resolved.message);
  const { mode, settings, common } = resolved.value;
  const prepared = prepareQuestions(mode, opts.questions, seed);
  if (prepared.problem) throw new Error(prepared.problem);

  const teams = makeTeams(common.teamCount);
  const players = Array.from({ length: opts.players }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Bot ${i + 1}`,
    teamId: teams.length ? teams[i % teams.length]!.id : null,
    isBot: true,
  }));

  let t = 1_000_000;
  const clock = { now: () => t };
  const errors: SimulateResult['errors'] = [];
  const rt = new GameRuntime({
    mode,
    settings,
    common,
    questions: prepared.questions,
    players,
    teams,
    seed,
    clock,
    strict: true,
    listener: { error: (error, where) => errors.push({ where, error }) },
  });
  const rng = createRng(seed + 7);
  const skill = opts.skill ?? 0.7;
  const maxGameMs = opts.maxGameMs ?? 3 * 60 * 60 * 1000;
  const leaks: string[] = [];
  let actions = 0;
  let rejected = 0;

  const start = rt.start();
  if (!start.ok) return { results: rt.results, gameMs: 0, actions, rejected, errors, leaks, stalled: false };

  const nextBotAt = new Map(players.map((p) => [p.id, t + rt.botDelay(p.id, rng)]));
  let hostNextAt: number | null = null;
  let paused = false;
  let resumeAt: number | null = null;
  let didPause = false;
  let didChurn = false;
  let guard = 0;

  while (rt.status !== 'ended' && guard++ < 200_000) {
    if (rt.gameNow() > maxGameMs) break;
    const timerIn = rt.msUntilNextTimer();
    const candidates: number[] = [...nextBotAt.values()];
    if (timerIn !== null) candidates.push(t + timerIn);
    // A host-paced game waiting on the host: press next after a short pause, like a teacher would.
    if (timerIn === null && !paused && mode.onHostNext && hostNextAt === null) hostNextAt = t + 4000;
    if (hostNextAt !== null) candidates.push(hostNextAt);
    if (resumeAt !== null) candidates.push(resumeAt);
    const nextT = Math.min(...candidates);
    if (!Number.isFinite(nextT)) break;
    t = Math.max(t, nextT);

    if (resumeAt !== null && t >= resumeAt) {
      rt.resume();
      paused = false;
      resumeAt = null;
      for (const p of players) nextBotAt.set(p.id, t + rt.botDelay(p.id, rng));
      continue;
    }
    if (paused) {
      // While paused, bots try to act and must be refused.
      for (const p of players) nextBotAt.set(p.id, t + 60_000);
      continue;
    }
    if (opts.pauseAt !== undefined && !didPause && rt.status === 'running' && rt.gameNow() >= opts.pauseAt) {
      didPause = true;
      rt.pause();
      paused = true;
      resumeAt = t + 30_000;
      const refused = rt.act(players[0]!.id, { type: 'answer' });
      if (refused.ok) errors.push({ where: 'pause', error: new Error('An action was accepted while paused') });
      continue;
    }
    if (hostNextAt !== null && t >= hostNextAt) {
      hostNextAt = null;
      if (rt.msUntilNextTimer() === null) rt.hostNext();
    }
    rt.fireDueTimers();
    for (const p of players) {
      if (rt.status !== 'running') break;
      if ((nextBotAt.get(p.id) ?? Infinity) > t) continue;
      const action = rt.botAction(p.id, skill, rng);
      if (action) {
        actions++;
        const r = rt.act(p.id, action);
        if (!r.ok) {
          rejected++;
          if (r.code === 'internal') errors.push({ where: 'act', error: new Error(r.message) });
        }
      }
      nextBotAt.set(p.id, t + rt.botDelay(p.id, rng));
    }
    if (opts.churn && !didChurn && rt.gameNow() > 20_000 && players.length > 1) {
      didChurn = true;
      rt.setConnected(players[1]!.id, false);
      rt.setConnected(players[1]!.id, true);
      rt.addPlayer({ id: 'late', name: 'Late Bot', teamId: teams[0]?.id ?? null, isBot: true });
      nextBotAt.set('late', t + 1000);
      players.push({ id: 'late', name: 'Late Bot', teamId: teams[0]?.id ?? null, isBot: true });
      if (players.length > 3) {
        rt.removePlayer(players[2]!.id);
        nextBotAt.delete(players[2]!.id);
      }
    }
    for (const p of players) {
      if (!rt.hasPlayer(p.id)) continue;
      const v = rt.view({ kind: 'player', playerId: p.id });
      for (const leak of findAnswerLeaks(v)) leaks.push(`${p.id}: ${leak}`);
    }
    rt.view({ kind: 'host' });
  }

  const stalled = rt.status !== 'ended';
  if (stalled) rt.end('host');
  return { results: rt.results, gameMs: rt.gameNow(), actions, rejected, errors, leaks: [...new Set(leaks)], stalled };
}
