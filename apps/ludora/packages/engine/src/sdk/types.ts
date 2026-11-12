import type { z } from 'zod';
import type {
  Answer,
  AnswerReveal,
  CommonSettings,
  FeedItem,
  ModeMeta,
  PublicQuestion,
  Question,
  Rng,
  SettingField,
  SettingValues,
  VariantMeta,
} from '@ludora/shared';
import type { GradeResult } from '../questions/grade.ts';

/*
 * The game-mode SDK. A mode is a set of pure functions over a plain-data
 * state object. The runtime owns time, randomness, players, questions and
 * persistence; a mode only decides what happens.
 *
 * Rules a mode must follow:
 *  - State is plain data (no classes, functions, Maps or Dates) so it can be
 *    cloned, snapshotted and rolled back.
 *  - All time comes from ctx.now() (game time, which stops while paused).
 *  - All randomness comes from ctx.rng (seeded, so games replay exactly).
 *  - view() must not change state. It is called once per viewer per update.
 *  - Never put an unrevealed answer in a player's view.
 */

export type PlayerId = string;
export type TeamId = string;

export interface EnginePlayer {
  id: PlayerId;
  name: string;
  teamId: TeamId | null;
  isBot: boolean;
  connected: boolean;
  /** Game time at which the player joined; 0 for everyone present at the start. */
  joinedAt: number;
  /**
   * Extra time on timed questions the host gave this player, as a share of the time limit
   * (0.25, 0.5 or 1 for double). Host-paced rounds keep their question open that much longer
   * for them alone; nobody else is told. Missing or 0 for everyone else.
   */
  extraTime?: number;
}

export interface EngineTeam {
  id: TeamId;
  name: string;
  hue: number;
}

export type Viewer = { kind: 'player'; playerId: PlayerId } | { kind: 'host' };

export interface PresentedQuestion {
  iid: string;
  qid: string;
  /** Authored ids in the order shown, for questions with shuffleable parts. */
  order: string[] | null;
  shownAt: number;
}

/** A live question as sent to a client. */
export interface QuestionView {
  iid: string;
  q: PublicQuestion;
  shownAt: number;
  /** Game time when answers close, or null for no limit. */
  deadline: number | null;
  index?: number;
  total?: number;
}

/** What a player sees after answering. */
export interface FeedbackView {
  iid: string;
  correct: boolean;
  partial: number;
  reveal: AnswerReveal;
  explanation?: string;
  points?: number;
  /** A mode-specific line such as "+2 spaces" or "Shield up". */
  text?: string;
}

export interface QuestionApi {
  /** Playable question ids, in set order (after adaptation and limits). */
  ids(): readonly string[];
  get(qid: string): Question;
  count(): number;
  /** Show a question. The returned instance id is used to view and grade it. */
  present(qid: string, opts?: { shuffle?: boolean }): string;
  instance(iid: string): PresentedQuestion;
  view(iid: string, extra?: { deadline?: number | null; index?: number; total?: number }): QuestionView;
  /** Grade an answer submitted in tokens, as players send them. */
  grade(iid: string, answer: Answer): GradeResult;
  /** The correct answer, in the tokens of this instance. */
  reveal(iid: string): AnswerReveal;
  explanation(iid: string): string | undefined;
  /** False for a poll, which has no right answer and scores nothing. */
  isGraded(iid: string): boolean;
  /** Time allowed for this question in ms: its own limit, or the game's. */
  timeLimitMs(iid: string): number;
}

/**
 * What an answer record stands for. Rewards, streaks and teacher reports
 * treat them differently, so a mode that records many small tries cannot
 * inflate any of them.
 * - 'answer' (the default): a graded response to a question.
 * - 'attempt': one of several tries at the same question inside a puzzle,
 *   such as turning over a memory pair or marking a bingo square.
 * - 'self': the player graded themselves (flashcards). Never counted as a
 *   correct answer for rewards, quests, achievements or streaks.
 */
export type AnswerKind = 'answer' | 'attempt' | 'self';

export interface AnswerRecord {
  playerId: PlayerId;
  qid: string;
  correct: boolean;
  partial: number;
  responseMs: number;
  at: number;
  kind?: AnswerKind;
  /**
   * The answer as the player gave it, in words (filled in by the runtime from the last answer graded
   * for this question). Only the host's end-of-game report reads it; it never reaches a player.
   */
  given?: string | null;
}

export interface ModeContext<TSettings extends SettingValues = SettingValues> {
  readonly settings: TSettings;
  readonly common: CommonSettings;
  readonly rng: Rng;
  /** Game time in ms. Stops while the game is paused. */
  now(): number;
  /** Players in the game, including disconnected ones. Players who left or were removed are gone. */
  players(): readonly EnginePlayer[];
  player(id: PlayerId): EnginePlayer | undefined;
  /** Everyone who played, including players who have left. Use this in results(). */
  everyone(): readonly (EnginePlayer & { left: boolean })[];
  teams(): readonly EngineTeam[];
  questions: QuestionApi;
  /** Schedule onTimer(id) at game time `at`. Replaces a timer with the same id. */
  setTimer(id: string, at: number): void;
  clearTimer(id: string): void;
  hasTimer(id: string): boolean;
  /** A line in the game feed. Use `to` for lines only some players should see. */
  feed(text: string, opts?: { tone?: FeedItem['tone']; to?: PlayerId[] }): void;
  /** Count an answer towards stats, rewards and teacher reports. */
  recordAnswer(rec: Omit<AnswerRecord, 'at'>): void;
  endGame(summary?: string): void;
}

/**
 * Return `{ error }` to reject an action. Any state changes made before rejecting are discarded.
 * Return `{ quiet: true }` for frequent, small moves (walking about a map): the change is kept,
 * but instead of a full view for everyone the room sends a compact pulse (see `GameMode.pulse`).
 */
export type ActionResult = void | { error: string } | { quiet: true };

export interface ModeResults {
  /** Higher score ranks higher. Ties share a rank. */
  standings: { playerId: PlayerId; score: number; label: string }[];
  teamStandings?: { teamId: TeamId; score: number; label: string }[];
  outcome?: 'competitive' | 'coop-win' | 'coop-loss';
  summary: string;
}

export interface BotContext<TSettings extends SettingValues = SettingValues> {
  playerId: PlayerId;
  rng: Rng;
  /** Chance of answering a question correctly, 0..1. */
  skill: number;
  now: number;
  settings: TSettings;
  /** An answer to a shown question in tokens: right with probability `skill`. */
  answer(iid: string): Answer;
  /**
   * The bot's mind: only the server's practice bots have one (the test harness's bots do not, and
   * must keep playing exactly as before). With a mind, `answer` is the mind's answer, the action is
   * held back until it has finished thinking, and the mode's bot should make its other choices
   * through the mind (see packages/engine/src/bots). Policies act only on the player's own view.
   */
  mind?: BotMind;
}

/** The traits a practice bot plays with, each 0..1. */
export interface BotTraits {
  /** How much it knows. */
  ability: number;
  /** How quickly it reads, thinks and taps. */
  speed: number;
  /** How alike its moves and times are from one moment to the next. */
  consistency: number;
  /** Appetite for risk, and how well it shrugs off a mistake. */
  nerve: number;
  /** How rarely it drifts off or slips. */
  attention: number;
}

/** What a mode's bot policy can ask a practice bot's mind. All randomness comes from the bot's own seeded stream. */
export interface BotMind {
  readonly persona: string;
  readonly traits: Readonly<BotTraits>;
  /** -1 rattled .. 1 on a roll. */
  readonly mood: number;
  /** Willingness to take a risk right now, 0..1: nerve, nudged by mood. */
  boldness(): number;
  random(): number;
  chance(p: number): boolean;
  /** Integer in [min, max]. */
  int(min: number, max: number): number;
  /**
   * The option with the best score once personal noise is added (scores are on a scale where 1 is a
   * clear preference). Wilder for careless or unsteady bots, now and then a slip to any option.
   */
  choose<T>(options: readonly T[], score: (o: T) => number, spread?: number): T | undefined;
  /** How likely it feels it is to get a typical question right just now (0..1), before seeing one. */
  selfBelief(): number;
  /** How sure it feels about a question it has read (0..1), or null before it has read it. */
  sure(iid: string): number | null;
  /** A scratch object kept for the whole game, for things the bot remembers (cards it has seen). */
  memory<T extends object>(key: string, init: () => T): T;
}

// The SDK is deliberately loose about state and action types at the
// registry boundary; each mode is fully typed inside its own module.
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface GameMode<S = any, TSettings extends SettingValues = any, A = any> {
  meta: ModeMeta;
  settings: readonly SettingField[];
  /** Mode defaults for the common settings, e.g. a shorter question timer. */
  defaults?: Partial<CommonSettings>;
  /** Schema for player actions. Anything that fails it is rejected before onAction. */
  action: z.ZodType<A>;
  init(ctx: ModeContext<TSettings>): S;
  onPlayerJoin?(state: S, player: EnginePlayer, ctx: ModeContext<TSettings>): void;
  onPlayerLeave?(state: S, player: EnginePlayer, ctx: ModeContext<TSettings>): void;
  onAction(state: S, playerId: PlayerId, action: A, ctx: ModeContext<TSettings>): ActionResult;
  onTimer?(state: S, timerId: string, ctx: ModeContext<TSettings>): void;
  /** The host pressed "next" (host-paced modes). */
  onHostNext?(state: S, ctx: ModeContext<TSettings>): ActionResult;
  /**
   * Who the open question is still waiting for (connected players who may answer and have not).
   * Null when there is no single question open for everyone. Host-paced modes provide it; the host's
   * "Still answering" list reads it. Must not change state.
   */
  waitingOn?(state: S, ctx: ModeContext<TSettings>): PlayerId[] | null;
  /** The host adds time to the open question. Return `{ error }` when no timed question is open. */
  addTime?(state: S, ms: number, ctx: ModeContext<TSettings>): ActionResult;
  /** A player who joined after the start begins level with the lowest score in the game (the room's catch-up rule). */
  catchUp?(state: S, playerId: PlayerId, ctx: ModeContext<TSettings>): ActionResult;
  view(state: S, viewer: Viewer, ctx: ModeContext<TSettings>): unknown;
  /**
   * Compact data every screen gets several times a second after quiet actions, such as where
   * everyone is standing. The same for every viewer, so it must hold nothing private and no
   * answers. Keep it small: rounded numbers in arrays. Must not change state.
   */
  pulse?(state: S, ctx: ModeContext<TSettings>): unknown;
  results(state: S, ctx: ModeContext<TSettings>): ModeResults;
  /** Practice bots and the automated full-game tests use this. Return null to wait. */
  bot?(view: any, ctx: BotContext<TSettings>): A | null;
  /** Milliseconds a bot waits before acting on a view. */
  botDelay?(view: any, rng: Rng): number;
}

export interface ModeVariant {
  meta: VariantMeta;
  settings?: SettingValues;
  common?: Partial<CommonSettings>;
  /** Setting keys the host cannot change in this variant. */
  locked?: readonly string[];
}
