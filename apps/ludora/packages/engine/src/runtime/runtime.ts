import {
  createRng,
  type CommonSettings,
  type FeedItem,
  type Question,
  type Rng,
  type SettingValues,
} from '@ludora/shared';
import { gradeAnswer, revealAnswer, correctAnswerFor, wrongAnswerFor } from '../questions/grade.ts';
import { answerFromTokens, answerToTokens, presentationOrder, revealToTokens, toPublicQuestion } from '../questions/present.ts';
import type {
  ActionResult,
  AnswerRecord,
  BotContext,
  EnginePlayer,
  EngineTeam,
  GameMode,
  ModeContext,
  PlayerId,
  PresentedQuestion,
  QuestionApi,
  Viewer,
} from '../sdk/types.ts';
import { ChaosEngine, emptyChaosState } from '../chaos/engine.ts';
import { chaosAdapterFor } from '../chaos/adapters/index.ts';
import { getCheat } from '../chaos/registry.ts';
import '../chaos/cheats/index.ts';
import type { CastOutcome, CastRequest, ChaosState, ChaosView } from '../chaos/types.ts';

export interface RuntimeClock {
  /** Wall-clock milliseconds. */
  now(): number;
}

export interface RuntimeListener {
  changed?(): void;
  feed?(item: FeedItem): void;
  ended?(results: EngineResults): void;
  error?(err: unknown, where: string): void;
  timersChanged?(): void;
}

export interface RuntimePlayerInit {
  id: PlayerId;
  name: string;
  teamId: string | null;
  isBot: boolean;
  connected?: boolean;
}

export interface RuntimeOptions {
  mode: GameMode;
  settings: SettingValues;
  common: CommonSettings;
  questions: readonly Question[];
  players: readonly RuntimePlayerInit[];
  teams: readonly EngineTeam[];
  seed: number;
  clock: RuntimeClock;
  listener?: RuntimeListener;
  /** Mode errors tolerated before the game is stopped and saved. */
  maxErrors?: number;
  /**
   * Deep-freeze committed state so any mutation outside a transaction (for
   * example inside view()) throws. Used by tests; too slow for production.
   */
  strict?: boolean;
  /** Let players who unlocked the secret chaos menu cast cheats in this game. */
  chaos?: boolean;
}

export interface PlayerStats {
  answered: number;
  correct: number;
  partialSum: number;
  responseMsSum: number;
  streak: number;
  bestStreak: number;
}

export interface EngineStanding {
  playerId: PlayerId;
  name: string;
  rank: number;
  score: number;
  label: string;
  teamId: string | null;
  isBot: boolean;
  left: boolean;
  stats: PlayerStats;
}

export interface EngineResults {
  standings: EngineStanding[];
  teamStandings: { teamId: string; name: string; rank: number; score: number; label: string }[];
  outcome: 'competitive' | 'coop-win' | 'coop-loss';
  summary: string;
  endedBy: 'mode' | 'host' | 'error';
  durationMs: number;
  answers: AnswerRecord[];
  /** Set when anyone cast a chaos cheat in this game. */
  chaos: { casts: number; casters: PlayerId[] } | null;
}

export type DispatchResult = { ok: true } | { ok: false; code: 'invalid_state' | 'rejected' | 'internal'; message: string };

interface Effects {
  timers: Map<string, number>;
  instances: Map<string, PresentedQuestion>;
  feed: { text: string; tone?: FeedItem['tone']; to?: string[] }[];
  answers: AnswerRecord[];
  end: { summary?: string } | null;
}

const MAX_TIMER_FIRES_PER_TICK = 500;
/** The pseudo-timer id under which the chaos layer's expiries and ticks are scheduled. */
const CHAOS_TIMER = '\u0000chaos';

type ChaosDraft = ChaosState & { rng: number };
type TxFn = (draft: any, ctx: ModeContext, chaos: ChaosDraft | null) => ActionResult;

function readOnly(what: string): never {
  throw new Error(`${what}() cannot be called while drawing a view or results`);
}

export function emptyStats(): PlayerStats {
  return { answered: 0, correct: 0, partialSum: 0, responseMsSum: 0, streak: 0, bestStreak: 0 };
}

/**
 * Runs one game of one mode. Pure and deterministic given its inputs: no
 * timers, sockets or database. The server drives it with real time; tests
 * drive it with fake time.
 */
export class GameRuntime {
  readonly mode: GameMode;
  readonly settings: SettingValues;
  readonly common: CommonSettings;
  status: 'idle' | 'running' | 'paused' | 'ended' = 'idle';
  version = 0;
  results: EngineResults | null = null;
  errorCount = 0;

  private state: unknown = undefined;
  private timers = new Map<string, number>();
  private instances = new Map<string, PresentedQuestion>();
  private iidCounter = 0;
  private readonly players = new Map<PlayerId, EnginePlayer>();
  private readonly departed = new Map<PlayerId, EnginePlayer>();
  private readonly stats = new Map<PlayerId, PlayerStats>();
  private readonly answers: AnswerRecord[] = [];
  private readonly teams: readonly EngineTeam[];
  private readonly questionMap: Map<string, Question>;
  private readonly questionIds: string[];
  private rng: Rng;
  private readonly clock: RuntimeClock;
  private readonly listener: RuntimeListener;
  private readonly maxErrors: number;
  private readonly strict: boolean;
  private wallStart = 0;
  private pausedAt: number | null = null;
  private pausedTotal = 0;
  private feedSeq = 0;
  private chaosState: ChaosDraft | null = null;
  private readonly chaos: ChaosEngine | null = null;

  constructor(opts: RuntimeOptions) {
    this.mode = opts.mode;
    this.settings = opts.settings;
    this.common = opts.common;
    this.teams = opts.teams;
    this.clock = opts.clock;
    this.listener = opts.listener ?? {};
    this.maxErrors = opts.maxErrors ?? 3;
    this.strict = opts.strict ?? false;
    this.rng = createRng(opts.seed);
    this.questionMap = new Map(opts.questions.map((q) => [q.id, q]));
    this.questionIds = opts.questions.map((q) => q.id);
    if (this.questionIds.length === 0) throw new Error('A game needs at least one question');
    for (const p of opts.players) {
      this.players.set(p.id, { ...p, connected: p.connected ?? true, joinedAt: 0 });
      this.stats.set(p.id, emptyStats());
    }
    const adapter = opts.chaos ? chaosAdapterFor(opts.mode.meta.id) : null;
    if (adapter) {
      this.chaos = new ChaosEngine(adapter, { players: () => [...this.players.values()], teams: () => this.teams, name: (id) => this.nameOf(id) }, this.teams, this.settings);
      this.chaosState = emptyChaosState(opts.seed ^ 0x5eed);
    }
  }

  /* ------------------------------ lifecycle ------------------------------ */

  start(): DispatchResult {
    if (this.status !== 'idle') return { ok: false, code: 'invalid_state', message: 'This game has already started.' };
    this.wallStart = this.clock.now();
    this.status = 'running';
    return this.transact('init', (_draft, ctx) => {
      this.state = this.mode.init(ctx);
    }, true);
  }

  /** Game time in ms since start. Frozen while paused. */
  gameNow(): number {
    if (this.status === 'idle') return 0;
    const wall = this.pausedAt ?? this.clock.now();
    return Math.max(0, wall - this.wallStart - this.pausedTotal);
  }

  pause(): boolean {
    if (this.status !== 'running') return false;
    this.pausedAt = this.clock.now();
    this.status = 'paused';
    this.bump();
    this.listener.timersChanged?.();
    return true;
  }

  resume(): boolean {
    if (this.status !== 'paused' || this.pausedAt === null) return false;
    this.pausedTotal += this.clock.now() - this.pausedAt;
    this.pausedAt = null;
    this.status = 'running';
    this.bump();
    this.listener.timersChanged?.();
    return true;
  }

  /** End the game now (host ended it, or the room is closing). Results are still produced. */
  end(by: 'host' | 'error' = 'host', summary?: string): EngineResults | null {
    if (this.status === 'idle') return null;
    this.finish(by, summary);
    return this.results;
  }

  /* ------------------------------- players ------------------------------- */

  addPlayer(p: RuntimePlayerInit): DispatchResult {
    if (this.players.has(p.id)) return { ok: true };
    const player: EnginePlayer = { ...p, connected: p.connected ?? true, joinedAt: this.gameNow() };
    this.departed.delete(p.id);
    this.players.set(p.id, player);
    if (!this.stats.has(p.id)) this.stats.set(p.id, emptyStats());
    if (this.status === 'idle' || this.status === 'ended' || !this.mode.onPlayerJoin) {
      this.bump();
      return { ok: true };
    }
    return this.transact('join', (draft, ctx) => this.mode.onPlayerJoin!(draft, player, ctx));
  }

  removePlayer(id: PlayerId): DispatchResult {
    const p = this.players.get(id);
    if (!p) return { ok: true };
    this.players.delete(id);
    this.departed.set(id, p);
    if (this.status === 'running' || this.status === 'paused') {
      if (this.chaos && this.chaosState && this.chaos.touchesPlayer(this.chaosState, id)) {
        this.transact('chaos:left', (draft, ctx, cd) => this.chaos!.dropPlayer(draft, ctx, cd!, id));
      }
    }
    if (this.status === 'idle' || this.status === 'ended' || !this.mode.onPlayerLeave) {
      this.bump();
      return { ok: true };
    }
    return this.transact('leave', (draft, ctx) => this.mode.onPlayerLeave!(draft, p, ctx));
  }

  setConnected(id: PlayerId, connected: boolean): void {
    const p = this.players.get(id);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    this.bump();
  }

  hasPlayer(id: PlayerId): boolean {
    return this.players.has(id);
  }

  playerList(): EnginePlayer[] {
    return [...this.players.values()];
  }

  /* ------------------------------- actions ------------------------------- */

  act(playerId: PlayerId, raw: unknown): DispatchResult {
    if (this.status !== 'running') {
      return { ok: false, code: 'invalid_state', message: this.status === 'paused' ? 'The game is paused.' : 'The game is not running.' };
    }
    if (!this.players.has(playerId)) return { ok: false, code: 'rejected', message: 'You are not in this game.' };
    const parsed = this.mode.action.safeParse(raw);
    if (!parsed.success) return { ok: false, code: 'rejected', message: 'That move is not allowed here.' };
    if (this.chaos && this.chaosState?.effects.length) {
      const blocked = this.chaosGate(playerId, parsed.data);
      if (blocked) return { ok: false, code: 'rejected', message: blocked };
    }
    return this.transact('action', (draft, ctx) => this.mode.onAction(draft, playerId, parsed.data, ctx));
  }

  /* -------------------------------- chaos -------------------------------- */

  /** Whether this game runs the chaos layer at all. */
  get chaosEnabled(): boolean {
    return this.chaos !== null;
  }

  /** Cast chaos cheats (one, or several as a combination). All or nothing. */
  cast(playerId: PlayerId, requests: readonly CastRequest[]): CastOutcome {
    if (!this.chaos || !this.chaosState) return { ok: false, code: 'invalid_state', message: 'Chaos is switched off in this game.' };
    if (this.status !== 'running') {
      return { ok: false, code: 'invalid_state', message: this.status === 'paused' ? 'The game is paused.' : 'Chaos only works while a game is running.' };
    }
    let outcome: CastOutcome = { ok: false, code: 'internal', message: 'Something went wrong with that cheat.' };
    const r = this.transact('chaos:cast', (draft, ctx, cd) => {
      outcome = this.chaos!.cast(draft, ctx, cd!, playerId, requests);
      if (!outcome.ok) return { error: outcome.message };
    });
    if (!r.ok && outcome.ok) return { ok: false, code: r.code, message: r.message };
    if (!r.ok && r.code === 'internal') return { ok: false, code: 'internal', message: r.message };
    return outcome;
  }

  undoCast(playerId: PlayerId, castId: string): DispatchResult {
    return this.chaosCommand((draft, ctx, cd) => {
      const r = this.chaos!.undo(draft, ctx, cd, playerId, castId);
      if (!r.ok) return { error: r.message };
    });
  }

  stopEffect(playerId: PlayerId, eid: string): DispatchResult {
    return this.chaosCommand((draft, ctx, cd) => {
      const r = this.chaos!.stop(draft, ctx, cd, playerId, eid);
      if (!r.ok) return { error: r.message };
    });
  }

  /** The host ends all chaos for the rest of this game. */
  calmChaos(): DispatchResult {
    if (this.chaosState?.calmed) return { ok: true };
    return this.chaosCommand((draft, ctx, cd) => this.chaos!.calm(draft, ctx, cd));
  }

  chaosView(viewer: Viewer, unlocked: boolean): ChaosView | null {
    if (!this.chaos || !this.chaosState || this.status === 'idle') return null;
    return this.chaos.view(this.chaosState, viewer, this.gameNow(), unlocked);
  }

  /** The answer to a presented question in its tokens, for tests only. */
  debugReveal(iid: string): unknown {
    const inst = this.instances.get(iid);
    if (!inst) return null;
    const q = this.questionMap.get(inst.qid)!;
    return revealToTokens(q, inst.order, revealAnswer(q));
  }

  /** Chaos state, for tests and debugging tools only. */
  debugChaos(): ChaosState | null {
    return this.chaosState;
  }

  private chaosCommand(fn: (draft: any, ctx: ModeContext, cd: ChaosDraft) => ActionResult): DispatchResult {
    if (!this.chaos || !this.chaosState) return { ok: false, code: 'invalid_state', message: 'Chaos is switched off in this game.' };
    if (this.status !== 'running' && this.status !== 'paused') return { ok: false, code: 'invalid_state', message: 'The game is not running.' };
    return this.transact('chaos:command', (draft, ctx, cd) => fn(draft, ctx, cd!));
  }

  /**
   * Let active effects refuse an action before the mode sees it. Gates read
   * the committed state; any bookkeeping they do (charges used) is kept even
   * though the action itself is refused.
   */
  private chaosGate(playerId: PlayerId, action: unknown): string | null {
    const cd = structuredClone(this.chaosState!);
    const fx: Effects = { timers: new Map(this.timers), instances: new Map(), feed: [], answers: [], end: null };
    const ctx = this.makeContext(fx);
    let blocked: string | null;
    try {
      blocked = this.chaos!.gate(this.state, ctx, cd, playerId, action);
    } catch (err) {
      this.listener.error?.(err, 'chaos:gate');
      return null;
    }
    this.chaosState = cd;
    if (blocked) {
      for (const f of fx.feed) this.emitFeed(f);
      this.bump();
    }
    return blocked;
  }

  hostNext(): DispatchResult {
    if (this.status !== 'running') return { ok: false, code: 'invalid_state', message: 'The game is not running.' };
    if (!this.mode.onHostNext) return { ok: false, code: 'rejected', message: 'This mode moves on by itself.' };
    return this.transact('host-next', (draft, ctx) => this.mode.onHostNext!(draft, ctx));
  }

  /* -------------------------------- timers ------------------------------- */

  /** Fire every timer that is due. Returns how many fired. */
  fireDueTimers(): number {
    let fired = 0;
    while (this.status === 'running' && fired < MAX_TIMER_FIRES_PER_TICK) {
      const due = this.earliestTimer();
      if (!due || due[1] > this.gameNow()) break;
      const [id] = due;
      fired++;
      if (id === CHAOS_TIMER) {
        const r = this.transact('chaos:tick', (draft, ctx, cd) => this.chaos!.fireDue(draft, ctx, cd!));
        if (!r.ok && this.chaosState) {
          this.chaos!.dropDue(this.chaosState, this.gameNow());
          this.bump();
        }
        continue;
      }
      this.timers.delete(id);
      if (this.mode.onTimer) this.transact(`timer:${id}`, (draft, ctx) => this.mode.onTimer!(draft, id, ctx));
    }
    if (fired >= MAX_TIMER_FIRES_PER_TICK) this.fail(new Error('Timer loop: too many timers fired at once'), 'timers');
    return fired;
  }

  /** Game time of the next timer, or null. */
  nextTimerAt(): number | null {
    return this.earliestTimer()?.[1] ?? null;
  }

  /** Wall-clock ms until the next timer fires, or null when nothing is scheduled or the game is paused. */
  msUntilNextTimer(): number | null {
    if (this.status !== 'running') return null;
    const at = this.nextTimerAt();
    return at === null ? null : Math.max(0, at - this.gameNow());
  }

  private earliestTimer(): [string, number] | null {
    let best: [string, number] | null = null;
    for (const entry of this.timers) if (!best || entry[1] < best[1]) best = entry;
    const chaosAt = this.chaos && this.chaosState ? this.chaos.nextDue(this.chaosState) : null;
    if (chaosAt !== null && (!best || chaosAt < best[1])) best = [CHAOS_TIMER, chaosAt];
    return best;
  }

  /* -------------------------------- views -------------------------------- */

  view(viewer: Viewer): unknown {
    if (this.state === undefined) return null;
    try {
      return this.mode.view(this.state, viewer, this.makeContext(null));
    } catch (err) {
      this.listener.error?.(err, 'view');
      return { error: 'This screen could not be drawn.' };
    }
  }

  /** The action a practice bot would take now, or null. */
  botAction(playerId: PlayerId, skill: number, rng: Rng): unknown {
    if (this.status !== 'running' || !this.mode.bot || !this.players.has(playerId)) return null;
    const view = this.view({ kind: 'player', playerId });
    if (!view || (typeof view === 'object' && 'error' in view)) return null;
    const ctx: BotContext = {
      playerId,
      rng,
      skill,
      now: this.gameNow(),
      settings: this.settings,
      answer: (iid) => {
        const inst = this.instances.get(iid);
        if (!inst) return { type: 'short', text: '?' };
        const q = this.questionMap.get(inst.qid)!;
        const raw = rng.next() < skill ? correctAnswerFor(q) : wrongAnswerFor(q, () => rng.next());
        return answerToTokens(q, inst.order, raw);
      },
    };
    try {
      return this.mode.bot(view, ctx);
    } catch (err) {
      this.listener.error?.(err, 'bot');
      return null;
    }
  }

  botDelay(playerId: PlayerId, rng: Rng): number {
    if (!this.mode.botDelay) return 1200 + rng.int(0, 1800);
    try {
      return Math.max(50, this.mode.botDelay(this.view({ kind: 'player', playerId }), rng));
    } catch {
      return 1500;
    }
  }

  statsFor(id: PlayerId): PlayerStats {
    return this.stats.get(id) ?? emptyStats();
  }

  answerLog(): readonly AnswerRecord[] {
    return this.answers;
  }

  /** Internal state, for tests and debugging tools only. */
  debugState(): unknown {
    return this.state;
  }

  /* ----------------------------- transactions ---------------------------- */

  /**
   * Run a mode hook against a copy of the state. Commit if it returns
   * normally; discard everything (state, timers, feed, randomness) if it
   * rejects or throws. A thrown error counts towards stopping the game.
   */
  private transact(where: string, fn: TxFn, isInit = false): DispatchResult {
    const draft = isInit ? undefined : structuredClone(this.state);
    const rngState = this.rng.state();
    const fx: Effects = { timers: new Map(this.timers), instances: new Map(), feed: [], answers: [], end: null };
    const ctx = this.makeContext(fx);
    const cd = this.chaosState && !isInit ? structuredClone(this.chaosState) : null;
    // Lasting cheats bend what the mode itself does (points, coins), never what other cheats do.
    const before = cd && this.chaos && cd.effects.length && !where.startsWith('chaos') ? this.chaos.snapshot(draft, ctx, cd) : null;
    let outcome: ActionResult;
    try {
      outcome = fn(draft, ctx, cd);
    } catch (err) {
      this.rng = createRng(rngState);
      if (isInit) this.state = undefined;
      // A broken cheat is refused; it never counts towards stopping the game.
      if (where.startsWith('chaos')) this.listener.error?.(err, where);
      else this.fail(err, where);
      return { ok: false, code: 'internal', message: 'Something went wrong in this game.' };
    }
    let result = draft;
    if (before && !(outcome && typeof outcome === 'object' && 'error' in outcome)) {
      const safe = structuredClone(draft);
      try {
        this.chaos!.afterTransact(draft, ctx, cd!, before);
      } catch (err) {
        // The mode's own move stands; the effect that failed to bend it is removed.
        this.listener.error?.(err, 'chaos:delta');
        result = safe;
        cd!.effects = cd!.effects.filter((e) => !Object.keys(getCheat(e.cheatId)?.hooks?.delta ?? {}).length);
      }
    }
    if (outcome && typeof outcome === 'object' && 'error' in outcome) {
      this.rng = createRng(rngState);
      return { ok: false, code: 'rejected', message: outcome.error };
    }
    if (!isInit) this.state = result;
    if (cd) this.chaosState = cd;
    if (this.strict) deepFreeze(this.state);
    this.timers = fx.timers;
    for (const [iid, inst] of fx.instances) this.instances.set(iid, inst);
    for (const a of fx.answers) this.applyAnswer(a);
    this.bump();
    for (const f of fx.feed) this.emitFeed(f);
    if (fx.end) this.finish('mode', fx.end.summary);
    else this.listener.timersChanged?.();
    return { ok: true };
  }

  private emitFeed(f: Effects['feed'][number]) {
    const item: FeedItem = { id: ++this.feedSeq, at: this.gameNow(), text: f.text, ...(f.tone ? { tone: f.tone } : {}), ...(f.to ? { to: f.to } : {}) };
    this.listener.feed?.(item);
  }

  private applyAnswer(a: AnswerRecord) {
    this.answers.push(a);
    const s = this.stats.get(a.playerId) ?? emptyStats();
    s.answered++;
    s.partialSum += a.partial;
    s.responseMsSum += Math.max(0, a.responseMs);
    if (a.correct) {
      s.correct++;
      s.streak++;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
    } else s.streak = 0;
    this.stats.set(a.playerId, s);
  }

  private fail(err: unknown, where: string) {
    this.errorCount++;
    this.listener.error?.(err, where);
    if (this.state === undefined) {
      // The mode could not even set up. Nothing to save; mark ended.
      this.status = 'ended';
      this.results = this.fallbackResults('error', 'This game could not start.');
      this.bump();
      this.listener.ended?.(this.results);
      return;
    }
    if (this.errorCount >= this.maxErrors) this.finish('error', 'The game stopped early because of a problem. Scores so far were kept.');
  }

  private finish(endedBy: EngineResults['endedBy'], summary?: string) {
    if (this.status === 'ended' || this.status === 'idle') return;
    const durationMs = this.gameNow();
    this.status = 'ended';
    this.timers.clear();
    let results: EngineResults;
    try {
      const r = this.mode.results(this.state, this.makeContext(null));
      results = this.buildResults(r, endedBy, summary ?? r.summary, durationMs);
    } catch (err) {
      this.listener.error?.(err, 'results');
      results = this.fallbackResults(endedBy, summary ?? 'Final scores are based on correct answers.');
    }
    this.results = results;
    this.bump();
    this.listener.ended?.(results);
  }

  private nameOf(id: PlayerId) {
    return (this.players.get(id) ?? this.departed.get(id))?.name ?? 'Player';
  }

  private buildResults(
    r: ReturnType<GameMode['results']>,
    endedBy: EngineResults['endedBy'],
    summary: string,
    durationMs: number,
  ): EngineResults {
    const known = r.standings.filter((s) => this.players.has(s.playerId) || this.departed.has(s.playerId));
    const listed = new Set(known.map((s) => s.playerId));
    // Players the mode forgot (including anyone who left) still get a line, so nobody vanishes from the results.
    for (const p of this.players.values()) if (!listed.has(p.id)) known.push({ playerId: p.id, score: 0, label: '0' });
    for (const p of this.departed.values()) if (!listed.has(p.id)) known.push({ playerId: p.id, score: 0, label: 'Left the game' });
    const ranked = rankBy(known, (s) => s.score);
    const standings: EngineStanding[] = ranked.map(({ item, rank }) => {
      const p = this.players.get(item.playerId) ?? this.departed.get(item.playerId)!;
      return {
        playerId: item.playerId,
        name: p.name,
        rank,
        score: item.score,
        label: item.label,
        teamId: p.teamId,
        isBot: p.isBot,
        left: !this.players.has(item.playerId),
        stats: this.statsFor(item.playerId),
      };
    });
    let teamRaw = r.teamStandings;
    if (!teamRaw && this.teams.length) {
      teamRaw = this.teams.map((t) => {
        const score = standings.filter((s) => s.teamId === t.id).reduce((n, s) => n + s.score, 0);
        return { teamId: t.id, score, label: score.toLocaleString('en-US') };
      });
    }
    const teamStandings = rankBy(teamRaw ?? [], (t) => t.score).map(({ item, rank }) => ({
      teamId: item.teamId,
      name: this.teams.find((t) => t.id === item.teamId)?.name ?? item.teamId,
      rank,
      score: item.score,
      label: item.label,
    }));
    const chaos = this.chaosState && this.chaosState.totalCasts > 0 ? { casts: this.chaosState.totalCasts, casters: this.chaosState.usedBy.slice() } : null;
    return { standings, teamStandings, outcome: r.outcome ?? 'competitive', summary, endedBy, durationMs, answers: this.answers.slice(), chaos };
  }

  private fallbackResults(endedBy: EngineResults['endedBy'], summary: string): EngineResults {
    const all = [...this.players.values(), ...this.departed.values()];
    const scored = all.map((p) => ({ playerId: p.id, score: this.statsFor(p.id).correct, label: `${this.statsFor(p.id).correct} correct` }));
    return this.buildResults({ standings: scored, summary }, endedBy, summary, this.gameNow());
  }

  private bump() {
    this.version++;
    this.listener.changed?.();
  }

  /* -------------------------------- context ------------------------------ */

  private makeContext(fx: Effects | null): ModeContext {
    const timers = () => fx?.timers ?? this.timers;
    return {
      settings: this.settings,
      common: this.common,
      rng: this.rng,
      now: () => this.gameNow(),
      players: () => [...this.players.values()],
      player: (id) => this.players.get(id),
      everyone: () => [
        ...[...this.players.values()].map((p) => ({ ...p, left: false })),
        ...[...this.departed.values()].map((p) => ({ ...p, left: true })),
      ],
      teams: () => this.teams,
      questions: this.questionApi(fx),
      setTimer: (id, at) => (fx ? void fx.timers.set(id, Math.max(at, this.gameNow())) : readOnly('setTimer')),
      clearTimer: (id) => (fx ? void fx.timers.delete(id) : readOnly('clearTimer')),
      hasTimer: (id) => timers().has(id),
      feed: (text, opts) => (fx ? void fx.feed.push({ text, ...opts }) : readOnly('feed')),
      recordAnswer: (rec) => (fx ? void fx.answers.push({ ...rec, at: this.gameNow() }) : readOnly('recordAnswer')),
      endGame: (summary) => (fx ? void (fx.end = summary === undefined ? {} : { summary }) : readOnly('endGame')),
    };
  }

  private questionApi(fx: Effects | null): QuestionApi {
    const instance = (iid: string): PresentedQuestion => {
      const inst = fx?.instances.get(iid) ?? this.instances.get(iid);
      if (!inst) throw new Error(`Unknown question instance ${iid}`);
      return inst;
    };
    const question = (qid: string): Question => {
      const q = this.questionMap.get(qid);
      if (!q) throw new Error(`Unknown question ${qid}`);
      return q;
    };
    return {
      ids: () => this.questionIds,
      get: question,
      count: () => this.questionIds.length,
      present: (qid, opts) => {
        if (!fx) return readOnly('present');
        const q = question(qid);
        const iid = `q${++this.iidCounter}`;
        const order = presentationOrder(q, this.rng, opts?.shuffle ?? this.common.shuffleChoices);
        fx.instances.set(iid, { iid, qid, order, shownAt: this.gameNow() });
        return iid;
      },
      instance,
      view: (iid, extra) => {
        const inst = instance(iid);
        return {
          iid,
          q: toPublicQuestion(question(inst.qid), inst.order),
          shownAt: inst.shownAt,
          deadline: extra?.deadline ?? null,
          ...(extra?.index !== undefined ? { index: extra.index } : {}),
          ...(extra?.total !== undefined ? { total: extra.total } : {}),
        };
      },
      grade: (iid, answer) => {
        const inst = instance(iid);
        const q = question(inst.qid);
        return gradeAnswer(q, answerFromTokens(q, inst.order, answer));
      },
      reveal: (iid) => {
        const inst = instance(iid);
        const q = question(inst.qid);
        return revealToTokens(q, inst.order, revealAnswer(q));
      },
      explanation: (iid) => question(instance(iid).qid).explanation,
      timeLimitMs: (iid) => (question(instance(iid).qid).timeLimitSec ?? this.common.questionTimeSec) * 1000,
    };
  }
}

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const v of Object.values(value)) deepFreeze(v);
}

/** Sort by score, highest first; equal scores share a rank (1, 1, 3). */
export function rankBy<T>(items: readonly T[], score: (t: T) => number): { item: T; rank: number }[] {
  const sorted = items.slice().sort((a, b) => score(b) - score(a));
  let lastScore: number | null = null;
  let lastRank = 0;
  return sorted.map((item, i) => {
    const s = score(item);
    if (lastScore === null || s !== lastScore) {
      lastRank = i + 1;
      lastScore = s;
    }
    return { item, rank: lastRank };
  });
}
