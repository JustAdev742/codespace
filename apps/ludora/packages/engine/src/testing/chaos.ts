import { createRng, type CommonSettings, type Question } from '@ludora/shared';
import { GameRuntime } from '../runtime/runtime.ts';
import { prepareQuestions, resolveGameConfig } from '../registry.ts';
import { makeTeams } from '../teams.ts';
import type { CastRequest } from '../chaos/types.ts';
import '../chaos/cheats/index.ts';

/*
 * A game with bots on a fake clock that a test drives step by step, so it
 * can cast cheats at chosen moments and look at what changed. Bots play the
 * same way for the same seed, so two runs that differ only in one cast can
 * be compared.
 */

export interface ChaosSimOptions {
  modeId: string;
  variantId?: string;
  questions: readonly Question[];
  players: number;
  seed?: number;
  skill?: number;
  settings?: Record<string, unknown>;
  common?: Partial<CommonSettings>;
}

export class ChaosSim {
  readonly rt: GameRuntime;
  readonly ids: string[];
  readonly errors: { where: string; error: unknown }[] = [];
  readonly feed: string[] = [];
  t = 1_000_000;
  private readonly rng;
  private readonly skill: number;
  private readonly nextBotAt = new Map<string, number>();
  private hostNextAt: number | null = null;
  /** Players whose bots stop acting (to keep a target still in a test). */
  readonly idle = new Set<string>();

  constructor(opts: ChaosSimOptions) {
    const seed = opts.seed ?? 4242;
    const resolved = resolveGameConfig({ modeId: opts.modeId, variantId: opts.variantId ?? null, settings: opts.settings ?? {}, common: opts.common ?? {} });
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
    this.ids = players.map((p) => p.id);
    this.rt = new GameRuntime({
      mode,
      settings,
      common,
      questions: prepared.questions,
      players,
      teams,
      seed,
      clock: { now: () => this.t },
      strict: true,
      chaos: true,
      listener: {
        error: (error, where) => this.errors.push({ where, error }),
        feed: (item) => this.feed.push(item.text),
      },
    });
    this.rng = createRng(seed + 7);
    this.skill = opts.skill ?? 0.75;
    const r = this.rt.start();
    if (!r.ok) throw new Error(r.message);
    for (const id of this.ids) this.nextBotAt.set(id, this.t + this.rt.botDelay(id, this.rng));
  }

  get now() {
    return this.rt.gameNow();
  }

  /** Play on for `ms` of game time: timers fire, bots act, the host presses next when a game waits on it. */
  run(ms: number) {
    const until = this.t + ms;
    let guard = 0;
    while (this.rt.status === 'running' && this.t < until && guard++ < 100_000) {
      const timerIn = this.rt.msUntilNextTimer();
      const candidates = [...this.nextBotAt.entries()].filter(([id]) => this.rt.hasPlayer(id)).map(([, at]) => at);
      if (timerIn !== null) candidates.push(this.t + timerIn);
      if (timerIn === null && this.rt.mode.onHostNext && this.hostNextAt === null) this.hostNextAt = this.t + 3000;
      if (this.hostNextAt !== null) candidates.push(this.hostNextAt);
      const next = Math.min(until, ...candidates);
      this.t = Math.max(this.t, next);
      if (this.hostNextAt !== null && this.t >= this.hostNextAt) {
        this.hostNextAt = null;
        if (this.rt.msUntilNextTimer() === null) this.rt.hostNext();
      }
      this.rt.fireDueTimers();
      for (const id of this.ids) {
        if (this.rt.status !== 'running' || !this.rt.hasPlayer(id)) continue;
        if ((this.nextBotAt.get(id) ?? Infinity) > this.t) continue;
        if (!this.idle.has(id)) {
          const action = this.rt.botAction(id, this.skill, this.rng);
          if (action) {
            const r = this.rt.act(id, action);
            if (!r.ok && r.code === 'internal') this.errors.push({ where: 'act', error: new Error(r.message) });
          }
        }
        this.nextBotAt.set(id, this.t + this.rt.botDelay(id, this.rng));
      }
    }
    if (this.t < until) this.t = until;
  }

  cast(caster: string, ...requests: CastRequest[]) {
    return this.rt.cast(caster, requests);
  }

  state(): any {
    return this.rt.debugState();
  }

  chaos() {
    return this.rt.debugChaos()!;
  }

  view(playerId: string, unlocked = true) {
    return this.rt.chaosView({ kind: 'player', playerId }, unlocked)!;
  }
}
