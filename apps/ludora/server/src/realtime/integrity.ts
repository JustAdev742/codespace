/*
 * Integrity signals: three patterns in a live game that suggest a player is not playing it by
 * hand, on one device. This only notices and reports. Nothing here, and nothing that reads its
 * result, changes a score, refuses a move, slows or removes a player, or shows a player anything.
 *
 * The room hands it facts as they happen and it answers with a signal, at most once for each
 * player and kind. One watch lasts one game: the room makes it when a game starts and drops it
 * when the game ends, so nothing is kept. It is plain TypeScript with no I/O, like the room.
 */

/** A right answer this soon after its question opened was not read first: a person needs about 200 ms just to react to something appearing, before reading, choosing, and the trip to the server and back. */
export const TOO_FAST_MS = 250;
/** Right answers that fast, in one game, before it is reported: one or two can be a lucky tap landing as the question appears. */
export const TOO_FAST_COUNT = 5;
/** The share of a player's too-fast answers that may be wrong: a key held down answers as fast but is right only by chance, and a program that knows the answers is right nearly every time. */
export const TOO_FAST_WRONG_SHARE = 0.1;
/** Messages the game's own screens never send, from one player in one game, before it is reported: fewer can be a tab left open across an update, or a move sent as a lesson changed games. */
export const ILLEGAL_MOVES_COUNT = 5;
/** Players connected at the same time from one browser before it is reported: two is what rejoining under a new name with the old tab still open looks like. */
export const ONE_DEVICE_PLAYERS = 3;

/**
 * Why a move was turned away.
 * - `malformed`: not shaped like a move at all, or not like any move this game has.
 * - `host_command`: a player's connection sent one of the host's commands.
 * - `refused`: a well-formed move the game said no to: a second tap on an answer, an answer after
 *   time ran out, a move while paused, buying something the player cannot afford.
 */
export type Rejection = 'malformed' | 'host_command' | 'refused';

/** What each counts towards ILLEGAL_MOVES_COUNT. A refused move counts nothing: every player's own screen sends them in ordinary play. */
export const REJECTION_WEIGHT: Readonly<Record<Rejection, number>> = { malformed: 1, host_command: 1, refused: 0 };

export type IntegrityKind = 'too_fast' | 'illegal_moves' | 'one_device_many_players';

export interface IntegritySignal {
  kind: IntegrityKind;
  playerId: string;
  /** How many times, or for one_device_many_players how many players. */
  count: number;
  /** one_device_many_players: the other players on the same device. */
  others?: string[];
}

export class IntegrityWatch {
  private readonly fast = new Map<string, { right: number; wrong: number }>();
  private readonly illegal = new Map<string, number>();
  private readonly told = new Set<string>();

  /** Each signal goes out once. */
  private once(kind: IntegrityKind, key: string, signal: Omit<IntegritySignal, 'kind'>): IntegritySignal | null {
    const k = `${kind}:${key}`;
    if (this.told.has(k)) return null;
    this.told.add(k);
    return { kind, ...signal };
  }

  /**
   * A player's answer was graded. Both times are the server's own clock: when the question was
   * presented to them and when their answer arrived. Nothing the player's device says is used.
   */
  answered(playerId: string, openedAt: number, arrivedAt: number, correct: boolean): IntegritySignal | null {
    const took = arrivedAt - openedAt;
    if (!(took >= 0 && took < TOO_FAST_MS)) return null;
    const f = this.fast.get(playerId) ?? { right: 0, wrong: 0 };
    if (correct) f.right++;
    else f.wrong++;
    this.fast.set(playerId, f);
    if (f.right < TOO_FAST_COUNT || f.wrong > (f.right + f.wrong) * TOO_FAST_WRONG_SHARE) return null;
    return this.once('too_fast', playerId, { playerId, count: f.right });
  }

  /** A move from a player was turned away. */
  rejected(playerId: string, why: Rejection): IntegritySignal | null {
    const weight = REJECTION_WEIGHT[why];
    if (!weight) return null;
    const n = (this.illegal.get(playerId) ?? 0) + weight;
    this.illegal.set(playerId, n);
    if (n < ILLEGAL_MOVES_COUNT) return null;
    return this.once('illegal_moves', playerId, { playerId, count: n });
  }

  /**
   * These players are connected at the same time and share one device key, oldest seat first.
   * The key is whatever the caller trusts to mean "the same device"; it is never reported.
   */
  sameDevice(deviceKey: string, playerIds: readonly string[]): IntegritySignal | null {
    if (playerIds.length < ONE_DEVICE_PLAYERS) return null;
    return this.once('one_device_many_players', deviceKey, { playerId: playerIds[0]!, count: playerIds.length, others: playerIds.slice(1) });
  }
}

/** The line written to the server log for a signal. Display names only: no address, account id or email. */
export interface IntegrityEvent {
  ludora_event: 'integrity';
  kind: IntegrityKind;
  /** The room's code. */
  room: string;
  /** The game mode's id. */
  mode: string;
  /** The player's name as the game shows it. */
  player: string;
  count: number;
  /** One sentence for the person who reads the alert. */
  detail: string;
  /** ISO time the signal was raised, by the server's clock. */
  at: string;
}

function listed(names: readonly string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;
}

/** Build the log line for a signal. `others` are the other players' names, for one_device_many_players. */
export function integrityEvent(e: { kind: IntegrityKind; room: string; mode: string; player: string; count: number; at: number | Date; others?: readonly string[] }): IntegrityEvent {
  let detail: string;
  switch (e.kind) {
    case 'too_fast':
      detail = `${e.player} gave ${e.count} right answers, each less than a quarter of a second after the question appeared.`;
      break;
    case 'illegal_moves':
      detail = `${e.player}'s device sent ${e.count} messages that the game's own screens never send.`;
      break;
    case 'one_device_many_players':
      detail = `${e.count} players are connected from one browser at the same time: ${listed([e.player, ...(e.others ?? [])])}.`;
      break;
  }
  return { ludora_event: 'integrity', kind: e.kind, room: e.room, mode: e.mode, player: e.player, count: e.count, detail, at: new Date(e.at).toISOString() };
}
