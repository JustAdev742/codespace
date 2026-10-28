import { defineCheats } from '../registry.ts';
import type { ChaosApi, CheatDef } from '../types.ts';
import { odds, rollOdds, target } from '../cheats/kit.ts';
import { DEADLINE_GRACE_MS } from '../../mechanics/syncRounds.ts';
import { cardLines, cardProgress, LUCKY_EVERY, type Card, type WinRule } from '../../modes/glimgo/index.ts';

/*
 * Cheats that only make sense in Glimgo: they work the bingo cards (free
 * squares, marks, where squares sit), the lockout after a wrong square, and
 * the caller (how long a call lasts, which question is called next).
 *
 * Cards are structures, not numbers, so these cheats write the state directly
 * and cannot be undone. After every change to a card the player's progress is
 * recomputed the way the mode does it, and no cheat ever completes a card's
 * win: Glimgo is only ever called by a player's own mark. A square chaos marks
 * carries the number of the call that announced its answer, and a square chaos
 * frees becomes a free square exactly as a lucky star makes one, so every card
 * stays one the mode could have produced.
 */

const MODE = 'glimgo';
const MODES = [MODE] as const;
/** Every Glimgo game has the marks meter; needing it lets the chaos layer rank players by marks. */
const NEEDS = ['meter:marks'] as const;
const TIMER = 'phase';
const REVEAL_MS = 3000;
/** Long enough to outlast the longest call the host can set (60 seconds) and its grace. */
const CALL_SPAN_MS = 65_000;

interface Call {
  n: number;
  qid: string;
  iid: string;
  answer: number;
  startedAt: number;
  endsAt: number;
  closed: boolean;
  found: number;
}

/* -------------------------------- helpers ------------------------------- */

const st = (api: ChaosApi) => api.s;
const win = (api: ChaosApi): WinRule => {
  const w = api.ctx.settings.win;
  return w === 'two-lines' || w === 'full' ? w : 'line';
};
const cardOf = (api: ChaosApi, id: string): Card | undefined => st(api).cards[id];
const isMarked = (card: Card, i: number) => card.cells[i] === -1 || (card.marks[i] ?? 0) > 0;
const isAnswer = (card: Card, i: number) => (card.cells[i] ?? -1) >= 0;
const openCall = (api: ChaosApi): Call | undefined => (st(api).phase === 'call' ? st(api).calls.at(-1) : undefined);
const progressOf = (api: ChaosApi, card: Card) => cardProgress(card, st(api).size, win(api));
const sameAnswer = (api: ChaosApi, a: number, b: number) => a >= 0 && b >= 0 && st(api).answers[a]?.key === st(api).answers[b]?.key;
const clone = (card: Card): Card => ({ cells: card.cells.slice(), marks: card.marks.slice() });
/** Row and column of a square, for feed lines. */
const where = (api: ChaosApi, i: number) => `row ${Math.floor(i / st(api).size) + 1}, square ${(i % st(api).size) + 1}`;
const answerText = (api: ChaosApi, a: number) => st(api).answers[a]?.text ?? '?';

/** Recompute a player's progress the way the mode does after a mark. */
function refresh(api: ChaosApi, id: string) {
  const card = cardOf(api, id);
  if (card) st(api).progress[id] = progressOf(api, card);
}

function gameOn(api: ChaosApi): { error: string } | null {
  const s = st(api);
  return s.winner || s.phase === 'finale' || s.phase === 'done' ? { error: 'Somebody has already called Glimgo.' } : null;
}

function needCard(api: ChaosApi, id: string): Card | { error: string } {
  const no = gameOn(api);
  if (no) return no;
  return cardOf(api, id) ?? { error: `${api.name(id)} has no card.` };
}

/** Squares a lucky star may free on a card: on the line closest to finishing, or anywhere open for a whole-card game. */
function starSquares(api: ChaosApi, card: Card): number[] {
  const size = st(api).size;
  const open = win(api) === 'full' ? [card.cells.map((_, i) => i).filter((i) => !isMarked(card, i))] : cardLines(size).map((line) => line.filter((i) => !isMarked(card, i)));
  const sizes = open.filter((o) => o.length > 0).map((o) => o.length);
  if (!sizes.length) return [];
  const fewest = Math.min(...sizes);
  return [...new Set(open.filter((o) => o.length === fewest).flat())].sort((a, b) => a - b);
}

/** Make a square free, as a lucky star does. */
function free(card: Card, i: number) {
  card.cells[i] = -1;
  card.marks[i] = 0;
}

/** Move a square's answer and mark to another place on the card (and the player's last tap with it). */
function swapSquares(api: ChaosApi, id: string, card: Card, i: number, j: number) {
  [card.cells[i], card.cells[j]] = [card.cells[j]!, card.cells[i]!];
  [card.marks[i], card.marks[j]] = [card.marks[j]!, card.marks[i]!];
  const last = st(api).lastMark[id];
  if (last && (last.square === i || last.square === j)) last.square = last.square === i ? j : i;
}

/** Marks chaos may rub out: answer squares marked by an earlier call (the open call's find stays, so `found` stays true). */
function rubbable(api: ChaosApi, card: Card): number[] {
  const open = openCall(api)?.n;
  return card.cells.flatMap((a, i) => (a >= 0 && (card.marks[i] ?? 0) > 0 && card.marks[i] !== open ? [i] : []));
}

/** The lucky stars rule, as the mode runs it after every fifth call. Returns who got one. */
function luckyStars(api: ChaosApi): string[] {
  const s = st(api);
  const here = api.players().filter((p) => p.connected && s.cards[p.id] && s.progress[p.id]);
  if (here.length < 2) return [];
  const toGo = here.map((p) => s.progress[p.id].toGo as number);
  const furthest = Math.max(...toGo);
  if (furthest <= Math.min(...toGo)) return [];
  const lucky = here.filter((p) => s.progress[p.id].toGo === furthest).map((p) => p.id);
  for (const id of lucky) {
    const card = s.cards[id] as Card;
    const squares = starSquares(api, card);
    if (!squares.length) continue;
    free(card, api.rng.pick(squares));
    refresh(api, id);
  }
  api.feed('A lucky star! You were furthest from Glimgo, so one of your squares is now free.', 'good', lucky);
  return lucky;
}

/** Close the open call as the mode does: reveal its answer, then lucky stars on every fifth call if they are on. */
function closeCall(api: ChaosApi) {
  const s = st(api);
  const call = openCall(api);
  if (call) call.closed = true;
  s.phase = 'reveal';
  s.phaseEndsAt = api.now() + REVEAL_MS;
  api.ctx.setTimer(TIMER, s.phaseEndsAt);
  if (call && api.ctx.settings.luckyStars && call.n % LUCKY_EVERY === 0) luckyStars(api);
}

/** Start a call for a chosen question now, as the mode starts one. */
function startCall(api: ChaosApi, qid: string) {
  const s = st(api);
  const now = api.now();
  const call: Call = {
    n: s.calls.length + 1,
    qid,
    iid: api.ctx.questions.present(qid, { shuffle: false }),
    answer: s.answerOf[qid],
    startedAt: now,
    endsAt: now + Number(api.ctx.settings.callSeconds) * 1000,
    closed: false,
    found: 0,
  };
  s.calls.push(call);
  s.timesCalled[qid] = (s.timesCalled[qid] ?? 0) + 1;
  s.answerCalls[call.answer] = (s.answerCalls[call.answer] ?? 0) + 1;
  s.found = {};
  s.phase = 'call';
  s.phaseEndsAt = call.endsAt;
  api.ctx.setTimer(TIMER, call.endsAt + DEADLINE_GRACE_MS);
}

/** Does any connected player still have this answer unmarked? */
function stillNeeded(api: ChaosApi, answer: number): boolean {
  return api.players().some((p) => {
    const card = p.connected ? cardOf(api, p.id) : undefined;
    return Boolean(card?.cells.some((a, i) => sameAnswer(api, a, answer) && !isMarked(card, i)));
  });
}

/** After a mark the mode did not see, apply its rule for closing a call: enough finders, or nobody left needing it. */
function afterMark(api: ChaosApi, call: Call) {
  const finders = Number(api.ctx.settings.finders) || 0;
  if ((finders > 0 && call.found >= finders) || !stillNeeded(api, call.answer)) closeCall(api);
}

/** Change an open call's length, keeping its phase timer in step. */
function setCallEnd(api: ChaosApi, call: Call, endsAt: number) {
  call.endsAt = endsAt;
  st(api).phaseEndsAt = endsAt;
  api.ctx.setTimer(TIMER, endsAt + DEADLINE_GRACE_MS);
}

const markAction = (a: unknown): { square: number } | null => {
  const x = a as { type?: string; square?: number } | null;
  return x?.type === 'mark' && typeof x.square === 'number' ? { square: x.square } : null;
};

/** A key for a player's last tap, so lasting cheats can tell a new tap from an old one. */
const tapKey = (api: ChaosApi, id: string) => {
  const last = st(api).lastMark[id];
  return last ? `${last.n}:${last.square}:${last.ok}` : '';
};

/** The square Padlocked Glimgo Square locks: the lowest-numbered unmarked answer square on the target's closest line. */
export function padlockSquare(card: Card, size: number, rule: WinRule): number | null {
  const open = rule === 'full' ? [card.cells.map((_, i) => i).filter((i) => !isMarked(card, i))] : cardLines(size).map((line) => line.filter((i) => !isMarked(card, i)));
  const usable = open.map((o) => o.filter((i) => isAnswer(card, i))).filter((o) => o.length > 0);
  if (!usable.length) return null;
  const fewest = Math.min(...usable.map((o) => o.length));
  return Math.min(...usable.filter((o) => o.length === fewest).flat());
}

/** The question ids that may still be called (each at most twice), first-time calls first, whose answer passes `want`. */
function callable(api: ChaosApi, want: (answer: number) => boolean): string[] {
  const s = st(api);
  const fresh = (s.pool as string[]).filter((q) => (s.timesCalled[q] ?? 0) === 0 && want(s.answerOf[q]));
  if (fresh.length) return fresh;
  return (s.pool as string[]).filter((q) => (s.timesCalled[q] ?? 0) === 1 && want(s.answerOf[q]));
}

/* --------------------------------- cards -------------------------------- */

const cards: CheatDef[] = [
  {
    id: 'glimgo.lucky-star',
    name: 'Glimgo Wishing Star',
    category: 'advantage',
    description: 'A lucky star just for you: one unmarked square on the line you are closest to finishing (anywhere open in a whole-card game) becomes a free square. Refused when you are one square from Glimgo, so it never wins the game for you.',
    target: 'self',
    modes: MODES,
    needs: NEEDS,
    cost: 40,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const card = needCard(api, c.caster);
      if ('error' in card) return card;
      if (progressOf(api, card).toGo < 2) return { error: 'You are one square from Glimgo: a star would win it for you.' };
      const i = api.rng.pick(starSquares(api, card));
      free(card, i);
      refresh(api, c.caster);
      api.feed(`Glimgo Wishing Star: your square at ${where(api, i)} is now free.`, 'good', [c.caster]);
    },
  },
  {
    id: 'glimgo.star-shower',
    name: 'Glimgo Star Shower',
    category: 'round',
    description: 'Hands out lucky stars now, exactly as the Lucky Stars rule does: the connected players furthest from Glimgo (when not everyone is level) each get a free square on their closest line.',
    target: 'room',
    modes: MODES,
    needs: NEEDS,
    cost: 35,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api) => {
      const no = gameOn(api);
      if (no) return no;
      const lucky = luckyStars(api);
      if (!lucky.length) return { error: 'Everyone is level, so nobody is furthest behind.' };
      api.feed(`Glimgo Star Shower: lucky stars for ${lucky.map((id) => api.name(id)).join(', ')}.`, 'info');
    },
  },
  {
    id: 'glimgo.ink-blot',
    name: 'Glimgo Ink Blot',
    category: 'troll',
    description: 'Rubs out one of an opponent\'s marks: the one that sets them furthest back from Glimgo. Never a free square, and never the mark they made on the call that is open now.',
    target: 'opponent',
    modes: MODES,
    needs: NEEDS,
    cost: 30,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const card = needCard(api, t);
      if ('error' in card) return card;
      const options = rubbable(api, card).map((i) => {
        const after = clone(card);
        after.marks[i] = 0;
        return { i, p: progressOf(api, after) };
      });
      if (!options.length) return { error: `${api.name(t)} has no mark that can be rubbed out.` };
      const best = options.sort((x, y) => y.p.toGo - x.p.toGo || x.p.lines - y.p.lines || x.i - y.i)[0]!;
      const text = answerText(api, card.cells[best.i]!);
      card.marks[best.i] = 0;
      refresh(api, t);
      api.feed(`Glimgo Ink Blot: your mark on "${text}" was rubbed out.`, 'bad', [t]);
    },
  },
  {
    id: 'glimgo.mark-snatch',
    name: 'Glimgo Mark Snatch',
    category: 'troll',
    description: 'Take one of an opponent\'s marks: it is rubbed out on their card and marked on yours, where you have the same answer unmarked. Never the mark from the open call, and never one that would complete your card.',
    target: 'opponent',
    modes: MODES,
    needs: NEEDS,
    cost: 40,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const theirs = needCard(api, t);
      if ('error' in theirs) return theirs;
      const mine = needCard(api, c.caster);
      if ('error' in mine) return mine;
      const options = rubbable(api, theirs).flatMap((i) => {
        const j = mine.cells.findIndex((a, k) => sameAnswer(api, a, theirs.cells[i]!) && !isMarked(mine, k));
        if (j < 0) return [];
        const after = clone(mine);
        after.marks[j] = theirs.marks[i]!;
        const p = progressOf(api, after);
        return p.toGo >= 1 ? [{ i, j, toGo: p.toGo }] : [];
      });
      if (!options.length) return { error: `${api.name(t)} has no mark you could take.` };
      const pick = options.sort((x, y) => x.toGo - y.toGo || x.i - y.i)[0]!;
      mine.marks[pick.j] = theirs.marks[pick.i]!;
      theirs.marks[pick.i] = 0;
      refresh(api, t);
      refresh(api, c.caster);
      api.feed(`Glimgo Mark Snatch: ${api.name(c.caster)} took ${api.name(t)}'s mark on "${answerText(api, mine.cells[pick.j]!)}".`, 'bad');
    },
  },
  {
    id: 'glimgo.card-swap',
    name: 'Glimgo Card Switcheroo',
    category: 'troll',
    description: 'You and an opponent trade cards, marks and all. Only when they are ahead of you (fewer squares to go, or as many with more marks).',
    target: 'opponent',
    modes: MODES,
    needs: NEEDS,
    cost: 60,
    cooldownMs: 120_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const theirs = needCard(api, t);
      if ('error' in theirs) return theirs;
      const mine = needCard(api, c.caster);
      if ('error' in mine) return mine;
      const s = st(api);
      const a = s.progress[c.caster];
      const b = s.progress[t];
      if (!(b.toGo < a.toGo || (b.toGo === a.toGo && b.marks > a.marks))) return { error: `${api.name(t)} is not ahead of you.` };
      [s.cards[c.caster], s.cards[t]] = [theirs, mine];
      [s.progress[c.caster], s.progress[t]] = [b, a];
      // A find on the open call and the last tap belong to the card they were made on.
      const fa = s.found[c.caster];
      const fb = s.found[t];
      delete s.found[c.caster];
      delete s.found[t];
      if (fb) s.found[c.caster] = true;
      if (fa) s.found[t] = true;
      const la = s.lastMark[c.caster];
      const lb = s.lastMark[t];
      delete s.lastMark[c.caster];
      delete s.lastMark[t];
      if (lb) s.lastMark[c.caster] = lb;
      if (la) s.lastMark[t] = la;
      api.feed(`Glimgo Card Switcheroo: ${api.name(c.caster)} and ${api.name(t)} traded cards.`, 'big');
    },
  },
  {
    id: 'glimgo.scramble',
    name: 'Scrambled Glimgo Card',
    category: 'troll',
    description: 'Rearranges an opponent\'s squares, marks and all, into the layout that leaves them furthest from Glimgo out of 20 random shuffles. Refused when no shuffle would set them back.',
    target: 'opponent',
    modes: MODES,
    needs: NEEDS,
    cost: 35,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const card = needCard(api, t);
      if ('error' in card) return card;
      const now = progressOf(api, card);
      const n = card.cells.length;
      let best: { order: number[]; toGo: number; lines: number } | null = null;
      for (let k = 0; k < 20; k++) {
        const order = api.rng.shuffle(Array.from({ length: n }, (_, i) => i));
        const p = progressOf(api, { cells: order.map((i) => card.cells[i]!), marks: order.map((i) => card.marks[i]!) });
        if (!best || p.toGo > best.toGo || (p.toGo === best.toGo && p.lines < best.lines)) best = { order, toGo: p.toGo, lines: p.lines };
      }
      if (!best || (best.toGo <= now.toGo && best.lines >= now.lines)) return { error: `No shuffle would set ${api.name(t)} back.` };
      const order = best.order;
      const cells = order.map((i) => card.cells[i]!);
      const marks = order.map((i) => card.marks[i]!);
      card.cells.splice(0, n, ...cells);
      card.marks.splice(0, n, ...marks);
      const last = st(api).lastMark[t];
      if (last) last.square = order.indexOf(last.square);
      refresh(api, t);
      api.feed(`Scrambled Glimgo Card: ${api.name(t)}'s card was shuffled.`, 'bad');
    },
  },
  {
    id: 'glimgo.sliding-tile',
    name: 'Glimgo Sliding Tile',
    category: 'advantage',
    description: 'One of your marked squares slides into a better place: it swaps with an unmarked square so you end up one or more squares closer to Glimgo, but never at it. Not in a whole-card game, where places do not matter.',
    target: 'self',
    modes: MODES,
    needs: NEEDS,
    cost: 35,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const card = needCard(api, c.caster);
      if ('error' in card) return card;
      if (win(api) === 'full') return { error: 'In a whole-card game, where squares sit does not matter.' };
      const now = progressOf(api, card);
      let best: { i: number; j: number; toGo: number } | null = null;
      for (let i = 0; i < card.cells.length; i++) {
        if (!isAnswer(card, i) || !isMarked(card, i)) continue;
        for (let j = 0; j < card.cells.length; j++) {
          if (!isAnswer(card, j) || isMarked(card, j)) continue;
          const after = clone(card);
          [after.cells[i], after.cells[j]] = [after.cells[j]!, after.cells[i]!];
          [after.marks[i], after.marks[j]] = [after.marks[j]!, after.marks[i]!];
          const p = progressOf(api, after);
          if (p.toGo >= 1 && p.toGo < now.toGo && (!best || p.toGo < best.toGo)) best = { i, j, toGo: p.toGo };
        }
      }
      if (!best) return { error: 'No slide would bring you closer without winning outright.' };
      swapSquares(api, c.caster, card, best.i, best.j);
      refresh(api, c.caster);
      api.feed(`Glimgo Sliding Tile: your mark moved to ${where(api, best.j)}.`, 'good', [c.caster]);
    },
  },
  {
    id: 'glimgo.gamble',
    name: 'Dauber\'s Gamble',
    category: 'random',
    description: `Gamble with your own card. Odds: ${odds([['one unmarked square on your closest line becomes free', 50], ['one of your marks (not from the open call) is rubbed out', 50]])}. Needs you at least two squares from Glimgo and a mark to lose.`,
    target: 'self',
    modes: MODES,
    needs: NEEDS,
    cost: 20,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const card = needCard(api, c.caster);
      if ('error' in card) return card;
      const marks = rubbable(api, card);
      if (progressOf(api, card).toGo < 2 || !marks.length) return { error: 'The gamble needs you at least two squares from Glimgo and a mark to lose.' };
      if (rollOdds<'win' | 'lose'>(api, [['win', 50], ['lose', 50]]) === 'win') {
        const i = api.rng.pick(starSquares(api, card));
        free(card, i);
        api.feed(`Dauber's Gamble: you won a free square at ${where(api, i)}.`, 'good', [c.caster]);
      } else {
        const i = api.rng.pick(marks);
        card.marks[i] = 0;
        api.feed(`Dauber's Gamble: you lost your mark at ${where(api, i)}.`, 'bad', [c.caster]);
      }
      refresh(api, c.caster);
    },
  },
];

/* ---------------------------- marks and lockouts ------------------------ */

const marking: CheatDef[] = [
  {
    id: 'glimgo.inkstorm',
    name: 'Glimgo Inkstorm',
    category: 'troll',
    description: 'Every other player is locked out of marking for 4 seconds, as if they had tapped a wrong square. Only while a call is open.',
    target: 'everyone-else',
    modes: MODES,
    needs: NEEDS,
    cost: 40,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const no = gameOn(api);
      if (no) return no;
      if (!openCall(api)) return { error: 'Wait for a call to open.' };
      const until = api.now() + 4000;
      const s = st(api);
      for (const id of c.targets) if ((s.lockedUntil[id] ?? 0) < until) s.lockedUntil[id] = until;
      api.feed(`Glimgo Inkstorm: everyone but ${api.name(c.caster)} is locked out for 4 seconds.`, 'bad');
    },
  },
  {
    id: 'glimgo.butterfingers',
    name: 'Dauber Butterfingers',
    category: 'troll',
    description: 'For 30 seconds, every wrong square an opponent taps locks them out for 5 more seconds on top of the room\'s lockout.',
    target: 'opponent',
    modes: MODES,
    needs: NEEDS,
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 30_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const card = needCard(api, target(c));
      if ('error' in card) return card;
      if (fx) fx.data.tap = tapKey(api, target(c));
    },
    hooks: {
      tick: (api, fx) => {
        const t = target(fx);
        const s = st(api);
        const last = s.lastMark[t];
        if (tapKey(api, t) === fx.data.tap) return;
        fx.data.tap = tapKey(api, t);
        if (!last || last.ok || gameOn(api)) return;
        s.lockedUntil[t] = Math.max(s.lockedUntil[t] ?? 0, api.now()) + 5000;
        api.feed('Butterfingers: that wrong square locks you out for 5 more seconds.', 'bad', [t]);
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Butterfingers: wrong squares cost 5 more seconds', until: fx.endsAt }),
  },
  {
    id: 'glimgo.steady-hand',
    name: 'Dauber\'s Steady Hand',
    category: 'advantage',
    description: 'For 25 seconds, any lockout you get from a wrong square is lifted within a quarter of a second (and one you have now is lifted at once).',
    target: 'self',
    modes: MODES,
    needs: [...NEEDS, 'lockout'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 25_000,
    tickMs: 250,
    apply: (api, c) => {
      const card = needCard(api, c.caster);
      if ('error' in card) return card;
      const s = st(api);
      if ((s.lockedUntil[c.caster] ?? 0) > api.now()) s.lockedUntil[c.caster] = api.now();
    },
    hooks: {
      tick: (api, fx) => {
        const s = st(api);
        if ((s.lockedUntil[fx.caster] ?? 0) > api.now()) s.lockedUntil[fx.caster] = api.now();
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Steady hand: no lockouts', until: fx.endsAt }),
  },
  {
    id: 'glimgo.benched',
    name: 'Glimgo Benched',
    category: 'troll',
    description: 'An opponent cannot mark any square during the call that is open now (or the next call, if none is open).',
    target: 'opponent',
    modes: MODES,
    needs: NEEDS,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: CALL_SPAN_MS + REVEAL_MS + 3000,
    tickMs: 500,
    stacking: 'reject',
    apply: (api, c, fx) => {
      const card = needCard(api, target(c));
      if ('error' in card) return card;
      const call = openCall(api);
      if (call && st(api).found[target(c)]) return { error: `${api.name(target(c))} already found this call.` };
      if (fx) fx.data.n = call ? call.n : st(api).calls.length + 1;
    },
    hooks: {
      gate: (api, fx, _id, action) => (markAction(action) && openCall(api)?.n === fx.data.n ? { block: 'You are benched for this call.' } : undefined),
      tick: (api, fx) => {
        const n = Number(fx.data.n);
        const call: Call | undefined = st(api).calls[n - 1];
        if (call && (call.closed || openCall(api)?.n !== n)) api.endEffect(fx.eid, 'used');
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Benched for a call', tone: 'bad' }),
  },
  {
    id: 'glimgo.padlock',
    name: 'Padlocked Glimgo Square',
    category: 'troll',
    description: 'For 30 seconds, the unmarked square an opponent most needs (the first one on their closest line) cannot be marked.',
    target: 'opponent',
    modes: MODES,
    needs: NEEDS,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 30_000,
    apply: (api, c, fx) => {
      const card = needCard(api, target(c));
      if ('error' in card) return card;
      const sq = padlockSquare(card, st(api).size, win(api));
      if (sq === null) return { error: `${api.name(target(c))} has no unmarked square to lock.` };
      if (fx) {
        fx.data.square = sq;
        fx.data.text = answerText(api, card.cells[sq]!);
      }
    },
    hooks: {
      gate: (_api, fx, _id, action) => (markAction(action)?.square === fx.data.square ? { block: 'That square is padlocked for a few seconds.' } : undefined),
    },
    overlay: (fx) => ({ kind: 'badge', text: `Padlocked: "${String(fx.data.text)}"`, tone: 'bad' }),
  },
  {
    id: 'glimgo.chain-reaction',
    name: 'Glimgo Chain Reaction',
    category: 'advantage',
    description: 'Your next right square (within 30 seconds) also turns one unmarked square beside it (up, down, left or right) into a free square: the one that brings you closest to Glimgo without completing your card.',
    target: 'self',
    modes: MODES,
    needs: NEEDS,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 30_000,
    tickMs: 250,
    stacking: 'reject',
    apply: (api, c, fx) => {
      const card = needCard(api, c.caster);
      if ('error' in card) return card;
      if (fx) fx.data.tap = tapKey(api, c.caster);
    },
    hooks: {
      tick: (api, fx) => {
        if (gameOn(api)) return;
        const id = fx.caster;
        const last = st(api).lastMark[id];
        if (tapKey(api, id) === fx.data.tap) return;
        fx.data.tap = tapKey(api, id);
        const card = cardOf(api, id);
        if (!last?.ok || !card) return;
        const size = st(api).size;
        const r = Math.floor(last.square / size);
        const col = last.square % size;
        const near = [
          [r - 1, col],
          [r + 1, col],
          [r, col - 1],
          [r, col + 1],
        ]
          .filter(([y, x]) => y! >= 0 && y! < size && x! >= 0 && x! < size)
          .map(([y, x]) => y! * size + x!)
          .filter((i) => isAnswer(card, i) && !isMarked(card, i))
          .map((i) => {
            const after = clone(card);
            free(after, i);
            return { i, toGo: progressOf(api, after).toGo };
          })
          .filter((o) => o.toGo >= 1)
          .sort((a, b) => a.toGo - b.toGo || a.i - b.i);
        const pick = near[0];
        if (pick) {
          free(card, pick.i);
          refresh(api, id);
          api.feed(`Glimgo Chain Reaction: your square at ${where(api, pick.i)} went free too.`, 'good', [id]);
        }
        api.endEffect(fx.eid, 'used');
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Chain reaction armed', until: fx.endsAt }),
  },
  {
    id: 'glimgo.copycat',
    name: 'Copycat Dauber',
    category: 'advantage',
    description: 'For 25 seconds, whenever an opponent marks a right square, the same answer is marked on your card too, if you have it unmarked and it would not complete your card.',
    target: 'opponent',
    hostile: false,
    modes: MODES,
    needs: NEEDS,
    cost: 35,
    cooldownMs: 50_000,
    durationMs: 25_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const card = needCard(api, c.caster);
      if ('error' in card) return card;
      if (!cardOf(api, target(c))) return { error: `${api.name(target(c))} has no card.` };
      if (fx) fx.data.tap = tapKey(api, target(c));
    },
    hooks: {
      tick: (api, fx) => {
        if (gameOn(api)) return;
        const t = target(fx);
        if (tapKey(api, t) === fx.data.tap) return;
        fx.data.tap = tapKey(api, t);
        const s = st(api);
        const last = s.lastMark[t];
        const theirs = cardOf(api, t);
        const mine = cardOf(api, fx.caster);
        if (!last?.ok || !theirs || !mine) return;
        const answer = theirs.cells[last.square]!;
        const j = mine.cells.findIndex((a, k) => sameAnswer(api, a, answer) && !isMarked(mine, k));
        if (j < 0) return;
        const after = clone(mine);
        after.marks[j] = last.n;
        if (progressOf(api, after).toGo < 1) return;
        mine.marks[j] = last.n;
        refresh(api, fx.caster);
        api.feed(`Copycat Dauber: you copied "${answerText(api, answer)}" from ${api.name(t)}.`, 'good', [fx.caster]);
        const call = openCall(api);
        if (call && call.n === last.n && !s.found[fx.caster]) {
          s.found[fx.caster] = true;
          call.found++;
          afterMark(api, call);
        }
      },
    },
    overlayFor: 'caster',
    overlay: (fx) => ({ kind: 'countdown', label: 'Copycat: copying a rival\'s marks', until: fx.endsAt }),
  },
];

/* -------------------------------- the caller ----------------------------- */

const caller: CheatDef[] = [
  {
    id: 'glimgo.hold-call',
    name: 'Hold the Glimgo Call',
    category: 'round',
    description: 'The call that is open now stays open 10 seconds longer.',
    target: 'room',
    modes: MODES,
    needs: NEEDS,
    cost: 20,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api) => {
      const no = gameOn(api);
      if (no) return no;
      const call = openCall(api);
      if (!call) return { error: 'No call is open.' };
      setCallEnd(api, call, Math.max(call.endsAt, api.now()) + 10_000);
      api.feed('Hold the Glimgo Call: this call stays open 10 seconds longer.', 'info');
    },
  },
  {
    id: 'glimgo.hurry-caller',
    name: 'Hurry the Glimgo Caller',
    category: 'troll',
    description: 'The call that is open now closes at once: its answer is shown and the next call follows, as when its time runs out.',
    target: 'room',
    hostile: true,
    modes: MODES,
    needs: NEEDS,
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api) => {
      const no = gameOn(api);
      if (no) return no;
      if (!openCall(api)) return { error: 'No call is open.' };
      closeCall(api);
      api.feed('Hurry the Glimgo Caller: that call is closed.', 'bad');
    },
  },
  {
    id: 'glimgo.encore',
    name: 'Glimgo Encore Call',
    category: 'round',
    description: 'During a reveal, the question just revealed is called again straight away (each question can still be called at most twice). Only when somebody still needs its answer.',
    target: 'room',
    modes: MODES,
    needs: NEEDS,
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const no = gameOn(api);
      if (no) return no;
      const s = st(api);
      const last: Call | undefined = s.calls.at(-1);
      if (s.phase !== 'reveal' || !last) return { error: 'An encore only works while a call is being revealed.' };
      if ((s.timesCalled[last.qid] ?? 0) >= 2) return { error: 'That question has already been called twice.' };
      if (!stillNeeded(api, last.answer)) return { error: 'Nobody still needs that answer.' };
      startCall(api, last.qid);
      api.feed('Glimgo Encore Call: that one is called again!', 'big');
    },
  },
  {
    id: 'glimgo.rigged-draw',
    name: 'Rigged Glimgo Draw',
    category: 'advantage',
    description: 'During a reveal, the next call comes at once and is drawn from answers you still need on your card (each question can still be called at most twice).',
    target: 'self',
    modes: MODES,
    needs: NEEDS,
    cost: 40,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const card = needCard(api, c.caster);
      if ('error' in card) return card;
      if (st(api).phase !== 'reveal') return { error: 'The draw can only be rigged while a call is being revealed.' };
      const want = (a: number) => card.cells.some((x, i) => sameAnswer(api, x, a) && !isMarked(card, i));
      const options = callable(api, want);
      if (!options.length) return { error: 'No question left to call has an answer you need.' };
      startCall(api, api.rng.pick(options));
    },
  },
  {
    id: 'glimgo.first-dibs',
    name: 'Glimgo First Dibs',
    category: 'troll',
    description: 'Once you find the call that is open now, nobody else can mark it, and it closes within a quarter of a second.',
    target: 'room',
    modes: MODES,
    needs: NEEDS,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: CALL_SPAN_MS,
    tickMs: 250,
    stacking: 'stack',
    apply: (api, c, fx) => {
      const card = needCard(api, c.caster);
      if ('error' in card) return card;
      const call = openCall(api);
      if (!call) return { error: 'No call is open.' };
      if (st(api).found[c.caster]) return { error: 'You already found this call.' };
      if (fx) fx.data.n = call.n;
    },
    hooks: {
      gate: (api, fx, id, action) => {
        if (id === fx.caster || !markAction(action)) return;
        if (openCall(api)?.n === fx.data.n && st(api).found[fx.caster]) return { block: `${api.name(fx.caster)} had first dibs on this call.` };
      },
      tick: (api, fx) => {
        const call = openCall(api);
        if (!call || call.n !== fx.data.n) {
          api.endEffect(fx.eid, 'used');
          return;
        }
        if (!st(api).found[fx.caster]) return;
        closeCall(api);
        api.feed(`Glimgo First Dibs: ${api.name(fx.caster)} found it first, so the call is closed.`, 'bad');
        api.endEffect(fx.eid, 'used');
      },
    },
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'First dibs on this call', tone: 'info' }),
  },
  {
    id: 'glimgo.tempo',
    name: 'Glimgo Caller\'s Tempo',
    category: 'round',
    description: 'For 40 seconds, every call (the open one included) lasts half as long as the room\'s setting, or one and a half times as long: your choice. A call that is cut short keeps at least 1 more second.',
    target: 'room',
    modes: MODES,
    needs: NEEDS,
    params: [
      {
        key: 'tempo',
        label: 'Tempo',
        kind: 'choice',
        options: [
          { value: 'fast', label: 'Fast: half as long' },
          { value: 'slow', label: 'Slow: one and a half times as long' },
        ],
        default: 'fast',
      },
    ],
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 40_000,
    tickMs: 250,
    stacking: 'reject',
    apply: (api, c, fx) => {
      const no = gameOn(api);
      if (no) return no;
      if (fx) {
        fx.data.factor = c.params.tempo === 'slow' ? 1.5 : 0.5;
        fx.data.done = 0;
        retime(api, fx.data);
      }
    },
    hooks: { tick: (api, fx) => retime(api, fx.data) },
    overlayFor: 'all',
    overlay: (fx) => ({ kind: 'badge', text: Number(fx.data.factor) < 1 ? 'Fast calls' : 'Slow calls', tone: 'info' }),
  },
];

/** Give the open call its new length once (Caller's Tempo). */
function retime(api: ChaosApi, data: Record<string, unknown>) {
  const call = openCall(api);
  if (!call || call.n === data.done) return;
  data.done = call.n;
  const want = call.startedAt + Math.round(Number(api.ctx.settings.callSeconds) * 1000 * Number(data.factor));
  setCallEnd(api, call, Math.max(want, api.now() + 1000));
}

const cheats: CheatDef[] = [...cards, ...marking, ...caller];

defineCheats(cheats);
