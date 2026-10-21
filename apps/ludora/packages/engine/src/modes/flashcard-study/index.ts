/*
 * Flashcard Study: a Leitner-style session. Every question is a card in box
 * 1. "Knew it" moves a card up a box, "Not yet" sends it back to box 1, and
 * box 3 means mastered.
 *
 * Scheduling counts cards shown, not time. Every card has a step at which it
 * is due: new cards in deck order, a box 1 card two cards after it was
 * graded, a box 2 card five cards after. The next card is the one due
 * soonest, so lower boxes come up more often, and new cards keep arriving
 * even while some are being missed over and over.
 *
 * The back of the card is only in the view once the player has turned it.
 */
import { z } from 'zod';
import { defineMode } from '../../sdk/define.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { answerText } from './answer-text.ts';
import { meta, settings } from './meta.ts';

type Settings = { quick: boolean };

export const MASTERED_BOX = 3;
/** Cards graded before a card in this box is due again. New cards already waiting can come first. */
export const RETURN_GAP: Readonly<Record<number, number>> = { 1: 2, 2: 5 };
const DEFAULT_LIMIT_SEC = 600;

interface Card {
  qid: string;
  iid: string;
  flipped: boolean;
  flippedAt: number | null;
}

interface Study {
  /** This player's deck order. */
  order: string[];
  /** Box of every card in the session, 1 to 3. */
  boxes: Record<string, number>;
  /** The step (cards graded so far) at which each card is next due. */
  due: Record<string, number>;
  /** When each card was last scheduled. Of two cards due together, the later one goes first. */
  scheduled: Record<string, number>;
  step: number;
  seq: number;
  card: Card | null;
  knew: number;
  notYet: number;
  mastered: number;
  last: { knew: boolean; box: number; mastered: boolean } | null;
  done: boolean;
  doneAt: number | null;
}

export interface State {
  /** Question ids in this session. */
  cards: string[];
  students: Record<PlayerId, Study>;
  endsAt: number;
}

const iid = z.string().max(24);
const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('flip'), iid }),
  z.object({ type: z.literal('grade'), iid, knew: z.boolean() }),
]);
type Action = z.infer<typeof action>;

/** The card due soonest, other than the one just graded unless it is the only one left. */
export function nextDue(st: Pick<Study, 'order' | 'boxes' | 'due' | 'scheduled'>, justGraded: string | null): string | null {
  let best: string | null = null;
  for (const qid of st.order) {
    if ((st.boxes[qid] ?? 1) >= MASTERED_BOX || qid === justGraded) continue;
    const better = best === null || st.due[qid]! < st.due[best]! || (st.due[qid] === st.due[best] && st.scheduled[qid]! > st.scheduled[best]!);
    if (better) best = qid;
  }
  if (best === null && justGraded !== null && (st.boxes[justGraded] ?? 1) < MASTERED_BOX) best = justGraded;
  return best;
}

function showNext(st: Study, justGraded: string | null, ctx: ModeContext) {
  const qid = nextDue(st, justGraded);
  if (qid === null) {
    st.card = null;
    st.done = true;
    st.doneAt = ctx.now();
    return;
  }
  st.card = { qid, iid: ctx.questions.present(qid), flipped: false, flippedAt: null };
}

function newStudy(cards: readonly string[], ctx: ModeContext): Study {
  const order = ctx.common.shuffleQuestions ? ctx.rng.shuffle(cards) : cards.slice();
  const st: Study = {
    order,
    boxes: Object.fromEntries(order.map((qid) => [qid, 1])),
    due: Object.fromEntries(order.map((qid, i) => [qid, i])),
    scheduled: Object.fromEntries(order.map((qid, i) => [qid, i])),
    step: 0,
    seq: order.length,
    card: null,
    knew: 0,
    notYet: 0,
    mastered: 0,
    last: null,
    done: false,
    doneAt: null,
  };
  showNext(st, null, ctx);
  return st;
}

const allDone = (s: State, ctx: ModeContext) => {
  const active = ctx.players().filter((p) => s.students[p.id]);
  return active.length > 0 && active.every((p) => s.students[p.id]!.done);
};

function cardView(c: Card, st: Study, ctx: ModeContext) {
  const shown = ctx.questions.view(c.iid);
  const q = ctx.questions.get(c.qid);
  return {
    iid: c.iid,
    q: shown.q,
    shownAt: shown.shownAt,
    box: st.boxes[c.qid] ?? 1,
    flipped: c.flipped,
    // The back exists in the view only after the card has been turned over.
    ...(c.flipped ? { back: answerText(q), ...(q.explanation ? { explanation: q.explanation } : {}) } : {}),
  };
}

function accuracy(st: Study | undefined) {
  const graded = (st?.knew ?? 0) + (st?.notYet ?? 0);
  return graded ? Math.round(((st?.knew ?? 0) / graded) * 100) : 0;
}

export const flashcardStudy = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: { timeLimitSec: DEFAULT_LIMIT_SEC },
  action,
  init(ctx) {
    const ids = ctx.common.shuffleQuestions ? ctx.rng.shuffle(ctx.questions.ids()) : ctx.questions.ids().slice();
    const cards = ids.slice(0, ctx.common.questionLimit || ids.length);
    const students: State['students'] = {};
    for (const p of ctx.players()) students[p.id] = newStudy(cards, ctx);
    const limitSec = ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec : DEFAULT_LIMIT_SEC;
    const endsAt = ctx.now() + limitSec * 1000;
    ctx.setTimer('time', endsAt);
    return { cards, students, endsAt };
  },
  onPlayerJoin(s, p, ctx) {
    s.students[p.id] ??= newStudy(s.cards, ctx);
  },
  onPlayerLeave(s, _p, ctx) {
    if (ctx.players().length === 0 || allDone(s, ctx)) ctx.endGame(allDone(s, ctx) ? 'Every card is mastered.' : 'Study session over.');
  },
  onAction(s, playerId, a, ctx) {
    const st = s.students[playerId];
    if (!st) return { error: 'You are not in this game.' };
    const c = st.card;
    if (!c) return { error: 'There are no cards left to study.' };
    if (a.iid !== c.iid) return { error: 'That card has already been put away.' };
    if (a.type === 'flip') {
      if (c.flipped) return { error: 'That card is already turned over.' };
      c.flipped = true;
      c.flippedAt = ctx.now();
      return;
    }
    if (!c.flipped) return { error: 'Turn the card over first.' };
    const inst = ctx.questions.instance(c.iid);
    // Self-grades count like answers, so teachers can see which cards were hard.
    ctx.recordAnswer({ playerId, qid: c.qid, correct: a.knew, partial: a.knew ? 1 : 0, responseMs: (c.flippedAt ?? ctx.now()) - inst.shownAt, kind: 'self' });
    const from = st.boxes[c.qid] ?? 1;
    const box = a.knew ? (ctx.settings.quick ? MASTERED_BOX : Math.min(MASTERED_BOX, from + 1)) : 1;
    st.boxes[c.qid] = box;
    if (a.knew) st.knew++;
    else st.notYet++;
    st.step++;
    if (box >= MASTERED_BOX) st.mastered++;
    else {
      st.due[c.qid] = st.step + (RETURN_GAP[box] ?? 2);
      st.scheduled[c.qid] = st.seq++;
    }
    st.last = { knew: a.knew, box, mastered: box >= MASTERED_BOX };
    st.card = null;
    showNext(st, c.qid, ctx);
    if (st.done && allDone(s, ctx)) ctx.endGame('Every card is mastered.');
  },
  onTimer(_s, id, ctx) {
    if (id === 'time') ctx.endGame('Time is up.');
  },
  view(s, viewer, ctx) {
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const st = me ? s.students[me] : undefined;
    const inBox = (study: Study, box: number) => s.cards.filter((qid) => study.boxes[qid] === box).length;
    return {
      endsAt: s.endsAt,
      total: s.cards.length,
      quick: ctx.settings.quick,
      rows: ctx
        .players()
        .filter((p) => s.students[p.id])
        .map((p) => {
          const study = s.students[p.id]!;
          return { playerId: p.id, name: p.name, mastered: study.mastered, accuracy: accuracy(study), done: study.done };
        })
        .sort((a, b) => b.mastered - a.mastered || a.name.localeCompare(b.name)),
      you: st
        ? {
            mastered: st.mastered,
            box1: inBox(st, 1),
            box2: inBox(st, 2),
            knew: st.knew,
            notYet: st.notYet,
            accuracy: accuracy(st),
            done: st.done,
            card: st.card ? cardView(st.card, st, ctx) : null,
            last: st.last,
          }
        : null,
    };
  },
  results(s, ctx) {
    const total = s.cards.length;
    const standings = ctx.everyone().map((pl) => {
      const st = s.students[pl.id];
      const mastered = st?.mastered ?? 0;
      const acc = accuracy(st);
      // Cards mastered decide the order; accuracy breaks a tie.
      return { playerId: pl.id, score: mastered * 1000 + acc, label: `${mastered} of ${total} mastered, knew ${acc}%` };
    });
    const done = allDone(s, ctx);
    return { standings, outcome: done ? 'coop-win' : 'competitive', summary: done ? 'Every card is mastered.' : 'Study session over.' };
  },
  bot(view, ctx) {
    const card = view?.you?.card;
    if (!card) return null;
    if (!card.flipped) return { type: 'flip', iid: card.iid };
    const a = ctx.answer(card.iid);
    return { type: 'grade', iid: card.iid, knew: a.type === 'flashcard' ? a.knew : ctx.rng.chance(ctx.skill) };
  },
  botDelay(view, rng) {
    return view?.you?.card?.flipped ? 600 + rng.int(0, 900) : 1200 + rng.int(0, 2300);
  },
});
