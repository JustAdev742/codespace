import { createHmac, randomInt } from 'node:crypto';
import { COLLECTIONS, GLIMS } from '@ludora/content';

/*
 * The secret sequence that unlocks chaos. Every stage is checked here, on the
 * server; the browser only reports what the player did. Nothing about the
 * sequence is in the web app's files: the rhythm comes from a server secret,
 * the riddle and the ritual are drawn fresh for each attempt, and progress
 * lives in this process's memory.
 *
 *  1. Knock: tap the lantern on the About page in the right rhythm (seven
 *     taps). The rhythm is derived from the server secret, so it differs per
 *     deployment and is not in the source. The lantern flickers it as a hint.
 *  2. Riddle: name a Glim from its place in the collection book.
 *  3. Ritual: in a live game, as a player, send four reactions in the order
 *     the riddle's answer revealed, with no other reactions in between.
 *  4. Light: hold the lantern that then appears. The account is unlocked.
 *
 * Progress expires 20 minutes after the knock. Three wrong riddle answers
 * start it over. Nothing here grants anything by itself: only `light()`
 * succeeding lets the caller set the account's unlock.
 */

export const KNOCK_TAPS = 7;
export const SEQUENCE_TTL_MS = 20 * 60_000;
export const LIGHT_WINDOW_MS = 3 * 60_000;
const BEAT_TOLERANCE = 0.34;
const MAX_RIDDLE_TRIES = 3;
const MAX_KNOCKS_PER_HOUR = 30;

/** The knock rhythm: six gaps, each one or two beats, at least two of each. Derived from the server secret. */
export function knockBeats(secret: string): number[] {
  for (let salt = 0; ; salt++) {
    const bytes = createHmac('sha256', secret).update(`ludora-lantern-knock:${salt}`).digest();
    const beats = Array.from({ length: KNOCK_TAPS - 1 }, (_, i) => ((bytes[i] ?? 0) % 2) + 1);
    const longs = beats.filter((b) => b === 2).length;
    if (longs >= 2 && longs <= beats.length - 2) return beats;
  }
}

/** Whether tap gaps (ms) match the rhythm at any steady tempo between 110 and 700 ms a beat. */
export function matchesKnock(gaps: readonly number[], beats: readonly number[]): boolean {
  if (gaps.length !== beats.length || gaps.some((g) => !Number.isFinite(g) || g <= 0)) return false;
  const unit = gaps.reduce((a, b) => a + b, 0) / beats.reduce((a, b) => a + b, 0);
  if (unit < 110 || unit > 700) return false;
  return gaps.every((g, i) => Math.abs(g / unit - beats[i]!) <= BEAT_TOLERANCE);
}

export interface Riddle {
  text: string;
  answer: string;
  /** The reactions the ritual asks for, revealed once the riddle is solved. */
  ritual: string[];
}

const normalize = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '');
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

export function makeRiddle(reactions: readonly string[], pick: (max: number) => number = randomInt): Riddle {
  const collection = COLLECTIONS[pick(COLLECTIONS.length)]!;
  const members = GLIMS.filter((g) => g.collectionId === collection.id).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const n = pick(members.length);
  const glim = members[n]!;
  const ritual: string[] = [];
  // Four reactions, never the same one twice in a row.
  while (ritual.length < 4) {
    const i = pick(reactions.length);
    const r = reactions[i]!;
    ritual.push(r === ritual.at(-1) ? reactions[(i + 1) % reactions.length]! : r);
  }
  return {
    text: `Open your collection book to ${collection.name}. Who is the ${ordinal(n + 1)} Glim on that page?`,
    answer: glim.name,
    ritual,
  };
}

type Stage = 'knocked' | 'answered' | 'stirred';

interface Progress {
  stage: Stage;
  startedAt: number;
  riddle: Riddle;
  wrong: number;
  ritualAt: number;
  stirredAt: number;
}

export type KnockResult = { heard: false } | { heard: true; riddle: string };
export type AnswerResult = { ok: false; reason: 'no-riddle' | 'wrong' | 'reset' } | { ok: true; ritual: string[] };

/**
 * Holds each account's progress through the sequence. One per server; it is
 * in memory on purpose, so a restart simply asks players to start again.
 */
export class SequenceTracker {
  private readonly progress = new Map<string, Progress>();
  private readonly knocks = new Map<string, { n: number; resetAt: number }>();

  constructor(
    private readonly beats: readonly number[],
    private readonly reactions: readonly string[],
    private readonly now: () => number = Date.now,
    private readonly pick: (max: number) => number = randomInt,
  ) {}

  private live(userId: string): Progress | null {
    const p = this.progress.get(userId);
    if (!p) return null;
    if (this.now() - p.startedAt > SEQUENCE_TTL_MS) {
      this.progress.delete(userId);
      return null;
    }
    return p;
  }

  /** Stage 1. A matching knock starts (or restarts) the sequence and returns the riddle. */
  knock(userId: string, gaps: readonly number[]): KnockResult {
    const t = this.now();
    const k = this.knocks.get(userId);
    if (!k || k.resetAt < t) this.knocks.set(userId, { n: 1, resetAt: t + 3_600_000 });
    else if (++k.n > MAX_KNOCKS_PER_HOUR) return { heard: false };
    if (this.knocks.size > 100_000) this.knocks.clear();
    if (!matchesKnock(gaps, this.beats)) return { heard: false };
    const riddle = makeRiddle(this.reactions, this.pick);
    this.progress.set(userId, { stage: 'knocked', startedAt: t, riddle, wrong: 0, ritualAt: 0, stirredAt: 0 });
    if (this.progress.size > 100_000) this.sweep();
    return { heard: true, riddle: riddle.text };
  }

  /** Stage 2. The right Glim's name reveals the ritual. */
  answer(userId: string, text: string): AnswerResult {
    const p = this.live(userId);
    if (!p || p.stage !== 'knocked') return { ok: false, reason: 'no-riddle' };
    if (normalize(text) !== normalize(p.riddle.answer)) {
      if (++p.wrong >= MAX_RIDDLE_TRIES) {
        this.progress.delete(userId);
        return { ok: false, reason: 'reset' };
      }
      return { ok: false, reason: 'wrong' };
    }
    p.stage = 'answered';
    p.ritualAt = 0;
    return { ok: true, ritual: p.riddle.ritual };
  }

  /**
   * Stage 3. Called for every reaction an account sends as a player in a
   * running game. Returns true at the moment the ritual completes.
   */
  reaction(userId: string, emote: string, inRunningGame: boolean): boolean {
    const p = this.live(userId);
    if (!p || p.stage !== 'answered') return false;
    if (!inRunningGame) return false;
    const want = p.riddle.ritual[p.ritualAt];
    if (emote === want) p.ritualAt++;
    else p.ritualAt = emote === p.riddle.ritual[0] ? 1 : 0;
    if (p.ritualAt < p.riddle.ritual.length) return false;
    p.stage = 'stirred';
    p.stirredAt = this.now();
    return true;
  }

  /** Whether this account's ritual is done and the lantern is waiting to be lit. */
  stirred(userId: string): boolean {
    const p = this.live(userId);
    return Boolean(p && p.stage === 'stirred' && this.now() - p.stirredAt <= LIGHT_WINDOW_MS);
  }

  /** Stage 4. Succeeds once per completed sequence; the caller then records the unlock. */
  light(userId: string): boolean {
    if (!this.stirred(userId)) return false;
    this.progress.delete(userId);
    return true;
  }

  /** How far an account has got, for its own status check. */
  stage(userId: string): Stage | null {
    return this.live(userId)?.stage ?? null;
  }

  forget(userId: string) {
    this.progress.delete(userId);
  }

  private sweep() {
    const t = this.now();
    for (const [id, p] of this.progress) if (t - p.startedAt > SEQUENCE_TTL_MS) this.progress.delete(id);
  }
}
