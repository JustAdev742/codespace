import { createRng, type CommonSettings, type PracticeLevel, type Question } from '@ludora/shared';
import { GameRuntime, type EngineResults } from '../runtime/runtime.ts';
import { prepareQuestions, resolveGameConfig } from '../registry.ts';
import { makeTeams } from '../teams.ts';
import { PracticeMind } from '../bots/mind.ts';
import { practiceRoster, type BotProfile } from '../bots/personas.ts';
import { findAnswerLeaks } from './harness.ts';

/*
 * A whole game played by practice bots with minds, on a fake clock, the way the
 * server's room drives them. Separate from simulateGame (whose bots must keep
 * playing exactly as they always have), for the tests of the minds themselves.
 */

export interface MindedOptions {
  modeId: string;
  variantId?: string;
  questions: readonly Question[];
  /** One level for every bot, or a profile each. */
  level?: PracticeLevel;
  profiles?: BotProfile[];
  players?: number;
  seed?: number;
  settings?: Record<string, unknown>;
  common?: Partial<CommonSettings>;
  maxGameMs?: number;
}

export interface MindedResult {
  results: EngineResults | null;
  errors: { where: string; error: unknown }[];
  leaks: string[];
  stalled: boolean;
  gameMs: number;
  actions: number;
  rejected: number;
  profiles: BotProfile[];
  minds: PracticeMind[];
  /** Game time of each bot action, by player. */
  actedAt: Map<string, number[]>;
}

export function simulateMinded(opts: MindedOptions): MindedResult {
  const seed = opts.seed ?? 4321;
  const resolved = resolveGameConfig({ modeId: opts.modeId, variantId: opts.variantId ?? null, settings: opts.settings ?? {}, common: opts.common ?? {} });
  if (!resolved.ok) throw new Error(resolved.message);
  const { mode, settings, common } = resolved.value;
  const prepared = prepareQuestions(mode, opts.questions, seed);
  if (prepared.problem) throw new Error(prepared.problem);
  const profiles = opts.profiles ?? practiceRoster(opts.level ?? 'mixed', opts.players ?? 4, seed);
  const teams = makeTeams(common.teamCount);
  const players = profiles.map((_, i) => ({ id: `b${i + 1}`, name: `Bot ${i + 1}`, teamId: teams.length ? teams[i % teams.length]!.id : null, isBot: true }));
  let t = 1_000_000;
  const errors: MindedResult['errors'] = [];
  const rt = new GameRuntime({
    mode,
    settings,
    common,
    questions: prepared.questions,
    players,
    teams,
    seed,
    clock: { now: () => t },
    strict: true,
    listener: { error: (error, where) => errors.push({ where, error }) },
  });
  const minds = profiles.map((p) => new PracticeMind(p));
  const rng = createRng(seed + 11);
  const maxGameMs = opts.maxGameMs ?? 2 * 60 * 60 * 1000;
  const leaks: string[] = [];
  const actedAt = new Map<string, number[]>(players.map((p) => [p.id, []]));
  let actions = 0;
  let rejected = 0;
  const start = rt.start();
  if (!start.ok) return { results: rt.results, errors, leaks, stalled: false, gameMs: 0, actions, rejected, profiles, minds, actedAt };
  const next = new Map(players.map((p, i) => [p.id, t + rt.botDelay(p.id, rng, minds[i])]));
  let hostNextAt: number | null = null;
  let guard = 0;
  while (rt.status !== 'ended' && guard++ < 400_000) {
    if (rt.gameNow() > maxGameMs) break;
    const timerIn = rt.msUntilNextTimer();
    const candidates = [...next.values()];
    if (timerIn !== null) candidates.push(t + timerIn);
    if (timerIn === null && mode.onHostNext && hostNextAt === null) hostNextAt = t + 4000;
    if (hostNextAt !== null) candidates.push(hostNextAt);
    const nextT = Math.min(...candidates);
    if (!Number.isFinite(nextT)) break;
    t = Math.max(t, nextT);
    if (hostNextAt !== null && t >= hostNextAt) {
      hostNextAt = null;
      if (rt.msUntilNextTimer() === null) rt.hostNext();
    }
    rt.fireDueTimers();
    players.forEach((p, i) => {
      if (rt.status !== 'running' || (next.get(p.id) ?? Infinity) > t) return;
      const action = rt.botAction(p.id, 0.5, rng, minds[i]);
      if (action) {
        actions++;
        actedAt.get(p.id)!.push(rt.gameNow());
        const r = rt.act(p.id, action);
        if (!r.ok) {
          rejected++;
          if (r.code === 'internal') errors.push({ where: 'act', error: new Error(r.message) });
        }
      }
      next.set(p.id, t + rt.botDelay(p.id, rng, minds[i]));
    });
    if (guard % 25 === 0) for (const p of players) for (const leak of findAnswerLeaks(rt.view({ kind: 'player', playerId: p.id }))) leaks.push(`${p.id}: ${leak}`);
  }
  const stalled = rt.status !== 'ended';
  if (stalled) rt.end('host');
  return { results: rt.results, errors, leaks: [...new Set(leaks)], stalled, gameMs: rt.gameNow(), actions, rejected, profiles, minds, actedAt };
}
