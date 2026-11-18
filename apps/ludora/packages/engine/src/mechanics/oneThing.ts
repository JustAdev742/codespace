import { streamNext, type StreamState } from './selfPaced.ts';
import type { ModeContext, PlayerId } from '../sdk/types.ts';

/*
 * One thing at a time (calm play, `ctx.calm`).
 *
 * In a self-paced mode with an action that needs steering, aiming or timing,
 * a question is normally open while the action goes on. In calm play the two
 * take turns, for each player on their own:
 *
 *   thinking  a question is open. The player's piece is in neutral: it does
 *             nothing, nothing can happen to it, and its own clocks stand
 *             still. The mode decides what neutral means (a kart coasts at
 *             its cruising speed, a tagger is hidden, customers wait).
 *   their go  no question is open. The player acts. The next question opens
 *             when the go ends: after a set time, or when the mode says the
 *             action is finished.
 *
 * What keeps it fair (docs/DECISIONS.md, D56):
 *  - The game opens the question, never the player, so nobody can call up
 *    shelter when they are in trouble.
 *  - Neutral is never better than playing: nothing is gained while thinking.
 *  - Where other players could otherwise reach the piece, the shelter is
 *    bounded (`shelterMs`): when it runs out the question is put away, not
 *    counted, and the player's go starts with nothing earned.
 *
 * A mode keeps one `Turn` per player beside their question stream and calls
 * these helpers only when `ctx.calm` is true, so a game without calm play
 * draws no extra random numbers, sets no extra timers and replays as before.
 */

export interface Turn {
  /** While it is the player's go: the game time it ends and their next question opens. Null while they think. */
  goUntil: number | null;
  /** Game time the open question began holding the player's piece. Null when nothing is held. */
  heldAt: number | null;
  /** While sheltered from other players: the game time the shelter runs out. Null for no limit. */
  shelterUntil: number | null;
}

export const newTurn = (): Turn => ({ goUntil: null, heldAt: null, shelterUntil: null });

/** The timer that ends a player's go. Modes pass it to `turnOnTimer` from `onTimer`. */
export const goTimer = (id: PlayerId) => `go:${id}`;
/** The timer that ends a player's shelter. */
export const shelterTimer = (id: PlayerId) => `shelter:${id}`;

/** Which player a turn timer belongs to and what it ends, or null for any other timer. */
export function turnTimerOf(timerId: string): { playerId: PlayerId; kind: 'go' | 'shelter' } | null {
  if (timerId.startsWith('go:')) return { playerId: timerId.slice(3), kind: 'go' };
  if (timerId.startsWith('shelter:')) return { playerId: timerId.slice(8), kind: 'shelter' };
  return null;
}

/** A question is open for this player in calm play, so their piece waits. Always false outside calm play. */
export function thinking(ctx: ModeContext, s: StreamState): boolean {
  return ctx.calm && s.iid !== null;
}

/**
 * The player's piece starts waiting (a question has opened while the piece is in play). With
 * `shelterMs`, the wait is bounded: `shelterTimer(id)` fires when it runs out. A player the host
 * gave extra time gets that share more.
 */
export function holdBegin(turn: Turn, playerId: PlayerId, ctx: ModeContext, shelterMs?: number): void {
  const now = ctx.now();
  turn.heldAt = now;
  turn.goUntil = null;
  ctx.clearTimer(goTimer(playerId));
  if (shelterMs !== undefined) {
    turn.shelterUntil = now + Math.round(shelterMs * (1 + (ctx.player(playerId)?.extraTime ?? 0)));
    ctx.setTimer(shelterTimer(playerId), turn.shelterUntil);
  }
}

/** The piece stops waiting. Returns how long it waited, for the mode to move the piece's own clocks on by. */
export function holdEnd(turn: Turn, playerId: PlayerId, ctx: ModeContext): number {
  const held = turn.heldAt === null ? 0 : Math.max(0, ctx.now() - turn.heldAt);
  turn.heldAt = null;
  turn.shelterUntil = null;
  ctx.clearTimer(shelterTimer(playerId));
  return held;
}

/** The player's go starts and lasts `ms`: `goTimer(id)` fires when it ends. */
export function goBegin(turn: Turn, playerId: PlayerId, ctx: ModeContext, ms: number): void {
  turn.goUntil = ctx.now() + ms;
  ctx.setTimer(goTimer(playerId), turn.goUntil);
}

/** The player's go is over: their next question opens (if none is open already). */
export function goEnd(turn: Turn, s: StreamState, playerId: PlayerId, ctx: ModeContext): void {
  turn.goUntil = null;
  ctx.clearTimer(goTimer(playerId));
  if (!s.iid) streamNext(s, ctx);
}

/**
 * Take the open question off the screen unanswered. Nothing is recorded, so it does not count for
 * or against the player; the deck brings the question round again later.
 */
export function putAway(s: StreamState): void {
  s.iid = null;
}

/** Move a piece's own clocks on by the time it waited: every listed time that had not yet come when the wait began. */
export function shiftClocks<T extends object>(target: T, keys: readonly (keyof T)[], from: number, by: number): void {
  if (by <= 0) return;
  for (const k of keys) {
    const v = target[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > from) (target as Record<keyof T, unknown>)[k] = v + by;
  }
}

/** What a player's screen needs to show one thing at a time. Null outside calm play, so screens can ignore it. */
export interface TurnView {
  /** 'question': answer, the action waits. 'go': act, no question is open. */
  phase: 'question' | 'go';
  /** Game time the go ends, when it is timed. */
  goUntil: number | null;
  /** Game time the shelter runs out, when it is bounded. */
  shelterUntil: number | null;
}

export function turnView(turn: Turn, s: StreamState, ctx: ModeContext): TurnView | null {
  if (!ctx.calm) return null;
  return { phase: s.iid !== null ? 'question' : 'go', goUntil: s.iid !== null ? null : turn.goUntil, shelterUntil: s.iid !== null ? turn.shelterUntil : null };
}
