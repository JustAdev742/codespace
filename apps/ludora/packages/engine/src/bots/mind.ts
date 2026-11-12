import { createRng, hashString, type Answer, type Question, type Rng } from '@ludora/shared';
import { correctAnswerFor, gradeAnswer } from '../questions/grade.ts';
import type { BotMind, BotTraits } from '../sdk/types.ts';
import { estimateDifficulty, readingWords } from './difficulty.ts';
import type { BotProfile } from './personas.ts';
import { guessChoice, humanWrongAnswer } from './wrong.ts';

/*
 * A practice bot's mind: a model of a player, written in code and seeded, so a
 * game replays the same. It decides what the bot knows (from how hard the
 * question looks, what it has seen already this game and the topics it happens
 * to be good at), how it is wrong when it is wrong, when it answers (reading,
 * then thinking with a human spread, never instantly) and how it feels (a
 * streak lifts it, a mistake can knock it, a long game tires it, the end
 * brings a second wind). Modes ask it for their other choices through BotMind.
 */

export interface PlanInput {
  iid: string;
  q: Question;
  shownAt: number;
  /** Game time answers close, if the player can see one. */
  deadline: number | null;
  now: number;
  /** How far through the game, 0..1, when known. */
  progress: number | null;
}

export interface AnswerPlan {
  iid: string;
  qid: string;
  answer: Answer;
  correct: boolean;
  partial: number;
  sure: number;
  /** Game time it will have finished reading and thinking; Infinity when it runs out of time. */
  readyAt: number;
  shownAt: number;
  committed: boolean;
}

/** The player a "My level" bot keeps pace with: their numbers so far in this game. */
export interface FollowStats {
  answered: number;
  correct: number;
  responseMsSum: number;
}

export interface MindOptions {
  /** Typed answers from the game's other questions: the similar words a player reaches for. */
  pool?: readonly string[];
  /** For a "My level" bot: the player it keeps close to. */
  follow?: () => FollowStats | null;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
/** The fewest milliseconds any answer takes, however easy. */
export const MIN_ANSWER_MS = 900;

function normal(rng: Rng): number {
  const u = Math.max(1e-9, rng.next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}

/** A fixed value in [-1, 1] for this bot and this key: what it happens to be good or bad at. */
function leaning(seed: number, key: string): number {
  return (hashString(`${seed}|${key}`) / 0xffffffff) * 2 - 1;
}

/** Extra work beyond reading and thinking: typing, dragging, matching. */
function workMs(q: Question, speed: number): number {
  const hand = 1.4 - speed * 0.7;
  switch (q.type) {
    case 'multi':
      return 350 * q.correct.length * hand;
    case 'short':
      return (500 + (q.accepted[0]?.length ?? 6) * 170) * hand;
    case 'numeric':
      return (400 + String(q.answer).length * 230) * hand;
    case 'order':
      return q.items.length * 520 * hand;
    case 'match':
      return q.pairs.length * 680 * hand;
    case 'sort':
      return q.items.length * 480 * hand;
    case 'blanks':
      return (q.bank ? 700 : 1400) * hand;
    case 'flashcard':
      return 500 * hand;
    default:
      return 0;
  }
}

export class PracticeMind implements BotMind {
  readonly persona: string;
  readonly traits: Readonly<BotTraits>;
  private readonly profile: BotProfile;
  private readonly rng: Rng;
  private readonly plans = new Map<string, AnswerPlan>();
  private readonly seen = new Map<string, { times: number; right: boolean; wrong: Answer | null }>();
  private readonly scratch = new Map<string, object>();
  private pool: readonly string[];
  private readonly follow: (() => FollowStats | null) | undefined;
  private moodValue = 0;
  private answered = 0;
  private right = 0;
  private msSum = 0;
  /** "My level": nudges to ability and pace that keep it close to the player. */
  private abilityNudge = 0;
  private paceNudge = 1;

  constructor(profile: BotProfile, opts: MindOptions = {}) {
    this.profile = profile;
    this.persona = profile.persona;
    this.traits = profile.traits;
    this.rng = createRng(profile.seed);
    this.pool = opts.pool ?? [];
    this.follow = profile.follows ? opts.follow : undefined;
  }

  get mood(): number {
    return this.moodValue;
  }

  /** Answers it has given this game, and how many it meant to get right. */
  get record(): { answered: number; right: number; meanMs: number } {
    return { answered: this.answered, right: this.right, meanMs: this.answered ? this.msSum / this.answered : 0 };
  }

  setPool(pool: readonly string[]) {
    this.pool = pool;
  }

  /* ------------------------------ policy API ------------------------------ */

  random(): number {
    return this.rng.next();
  }

  chance(p: number): boolean {
    return this.rng.next() < p;
  }

  int(min: number, max: number): number {
    return this.rng.int(min, max);
  }

  boldness(): number {
    const t = this.traits;
    return clamp(t.nerve + this.moodValue * 0.2 + (this.rng.next() - 0.5) * (0.35 - t.consistency * 0.25), 0, 1);
  }

  choose<T>(options: readonly T[], score: (o: T) => number, spread = 1): T | undefined {
    if (!options.length) return undefined;
    const t = this.traits;
    // Now and then a slip: not the move it meant.
    if (this.rng.next() < (1 - t.attention) * 0.05) return options[this.rng.int(0, options.length - 1)];
    const temp = spread * (0.1 + (1 - t.consistency) * 0.45 + (1 - t.ability) * 0.25);
    let best: T | undefined;
    let bestV = -Infinity;
    for (const o of options) {
      const u = Math.max(1e-9, Math.min(1 - 1e-9, this.rng.next()));
      const v = score(o) + temp * -Math.log(-Math.log(u));
      if (v > bestV) {
        bestV = v;
        best = o;
      }
    }
    return best;
  }

  selfBelief(): number {
    const base = sigmoid(5.5 * (this.traits.ability + this.abilityNudge - 0.38) + 0.3);
    const recent = (this.right + 2 * base) / (this.answered + 2);
    return clamp(recent + this.moodValue * 0.08, 0.02, 0.98);
  }

  sure(iid: string): number | null {
    return this.plans.get(iid)?.sure ?? null;
  }

  memory<T extends object>(key: string, init: () => T): T {
    let m = this.scratch.get(key);
    if (!m) {
      m = init();
      this.scratch.set(key, m);
    }
    return m as T;
  }

  /** How much slower than the mode's own pace it taps and moves (over 1 slower). */
  tapScale(): number {
    const t = this.traits;
    const wobble = Math.exp(normal(this.rng) * (0.12 + (1 - t.consistency) * 0.15));
    return clamp(this.profile.pace * this.paceNudge * (1.3 - t.speed * 0.6) * wobble, 0.4, 3);
  }

  /* -------------------------------- answers ------------------------------- */

  /** What it will answer to a question and when. Made once per question shown; the same afterwards. */
  plan(input: PlanInput): AnswerPlan {
    const had = this.plans.get(input.iid);
    // A second go at the same question (some modes allow retries) is a fresh attempt from now.
    if (had && !had.committed) return had;
    if (had) input = { ...input, shownAt: Math.max(input.shownAt, input.now) };
    const { q, iid } = input;
    const t = this.traits;
    const shape = this.profile.shape;
    const rng = this.rng;
    this.tidy(input.now);
    this.track();
    const progress = input.progress ?? null;

    // What it knows: ability against how hard the question looks, with its own leanings.
    const diff = estimateDifficulty(q);
    const topic = q.tags?.[0] ? `t:${q.tags[0].toLowerCase()}` : `q:${q.id.replace(/\d+$/, '')}`;
    let logit = 5.5 * (t.ability + this.abilityNudge - diff) + 0.3;
    logit += leaning(this.profile.seed, topic) * 0.7 + leaning(this.profile.seed, `q:${q.id}`) * 0.6;
    const memory = this.seen.get(q.id);
    if (memory) logit += 1.0 + (memory.right ? 0.5 : 0) + Math.min(0.5, (memory.times - 1) * 0.25);
    logit += this.moodValue * 0.45;
    if (this.answered < 5) logit += shape.start * (1 - this.answered / 5);
    const late = progress !== null && progress >= 0.75;
    if (late) logit += 0.1 + shape.finish * ((progress - 0.75) / 0.25);
    const fatigue = Math.min(0.7, this.answered / 70) * (1 - t.consistency * 0.5) * (late ? 0.5 : 1);
    logit -= fatigue;
    const pKnow = sigmoid(logit);
    let knows = rng.next() < pKnow;
    // A slip: knew it, but misread or tapped the wrong thing.
    if (knows && rng.next() < (1 - t.attention) * 0.06 + (1 - t.consistency) * 0.03) knows = false;
    const grip = knows ? 0.85 : pKnow;

    // When: reading, any typing or dragging, then thinking with a long tail.
    const pace = this.profile.pace * this.paceNudge;
    const wpm = 130 + t.speed * 170;
    const read = 300 + (readingWords(q) * 60_000) / wpm;
    const work = workMs(q, t.speed);
    const sureNow = knows ? 0.6 + 0.35 * pKnow : 0.1 + 0.35 * pKnow;
    const median = (700 + 3300 * diff) * (1.5 - t.speed * 0.8) * (knows ? 0.75 : 1.3) * (1 - this.moodValue * 0.12) * (1 + fatigue * 0.4);
    let think = median * Math.exp(normal(rng) * (0.35 + (1 - t.consistency) * 0.35));
    // Drifting off: now and then a long gap before it gets going.
    if (rng.next() < (1 - t.attention) * 0.12) think += 2500 + rng.next() * 6000;
    if (this.answered < 3 && shape.start < 0) think *= 1.25;
    let total = Math.max(MIN_ANSWER_MS, (read + work + think) * pace, read * 0.6 + 500);
    let readyAt = input.shownAt + total;

    if (input.deadline !== null) {
      const room = input.deadline - input.shownAt - 250;
      if (total > room) {
        // Out of time: a guesser throws something in at the last moment; others are caught out.
        if (room > MIN_ANSWER_MS && rng.next() < 0.12 + shape.guess * 0.8) {
          total = Math.max(MIN_ANSWER_MS, room - (150 + rng.next() * 800));
          readyAt = input.shownAt + total;
          if (knows && rng.next() < 0.35) knows = false;
        } else readyAt = Infinity;
      } else if (!knows && room > MIN_ANSWER_MS * 2 && rng.next() < 0.08 * (1 - t.nerve) + 0.02) {
        // Unsure, it holds on till the last second.
        total = Math.max(total, room - (250 + rng.next() * 650));
        readyAt = input.shownAt + total;
      }
    }

    let answer: Answer;
    if (knows) answer = correctAnswerFor(q);
    else if (memory?.wrong && rng.next() < 0.3) answer = memory.wrong;
    else answer = this.guess(q, grip);
    const graded = gradeAnswer(q, answer);
    const plan: AnswerPlan = {
      iid,
      qid: q.id,
      answer,
      correct: q.type === 'poll' ? true : graded.correct,
      partial: graded.partial,
      sure: sureNow,
      readyAt,
      shownAt: input.shownAt,
      committed: false,
    };
    this.plans.set(iid, plan);
    return plan;
  }

  /** Whether it has finished thinking about a question. */
  ready(iid: string, now: number): boolean {
    const p = this.plans.get(iid);
    return Boolean(p && p.readyAt <= now);
  }

  /** The answer went in: remember the question and feel the result. */
  commit(iid: string, now: number) {
    const p = this.plans.get(iid);
    if (!p || p.committed) return;
    p.committed = true;
    this.answered++;
    if (p.correct) this.right++;
    this.msSum += Math.max(0, now - p.shownAt);
    const had = this.seen.get(p.qid);
    this.seen.set(p.qid, { times: (had?.times ?? 0) + 1, right: p.correct, wrong: p.correct ? null : p.answer });
    const t = this.traits;
    const shape = this.profile.shape;
    // Settles back towards calm, lifts on a right answer, wobbles on a wrong one (more for some).
    this.moodValue *= 0.9;
    if (p.correct) this.moodValue += 0.16 * (1 - this.moodValue);
    else this.moodValue -= shape.tilt * 0.35 * (1 + this.moodValue) * (1.1 - t.nerve * 0.4);
    this.moodValue = clamp(this.moodValue, -1, 1);
  }

  /** The earliest time a question it has read will be ready to answer, if any is still to come. */
  nextReady(now: number): number | null {
    let at: number | null = null;
    for (const p of this.plans.values()) {
      if (p.committed || !Number.isFinite(p.readyAt) || p.readyAt <= now) continue;
      if (at === null || p.readyAt < at) at = p.readyAt;
    }
    return at;
  }

  private guess(q: Question, grip: number): Answer {
    const rng = this.rng;
    switch (q.type) {
      case 'mcq':
        // Unsure on a choice question: a guess, pulled towards whatever looks like the answer.
        return { type: 'mcq', choiceId: guessChoice(rng, q.choices, [q.correct]) };
      case 'truefalse':
        return { type: 'truefalse', value: rng.next() < 0.45 ? q.correct : !q.correct };
      case 'poll':
        return { type: 'poll', choiceId: q.choices[rng.int(0, q.choices.length - 1)]!.id };
      default:
        return humanWrongAnswer(q, { rng, grip, pool: this.pool });
    }
  }

  /** "My level": edge ability and pace towards the player's own numbers in this game. */
  private track() {
    const s = this.follow?.();
    if (!s || s.answered < 2) return;
    const theirs = (s.correct + 1) / (s.answered + 2);
    const mine = (this.right + 1) / (this.answered + 2);
    this.abilityNudge = clamp(this.abilityNudge + 0.12 * (theirs - mine), -0.45, 0.45);
    if (this.answered >= 2 && s.responseMsSum > 0) {
      const ratio = s.responseMsSum / s.answered / Math.max(1, this.msSum / this.answered);
      this.paceNudge = clamp(this.paceNudge * Math.pow(ratio, 0.3), 0.5, 2);
    }
  }

  private tidy(now: number) {
    for (const [iid, p] of this.plans) if ((p.committed && p.shownAt < now - 60_000) || (Number.isFinite(p.readyAt) ? p.readyAt : p.shownAt) < now - 120_000) this.plans.delete(iid);
  }
}
