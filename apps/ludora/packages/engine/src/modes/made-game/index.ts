/*
 * The Mode Studio interpreter: one mode that runs any blueprint (packages/shared/src/blueprint.ts).
 * A blueprint is data, never code: every rule below is Ludora's, chosen and tuned by the blueprint's
 * fields. `blueprintMode(bp)` turns a checked blueprint into an ordinary GameMode that the runtime
 * plays like any other, so joins and leaves, late joiners, pausing, teams, results and bots all work
 * the usual way. Every game ends: the blueprint's time limit is always set (from the blueprint, never
 * from a host setting), rounds are capped by its question count, and own-pace players stop at it.
 *
 * Nothing here pays anything: the room rewards a made game by the rules for its pacing.
 */
import { z } from 'zod';
import {
  answerSchema,
  kindSize,
  KIND_INFO,
  MADE_GAME_MODE_ID,
  POWER_INFO,
  describeBlueprint,
  blueprintTagline,
  amountOf,
  type Blueprint,
  type BlueprintEvent,
  type ModeMeta,
  type PowerUp,
  type QuestionType,
} from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { GameMode, ModeContext, PlayerId, Viewer, FeedbackView } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import {
  syncAddPlayer,
  syncAddTime,
  syncBegin,
  syncHostNext,
  syncInit,
  syncOnTimer,
  syncView,
  syncWaitingOn,
  syncAnswer,
  type SyncConfig,
  type SyncState,
  type SyncView,
} from '../../mechanics/syncRounds.ts';

export { MADE_GAME_MODE_ID };

/** Squares on a collect grid. */
export const COLLECT_CELLS = 16;
/** Squares a player can have waiting to open. */
export const MAX_PICKS = 9;
/** Own-pace events: one starts every this long and lasts EVENT_MS. */
export const EVENT_EVERY_MS = 60_000;
export const EVENT_MS = 20_000;
/** Rounds: every fourth question is an event round. */
export const EVENT_ROUND_EVERY = 4;
/** Race shortcuts jump this far. */
export const SHORTCUT_JUMP = 3;

const QUESTION_TYPES: readonly QuestionType[] = ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match', 'blanks', 'sort'];

export interface MadeLast {
  seq: number;
  correct: boolean | null;
  /** What the answer (or move) changed, signed. */
  amount: number;
  notes: string[];
}

interface Pl {
  units: number;
  streak: number;
  rights: number;
  powersEarned: number;
  power: PowerUp | null;
  shield: boolean;
  double: boolean;
  frozen: boolean;
  lives: number;
  out: boolean;
  outOrder: number;
  place: number | null;
  /** Climb: highest ledge reached. */
  ledge: number;
  /** Collect: squares waiting to be opened. */
  picks: number;
  /** Collect: what each square holds (-1 a trap). Never sent to anyone. */
  grid: number[] | null;
  opened: boolean[] | null;
  /** Own pace: questions answered, and done once the blueprint's count is reached. */
  answered: number;
  done: boolean;
  stream: StreamState | null;
  last: MadeLast | null;
  seq: number;
}

interface State {
  players: Record<PlayerId, Pl>;
  sync: SyncState | null;
  endsAt: number;
  finishOrder: PlayerId[];
  outCount: number;
  tower: number;
  tiles: (PlayerId | null)[];
  pulls: Record<string, number>;
  shortcuts: number[];
  /** Own pace: the event on now. */
  event: { type: BlueprintEvent; until: number } | null;
  eventCount: number;
  coopWon: boolean;
  winnerTeam: string | null;
}

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
  z.object({ type: z.literal('power') }),
  z.object({ type: z.literal('pick'), cell: z.number().int().min(0).max(COLLECT_CELLS - 1) }),
]);
type Action = z.infer<typeof action>;

/** Public row about a player. Holds nothing private (no grid, no power held). */
export interface MadeRow {
  playerId: string;
  name: string;
  teamId: string | null;
  score: number;
  lives: number | null;
  out: boolean;
  place: number | null;
}

export interface MadeYou {
  score: number;
  lives: number | null;
  out: boolean;
  place: number | null;
  picks: number;
  /** Collect: opened squares show what they held; unopened ones are null. */
  grid: (number | null)[] | null;
  power: PowerUp | null;
  shield: boolean;
  double: boolean;
  frozen: boolean;
  streak: number;
  /** Right answers still needed for the next power-up, or null when the game has none. */
  nextPowerIn: number | null;
  last: MadeLast | null;
  done: boolean;
  answered: number;
  question: ReturnType<typeof streamQuestionView>;
  feedback: FeedbackView | null;
}

export interface MadeView {
  game: Blueprint;
  endsAt: number;
  sync: SyncView | null;
  /** The event on now: own pace with its end time, rounds for the open round. */
  event: { type: BlueprintEvent; until: number | null } | null;
  tower: number;
  tiles: (string | null)[] | null;
  pulls: { teamId: string; pulls: number }[] | null;
  shortcuts: number[];
  ledgeEvery: number | null;
  rows: MadeRow[];
  players: number;
  finished: number;
  you: MadeYou | null;
}

/* ---------------------------------------------------------------------------------------------- */

function newPlayer(bp: Blueprint, ctx: ModeContext, withStream: boolean): Pl {
  return {
    units: 0,
    streak: 0,
    rights: 0,
    powersEarned: 0,
    power: null,
    shield: false,
    double: false,
    frozen: false,
    lives: bp.kind.type === 'survive' ? bp.kind.lives : 0,
    out: false,
    outOrder: 0,
    place: null,
    ledge: 0,
    picks: 0,
    grid: bp.kind.type === 'collect' ? newGrid(bp, ctx) : null,
    opened: bp.kind.type === 'collect' ? Array.from({ length: COLLECT_CELLS }, () => false) : null,
    answered: 0,
    done: false,
    stream: withStream ? streamInit(ctx) : null,
    last: null,
    seq: 0,
  };
}

function newGrid(bp: Blueprint, ctx: ModeContext): number[] {
  const bag = [0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 3];
  const grid = Array.from({ length: COLLECT_CELLS }, () => ctx.rng.pick(bag));
  if (bp.kind.twist) for (const i of ctx.rng.shuffle(grid.map((_, j) => j)).slice(0, 2)) grid[i] = -1;
  return grid;
}

/** Spaces on a race track that jump you ahead: about one per eight spaces, never near the ends. */
export function placeShortcuts(length: number, ctx: ModeContext): number[] {
  const spaces = Array.from({ length: Math.max(0, length - SHORTCUT_JUMP - 3) }, (_, i) => i + 2);
  const count = Math.min(spaces.length, Math.max(1, Math.floor(length / 8)));
  return ctx.rng
    .shuffle(spaces)
    .slice(0, count)
    .sort((a, b) => a - b);
}

function name(ctx: ModeContext, id: PlayerId) {
  return ctx.player(id)?.name ?? 'A player';
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/* ---------------------------------------------------------------------------------------------- */

export function blueprintMeta(bp: Blueprint): ModeMeta {
  const k = bp.kind.type;
  const rules = describeBlueprint(bp);
  return {
    id: MADE_GAME_MODE_ID,
    title: bp.name,
    tagline: blueprintTagline(bp),
    description: rules.slice(0, 2).join(' '),
    category: k === 'build' || k === 'tug' ? 'party' : k === 'territory' || k === 'collect' ? 'strategy' : 'arcade',
    pacing: bp.pacing === 'rounds' ? 'host' : 'self',
    players: { min: 1, max: 200, recommended: '2 to 40' },
    duration: { min: 1, max: Math.max(1, Math.ceil(bp.end.timeLimitSec / 60)) },
    difficulty: bp.extras.powers.length || bp.answer.rule === 'chance' ? 2 : 1,
    teams: KIND_INFO[k].teams,
    questionTypes: QUESTION_TYPES,
    minQuestions: 3,
    common: { fields: [], defaults: { questionTimeSec: bp.end.questionTimeSec, timeLimitSec: bp.end.timeLimitSec, questionLimit: 0 } },
    rules: [...bp.howTo, ...rules],
    thumbnail: { glyph: bp.cover.glyph, hue: bp.cover.hue, accentHue: bp.look.accent },
    status: 'playable',
    stage: bp.look.dimension,
  };
}

/** Make a GameMode from a blueprint that passed parseBlueprint. */
export function blueprintMode(bp: Blueprint): GameMode<State, Record<string, never>, Action> {
  const k = bp.kind;
  const size = kindSize(k);
  const rounds = bp.pacing === 'rounds';
  const unit = bp.unit;

  /* ------------------------------ helpers over the state ------------------------------ */

  const active = (s: State, ctx: ModeContext) => ctx.players().filter((p) => s.players[p.id]);

  function teamOf(ctx: ModeContext, id: PlayerId): string | null {
    const p = ctx.player(id) ?? ctx.everyone().find((e) => e.id === id);
    if (k.type === 'tug') return p?.teamId ?? ctx.teams()[0]?.id ?? 'solo';
    return p?.teamId ?? null;
  }

  function score(s: State, id: PlayerId): number {
    if (k.type === 'territory') return s.tiles.reduce((n, t) => n + (t === id ? 1 : 0), 0);
    return s.players[id]?.units ?? 0;
  }

  function tugMargin(s: State, team: string): number {
    const mine = s.pulls[team] ?? 0;
    const others = Object.entries(s.pulls).filter(([t]) => t !== team).map(([, v]) => v);
    return mine - Math.max(0, ...others);
  }

  /** Rally: is this player in the back half of the field? */
  function inBackHalf(s: State, id: PlayerId, ctx: ModeContext): boolean {
    const ids = active(s, ctx).map((p) => p.id);
    if (ids.length < 2) return false;
    const mine = score(s, id);
    const ahead = ids.filter((o) => o !== id && score(s, o) > mine).length;
    return ahead + 1 > Math.ceil(ids.length / 2);
  }

  function eventNow(s: State, ctx: ModeContext): BlueprintEvent | null {
    if (!bp.extras.events.length) return null;
    if (rounds) {
      const r = s.sync?.round ?? -1;
      if (r < 0 || r % EVENT_ROUND_EVERY !== EVENT_ROUND_EVERY - 1) return null;
      return bp.extras.events[Math.floor(r / EVENT_ROUND_EVERY) % bp.extras.events.length]!;
    }
    return s.event && s.event.until > ctx.now() ? s.event.type : null;
  }

  function adjacent(a: number, b: number, n: number) {
    const ar = Math.floor(a / n);
    const br = Math.floor(b / n);
    return (ar === br && Math.abs(a - b) === 1) || (a % n === b % n && Math.abs(ar - br) === 1);
  }

  function friendly(ctx: ModeContext, a: PlayerId, b: PlayerId | null): boolean {
    if (!b) return false;
    if (a === b) return true;
    const ta = teamOf(ctx, a);
    return ta !== null && ta === teamOf(ctx, b);
  }

  /** Territory: claim up to n squares next to yours (or your team's). Returns how many were taken. */
  function claim(s: State, id: PlayerId, n: number, ctx: ModeContext, notes: string[]): number {
    const side = k.type === 'territory' ? k.grid : 1;
    let got = 0;
    for (let i = 0; i < n; i++) {
      const mine = s.tiles.map((t, j) => (friendly(ctx, id, t) ? j : -1)).filter((j) => j >= 0);
      const free = s.tiles.map((t, j) => (t === null ? j : -1)).filter((j) => j >= 0);
      const near = (cands: number[]) => cands.filter((c) => mine.some((m) => adjacent(c, m, side)));
      if (free.length) {
        const pool = near(free);
        s.tiles[ctx.rng.pick(pool.length ? pool : free)] = id;
        got++;
        continue;
      }
      if (k.type !== 'territory' || !k.twist) {
        if (!notes.includes('Map full')) notes.push('Map full');
        break;
      }
      // Steal: from the leader who is not on your side.
      const owners = [...new Set(s.tiles.filter((t): t is string => t !== null && !friendly(ctx, id, t)))];
      if (!owners.length) break;
      const leader = owners.sort((a, b) => score(s, b) - score(s, a) || a.localeCompare(b))[0]!;
      const theirs = s.tiles.map((t, j) => (t === leader ? j : -1)).filter((j) => j >= 0);
      const pool = near(theirs);
      s.tiles[ctx.rng.pick(pool.length ? pool : theirs)] = id;
      got++;
      if (!notes.includes('Steal')) notes.push('Steal');
    }
    return got;
  }

  function release(s: State, id: PlayerId, n: number): number {
    let lost = 0;
    for (let j = s.tiles.length - 1; j >= 0 && lost < n; j--) {
      if (s.tiles[j] === id) {
        s.tiles[j] = null;
        lost++;
      }
    }
    return lost;
  }

  /** Add a gain for a player in the kind's own terms. Returns what actually changed. */
  function gain(s: State, id: PlayerId, n: number, ctx: ModeContext, notes: string[]): number {
    const p = s.players[id]!;
    if (n <= 0) return 0;
    switch (k.type) {
      case 'race': {
        const before = p.units;
        p.units = Math.min(k.length, p.units + n);
        if (k.twist && p.units < k.length && s.shortcuts.includes(p.units)) {
          p.units = Math.min(k.length, p.units + SHORTCUT_JUMP);
          notes.push('Shortcut');
        }
        return p.units - before;
      }
      case 'climb': {
        const before = p.units;
        p.units = Math.min(k.height, p.units + n);
        if (k.twist) p.ledge = Math.max(p.ledge, Math.floor(p.units / 5) * 5);
        return p.units - before;
      }
      case 'collect': {
        const before = p.picks;
        p.picks = Math.min(MAX_PICKS, p.picks + n);
        return p.picks - before;
      }
      case 'build':
        s.tower += n;
        p.units += n;
        return n;
      case 'territory':
        return claim(s, id, n, ctx, notes);
      case 'survive':
        p.units += n;
        return n;
      case 'tug': {
        const team = teamOf(ctx, id)!;
        s.pulls[team] = (s.pulls[team] ?? 0) + n;
        p.units += n;
        return n;
      }
    }
  }

  /** Take a cost off a player in the kind's own terms. Returns how much was lost (positive). */
  function cost(s: State, id: PlayerId, n: number, ctx: ModeContext): number {
    const p = s.players[id]!;
    if (n <= 0) return 0;
    switch (k.type) {
      case 'race':
      case 'survive':
      case 'collect': {
        const before = p.units;
        p.units = Math.max(0, p.units - n);
        return before - p.units;
      }
      case 'climb': {
        const before = p.units;
        p.units = Math.max(k.twist ? p.ledge : 0, p.units - n);
        return before - p.units;
      }
      case 'build': {
        const before = s.tower;
        s.tower = Math.max(0, s.tower - n);
        return before - s.tower;
      }
      case 'territory':
        return release(s, id, n);
      case 'tug': {
        const team = teamOf(ctx, id)!;
        const before = s.pulls[team] ?? 0;
        s.pulls[team] = Math.max(0, before - n);
        return before - s.pulls[team]!;
      }
    }
  }

  function setLast(p: Pl, correct: boolean | null, amount: number, notes: string[]) {
    p.seq++;
    p.last = { seq: p.seq, correct, amount, notes };
  }

  function earnPower(p: Pl, id: PlayerId, ctx: ModeContext, notes: string[]) {
    if (!bp.extras.powers.length) return;
    if (p.rights % bp.extras.powerEvery !== 0 || p.power) return;
    p.power = bp.extras.powers[p.powersEarned % bp.extras.powers.length]!;
    p.powersEarned++;
    notes.push(`Power-up: ${POWER_INFO[p.power].label}`);
    ctx.feed(`You earned ${POWER_INFO[p.power].label}. Use it when you like.`, { to: [id] });
  }

  /** What one answer does, once graded. */
  function resolveAnswer(s: State, id: PlayerId, r: { correct: boolean; responseMs: number; limitMs: number; streak: number; double: boolean }, ctx: ModeContext) {
    const p = s.players[id]!;
    const notes: string[] = [];
    const a = bp.answer;
    p.streak = r.correct ? r.streak : 0;
    if (r.correct) {
      p.rights++;
      let n = a.right;
      if (a.rule === 'chance' && a.outcomes.length) {
        const total = a.outcomes.reduce((t, o) => t + o.weight, 0);
        let roll = ctx.rng.int(1, total);
        const hit = a.outcomes.find((o) => (roll -= o.weight) <= 0) ?? a.outcomes[a.outcomes.length - 1]!;
        n = hit.amount;
        notes.push(hit.label);
      }
      if (a.rule === 'points') {
        if (a.speed > 0 && r.limitMs > 0) {
          const bonus = Math.round(a.speed * Math.max(0, 1 - r.responseMs / r.limitMs));
          if (bonus > 0) {
            n += bonus;
            notes.push(`Quick +${bonus}`);
          }
        }
        if (a.streak > 0 && r.streak > 1) {
          const bonus = Math.min(a.streak, r.streak - 1);
          n += bonus;
          notes.push(`Streak +${bonus}`);
        }
      }
      if (k.type === 'tug' && k.twist && r.streak >= 3) {
        n *= 2;
        notes.push('Surge');
      }
      if (r.double) n *= 2;
      const ev = eventNow(s, ctx);
      if (ev === 'golden' && n > 0) {
        n *= 2;
        notes.push('Golden');
      }
      if (ev === 'rally' && inBackHalf(s, id, ctx)) {
        n += 1;
        notes.push('Rally +1');
      }
      if (p.double && n > 0) {
        n *= 2;
        p.double = false;
        notes.push('Double');
      }
      if (p.frozen) {
        n = 0;
        p.frozen = false;
        notes.push('Frozen');
      }
      if (k.type === 'survive' && k.twist && r.streak > 0 && r.streak % 5 === 0 && p.lives < k.lives) {
        p.lives++;
        notes.push('Life back');
      }
      const got = gain(s, id, n, ctx, notes);
      earnPower(p, id, ctx, notes);
      setLast(p, true, got, notes);
    } else {
      let lost = 0;
      if (p.shield) {
        p.shield = false;
        notes.push('Shield');
      } else {
        lost = cost(s, id, a.wrong, ctx);
        if (k.type === 'build' && k.twist) {
          lost += cost(s, id, 1, ctx);
          notes.push('Wind');
        }
        if (k.type === 'survive') {
          p.lives = Math.max(0, p.lives - 1);
          notes.push(p.lives === 0 ? 'Out' : `${p.lives} ${p.lives === 1 ? 'life' : 'lives'} left`);
          if (p.lives === 0) knockOut(s, id, ctx);
        }
      }
      setLast(p, false, -lost, notes);
    }
  }

  function knockOut(s: State, id: PlayerId, ctx: ModeContext) {
    const p = s.players[id]!;
    if (p.out) return;
    p.out = true;
    s.outCount++;
    p.outOrder = s.outCount;
    if (p.stream) p.stream.iid = null;
    ctx.feed(`${name(ctx, id)} is out.`, { tone: 'info' });
  }

  function reached(s: State, id: PlayerId, ctx: ModeContext): boolean {
    if (k.type === 'race' || k.type === 'climb' || k.type === 'collect') return score(s, id) >= size;
    if (k.type === 'tug') return tugMargin(s, teamOf(ctx, id)!) >= size;
    return false;
  }

  function finish(ctx: ModeContext, summary: string) {
    ctx.clearTimer('time');
    ctx.clearTimer('event');
    ctx.endGame(summary);
  }

  /** Check every way the game can end. Called after anything that changes scores or players. */
  function checkEnd(s: State, ctx: ModeContext): boolean {
    const players = active(s, ctx);
    if (bp.end.type === 'together' && k.type === 'build' && s.tower >= k.target) {
      s.coopWon = true;
      finish(ctx, `The tower is built: ${amountOf(s.tower, unit)}. Everyone wins together.`);
      return true;
    }
    if (bp.end.type === 'first') {
      const done = players.filter((p) => reached(s, p.id, ctx)).sort((a, b) => score(s, b.id) - score(s, a.id) || a.name.localeCompare(b.name));
      if (done.length) {
        for (const p of done) {
          if (s.players[p.id]!.place === null) {
            s.finishOrder.push(p.id);
            s.players[p.id]!.place = s.finishOrder.length;
          }
        }
        if (k.type === 'tug') {
          s.winnerTeam = teamOf(ctx, done[0]!.id);
          const team = ctx.teams().find((t) => t.id === s.winnerTeam);
          finish(ctx, `${team?.name ?? 'A team'} pulled the marker home.`);
        } else finish(ctx, `${name(ctx, s.finishOrder[0]!)} got there first.`);
        return true;
      }
    }
    if (k.type === 'survive') {
      const alive = players.filter((p) => !s.players[p.id]!.out);
      const started = Object.keys(s.players).length;
      if (alive.length === 0 || (bp.end.type === 'last' && started > 1 && alive.length <= 1)) {
        finish(ctx, alive.length === 1 ? `${alive[0]!.name} is the last one standing.` : 'Everyone is out.');
        return true;
      }
    }
    if (!rounds && players.length > 0 && players.every((p) => s.players[p.id]!.done || s.players[p.id]!.out)) {
      finish(ctx, 'Everyone has answered all their questions.');
      return true;
    }
    return false;
  }

  /* ------------------------------------- rounds ------------------------------------- */

  type SState = State & { sync: SyncState };
  const syncCfg: SyncConfig<SState> = {
    introMs: 3000,
    revealMs: 4000,
    leaderboardMs: 3500,
    autoAdvance: () => true,
    showLeaderboard: (s) => (s.sync?.round ?? 0) % 3 === 2,
    canAnswer: (s, id) => Boolean(s.players[id] && !s.players[id]!.out),
    // Scores live in the mode's own state; the round helper only grades, times and records.
    score: () => 0,
    onClosed(s, ctx) {
      const sync = s.sync!;
      const authored = sync.iid ? ctx.questions.get(ctx.questions.instance(sync.iid).qid) : null;
      const poll = sync.iid !== null && !ctx.questions.isGraded(sync.iid);
      const limitMs = sync.deadline - sync.startedAt;
      for (const p of ctx.players()) {
        const me = s.players[p.id];
        if (!me || me.out) continue;
        const ans = sync.answers[p.id];
        if (poll || (ans && ans.ungraded)) continue;
        if (!ans) {
          // No answer: no gain and no cost, but the streak is gone (the round helper reset it).
          me.streak = 0;
          setLast(me, null, 0, p.connected ? ['No answer'] : []);
          continue;
        }
        resolveAnswer(s, p.id, { correct: ans.correct, responseMs: ans.responseMs, limitMs, streak: sync.streaks[p.id] ?? 0, double: Boolean(authored?.doublePoints) }, ctx);
      }
      checkEnd(s, ctx);
    },
    isOver: () => false,
    onFinished(_s, ctx) {
      finish(ctx, 'That was the last question.');
    },
  };

  /* ------------------------------------- the mode ------------------------------------- */

  function rowsFor(s: State, ctx: ModeContext, viewer: Viewer): MadeRow[] {
    const all = ctx
      .players()
      .filter((p) => s.players[p.id])
      .map((p) => {
        const me = s.players[p.id]!;
        return { playerId: p.id, name: p.name, teamId: p.teamId, score: score(s, p.id), lives: k.type === 'survive' ? me.lives : null, out: me.out, place: me.place };
      })
      .sort((a, b) => (a.place ?? 1e9) - (b.place ?? 1e9) || Number(a.out) - Number(b.out) || b.score - a.score || a.name.localeCompare(b.name));
    const top = all.slice(0, viewer.kind === 'host' ? 40 : 8);
    if (viewer.kind === 'player') {
      const mine = all.find((r) => r.playerId === viewer.playerId);
      if (mine && !top.includes(mine)) top.push(mine);
    }
    return top;
  }

  function usePower(s: State, id: PlayerId, ctx: ModeContext): { error: string } | void {
    const p = s.players[id]!;
    if (!p.power) return { error: 'You have no power-up to use.' };
    if (p.out) return { error: 'You are out of this game.' };
    const power = p.power;
    p.power = null;
    const notes = [POWER_INFO[power].label];
    switch (power) {
      case 'double':
        p.double = true;
        setLast(p, null, 0, notes);
        break;
      case 'shield':
        p.shield = true;
        setLast(p, null, 0, notes);
        break;
      case 'leap': {
        const got = gain(s, id, 2, ctx, notes);
        setLast(p, null, got, notes);
        break;
      }
      case 'freeze': {
        const targets = active(s, ctx).filter((o) => !friendly(ctx, id, o.id) && !s.players[o.id]!.out);
        const target = targets.sort((a, b) => score(s, b.id) - score(s, a.id) || a.name.localeCompare(b.name))[0];
        if (target) {
          s.players[target.id]!.frozen = true;
          ctx.feed(`${name(ctx, id)} froze ${target.name}.`, { tone: 'info' });
        }
        setLast(p, null, 0, notes);
        break;
      }
      case 'gust': {
        const mine = score(s, id);
        const hit = active(s, ctx).filter((o) => !friendly(ctx, id, o.id) && score(s, o.id) > mine);
        for (const o of hit) cost(s, o.id, 1, ctx);
        if (hit.length) ctx.feed(`${name(ctx, id)} sent a gust: ${hit.length === 1 ? '1 player' : `${hit.length} players`} lost 1.`, { tone: 'info' });
        setLast(p, null, 0, notes);
        break;
      }
    }
    if (!(rounds && s.sync?.phase === 'done')) checkEnd(s, ctx);
  }

  function pick(s: State, id: PlayerId, cell: number, ctx: ModeContext): { error: string } | void {
    const p = s.players[id]!;
    if (k.type !== 'collect' || !p.grid || !p.opened) return { error: 'There is nothing to open in this game.' };
    if (p.out) return { error: 'You are out of this game.' };
    if (p.picks <= 0) return { error: 'Answer a question right to open a square.' };
    if (p.opened[cell]) return { error: 'That square is already open.' };
    p.picks--;
    p.opened[cell] = true;
    const v = p.grid[cell]!;
    const notes: string[] = [];
    let amount: number;
    if (v < 0) {
      amount = -cost(s, id, 1, ctx);
      notes.push('Trap');
    } else {
      p.units += v;
      amount = v;
      notes.push(v === 0 ? 'Empty' : `Found ${amountOf(v, unit)}`);
    }
    if (p.opened.every(Boolean)) {
      p.grid = newGrid(bp, ctx);
      p.opened = p.grid.map(() => false);
      notes.push('New grid');
    }
    setLast(p, null, amount, notes);
    checkEnd(s, ctx);
  }

  return defineMode<State, Record<string, never>, Action>({
    meta: blueprintMeta(bp),
    settings: [],
    defaults: { questionTimeSec: bp.end.questionTimeSec, timeLimitSec: bp.end.timeLimitSec, questionLimit: 0 },
    action,
    init(ctx) {
      const players: State['players'] = {};
      for (const p of ctx.players()) players[p.id] = newPlayer(bp, ctx, !rounds);
      // The blueprint's own limit, whatever the host's settings say, so every game ends.
      const endsAt = ctx.now() + bp.end.timeLimitSec * 1000;
      ctx.setTimer('time', endsAt);
      const s: State = {
        players,
        sync: null,
        endsAt,
        finishOrder: [],
        outCount: 0,
        tower: 0,
        tiles: k.type === 'territory' ? Array.from({ length: k.grid * k.grid }, () => null) : [],
        pulls: {},
        shortcuts: k.type === 'race' && k.twist ? placeShortcuts(k.length, ctx) : [],
        event: null,
        eventCount: 0,
        coopWon: false,
        winnerTeam: null,
      };
      if (k.type === 'tug') for (const t of ctx.teams()) s.pulls[t.id] = 0;
      if (k.type === 'tug' && !ctx.teams().length) s.pulls.solo = 0;
      if (rounds) {
        s.sync = syncInit(ctx, bp.end.questions);
        syncBegin(s as SState, syncCfg, ctx);
      } else if (bp.extras.events.length) ctx.setTimer('event', ctx.now() + EVENT_EVERY_MS);
      return s;
    },
    onPlayerJoin(s, p, ctx) {
      s.players[p.id] ??= newPlayer(bp, ctx, !rounds);
      if (s.sync) syncAddPlayer(s as SState, p.id);
      if (k.type === 'tug' && p.teamId) s.pulls[p.teamId] ??= 0;
    },
    onPlayerLeave(s, _p, ctx) {
      // Someone leaving can leave one player standing, or everyone left done.
      if (!(rounds && s.sync?.phase === 'done')) checkEnd(s, ctx);
    },
    onAction(s, id, a, ctx) {
      const p = s.players[id];
      if (!p) return { error: 'You are not in this game.' };
      if (a.type === 'power') return usePower(s, id, ctx);
      if (a.type === 'pick') return pick(s, id, a.cell, ctx);
      if (p.out) return { error: 'You are out of this game.' };
      if (rounds) return syncAnswer(s as SState, syncCfg, id, a.answer, ctx);
      if (!p.stream || p.done) return { error: 'You have answered all your questions.' };
      const res = streamSubmit(p.stream, id, a.iid, a.answer, ctx);
      if ('error' in res) return res;
      p.answered++;
      const authored = ctx.questions.get(ctx.questions.instance(a.iid).qid);
      // Own pace has no shared clock: the speed bonus counts against the game's time per question.
      resolveAnswer(s, id, { correct: res.correct, responseMs: res.responseMs, limitMs: bp.end.questionTimeSec * 1000, streak: res.streak, double: Boolean(authored.doublePoints) }, ctx);
      if (p.stream.last) {
        const l = p.last;
        if (l && l.amount !== 0) p.stream.last.text = `${l.amount > 0 ? '+' : ''}${amountOf(l.amount, unit)}${l.notes.length ? ` (${l.notes.join(', ')})` : ''}`;
        else if (l?.notes.length) p.stream.last.text = l.notes.join(', ');
      }
      if (p.answered >= bp.end.questions) p.done = true;
      if (checkEnd(s, ctx)) return;
      if (!p.done && !p.out) streamNext(p.stream, ctx);
    },
    onTimer(s, id, ctx) {
      if (id === 'time') {
        finish(ctx, 'Time is up.');
        return;
      }
      if (id === 'event' && !rounds && bp.extras.events.length) {
        const type = bp.extras.events[s.eventCount % bp.extras.events.length]!;
        s.eventCount++;
        s.event = { type, until: ctx.now() + EVENT_MS };
        ctx.feed(`${type === 'golden' ? 'Golden time' : 'Rally'} for 20 seconds.`, { tone: 'big' });
        ctx.setTimer('event', ctx.now() + EVENT_EVERY_MS);
        return;
      }
      if (s.sync) syncOnTimer(s as SState, syncCfg, id, ctx);
    },
    onHostNext(s, ctx) {
      if (!s.sync) return { error: 'Players answer at their own pace in this game.' };
      return syncHostNext(s as SState, syncCfg, ctx);
    },
    waitingOn(s, ctx) {
      return s.sync ? syncWaitingOn(s as SState, syncCfg, ctx) : null;
    },
    addTime(s, ms, ctx) {
      if (!s.sync) return { error: 'Players answer at their own pace in this game.' };
      return syncAddTime(s as SState, ms, ctx);
    },
    view(s, viewer, ctx): MadeView {
      const me = viewer.kind === 'player' ? s.players[viewer.playerId] : undefined;
      const ev = eventNow(s, ctx);
      const you: MadeYou | null = me
        ? {
            score: score(s, (viewer as { playerId: string }).playerId),
            lives: k.type === 'survive' ? me.lives : null,
            out: me.out,
            place: me.place,
            picks: me.picks,
            grid: me.grid && me.opened ? me.grid.map((v, i) => (me.opened![i] ? v : null)) : null,
            power: me.power,
            shield: me.shield,
            double: me.double,
            frozen: me.frozen,
            streak: me.streak,
            nextPowerIn: bp.extras.powers.length && !me.power ? bp.extras.powerEvery - (me.rights % bp.extras.powerEvery) : null,
            last: me.last,
            done: me.done,
            answered: me.answered,
            question: me.stream && !me.out && !me.done ? streamQuestionView(me.stream, ctx) : null,
            feedback: me.stream?.last ?? null,
          }
        : null;
      return {
        game: bp,
        endsAt: s.endsAt,
        sync: s.sync ? syncView(s as SState, syncCfg, viewer, ctx) : null,
        event: ev ? { type: ev, until: rounds ? null : (s.event?.until ?? null) } : null,
        tower: s.tower,
        tiles: k.type === 'territory' ? s.tiles : null,
        pulls: k.type === 'tug' ? Object.entries(s.pulls).map(([teamId, pulls]) => ({ teamId, pulls })) : null,
        shortcuts: s.shortcuts,
        ledgeEvery: k.type === 'climb' && k.twist ? 5 : null,
        rows: rowsFor(s, ctx, viewer),
        players: active(s, ctx).length,
        finished: s.finishOrder.length,
        you,
      };
    },
    results(s, ctx) {
      const everyone = ctx.everyone();
      const standings = everyone.map((p) => {
        const me = s.players[p.id];
        const sc = me ? score(s, p.id) : 0;
        let rank = sc;
        let label = amountOf(sc, unit);
        if (me && bp.end.type === 'first' && me.place !== null && k.type !== 'tug') {
          rank = size * 2 + (everyone.length - me.place + 1);
          label = `${ordinal(me.place)} home, ${amountOf(sc, unit)}`;
        } else if (me && k.type === 'survive' && bp.end.type === 'last') {
          rank = me.out ? me.outOrder : 10_000 + sc;
          label = me.out ? `Out, ${amountOf(sc, unit)}` : `Still in, ${amountOf(sc, unit)}`;
        } else if (k.type === 'build') label = `Added ${amountOf(sc, unit)}`;
        return { playerId: p.id, score: rank, label };
      });
      const teams = ctx.teams();
      let teamStandings: { teamId: string; score: number; label: string }[] | undefined;
      if (teams.length) {
        teamStandings = teams.map((t) => {
          const total = k.type === 'tug' ? (s.pulls[t.id] ?? 0) : everyone.filter((p) => teamOf(ctx, p.id) === t.id).reduce((n, p) => n + (s.players[p.id] ? score(s, p.id) : 0), 0);
          const bonus = s.winnerTeam === t.id ? 100_000 : 0;
          return { teamId: t.id, score: total + bonus, label: s.winnerTeam === t.id ? `Won, ${amountOf(total, unit)}` : amountOf(total, unit) };
        });
      }
      if (k.type === 'build' && bp.end.type === 'together') {
        return {
          standings,
          outcome: s.coopWon ? 'coop-win' : 'coop-loss',
          summary: s.coopWon ? `The tower was built: ${amountOf(s.tower, unit)}.` : `The tower reached ${amountOf(s.tower, unit)} of ${k.target}.`,
        };
      }
      return { standings, ...(teamStandings ? { teamStandings } : {}), outcome: 'competitive', summary: 'Final scores.' };
    },
    bot(view: MadeView, ctx) {
      const you = view?.you;
      if (!you || you.out) return null;
      const mind = ctx.mind;
      if (you.picks > 0 && you.grid) {
        const closed = you.grid.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
        if (closed.length) return { type: 'pick', cell: mind ? (mind.choose(closed, () => 0) ?? closed[0]!) : ctx.rng.pick(closed) };
      }
      if (you.power && (mind ? mind.chance(0.4 + 0.5 * mind.boldness()) : ctx.rng.chance(0.6))) return { type: 'power' };
      if (view.sync) {
        const sync = view.sync;
        if (sync.phase !== 'question' || !sync.question || !sync.you?.eligible || sync.you.answered) return null;
        return { type: 'answer', iid: sync.question.iid, answer: ctx.answer(sync.question.iid) };
      }
      const q = you.question;
      return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
    },
    botDelay(view: MadeView, rng) {
      const q = view?.sync?.question;
      if (view?.sync?.phase === 'question' && q?.deadline) {
        const window = Math.max(800, (q.deadline - q.shownAt) * 0.7);
        return 900 + rng.int(0, Math.round(window));
      }
      if (view?.you?.picks) return 500 + rng.int(0, 900);
      if (view?.sync) return 1000;
      return 1500 + rng.int(0, 3000);
    },
  });
}
