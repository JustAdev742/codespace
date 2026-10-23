/*
 * Glimgo: bingo where the calls are questions.
 *
 *   intro -> (call -> reveal)* -> finale -> done
 *
 * Every usable question has one short answer text. Each player gets their
 * own card of distinct answers, dealt with ctx.rng. A call shows a prompt
 * only; a player marks the square they think answers it. A mark counts only
 * if the square's answer is the call's answer (compared after
 * normalizeAnswerText); a wrong mark locks the player out of marking for a
 * few seconds. Every attempt is recorded with ctx.recordAnswer against the
 * called question. Calls favour answers that players still need, and each
 * question can be called twice at most (the second time only after every
 * useful question has had a turn), so the calls always run out eventually.
 *
 * Player views never say which square answers the open call: squares carry
 * only their text and whether they are marked.
 */
import { z } from 'zod';
import type { Media, Question } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { DEADLINE_GRACE_MS } from '../../mechanics/syncRounds.ts';
import { normalizeAnswerText } from '../../questions/grade.ts';
import { meta, settings } from './meta.ts';

export type WinRule = 'line' | 'two-lines' | 'full';
export interface Progress {
  /** Squares marked, not counting free ones. */
  marks: number;
  /** Completed rows, columns and diagonals. */
  lines: number;
  /** The fewest further marks that would meet the win condition. */
  toGo: number;
}
type Settings = { win: string; cardSize: string; callSeconds: number; lockoutSeconds: number; finders: number; luckyStars: boolean };
type Phase = 'intro' | 'call' | 'reveal' | 'finale' | 'done';

export interface Card {
  /** Answer index for each square, row by row. -1 is a free square. */
  cells: number[];
  /** The call number that marked each square, or 0 while it is unmarked. Free squares count as marked. */
  marks: number[];
}

interface Call {
  /** 1-based. */
  n: number;
  qid: string;
  iid: string;
  answer: number;
  startedAt: number;
  endsAt: number;
  closed: boolean;
  /** Players who marked it correctly. */
  found: number;
}

interface State {
  phase: Phase;
  phaseEndsAt: number | null;
  size: number;
  /** Distinct answers in play: normalised key and the text shown on squares. */
  answers: { key: string; text: string }[];
  /** Question ids that can be called. */
  pool: string[];
  answerOf: Record<string, number>;
  timesCalled: Record<string, number>;
  /** Times each answer has been called. */
  answerCalls: number[];
  calls: Call[];
  cards: Record<PlayerId, Card>;
  /** Each card's progress towards the win, kept up to date as squares are marked. */
  progress: Record<PlayerId, Progress>;
  /** Players who have marked the open call correctly. */
  found: Record<PlayerId, boolean>;
  lockedUntil: Record<PlayerId, number>;
  lastMark: Record<PlayerId, { n: number; square: number; ok: boolean }>;
  winner: PlayerId | null;
}

const action = z.object({ type: z.literal('mark'), iid: z.string().max(24), square: z.number().int().min(0).max(24) });
type Action = z.infer<typeof action>;

const TIMER = 'phase';
const INTRO_MS = 6000;
const REVEAL_MS = 3000;
const FINALE_MS = 5000;
const RECENT = 5;
/** Lucky stars: after every this many calls, the players furthest from Glimgo get a free square. */
export const LUCKY_EVERY = 5;

const opts = (ctx: ModeContext) => ctx.settings as Settings;
const winRule = (ctx: ModeContext): WinRule => {
  const w = opts(ctx).win;
  return w === 'two-lines' || w === 'full' ? w : 'line';
};

/** The one short answer a question has, as it would be written on a square. Null if it has none. */
export function glimgoAnswerText(q: Question): string | null {
  let text: string | undefined;
  switch (q.type) {
    case 'mcq':
      text = q.choices.find((c) => c.id === q.correct)?.text;
      break;
    case 'short':
      text = q.accepted[0];
      break;
    case 'numeric':
      text = `${q.answer}${q.unit ? ` ${q.unit}` : ''}`;
      break;
    case 'flashcard':
      text = q.back;
      break;
    default:
      return null;
  }
  const trimmed = text?.trim();
  return trimmed && normalizeAnswerText(trimmed) ? trimmed : null;
}

/** Card side length for a number of distinct answers and the host's choice. */
export function cardSizeFor(distinct: number, choice: string): number {
  if (choice === '3') return 3;
  if (choice === '4') return distinct >= 15 ? 4 : 3;
  return distinct >= 16 ? 4 : 3;
}

/** Rows, columns and both diagonals, as square indices. */
export function cardLines(size: number): number[][] {
  const idx = Array.from({ length: size }, (_, i) => i);
  return [
    ...idx.map((r) => idx.map((c) => r * size + c)),
    ...idx.map((c) => idx.map((r) => r * size + c)),
    idx.map((i) => i * size + i),
    idx.map((i) => i * size + (size - 1 - i)),
  ];
}

const isMarked = (card: Card, i: number) => card.cells[i] === -1 || (card.marks[i] ?? 0) > 0;

/**
 * Marked squares (not counting free ones), completed lines, and how many more marks the win needs.
 * Only lines with an answer square count: when a small set leaves many free squares, a row of them
 * alone is not a line, or the first correct mark anywhere would win.
 */
export function cardProgress(card: Card, size: number, win: WinRule): Progress {
  const marks = card.cells.filter((a, i) => a >= 0 && (card.marks[i] ?? 0) > 0).length;
  const playable = cardLines(size).filter((line) => line.some((i) => card.cells[i]! >= 0));
  // A card without a single answer square cannot be won (the game ends at once when the set has no answers).
  if (!playable.length) return { marks, lines: 0, toGo: size * size };
  const open = playable.map((line) => line.filter((i) => !isMarked(card, i)));
  const lines = open.filter((o) => o.length === 0).length;
  let toGo: number;
  if (win === 'full') toGo = card.cells.filter((_, i) => !isMarked(card, i)).length;
  else if (win === 'line') toGo = Math.min(...open.map((o) => o.length));
  else {
    toGo = Infinity;
    for (let a = 0; a < open.length; a++) {
      for (let b = a + 1; b < open.length; b++) toGo = Math.min(toGo, new Set([...open[a]!, ...open[b]!]).size);
    }
  }
  return { marks, lines, toGo };
}

function giveCard(s: State, playerId: PlayerId, ctx: ModeContext) {
  const card = dealCard(s, ctx);
  s.cards[playerId] = card;
  s.progress[playerId] = cardProgress(card, s.size, winRule(ctx));
}

function dealCard(s: State, ctx: ModeContext): Card {
  const count = s.size * s.size;
  const picked = ctx.rng.shuffle(s.answers.map((_, i) => i)).slice(0, count);
  const free = count - picked.length;
  const freeAt = new Set<number>();
  if (free > 0) {
    // Free squares go in the middle first, then anywhere.
    const middle = s.size === 3 ? [4] : ctx.rng.shuffle([5, 6, 9, 10]);
    const rest = ctx.rng.shuffle(Array.from({ length: count }, (_, i) => i).filter((i) => !middle.includes(i)));
    for (const i of [...middle, ...rest]) if (freeAt.size < free) freeAt.add(i);
  }
  const cells: number[] = [];
  let k = 0;
  for (let i = 0; i < count; i++) cells.push(freeAt.has(i) ? -1 : picked[k++]!);
  return { cells, marks: cells.map(() => 0) };
}

/** Squares match when their normalised answer texts are the same. */
function sameAnswer(s: State, a: number, b: number): boolean {
  return a >= 0 && b >= 0 && s.answers[a]?.key === s.answers[b]?.key;
}

function setPhase(s: State, ctx: ModeContext, phase: Phase, endsAt: number | null, timerAt: number | null = endsAt) {
  s.phase = phase;
  s.phaseEndsAt = endsAt;
  if (timerAt !== null) ctx.setTimer(TIMER, timerAt);
  else ctx.clearTimer(TIMER);
}

const openCall = (s: State): Call | undefined => (s.phase === 'call' ? s.calls[s.calls.length - 1] : undefined);

/** The next question to call, favouring answers that players (especially connected ones) still need. */
function nextCall(s: State, ctx: ModeContext): string | null {
  const need = s.answers.map(() => 0);
  for (const p of ctx.players()) {
    const card = s.cards[p.id];
    if (!card) continue;
    const weight = p.connected ? 4 : 1;
    card.cells.forEach((a, i) => {
      if (a >= 0 && !isMarked(card, i)) need[a] = (need[a] ?? 0) + weight;
    });
  }
  const usable = (times: number) => s.pool.filter((q) => (s.timesCalled[q] ?? 0) === times && (need[s.answerOf[q]!] ?? 0) > 0);
  let candidates = usable(0);
  if (!candidates.length) candidates = usable(1);
  if (!candidates.length) return null;
  if (!ctx.common.shuffleQuestions) return candidates[0]!;
  // Answers nobody has heard yet are three times as likely as repeats of an answer already called.
  const weights = candidates.map((q) => {
    const a = s.answerOf[q]!;
    return (need[a] ?? 0) * ((s.answerCalls[a] ?? 0) === 0 ? 3 : 1);
  });
  let r = ctx.rng.next() * weights.reduce((x, y) => x + y, 0);
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]!;
    if (r < 0) return candidates[i]!;
  }
  return candidates[candidates.length - 1]!;
}

function finish(s: State, ctx: ModeContext, summary: string) {
  s.phase = 'done';
  s.phaseEndsAt = null;
  ctx.clearTimer(TIMER);
  ctx.endGame(summary);
}

const WIN_TEXT: Record<WinRule, string> = { line: 'a line', 'two-lines': 'two lines', full: 'the whole card' };

function nameOf(ctx: ModeContext, id: PlayerId): string {
  return ctx.player(id)?.name ?? ctx.everyone().find((p) => p.id === id)?.name ?? 'A player';
}

function startCall(s: State, ctx: ModeContext) {
  const qid = nextCall(s, ctx);
  if (!qid) return finish(s, ctx, 'The calls ran out. Most marks wins.');
  const now = ctx.now();
  const call: Call = {
    n: s.calls.length + 1,
    qid,
    iid: ctx.questions.present(qid, { shuffle: false }),
    answer: s.answerOf[qid]!,
    startedAt: now,
    endsAt: now + opts(ctx).callSeconds * 1000,
    closed: false,
    found: 0,
  };
  s.calls.push(call);
  s.timesCalled[qid] = (s.timesCalled[qid] ?? 0) + 1;
  s.answerCalls[call.answer] = (s.answerCalls[call.answer] ?? 0) + 1;
  s.found = {};
  setPhase(s, ctx, 'call', call.endsAt, call.endsAt + DEADLINE_GRACE_MS);
}

/**
 * Lucky stars: the connected players furthest from Glimgo (when not everyone
 * is level) each get a free square on the line they are closest to
 * finishing, or anywhere open for a full card. Someone furthest away is at
 * least two marks from winning, so a star never wins the game by itself.
 */
function giveLuckyStars(s: State, ctx: ModeContext) {
  const win = winRule(ctx);
  const here = ctx.players().filter((p) => p.connected && s.cards[p.id] && s.progress[p.id]);
  if (here.length < 2) return;
  const toGo = here.map((p) => s.progress[p.id]!.toGo);
  const furthest = Math.max(...toGo);
  if (furthest <= Math.min(...toGo)) return;
  const lucky = here.filter((p) => s.progress[p.id]!.toGo === furthest);
  for (const p of lucky) {
    const card = s.cards[p.id]!;
    const open = win === 'full' ? [card.cells.map((_, i) => i).filter((i) => !isMarked(card, i))] : cardLines(s.size).map((line) => line.filter((i) => !isMarked(card, i)));
    const fewest = Math.min(...open.filter((o) => o.length > 0).map((o) => o.length));
    const squares = [...new Set(open.filter((o) => o.length === fewest).flat())].sort((a, b) => a - b);
    const square = ctx.rng.pick(squares);
    card.cells[square] = -1;
    card.marks[square] = 0;
    s.progress[p.id] = cardProgress(card, s.size, win);
  }
  ctx.feed('A lucky star! You were furthest from Glimgo, so one of your squares is now free.', { to: lucky.map((p) => p.id), tone: 'good' });
}

function closeCall(s: State, ctx: ModeContext) {
  const call = openCall(s);
  if (call) call.closed = true;
  setPhase(s, ctx, 'reveal', ctx.now() + REVEAL_MS);
  if (call && opts(ctx).luckyStars && call.n % LUCKY_EVERY === 0) giveLuckyStars(s, ctx);
}

function advance(s: State, ctx: ModeContext) {
  switch (s.phase) {
    case 'intro':
    case 'reveal':
      return startCall(s, ctx);
    case 'call':
      return closeCall(s, ctx);
    case 'finale':
      return finish(s, ctx, s.winner ? `${nameOf(ctx, s.winner)} completed ${WIN_TEXT[winRule(ctx)]} first.` : 'Glimgo!');
    case 'done':
      return;
  }
}

/** Does any connected player still have this answer unmarked on their card? */
function stillNeeded(s: State, ctx: ModeContext, answer: number): boolean {
  return ctx.players().some((p) => {
    const card = p.connected ? s.cards[p.id] : undefined;
    return Boolean(card?.cells.some((a, i) => sameAnswer(s, a, answer) && !isMarked(card, i)));
  });
}

function promptOf(ctx: ModeContext, qid: string): { prompt: string; media?: Media } {
  const q = ctx.questions.get(qid);
  return { prompt: q.prompt, ...(q.media ? { media: q.media } : {}) };
}

export const glimgo = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const ids = ctx.common.shuffleQuestions ? ctx.rng.shuffle(ctx.questions.ids()) : ctx.questions.ids().slice();
    const limited = ids.slice(0, Math.min(ids.length, ctx.common.questionLimit || Infinity));
    const answers: State['answers'] = [];
    const byKey = new Map<string, number>();
    const answerOf: Record<string, number> = {};
    const pool: string[] = [];
    for (const qid of limited) {
      const q = ctx.questions.get(qid);
      const text = glimgoAnswerText(q);
      if (!text) continue;
      // A number is one answer with or without its unit: "56 legs" shares the square of a "56" from
      // another question, and a square shared by different spellings shows the bare number.
      const bare = q.type === 'numeric' ? String(q.answer) : text;
      const key = normalizeAnswerText(bare);
      let a = byKey.get(key);
      if (a === undefined) {
        a = answers.length;
        answers.push({ key, text });
        byKey.set(key, a);
      } else if (answers[a]!.text !== text) {
        answers[a]!.text = bare;
      }
      answerOf[qid] = a;
      pool.push(qid);
    }
    const s: State = {
      phase: 'intro',
      phaseEndsAt: null,
      size: cardSizeFor(answers.length, opts(ctx).cardSize),
      answers,
      pool,
      answerOf,
      timesCalled: {},
      answerCalls: answers.map(() => 0),
      calls: [],
      cards: {},
      progress: {},
      found: {},
      lockedUntil: {},
      lastMark: {},
      winner: null,
    };
    for (const p of ctx.players()) giveCard(s, p.id, ctx);
    if (!pool.length) {
      finish(s, ctx, 'This set has no short answers to put on the cards.');
      return s;
    }
    setPhase(s, ctx, 'intro', ctx.now() + INTRO_MS);
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    if (!s.cards[p.id]) giveCard(s, p.id, ctx);
  },
  onAction(s, playerId, a, ctx) {
    if (s.phase === 'finale' || s.phase === 'done') return { error: 'The game is over.' };
    const call = openCall(s);
    if (!call) return { error: 'Wait for the next call.' };
    if (a.iid !== call.iid) return { error: 'That call has closed.' };
    const card = s.cards[playerId];
    if (!card) return { error: 'You do not have a card.' };
    const cell = card.cells[a.square];
    if (cell === undefined) return { error: 'That square is not on your card.' };
    if (cell < 0) return { error: 'That square is free.' };
    if (isMarked(card, a.square)) return { error: 'That square is already marked.' };
    if (s.found[playerId]) return { error: 'You already found this one. Wait for the next call.' };
    const now = ctx.now();
    const locked = s.lockedUntil[playerId] ?? 0;
    if (now < locked) return { error: `You are locked out for ${Math.ceil((locked - now) / 1000)} more seconds.` };
    if (now > call.endsAt + DEADLINE_GRACE_MS) return { error: 'That call has closed.' };

    const ok = sameAnswer(s, cell, call.answer);
    const responseMs = Math.max(0, Math.min(now - call.startedAt, call.endsAt - call.startedAt));
    ctx.recordAnswer({ playerId, qid: call.qid, correct: ok, partial: ok ? 1 : 0, responseMs, kind: 'attempt' });
    s.lastMark[playerId] = { n: call.n, square: a.square, ok };
    if (!ok) {
      const ms = opts(ctx).lockoutSeconds * 1000;
      if (ms > 0) s.lockedUntil[playerId] = now + ms;
      return;
    }
    card.marks[a.square] = call.n;
    s.found[playerId] = true;
    call.found++;
    const progress = cardProgress(card, s.size, winRule(ctx));
    s.progress[playerId] = progress;
    if (progress.toGo === 0) {
      s.winner = playerId;
      call.closed = true;
      ctx.feed(`${nameOf(ctx, playerId)} called Glimgo!`, { tone: 'big' });
      setPhase(s, ctx, 'finale', now + FINALE_MS);
      return;
    }
    // Everyone who could mark this call has (or as many as may): show the answer and move on.
    const finders = opts(ctx).finders;
    if ((finders > 0 && call.found >= finders) || !stillNeeded(s, ctx, call.answer)) closeCall(s, ctx);
  },
  onTimer(s, id, ctx) {
    if (id === TIMER) advance(s, ctx);
  },
  onHostNext(s, ctx) {
    if (s.phase === 'done') return { error: 'The game is over.' };
    advance(s, ctx);
  },
  view(s, viewer, ctx) {
    const win = winRule(ctx);
    const now = ctx.now();
    const current = openCall(s);
    const closed = s.calls.filter((c) => c.closed);
    const last = closed[closed.length - 1];
    const recent = closed
      .slice(-RECENT)
      .reverse()
      .map((c) => ({ n: c.n, ...promptOf(ctx, c.qid), text: s.answers[c.answer]?.text ?? '', found: c.found }));
    const progress = ctx
      .players()
      .filter((p) => s.progress[p.id])
      .map((p) => ({ playerId: p.id, name: p.name, ...s.progress[p.id]! }))
      .sort((a, b) => a.toGo - b.toGo || b.marks - a.marks || a.name.localeCompare(b.name));
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const card = me ? s.cards[me] : undefined;
    const winnerCard = s.winner ? s.cards[s.winner] : undefined;
    const squaresOf = (c: Card) => c.cells.map((a, i) => ({ text: a >= 0 ? (s.answers[a]?.text ?? '') : '', free: a < 0, marked: isMarked(c, i) }));
    return {
      // Read by the host controls to label the Next button.
      sync: { phase: s.phase, phaseEndsAt: s.phaseEndsAt },
      phase: s.phase,
      phaseEndsAt: s.phaseEndsAt,
      win,
      size: s.size,
      callCount: s.calls.length,
      // The open call: its prompt only, never its answer.
      call: current ? { iid: current.iid, n: current.n, ...promptOf(ctx, current.qid), startedAt: current.startedAt, endsAt: current.endsAt, found: current.found } : null,
      // The call that just closed, with its answer, while it is being revealed.
      revealed: (s.phase === 'reveal' || s.phase === 'finale') && last ? recent[0]! : null,
      recent,
      oneToGo: progress.filter((p) => p.toGo === 1).length,
      leaders: progress.slice(0, viewer.kind === 'host' ? 12 : 5),
      winner: s.winner
        ? { playerId: s.winner, name: nameOf(ctx, s.winner), squares: viewer.kind === 'host' && winnerCard ? squaresOf(winnerCard) : null }
        : null,
      you:
        card && me
          ? {
              squares: squaresOf(card),
              ...(s.progress[me] ?? cardProgress(card, s.size, win)),
              lockedUntil: (s.lockedUntil[me] ?? 0) > now ? s.lockedUntil[me]! : null,
              found: Boolean(current && s.found[me]),
              last: s.lastMark[me] ?? null,
            }
          : null,
    };
  },
  results(s, ctx) {
    const win = winRule(ctx);
    const standings = ctx.everyone().map((p) => {
      const card = s.cards[p.id];
      const pr = s.progress[p.id] ?? (card ? cardProgress(card, s.size, win) : { marks: 0, lines: 0, toGo: s.size * s.size });
      const won = s.winner === p.id;
      const marks = `${pr.marks} ${pr.marks === 1 ? 'mark' : 'marks'}`;
      return {
        playerId: p.id,
        score: (won ? 1_000_000 : 0) + pr.marks * 1000 + pr.lines * 50 + Math.max(0, 20 - pr.toGo),
        label: won ? `Glimgo! ${marks}` : pr.toGo === 1 ? `${marks}, one to go` : marks,
      };
    });
    return {
      standings,
      summary: s.winner ? `${nameOf(ctx, s.winner)} completed ${WIN_TEXT[win]} first.` : 'No Glimgo this time. Most marks wins.',
    };
  },
  bot(view, ctx) {
    const call = view?.call;
    const you = view?.you;
    if (view?.phase !== 'call' || !call || !you || you.found) return null;
    if (you.lockedUntil !== null && you.lockedUntil > ctx.now) return null;
    const open: { text: string; i: number }[] = [];
    (you.squares as { text: string; free: boolean; marked: boolean }[]).forEach((sq, i) => {
      if (!sq.free && !sq.marked) open.push({ text: normalizeAnswerText(sq.text), i });
    });
    if (!open.length) return null;
    // ctx.answer gives text for typed and number questions; for choice questions and flashcards it does not, so the bot guesses.
    const a = ctx.answer(call.iid);
    const said = a.type === 'short' ? a.text : a.type === 'numeric' ? String(a.value) : null;
    if (said !== null) {
      const want = normalizeAnswerText(said);
      const hit = want ? open.find((o) => o.text === want || o.text.startsWith(`${want} `)) : undefined;
      if (hit) return { type: 'mark', iid: call.iid, square: hit.i };
      // Not on this card, or the bot does not know it: usually wait, sometimes take a chance.
      if (!ctx.rng.chance(0.2)) return null;
    } else if (!ctx.rng.chance(0.5)) return null;
    // Answers already revealed are unlikely to be called again soon.
    const heard = new Set(((view.recent ?? []) as { text: string }[]).map((c) => normalizeAnswerText(c.text)));
    const fresh = open.filter((o) => !heard.has(o.text));
    const pick = ctx.rng.pick(fresh.length ? fresh : open);
    return { type: 'mark', iid: call.iid, square: pick.i };
  },
  botDelay(view, rng) {
    if (view?.phase === 'call') return 1200 + rng.int(0, 3800);
    return 1000;
  },
});
