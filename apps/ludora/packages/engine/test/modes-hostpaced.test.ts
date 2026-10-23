import { describe, expect, it } from 'vitest';
import { commonSettingsSchema, createRng, type CommonSettings, type Question } from '@ludora/shared';
import { GameRuntime } from '../src/runtime/runtime.ts';
import { parseSettings } from '../src/sdk/settings.ts';
import type { GameMode, ModeVariant } from '../src/sdk/types.ts';
import { adaptQuestions } from '../src/questions/adapt.ts';
import { findAnswerLeaks, simulateGame, type SimulateResult } from '../src/testing/harness.ts';
import { FLASHCARD_SET, MIXED_SET } from '../src/testing/fixtures.ts';
import { DEADLINE_GRACE_MS } from '../src/mechanics/syncRounds.ts';
import { quickDraw } from '../src/modes/quick-draw/index.ts';
import * as quickDrawMeta from '../src/modes/quick-draw/meta.ts';
import { lanternOut, lanternPoints, revivalDue } from '../src/modes/lantern-out/index.ts';
import * as lanternOutMeta from '../src/modes/lantern-out/meta.ts';
import { confidence, confidenceChange } from '../src/modes/confidence/index.ts';
import * as confidenceMeta from '../src/modes/confidence/meta.ts';
import { cardLines, cardProgress, cardSizeFor, glimgo, glimgoAnswerText, type Card } from '../src/modes/glimgo/index.ts';
import * as glimgoMeta from '../src/modes/glimgo/meta.ts';

/*
 * Host-paced modes: Quick Draw, Lantern Out, Confidence and Glimgo.
 * Full games with bots for each mode and variant (the same checks as the
 * catalogue conformance suite), then focused tests of each mode's rules,
 * driving a runtime directly on a fake clock.
 */

const MODES: { mode: GameMode; meta: { meta: GameMode['meta']; settings: readonly unknown[]; variants: readonly ModeVariant[] } }[] = [
  { mode: quickDraw, meta: quickDrawMeta },
  { mode: lanternOut, meta: lanternOutMeta },
  { mode: confidence, meta: confidenceMeta },
  { mode: glimgo, meta: glimgoMeta },
];

const errorsOf = (r: SimulateResult) => r.errors.map((e) => `${e.where}: ${String(e.error)}`);

function expectClean(r: SimulateResult) {
  expect(errorsOf(r)).toEqual([]);
  expect(r.stalled).toBe(false);
  expect(r.leaks).toEqual([]);
  expect(r.results).not.toBeNull();
  expect(r.results?.endedBy).toBe('mode');
  expect(r.results?.standings[0]?.rank).toBe(1);
}

describe('host-paced modes: metadata', () => {
  it('exports matching metadata, settings and variants', () => {
    for (const { mode, meta } of MODES) {
      expect(mode.meta).toBe(meta.meta);
      expect(mode.settings).toBe(meta.settings);
      expect(mode.meta.pacing).toBe('host');
      expect(mode.meta.status).toBe('playable');
      expect(mode.meta.description.length).toBeGreaterThan(40);
      expect(mode.meta.rules.length).toBeGreaterThan(1);
      for (const v of meta.variants) {
        expect(v.meta.modeId).toBe(mode.meta.id);
        for (const key of v.locked ?? []) expect(mode.settings.some((f) => f.key === key), `${v.meta.id} locks ${key}`).toBe(true);
      }
    }
    const ids = MODES.flatMap(({ mode, meta }) => [mode.meta.id, ...meta.variants.map((v) => v.meta.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining(['quick-draw', 'quick-draw-first-to-5', 'quick-draw-steady', 'lantern-out', 'lantern-out-one-flame', 'lantern-out-no-revival', 'confidence', 'confidence-high-stakes', 'glimgo', 'glimgo-blackout', 'glimgo-speed']),
    );
  });
});

for (const { mode, meta } of MODES) {
  describe(`${mode.meta.title}: full games with bots`, () => {
    for (const players of [1, 4, 12]) {
      it(`plays to the end with ${players} player${players === 1 ? '' : 's'}`, () => {
        const r = simulateGame({ modeId: mode.meta.id, mode, questions: MIXED_SET, players, seed: players * 31 });
        expectClean(r);
        expect(r.results?.standings).toHaveLength(players);
        expect(r.actions).toBeGreaterThan(0);
      });
    }

    it('survives a pause, a disconnect, a late joiner and a player leaving', () => {
      const r = simulateGame({ modeId: mode.meta.id, mode, questions: MIXED_SET, players: 6, seed: 77, churn: true, pauseAt: 15_000 });
      expectClean(r);
      // Six players, one late joiner; the one who left still has a line.
      expect(r.results?.standings).toHaveLength(7);
      expect(r.results?.standings.some((s) => s.left)).toBe(true);
    });

    it('plays a flashcard-only set after adapting it', () => {
      const r = simulateGame({ modeId: mode.meta.id, mode, questions: FLASHCARD_SET, players: 3, seed: 5 });
      expectClean(r);
    });

    it('plays the same way twice with the same seed', () => {
      const a = simulateGame({ modeId: mode.meta.id, mode, questions: MIXED_SET, players: 4, seed: 99 });
      const b = simulateGame({ modeId: mode.meta.id, mode, questions: MIXED_SET, players: 4, seed: 99 });
      expectClean(a);
      expect(a.results?.standings.map((s) => [s.playerId, s.score, s.label])).toEqual(b.results?.standings.map((s) => [s.playerId, s.score, s.label]));
      expect(a.gameMs).toBe(b.gameMs);
    });

    it('plays with perfect and with hopeless bots', () => {
      expectClean(simulateGame({ modeId: mode.meta.id, mode, questions: MIXED_SET, players: 5, seed: 8, skill: 1 }));
      expectClean(simulateGame({ modeId: mode.meta.id, mode, questions: MIXED_SET, players: 5, seed: 8, skill: 0 }));
    });

    if (mode.settings.some((f) => f.key === 'autoAdvance')) {
      it('waits for the host when it does not move on automatically', () => {
        const r = simulateGame({ modeId: mode.meta.id, mode, questions: MIXED_SET, players: 4, seed: 21, settings: { autoAdvance: false } });
        expectClean(r);
      });
    }

    if (mode.meta.teams !== 'none') {
      it('plays with teams', () => {
        const r = simulateGame({ modeId: mode.meta.id, mode, questions: MIXED_SET, players: 6, common: { teamCount: 2 }, seed: 11 });
        expectClean(r);
        expect(r.results?.teamStandings).toHaveLength(2);
      });
    }

    for (const variant of meta.variants) {
      it(`variant ${variant.meta.title} plays to the end`, () => {
        for (const players of [1, 5]) {
          const r = simulateGame({ modeId: mode.meta.id, mode, variant, questions: MIXED_SET, players, seed: 3 + players });
          expectClean(r);
          expect(r.results?.standings).toHaveLength(players);
        }
        expectClean(simulateGame({ modeId: mode.meta.id, mode, variant, questions: FLASHCARD_SET, players: 4, seed: 17, churn: true, pauseAt: 15_000 }));
      });
    }
  });
}

/* --------------------------------------------------------------------- */
/* Driving a runtime directly                                             */
/* --------------------------------------------------------------------- */

const MCQ_SET = MIXED_SET.filter((q) => q.type === 'mcq');

interface Harness {
  rt: GameRuntime;
  clock: { t: number };
  /** Move the game clock on and fire any timers that are due. */
  tick(ms: number): void;
  view(id: string): any;
  host(): any;
  state(): any;
  errors: unknown[];
}

function drive(mode: GameMode, opts: { players?: string[]; settings?: Record<string, unknown>; common?: Partial<CommonSettings>; questions?: readonly Question[]; seed?: number } = {}): Harness {
  const clock = { t: 1_000, now: () => clock.t };
  const errors: unknown[] = [];
  const common = commonSettingsSchema.parse({ ...mode.defaults, shuffleQuestions: false, shuffleChoices: false, ...opts.common });
  const questions = adaptQuestions(opts.questions ?? MCQ_SET, mode.meta.questionTypes, createRng(1)).questions;
  const rt = new GameRuntime({
    mode,
    settings: parseSettings(mode.settings, opts.settings ?? {}),
    common,
    questions,
    players: (opts.players ?? ['a', 'b']).map((id) => ({ id, name: id.toUpperCase(), teamId: null, isBot: false })),
    teams: [],
    seed: opts.seed ?? 42,
    clock,
    strict: true,
    listener: { error: (e) => errors.push(e) },
  });
  expect(rt.start().ok).toBe(true);
  return {
    rt,
    clock,
    errors,
    tick(ms) {
      clock.t += ms;
      rt.fireDueTimers();
    },
    view: (id) => rt.view({ kind: 'player', playerId: id }),
    host: () => rt.view({ kind: 'host' }),
    state: () => rt.debugState(),
  };
}

/** The open question as player `id` sees it, with a right and a wrong answer in the tokens players use. */
function answersFor(h: Harness, id: string) {
  const v = h.view(id);
  const qv = v.sync?.question ?? v.question;
  const authored = findAuthored(qv.q.prompt);
  if (authored.type !== 'mcq') throw new Error('expected a choice question');
  // With shuffleChoices off, tokens follow the authored choice order.
  const right = authored.choices.findIndex((c) => c.id === authored.correct);
  return {
    iid: qv.iid as string,
    right: { type: 'mcq' as const, choiceId: `c${right}` },
    wrong: { type: 'mcq' as const, choiceId: `c${right === 0 ? 1 : 0}` },
  };
}

function answerAs(h: Harness, id: string, which: 'right' | 'wrong') {
  const a = answersFor(h, id);
  return h.rt.act(id, { type: 'answer', iid: a.iid, answer: a[which] });
}

function findAuthored(prompt: string): Question {
  const q = [...MIXED_SET, ...FLASHCARD_SET].find((x) => x.prompt === prompt);
  if (!q) throw new Error(`no question with prompt ${prompt}`);
  return q;
}

/* ------------------------------ Quick Draw ----------------------------- */

describe('Quick Draw rules', () => {
  function start(settings: Record<string, unknown> = {}, players = ['a', 'b', 'c']) {
    const h = drive(quickDraw, { players, settings });
    h.tick(3000); // intro
    expect(h.view('a').sync.phase).toBe('question');
    return h;
  }
  const answer = answerAs;

  it('locks a player out of the round after a wrong answer', () => {
    const h = start();
    expect(answer(h, 'a', 'wrong').ok).toBe(true);
    const v = h.view('a');
    expect(v.sync.phase).toBe('question');
    expect(v.you.lockedOut).toBe(true);
    expect(v.lockedOut).toBe(1);
    // One try per question: a second answer, even a right one, is refused.
    expect(answer(h, 'a', 'right')).toMatchObject({ ok: false, message: 'You already answered.' });
    expect(h.view('b').you.lockedOut).toBe(false);
  });

  it('gives the round to the first correct answer and shows who and how fast', () => {
    const h = start();
    answer(h, 'a', 'wrong');
    h.clock.t += 2500;
    expect(answer(h, 'b', 'right').ok).toBe(true);
    // Closed at once: c does not get a go.
    expect(answer(h, 'c', 'right').ok).toBe(false);
    const v = h.view('c');
    expect(v.sync.phase).toBe('reveal');
    expect(v.winner).toMatchObject({ playerId: 'b', name: 'B', responseMs: 2500 });
    expect(h.view('b').you).toMatchObject({ won: true, score: 1, wins: 1 });
    expect(h.host().winner?.name).toBe('B');
    expect(h.view('a').you.score).toBe(0);
    const log = h.rt.answerLog();
    expect(log.map((x) => [x.playerId, x.correct])).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });

  it('closes the round with no winner when nobody gets it', () => {
    const h = start({}, ['a', 'b']);
    answer(h, 'a', 'wrong');
    answer(h, 'b', 'wrong');
    const v = h.view('a');
    expect(v.sync.phase).toBe('reveal');
    expect(v.winner).toBeNull();
    expect(v.sync.reveal).not.toBeNull();
  });

  it('with the penalty on, a wrong answer costs a point but never goes below 0', () => {
    const h = start({ penalty: true }, ['a', 'b']);
    answer(h, 'a', 'wrong'); // at 0 already: stays 0
    expect(h.view('a').you.score).toBe(0);
    answer(h, 'b', 'right');
    h.tick(4500); // reveal
    expect(h.view('a').sync.phase).toBe('question');
    answer(h, 'b', 'wrong'); // 1 -> 0
    expect(h.view('b').you).toMatchObject({ score: 0, lostPoint: true });
    answer(h, 'a', 'right');
    expect(h.view('a').board.rows.find((r: any) => r.playerId === 'b').gain).toBe(-1);
  });

  it('ends the game as soon as someone reaches the target', () => {
    const h = start({ target: 2 }, ['a', 'b']);
    for (let i = 0; i < 2; i++) {
      answer(h, 'a', 'right');
      h.tick(4500);
    }
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results?.summary).toBe('A reached 2 points first.');
    expect(h.rt.results?.standings[0]).toMatchObject({ playerId: 'a', score: 2, rank: 1 });
    expect(h.errors).toEqual([]);
  });

  it('refuses answers to a closed question', () => {
    const h = start();
    const iid = h.view('a').sync.question.iid;
    answer(h, 'a', 'right');
    h.tick(4500);
    expect(h.view('b').sync.question.iid).not.toBe(iid);
    expect(h.rt.act('b', { type: 'answer', iid, answer: { type: 'mcq', choiceId: 'c0' } })).toMatchObject({ ok: false, message: 'That question has closed.' });
  });
});

/* ------------------------------ Lantern Out ---------------------------- */

describe('Lantern Out rules', () => {
  function start(settings: Record<string, unknown>, players = ['a', 'b', 'c']) {
    const h = drive(lanternOut, { players, settings });
    h.tick(4000);
    expect(h.view('a').sync.phase).toBe('question');
    return h;
  }
  const answer = answerAs;
  const closeRound = (h: Harness) => h.tick(20_000 + DEADLINE_GRACE_MS);

  it('blows out a lantern for a wrong or missed answer and knocks out at zero', () => {
    const h = start({ lives: 2, reviveEvery: 0 });
    answer(h, 'a', 'wrong');
    answer(h, 'b', 'right');
    closeRound(h); // c missed it
    expect(h.view('a').you).toMatchObject({ lanterns: 1, lost: true, out: false });
    expect(h.view('b').you).toMatchObject({ lanterns: 2, lost: false });
    expect(h.view('c').you).toMatchObject({ lanterns: 1, lost: true });
    expect(h.view('b').you.points).toBeGreaterThanOrEqual(100);
    h.tick(5000);
    answer(h, 'a', 'wrong');
    answer(h, 'b', 'right');
    answer(h, 'c', 'right');
    expect(h.view('a').you).toMatchObject({ lanterns: 0, out: true, knockedOut: true, outAt: 1 });
    expect(h.view('a').last.out).toEqual(['A']);
    h.tick(5000);
    // Out: watching, not answering.
    expect(h.view('a').sync.you.eligible).toBe(false);
    expect(answer(h, 'a', 'right')).toMatchObject({ ok: false });
  });

  it('lets only knocked-out players answer in a revival round, and relights one lantern', () => {
    const h = start({ lives: 1, reviveEvery: 2 });
    answer(h, 'a', 'wrong');
    answer(h, 'b', 'right');
    answer(h, 'c', 'right');
    expect(h.view('a').you.out).toBe(true);
    h.tick(5000);
    // Question 2 is a revival round because someone is out.
    const v = h.view('b');
    expect(v.revival).toBe(true);
    expect(v.sync.you.eligible).toBe(false);
    expect(h.view('a').sync.you.eligible).toBe(true);
    expect(answer(h, 'b', 'right')).toMatchObject({ ok: false, message: 'This is a revival round: only players who are out can answer.' });
    expect(answer(h, 'a', 'right').ok).toBe(true);
    // Everyone who could answer has: the round closes and a is back in with one lantern; b and c lost nothing.
    expect(h.view('a').sync.phase).toBe('reveal');
    expect(h.view('a').you).toMatchObject({ lanterns: 1, out: false, relit: true });
    expect(h.view('b').you.lanterns).toBe(1);
    expect(h.view('c').you.lanterns).toBe(1);
    expect(h.view('a').last.relit).toEqual(['A']);
  });

  it('plays a due revival round as a normal round when nobody is out', () => {
    const h = start({ lives: 3, reviveEvery: 1 }, ['a', 'b']);
    const v = h.view('a');
    expect(v.revival).toBe(false);
    expect(v.sync.you.eligible).toBe(true);
    expect(revivalDue(4, 4)).toBe(true);
    expect(revivalDue(3, 4)).toBe(false);
    expect(revivalDue(4, 0)).toBe(false);
  });

  it('ends when one player is left and ranks survivors above players who went out, later exits higher', () => {
    const h = start({ lives: 1, reviveEvery: 0 });
    answer(h, 'a', 'wrong');
    answer(h, 'b', 'right');
    answer(h, 'c', 'right');
    h.tick(5000);
    answer(h, 'b', 'wrong');
    answer(h, 'c', 'right');
    h.tick(5000);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results?.summary).toBe('C kept the last lantern burning.');
    expect(h.rt.results?.standings.map((s) => s.playerId)).toEqual(['c', 'b', 'a']);
    expect(h.rt.results?.standings.map((s) => s.label)).toEqual([expect.stringMatching(/^1 lantern lit/), 'Out on question 2', 'Out on question 1']);
  });

  it('gives late joiners one lantern and does not charge them for a question they missed the start of', () => {
    const h = start({ lives: 3, reviveEvery: 0 });
    h.clock.t += 1000;
    h.rt.addPlayer({ id: 'late', name: 'Late', teamId: null, isBot: false });
    closeRound(h);
    expect(h.view('late').you).toMatchObject({ lanterns: 1, out: false });
    expect(h.view('a').you.lanterns).toBe(2);
  });

  it('scores 100 to 200 points for a correct answer', () => {
    expect(lanternPoints({ correct: true, responseMs: 0, limitMs: 20_000 })).toBe(200);
    expect(lanternPoints({ correct: true, responseMs: 20_000, limitMs: 20_000 })).toBe(100);
    expect(lanternPoints({ correct: false, responseMs: 0, limitMs: 20_000 })).toBe(0);
  });
});

/* ------------------------------ Confidence ----------------------------- */

describe('Confidence rules', () => {
  function start(settings: Record<string, unknown> = {}, players = ['a', 'b', 'c']) {
    const h = drive(confidence, { players, settings });
    h.tick(4000);
    expect(h.view('a').phase).toBe('wager');
    return h;
  }
  const answer = answerAs;

  it('scores 100 per level for a right answer and 50 per level above guessing for a wrong one', () => {
    expect([1, 2, 3].map((l) => confidenceChange(l as 1 | 2 | 3, true))).toEqual([100, 200, 300]);
    expect([1, 2, 3].map((l) => confidenceChange(l as 1 | 2 | 3, false))).toEqual([-0, -50, -100]);
    expect([1, 2, 3].map((l) => confidenceChange(l as 1 | 2 | 3, false, true))).toEqual([-100, -200, -300]);
  });

  it('sends only the prompt while players choose their confidence', () => {
    const h = start();
    for (const v of [h.view('a'), h.host()]) {
      expect(v.question).toBeNull();
      expect(Object.keys(v.prompt).sort()).toEqual(['prompt']);
      expect(v.prompt.prompt).toBe(MCQ_SET[0]!.prompt);
      const json = JSON.stringify(v);
      expect(json).not.toContain('choices');
      for (const c of (MCQ_SET[0] as Extract<Question, { type: 'mcq' }>).choices) expect(json).not.toContain(`"${c.text}"`);
      expect(findAnswerLeaks(v)).toEqual([]);
    }
    expect(h.view('a').you.wager).toBeNull();
  });

  it('keeps a picture with the prompt during the wager', () => {
    const withImage: Question[] = MCQ_SET.map((q, i) => (i === 0 ? { ...q, media: { kind: 'image', url: '/uploads/planets.png', alt: 'The planets' } } : q));
    const h = drive(confidence, { questions: withImage });
    h.tick(4000);
    expect(h.view('a').prompt).toEqual({ prompt: withImage[0]!.prompt, media: { kind: 'image', url: '/uploads/planets.png', alt: 'The planets' } });
  });

  it('shows the choices once everyone has chosen, then locks the choice', () => {
    const h = start();
    expect(h.rt.act('a', { type: 'wager', level: 3 }).ok).toBe(true);
    expect(h.rt.act('a', { type: 'wager', level: 2 }).ok).toBe(true); // changed her mind
    h.rt.act('b', { type: 'wager', level: 2 });
    expect(h.view('a').phase).toBe('wager');
    h.rt.act('c', { type: 'wager', level: 1 });
    const v = h.view('a');
    expect(v.phase).toBe('question');
    expect(v.prompt).toBeNull();
    expect(v.question.q.choices.length).toBe(4);
    expect(v.you.wager).toBe(2);
    expect(h.rt.act('a', { type: 'wager', level: 3 })).toMatchObject({ ok: false, message: 'Your confidence is locked in for this question.' });
  });

  it('opens the question when the wager time runs out, guessing for anyone who did not choose', () => {
    const h = start({ wagerSeconds: 6 });
    h.rt.act('a', { type: 'wager', level: 3 });
    h.tick(6000);
    expect(h.view('b').phase).toBe('question');
    expect(h.view('b').you.wager).toBeNull();
    answer(h, 'a', 'right');
    answer(h, 'b', 'right');
    answer(h, 'c', 'wrong');
    expect(h.view('a').phase).toBe('reveal');
    expect(h.view('a').you.outcome).toMatchObject({ level: 3, correct: true, change: 300 });
    expect(h.view('b').you.outcome).toMatchObject({ level: 1, correct: true, change: 100 });
    expect(h.view('c').you.outcome).toMatchObject({ level: 1, correct: false, change: 0 });
    expect(h.view('a').levels).toEqual([
      { level: 1, players: 2, right: 1 },
      { level: 2, players: 0, right: 0 },
      { level: 3, players: 1, right: 1 },
    ]);
  });

  it('takes points off for confident wrong or missed answers, never below 0, and only reveals at the end', () => {
    const h = start({ leaderboard: false });
    h.rt.act('a', { type: 'wager', level: 1 });
    h.rt.act('b', { type: 'wager', level: 2 });
    h.rt.act('c', { type: 'wager', level: 3 });
    answer(h, 'a', 'right');
    answer(h, 'b', 'right');
    answer(h, 'c', 'right');
    expect(h.view('c').you.score).toBe(300);
    h.tick(6000); // reveal, next wager
    h.rt.act('a', { type: 'wager', level: 3 });
    h.rt.act('b', { type: 'wager', level: 3 });
    h.rt.act('c', { type: 'wager', level: 2 });
    answer(h, 'a', 'wrong');
    answer(h, 'b', 'wrong');
    // Scores do not move until the question closes.
    expect(h.view('a').you.score).toBe(100);
    expect(h.view('a').you.outcome).toBeNull();
    h.tick(20_000 + DEADLINE_GRACE_MS); // c misses it
    expect(h.view('a').you).toMatchObject({ score: 0, outcome: { change: -100 } });
    expect(h.view('b').you).toMatchObject({ score: 100, outcome: { change: -100 } });
    expect(h.view('c').you).toMatchObject({ score: 250, outcome: { answered: false, change: -50 } });
    expect(h.view('a').you.tally).toEqual({ picks: [1, 0, 1], right: [1, 0, 0] });
  });

  it('records every answer with the question it belongs to', () => {
    const h = start();
    for (const id of ['a', 'b', 'c']) h.rt.act(id, { type: 'wager', level: 2 });
    answer(h, 'a', 'right');
    answer(h, 'b', 'wrong');
    const log = h.rt.answerLog();
    expect(log.map((x) => [x.playerId, x.qid, x.correct])).toEqual([
      ['a', MCQ_SET[0]!.id, true],
      ['b', MCQ_SET[0]!.id, false],
    ]);
  });

  it('in high stakes a wrong guess costs 100', () => {
    const h = start({ highStakes: true });
    for (const id of ['a', 'b', 'c']) h.rt.act(id, { type: 'wager', level: 1 });
    for (const id of ['a', 'b']) answer(h, id, 'right');
    answer(h, 'c', 'wrong');
    expect(h.view('a').you.score).toBe(100);
    h.tick(6000); // reveal
    h.tick(5000); // leaderboard
    for (const id of ['a', 'b', 'c']) h.rt.act(id, { type: 'wager', level: 1 });
    answer(h, 'a', 'wrong');
    answer(h, 'b', 'right');
    answer(h, 'c', 'right');
    expect(h.view('a').you).toMatchObject({ score: 0, outcome: { change: -100 } });
  });

  it('ends with a summary about calibration', () => {
    const r = simulateGame({ modeId: confidence.meta.id, mode: confidence, questions: MIXED_SET, players: 6, seed: 4 });
    expectClean(r);
    expect(r.results?.summary).toMatch(/right \d+% of the time|Final scores/);
  });
});

/* -------------------------------- Glimgo ------------------------------- */

/** A set where every answer is typed text, so the test knows every answer. */
const WORDS: Question[] = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima',
].map((w, i) => ({ id: `w${i + 1}`, type: 'short' as const, prompt: `Code word number ${i + 1}?`, accepted: [w] }));
/** Eight answers: every 3 by 3 card holds all of them around a free middle square. */
const WORDS8 = WORDS.slice(0, 8);

describe('Glimgo rules', () => {
  function start(settings: Record<string, unknown> = {}, questions: readonly Question[] = WORDS, players = ['a', 'b']) {
    const h = drive(glimgo, { players, settings, questions });
    expect(h.view('a').phase).toBe('intro');
    h.tick(6000);
    expect(h.view('a').phase).toBe('call');
    return h;
  }
  /** Square indices on a player's card that do and do not answer the open call. */
  function squaresFor(h: Harness, id: string) {
    const v = h.view(id);
    const want = WORDS.find((q) => q.prompt === v.call.prompt) as Extract<Question, { type: 'short' }>;
    const squares = v.you.squares as { text: string; free: boolean; marked: boolean }[];
    const right = squares.findIndex((s) => s.text === want.accepted[0]);
    const wrong = squares.findIndex((s, i) => i !== right && !s.free && !s.marked);
    return { right, wrong, iid: v.call.iid as string };
  }

  it('derives one answer text per question', () => {
    expect(glimgoAnswerText(MIXED_SET[0]!)).toBe('Mercury');
    expect(glimgoAnswerText(MIXED_SET[2]!)).toBe('Paris');
    expect(glimgoAnswerText({ id: 'n', type: 'numeric', prompt: 'How long?', answer: 12, unit: 'cm' })).toBe('12 cm');
    expect(glimgoAnswerText(MIXED_SET[3]!)).toBe('56');
    expect(glimgoAnswerText(FLASHCARD_SET[0]!)).toBe('An animal that eats only plants');
    expect(glimgoAnswerText(MIXED_SET[4]!)).toBeNull();
  });

  it('treats a number with or without its unit as one answer', () => {
    // 7 x 8 and the spiders' legs are both 56: one square, written "56", answers both calls.
    const sevenEights: Question = { id: 'm', type: 'mcq', prompt: 'What is 7 × 8?', choices: [{ id: 'a', text: '56' }, { id: 'b', text: '54' }], correct: 'a' };
    const spiders: Question = { id: 'n', type: 'numeric', prompt: 'How many legs do 7 spiders have?', answer: 56, unit: 'legs' };
    for (const order of [[sevenEights, spiders], [spiders, sevenEights]]) {
      const h = start({}, [...order, ...WORDS8], ['a']);
      const texts = h.view('a').you.squares.map((sq: any) => sq.text);
      expect(texts.filter((t: string) => t.includes('56'))).toEqual(['56']);
    }
    // A number with a unit that no other answer shares keeps its unit.
    const h = start({}, [spiders, ...WORDS8], ['a']);
    expect(h.view('a').you.squares.map((sq: any) => sq.text)).toContain('56 legs');
  });

  it('chooses a card size from the number of different answers', () => {
    expect(cardSizeFor(16, 'auto')).toBe(4);
    expect(cardSizeFor(15, 'auto')).toBe(3);
    expect(cardSizeFor(15, '4')).toBe(4);
    expect(cardSizeFor(14, '4')).toBe(3);
    expect(cardSizeFor(30, '3')).toBe(3);
  });

  it('deals each player their own card of different answers', () => {
    const h = start();
    const a = h.view('a').you.squares.map((s: any) => s.text);
    const b = h.view('b').you.squares.map((s: any) => s.text);
    expect(a).toHaveLength(9);
    expect(new Set(a).size).toBe(9);
    expect(a).not.toEqual(b);
    // 4 by 4 when there are 16 different answers (the mixed set has exactly 16 once adapted).
    const big = start({}, MIXED_SET);
    expect(big.view('a').size).toBe(4);
    expect(big.view('a').you.squares).toHaveLength(16);
  });

  it('puts a free square in the middle when the set has only eight answers', () => {
    const h = start({}, FLASHCARD_SET);
    const squares = h.view('a').you.squares;
    expect(squares).toHaveLength(9);
    expect(squares[4]).toEqual({ text: '', free: true, marked: true });
    expect(squares.filter((s: any) => s.free)).toHaveLength(1);
  });

  it('shows the prompt of a call and never which square answers it', () => {
    const h = start();
    const v = h.view('a');
    expect(Object.keys(v.call).sort()).toEqual(['endsAt', 'found', 'iid', 'n', 'prompt', 'startedAt']);
    for (const sq of v.you.squares) expect(Object.keys(sq).sort()).toEqual(['free', 'marked', 'text']);
    expect(v.revealed).toBeNull();
    expect(findAnswerLeaks(v)).toEqual([]);
    const want = (WORDS.find((q) => q.prompt === v.call.prompt) as Extract<Question, { type: 'short' }>).accepted[0]!;
    // The answer may be on the card, but nowhere else in the view.
    const { you, ...rest } = v;
    void you;
    expect(JSON.stringify(rest)).not.toContain(want);
    expect(JSON.stringify(h.host())).not.toContain(`"${want}"`);
  });

  it('rejects a wrong mark and locks the player out, then accepts the right one', () => {
    const h = start({ lockoutSeconds: 5 }, WORDS8);
    const { right, wrong, iid } = squaresFor(h, 'a');
    expect(right).toBeGreaterThanOrEqual(0);
    expect(h.rt.act('a', { type: 'mark', iid, square: wrong }).ok).toBe(true);
    let v = h.view('a');
    expect(v.you.squares[wrong].marked).toBe(false);
    expect(v.you.last).toMatchObject({ square: wrong, ok: false });
    expect(v.you.lockedUntil).toBeGreaterThan(h.rt.gameNow());
    expect(h.rt.act('a', { type: 'mark', iid, square: right })).toMatchObject({ ok: false, message: expect.stringContaining('locked out') });
    h.clock.t += 5000;
    expect(h.rt.act('a', { type: 'mark', iid, square: right }).ok).toBe(true);
    v = h.view('a');
    expect(v.you.squares[right].marked).toBe(true);
    expect(v.you).toMatchObject({ found: true, marks: 1, lockedUntil: null, last: { square: right, ok: true } });
    // Every attempt is recorded against the called question.
    const qid = WORDS.find((q) => q.prompt === v.call.prompt)!.id;
    expect(h.rt.answerLog().map((x) => [x.playerId, x.qid, x.correct])).toEqual([
      ['a', qid, false],
      ['a', qid, true],
    ]);
    // Already found: no more marks this call.
    expect(h.rt.act('a', { type: 'mark', iid, square: wrong })).toMatchObject({ ok: false });
  });

  it('closes a call early once everyone who has the answer has marked it, then reveals it', () => {
    const h = start({}, WORDS, ['a']);
    const { right, iid } = squaresFor(h, 'a');
    if (right < 0) return; // not on this card; covered by the other tests
    h.rt.act('a', { type: 'mark', iid, square: right });
    const v = h.view('a');
    expect(v.phase).toBe('reveal');
    expect(v.revealed.text).toBe(v.you.squares[right].text);
    h.tick(3000);
    expect(h.view('a').phase).toBe('call');
    expect(h.view('a').callCount).toBe(2);
  });

  it('refuses marks between calls and for free or marked squares', () => {
    const h = start({}, FLASHCARD_SET, ['a']);
    const iid = h.view('a').call.iid;
    expect(h.rt.act('a', { type: 'mark', iid, square: 4 })).toMatchObject({ ok: false, message: 'That square is free.' });
    h.tick(15_000 + DEADLINE_GRACE_MS);
    expect(h.view('a').phase).toBe('reveal');
    expect(h.rt.act('a', { type: 'mark', iid, square: 0 })).toMatchObject({ ok: false, message: 'Wait for the next call.' });
    h.tick(3000);
    expect(h.rt.act('a', { type: 'mark', iid, square: 0 })).toMatchObject({ ok: false, message: 'That call has closed.' });
  });

  it('detects lines, two lines and a full card', () => {
    const lines3 = cardLines(3);
    expect(lines3).toHaveLength(8);
    expect(cardLines(4)).toHaveLength(10);
    const card: Card = { cells: [0, 1, 2, 3, -1, 5, 6, 7, 8], marks: [0, 0, 0, 0, 0, 0, 0, 0, 0] };
    expect(cardProgress(card, 3, 'line')).toEqual({ marks: 0, lines: 0, toGo: 2 });
    card.marks[0] = 1;
    expect(cardProgress(card, 3, 'line').toGo).toBe(1);
    card.marks[8] = 2; // diagonal through the free middle
    expect(cardProgress(card, 3, 'line')).toEqual({ marks: 2, lines: 1, toGo: 0 });
    expect(cardProgress(card, 3, 'two-lines').toGo).toBe(2);
    card.marks[2] = 3;
    expect(cardProgress(card, 3, 'two-lines')).toEqual({ marks: 3, lines: 1, toGo: 1 });
    expect(cardProgress(card, 3, 'full').toGo).toBe(5);
  });

  it('never counts a line made only of free squares', () => {
    // The whole top-left to bottom-right diagonal is free.
    const card: Card = { cells: [-1, 1, 2, 3, -1, 5, 6, 7, -1], marks: [0, 0, 0, 0, 0, 0, 0, 0, 0] };
    expect(cardProgress(card, 3, 'line')).toEqual({ marks: 0, lines: 0, toGo: 2 });
    expect(cardProgress(card, 3, 'two-lines').toGo).toBe(3);
    expect(cardProgress(card, 3, 'full').toGo).toBe(6);
    card.marks[1] = 1;
    card.marks[2] = 2; // the top row: one free square and two marks
    expect(cardProgress(card, 3, 'line')).toEqual({ marks: 2, lines: 1, toGo: 0 });
  });

  it('with only a few different answers, nobody starts with a finished line', () => {
    // Eight questions but three different answers: each card has six free squares.
    const few = WORDS8.map((q, i) => ({ ...q, accepted: [['Alpha', 'Bravo', 'Charlie'][i % 3]!] }));
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const h = start({}, few, ids);
    for (const id of ids) {
      const v = h.view(id);
      expect(v.you.squares.filter((sq: { free: boolean }) => sq.free)).toHaveLength(6);
      expect(v.you).toMatchObject({ marks: 0, lines: 0 });
      expect(v.you.toGo).toBeGreaterThan(0);
    }
  });

  it('a player who completes a line wins and the game ends', () => {
    const h = start({ lockoutSeconds: 0 }, WORDS, ['a', 'b']);
    let guard = 0;
    while (h.rt.status === 'running' && h.view('a').phase !== 'finale' && guard++ < 40) {
      const v = h.view('a');
      if (v.phase === 'call') {
        const { right, iid } = squaresFor(h, 'a');
        if (right >= 0) h.rt.act('a', { type: 'mark', iid, square: right });
      }
      if (h.view('a').phase === 'call') h.tick(15_000 + DEADLINE_GRACE_MS);
      else if (h.view('a').phase === 'reveal') h.tick(3000);
    }
    const v = h.view('a');
    expect(v.phase).toBe('finale');
    expect(v.winner).toMatchObject({ playerId: 'a', name: 'A' });
    expect(v.you.lines).toBeGreaterThanOrEqual(1);
    expect(h.host().winner.squares).toHaveLength(9);
    h.tick(5000);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results?.standings[0]).toMatchObject({ playerId: 'a', rank: 1 });
    expect(h.rt.results?.standings[0]?.label).toMatch(/^Glimgo!/);
    expect(h.rt.results?.summary).toBe('A completed a line first.');
    expect(h.errors).toEqual([]);
  });

  it('calls only answers someone still needs, each question at most twice, then most marks wins', () => {
    // Twelve answers, 3 by 3 cards: some answers are on nobody's card.
    const h = start({}, WORDS, ['a']);
    const onCard = new Set(h.view('a').you.squares.map((s: any) => s.text));
    const called: string[] = [];
    let guard = 0;
    while (h.rt.status === 'running' && guard++ < 100) {
      const v = h.view('a');
      if (v.phase === 'call') {
        called.push(v.call.prompt);
        h.tick(15_000 + DEADLINE_GRACE_MS);
      } else h.tick(3000);
    }
    expect(h.rt.status).toBe('ended');
    const answerOf = (prompt: string) => (WORDS.find((q) => q.prompt === prompt) as Extract<Question, { type: 'short' }>).accepted[0]!;
    for (const p of called) expect(onCard.has(answerOf(p))).toBe(true);
    // Nobody marked anything, so each of the nine answers came round twice.
    expect(called).toHaveLength(18);
    for (const p of new Set(called)) expect(called.filter((x) => x === p)).toHaveLength(2);
    expect(h.rt.results?.summary).toBe('The calls ran out. Most marks wins.');
  });

  it('the host can skip a call', () => {
    const h = start();
    const n = h.view('a').call.n;
    expect(h.rt.hostNext().ok).toBe(true);
    expect(h.view('a').phase).toBe('reveal');
    expect(h.rt.hostNext().ok).toBe(true);
    expect(h.view('a').call.n).toBe(n + 1);
  });

  it('deals a card to a late joiner', () => {
    const h = start();
    h.rt.addPlayer({ id: 'late', name: 'Late', teamId: null, isBot: false });
    expect(h.view('late').you.squares).toHaveLength(9);
  });
});
