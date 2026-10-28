import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';
import { MASTERED_BOX, nextDue, RETURN_GAP, reversible } from '../../modes/flashcard-study/index.ts';

/*
 * Cheats that only make sense in Flashcard Study. It is a study session for
 * one (no score, no rivals), so every cheat is for yourself and works on the
 * Leitner boxes and the schedule: put a card off, promote it, pull the box 2
 * cards forward, or bend the "Knew it" / "Not yet" rules for a while.
 *
 * The mode's rules, kept here as modes/flashcard-study/index.ts does them:
 *  - Only the session ends the session: chaos never masters a player's last
 *    card (they finish that one themselves), so nobody is left "done" without
 *    the mode noticing.
 *  - A card put away is rescheduled the mode's way (due step and order), and
 *    the next card is presented as the mode presents it (a new instance, the
 *    right way round).
 *  - Chaos never records an answer, so the teacher's report only counts real
 *    grades.
 * All of these write the state directly, so the instant ones are not undoable.
 */

const MODE = 'flashcard-study';
const M = [MODE] as const;
const id = (slug: string) => `${MODE}.${slug}`;

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
];

defineCheats(cheats);
