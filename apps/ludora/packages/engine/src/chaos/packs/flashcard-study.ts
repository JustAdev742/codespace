import { odds, rollOdds } from '../cheats/kit.ts';
import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';
import { MASTERED_BOX, nextDue, RETURN_GAP, reversible } from '../../modes/flashcard-study/index.ts';
import { answerText } from '../../modes/flashcard-study/answer-text.ts';
import { meta } from '../../modes/flashcard-study/meta.ts';

/*
 * Cheats that only make sense in Flashcard Study. It is a study session for
 * one (no score, no rivals), so every cheat is for yourself and works on the
 * Leitner boxes, the schedule, the card on the table and the session clock:
 * put a card off, promote it, pull the box 2 cards forward, bring a mastered
 * card back, turn a card around, get a hint, or bend the "Knew it" /
 * "Not yet" rules for a while.
 *
 * The mode's rules, kept here as modes/flashcard-study/index.ts does them:
 *  - Only the session ends the session: chaos never masters a player's last
 *    card (they finish that one themselves), so nobody is left "done" without
 *    the mode noticing. The session clock can be given time back, never taken.
 *  - A card put away is rescheduled the mode's way (due step and order), and
 *    the next card is presented as the mode presents it (a new instance, the
 *    right way round).
 *  - A card is only ever turned around when the mode's Answer side first
 *    setting could have turned it (a single written answer).
 *  - Chaos never records an answer, so the teacher's report only counts real
 *    grades.
 * All of these write the state directly, so the instant ones are not undoable.
 */

const MODE = 'flashcard-study';
const M = [MODE] as const;
const id = (slug: string) => `${MODE}.${slug}`;
const DEFAULT_LIMIT_SEC = meta.common.defaults.timeLimitSec!;
const OVERTIME_MS = 120_000;

const studyOf = (api: ChaosApi, pid: string): any => api.s.students?.[pid] ?? null;
const unmastered = (st: any): string[] => st.order.filter((q: string) => (st.boxes[q] ?? 1) < MASTERED_BOX);

/** The player's study record with a card on the table, or why not. */
function studying(api: ChaosApi, pid: string): any | { error: string } {
  const st = studyOf(api, pid);
  if (!st || st.done || !st.card) return { error: 'You have no card to study right now.' };
  return st;
}

/** Show the next card due, as the mode does after a grade. */
function showNext(api: ChaosApi, st: any, justPut: string) {
  const qid = nextDue(st, justPut)!;
  const reversed = Boolean(api.ctx.settings.reverse) && reversible(api.ctx.questions.get(qid));
  st.card = { qid, iid: api.ctx.questions.present(qid), flipped: false, flippedAt: null, ...(reversed ? { reversed } : {}) };
}

/**
 * Lasting effects watch grades: between two looks the step moves on by one
 * when a card was graded, and the card graded is the one that was on the
 * table at the last look.
 */
function watch(api: ChaosApi, fx: ActiveEffect | null, pid: string) {
  const st = studyOf(api, pid);
  if (fx && st) Object.assign(fx.data, { step: st.step, qid: st.card?.qid ?? null, boxes: { ...st.boxes } });
}

function graded(api: ChaosApi, fx: ActiveEffect): { st: any; qid: string; before: number } | null {
  const st = studyOf(api, fx.caster);
  if (!st) return null;
  const was = { step: Number(fx.data.step), qid: fx.data.qid as string | null, boxes: fx.data.boxes as Record<string, number> };
  watch(api, fx, fx.caster);
  if (st.step <= was.step || !was.qid || !st.last) return null;
  return { st, qid: was.qid, before: was.boxes[was.qid] ?? 1 };
}

/**
 * Put the card on the table away in `box` without grading it, and deal the
 * next card. A card left below mastered is due `gap` cards later (the box's
 * own gap by default), scheduled the way the mode schedules a graded card.
 */
function putAway(api: ChaosApi, st: any, box: number, gap = RETURN_GAP[box] ?? 2) {
  const qid = st.card.qid;
  st.boxes[qid] = box;
  if (box >= MASTERED_BOX) st.mastered++;
  else {
    st.due[qid] = st.step + gap;
    st.scheduled[qid] = st.seq++;
  }
  st.card = null;
  showNext(api, st, qid);
}

/** One box up, as "Knew it" moves a card (straight to mastered in Quick review). */
const boxUp = (api: ChaosApi, st: any) => (api.ctx.settings.quick ? MASTERED_BOX : Math.min(MASTERED_BOX, (st.boxes[st.card.qid] ?? 1) + 1));

/** What is on the back of the card on the table, as the mode would show it once turned over. */
function backOf(api: ChaosApi, card: { qid: string; reversed?: boolean }): string {
  const q = api.ctx.questions.get(card.qid);
  return card.reversed ? q.prompt : answerText(q);
}

const HINT_WORDS = 8;

/** The first letter (or digit) of each word, as "P… o… t…". Null when there is nothing to hint at. */
function initials(text: string): string | null {
  const firsts = text
    .split(/\s+/)
    .map((w) => w.match(/[\p{L}\p{N}]/u)?.[0])
    .filter((c): c is string => Boolean(c));
  if (!firsts.length) return null;
  const shown = firsts.slice(0, HINT_WORDS).map((c) => `${c}…`).join(' ');
  return firsts.length > HINT_WORDS ? `${shown} and ${firsts.length - HINT_WORDS} more words` : shown;
}

const secondsText = (ms: number) => (ms % 60_000 === 0 ? `${ms / 60_000} ${ms === 60_000 ? 'minute' : 'minutes'}` : `${Math.round(ms / 1000)} seconds`);

const LOTTERY: readonly ['up' | 'down', number][] = [
  ['up', 50],
  ['down', 50],
];

const cheats: CheatDef[] = [
  {
    id: id('slip-card'),
    name: 'Slip It Under the Pile',
    category: 'advantage',
    description: 'The card on the table is slipped back under the pile without being graded: it comes back two cards later, and the next card due is dealt now. Not when it is the only card left to study.',
    target: 'self',
    modes: M,
    cost: 15,
    cooldownMs: 20_000,
    undoable: false,
    apply: (api, c) => {
      const st = studying(api, c.caster);
      if ('error' in st) return st;
      const qid = st.card.qid;
      if (unmastered(st).length < 2) return { error: 'This is the only card left to study.' };
      st.due[qid] = st.step + 2;
      st.scheduled[qid] = st.seq++;
      st.card = null;
      showNext(api, st, qid);
      api.feed('You slipped that card under the pile. It will be back soon.', 'info', [c.caster]);
    },
  },
  {
    id: id('box-boost'),
    name: 'Lucky Promotion',
    category: 'advantage',
    description: 'The card on the table moves up a box as if you knew it (straight to mastered in Quick review), without being graded or counted as an answer, and the next card is dealt. Never your last card left to study.',
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const st = studying(api, c.caster);
      if ('error' in st) return st;
      const qid = st.card.qid;
      const box = api.ctx.settings.quick ? MASTERED_BOX : Math.min(MASTERED_BOX, (st.boxes[qid] ?? 1) + 1);
      if (box >= MASTERED_BOX && unmastered(st).length < 2) return { error: 'That is your last card: master it yourself.' };
      st.boxes[qid] = box;
      if (box >= MASTERED_BOX) st.mastered++;
      else {
        st.due[qid] = st.step + (RETURN_GAP[box] ?? 2);
        st.scheduled[qid] = st.seq++;
      }
      st.card = null;
      showNext(api, st, qid);
      api.feed(box >= MASTERED_BOX ? 'Lucky promotion: that card is mastered.' : `Lucky promotion: that card moved up to box ${box}.`, 'good', [c.caster]);
    },
  },
  {
    id: id('cram'),
    name: 'Cram Session',
    category: 'round',
    description: 'Cram the cards you nearly know: every card in box 2 comes up next, before any new or box 1 card. The card on the table stays where it is.',
    target: 'self',
    modes: M,
    cost: 15,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const st = studying(api, c.caster);
      if ('error' in st) return st;
      const box2 = unmastered(st).filter((q) => st.boxes[q] === 2 && q !== st.card.qid);
      if (!box2.length) return { error: 'You have no other cards in box 2.' };
      const rest = unmastered(st).filter((q) => !box2.includes(q));
      const first = Math.min(st.step, ...rest.map((q) => st.due[q] ?? st.step)) - 1;
      for (const q of box2) {
        st.due[q] = first;
        st.scheduled[q] = st.seq++;
      }
      api.feed(`Cram session: your ${box2.length} box 2 cards come next.`, 'info', [c.caster]);
    },
  },
  {
    id: id('quick-recall'),
    name: 'Quick Recall',
    category: 'advantage',
    description: 'For 30 seconds Quick review rules apply to you: a card you mark "Knew it" is mastered at once instead of moving up one box. Never your last card left. Not in a Quick review session, where that is already the rule.',
    target: 'self',
    modes: M,
    cost: 35,
    cooldownMs: 75_000,
    durationMs: 30_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      if (api.ctx.settings.quick) return { error: 'This session is already a Quick review.' };
      const st = studying(api, c.caster);
      if ('error' in st) return st;
      watch(api, fx, c.caster);
    },
    hooks: {
      tick: (api, fx) => {
        const g = graded(api, fx);
        if (!g || !g.st.last.knew) return;
        const { st, qid } = g;
        if ((st.boxes[qid] ?? 1) >= MASTERED_BOX || st.card?.qid === qid || unmastered(st).length < 2) return;
        st.boxes[qid] = MASTERED_BOX;
        st.mastered++;
        st.last = { ...st.last, box: MASTERED_BOX, mastered: true };
        fx.data.boxes = { ...st.boxes };
        api.feed('Quick recall: that card is mastered.', 'good', [fx.caster]);
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Quick recall', tone: 'good' }),
  },
  {
    id: id('safety-net'),
    name: 'Safety Net',
    category: 'advantage',
    description: 'For 30 seconds "Not yet" does not send a card back to box 1: it stays in the box it was in and comes back when that box’s cards are due.',
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 30_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const st = studying(api, c.caster);
      if ('error' in st) return st;
      watch(api, fx, c.caster);
    },
    hooks: {
      tick: (api, fx) => {
        const g = graded(api, fx);
        if (!g || g.st.last.knew || g.before <= 1 || g.st.boxes[g.qid] !== 1) return;
        const { st, qid, before } = g;
        st.boxes[qid] = before;
        st.due[qid] = st.step + (RETURN_GAP[before] ?? 2);
        st.last = { ...st.last, box: before };
        fx.data.boxes = { ...st.boxes };
        api.feed(`Safety net: that card stays in box ${before}.`, 'good', [fx.caster]);
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Safety net', tone: 'good' }),
  },
  {
    id: id('rapid-review'),
    name: 'Rapid Review',
    category: 'advantage',
    description: 'For 45 seconds, every card you grade that is not mastered comes round again after just one other card, instead of two (box 1) or five (box 2). A new card already waiting can still come first.',
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 45_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const st = studying(api, c.caster);
      if ('error' in st) return st;
      if (unmastered(st).length < 2) return { error: 'This is the only card left to study.' };
      watch(api, fx, c.caster);
    },
    hooks: {
      tick: (api, fx) => {
        const g = graded(api, fx);
        if (!g) return;
        const { st, qid } = g;
        if ((st.boxes[qid] ?? 1) >= MASTERED_BOX || st.card?.qid === qid || st.due[qid] <= st.step + 1) return;
        st.due[qid] = st.step + 1;
        api.feed('Rapid review: that card comes round again after one more.', 'info', [fx.caster]);
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Rapid review', tone: 'good' }),
  },
  {
    id: id('lottery'),
    name: 'Study Lottery',
    category: 'random',
    description: `Draw a ticket for the card on the table. Odds: ${odds([
      ['it moves up a box as if you knew it (straight to mastered in Quick review)', 50],
      ['it goes back to box 1 and comes round again two cards later', 50],
    ])}. It is not graded or counted as an answer, and the next card is dealt. Not when it is the only card left to study.`,
    target: 'self',
    modes: M,
    cost: 20,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const st = studying(api, c.caster);
      if ('error' in st) return st;
      if (unmastered(st).length < 2) return { error: 'This is the only card left to study.' };
      if (rollOdds(api, LOTTERY) === 'up') {
        const box = boxUp(api, st);
        putAway(api, st, box);
        api.feed(box >= MASTERED_BOX ? 'Study lottery: a winning ticket, and that card is mastered.' : `Study lottery: a winning ticket, and that card moved up to box ${box}.`, 'good', [c.caster]);
      } else {
        putAway(api, st, 1);
        api.feed('Study lottery: no luck. That card went back to box 1 and comes round again soon.', 'bad', [c.caster]);
      }
    },
  },
  {
    id: id('pop-quiz'),
    name: 'Pop Quiz',
    category: 'round',
    description: 'One card you have already mastered (each equally likely) is back for a pop quiz: it drops to box 2 and comes up straight after the card on the table. Mark it "Knew it" again to master it again.',
    target: 'self',
    modes: M,
    cost: 15,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const st = studying(api, c.caster);
      if ('error' in st) return st;
      const done = st.order.filter((q: string) => (st.boxes[q] ?? 1) >= MASTERED_BOX);
      if (!done.length) return { error: 'You have not mastered any cards yet.' };
      const qid: string = api.rng.pick(done);
      const rest = unmastered(st).filter((q) => q !== st.card.qid);
      st.boxes[qid] = 2;
      st.mastered--;
      st.due[qid] = Math.min(st.step, ...rest.map((q) => st.due[q] ?? st.step)) - 1;
      st.scheduled[qid] = st.seq++;
      api.feed('Pop quiz! A card you had mastered is back in box 2, and it comes up next.', 'info', [c.caster]);
    },
  },
  {
    id: id('turn-around'),
    name: 'Turn the Card Around',
    category: 'round',
    description: 'Turn the card on the table the other way round before you look at its back: the answer side shows first and you recall the question (in an Answer side first session, it turns back the usual way). Only for a card whose answer is one piece of writing, not a picture, a number, a list or true or false.',
    target: 'self',
    modes: M,
    cost: 15,
    cooldownMs: 20_000,
    undoable: false,
    apply: (api, c) => {
      const st = studying(api, c.caster);
      if ('error' in st) return st;
      if (st.card.flipped) return { error: 'That card is already turned over.' };
      if (!reversible(api.ctx.questions.get(st.card.qid))) return { error: 'This card only works the usual way round.' };
      if (st.card.reversed) delete st.card.reversed;
      else st.card.reversed = true;
      api.feed(st.card.reversed ? 'Card turned around: recall the question that goes with this answer.' : 'Card turned back the usual way round.', 'info', [c.caster]);
    },
  },
  {
    id: id('tip-of-the-tongue'),
    name: 'Tip of the Tongue',
    category: 'advantage',
    description: 'Before you turn the card on the table over, see the first letter (or digit) of every word on its back, for 20 seconds or until you turn it. Not for a true or false card.',
    target: 'self',
    modes: M,
    cost: 15,
    cooldownMs: 30_000,
    durationMs: 20_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const st = studying(api, c.caster);
      if ('error' in st) return st;
      if (st.card.flipped) return { error: 'That card is already turned over.' };
      if (!st.card.reversed && api.ctx.questions.get(st.card.qid).type === 'truefalse') return { error: 'A true or false card has nothing to hint at.' };
      const hint = initials(backOf(api, st.card));
      if (!hint) return { error: 'There is no writing on the back of this card to hint at.' };
      if (fx) Object.assign(fx.data, { iid: st.card.iid, hint });
    },
    hooks: {
      // The hint is for this card only: it goes once the card is turned over or put away.
      tick: (api, fx) => {
        const card = studyOf(api, fx.caster)?.card;
        if (!card || card.iid !== fx.data.iid || card.flipped) api.endEffect(fx.eid, 'used');
      },
    },
    overlay: (fx) => ({ kind: 'badge', text: `On the tip of your tongue: ${String(fx.data.hint ?? '')}`, tone: 'info' }),
  },
  {
    id: id('overtime'),
    name: 'Study Overtime',
    category: 'round',
    description: 'Puts up to 2 minutes back on the session clock, never more than the full length of the session. Refused while the clock is nearly full.',
    target: 'self',
    modes: M,
    cost: 20,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const st = studying(api, c.caster);
      if ('error' in st) return st;
      const limitSec = api.ctx.common.timeLimitSec > 0 ? api.ctx.common.timeLimitSec : DEFAULT_LIMIT_SEC;
      const cap = api.now() + limitSec * 1000;
      const endsAt = Math.min(Number(api.s.endsAt) + OVERTIME_MS, cap);
      if (endsAt - api.s.endsAt < 1000) return { error: 'The session clock is already full.' };
      const added = endsAt - api.s.endsAt;
      api.s.endsAt = endsAt;
      api.ctx.setTimer('time', endsAt);
      api.feed(`Study overtime: ${secondsText(added)} more on the session clock.`, 'good', [c.caster]);
    },
  },
];

defineCheats(cheats);
