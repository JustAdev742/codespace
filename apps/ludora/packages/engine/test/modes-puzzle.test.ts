import { describe, expect, it } from 'vitest';
import { commonSettingsSchema, createRng, type CommonSettings, type Question } from '@ludora/shared';
import { GameRuntime } from '../src/runtime/runtime.ts';
import { prepareQuestions } from '../src/registry.ts';
import { parseSettings } from '../src/sdk/settings.ts';
import type { GameMode, ModeVariant } from '../src/sdk/types.ts';
import { findAnswerLeaks, simulateGame, type SimulateResult } from '../src/testing/harness.ts';
import { FLASHCARD_SET, MIXED_SET } from '../src/testing/fixtures.ts';
import { answerText } from '../src/modes/flashcard-study/answer-text.ts';
import { lanternMatch, type State as LanternState } from '../src/modes/lantern-match/index.ts';
import { variants as lanternVariants } from '../src/modes/lantern-match/meta.ts';
import { buildScramble, matchesAnswer, scrambleSource, wordScramble, type State as ScrambleState } from '../src/modes/word-scramble/index.ts';
import { variants as scrambleVariants } from '../src/modes/word-scramble/meta.ts';
import { multiplierFor, timeAttack } from '../src/modes/time-attack/index.ts';
import { variants as timeAttackVariants } from '../src/modes/time-attack/meta.ts';
import { FLOOR_MS, START_MS, survivalRun, timerAfter } from '../src/modes/survival-run/index.ts';
import { variants as survivalVariants } from '../src/modes/survival-run/meta.ts';
import { flashcardStudy, type State as StudyState } from '../src/modes/flashcard-study/index.ts';
import { variants as studyVariants } from '../src/modes/flashcard-study/meta.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ------------------------------------------------------------------ */
/* Conformance: the same runs modes.test.ts makes once these modes are */
/* registered, plus every variant.                                     */
/* ------------------------------------------------------------------ */

const SUITE: { mode: GameMode; variants: ModeVariant[] }[] = [
  { mode: lanternMatch, variants: lanternVariants },
  { mode: wordScramble, variants: scrambleVariants },
  { mode: timeAttack, variants: timeAttackVariants },
  { mode: survivalRun, variants: survivalVariants },
  { mode: flashcardStudy, variants: studyVariants },
];

const errorsOf = (r: SimulateResult) => r.errors.map((e) => `${e.where}: ${String(e.error)}`);

function expectClean(r: SimulateResult) {
  expect(errorsOf(r)).toEqual([]);
  expect(r.stalled).toBe(false);
  expect(r.leaks).toEqual([]);
  expect(r.results).not.toBeNull();
  expect(r.results!.standings.length).toBeGreaterThan(0);
}

for (const { mode, variants } of SUITE) {
  const id = mode.meta.id;
  const max = mode.meta.players.max;
  describe(`${mode.meta.title} plays to the end`, () => {
    const counts = [...new Set([mode.meta.players.min, Math.min(4, max), Math.min(12, max)])];
    for (const players of counts) {
      it(`with ${players} player${players === 1 ? '' : 's'}`, () => {
        const r = simulateGame({ modeId: id, mode, questions: MIXED_SET, players, seed: players * 31 });
        expectClean(r);
        expect(r.results?.standings).toHaveLength(players);
        expect(r.results?.standings[0]?.rank).toBe(1);
        expect(r.results?.endedBy).toBe('mode');
        expect(r.actions).toBeGreaterThan(0);
      });
    }
    it(max > 1 ? 'through a pause, a disconnect, a late joiner and a leaver' : 'through a pause', () => {
      const r = simulateGame({ modeId: id, mode, questions: MIXED_SET, players: Math.min(6, max), seed: 77, churn: max > 1, pauseAt: 15_000 });
      expectClean(r);
      expect(r.results?.endedBy).toBe('mode');
      if (max > 1) expect(r.results?.standings.some((s) => s.left)).toBe(true);
    });
    it('with a flashcard-only set', () => {
      const r = simulateGame({ modeId: id, mode, questions: FLASHCARD_SET, players: Math.min(3, max), seed: 5 });
      expectClean(r);
      expect(r.results?.endedBy).toBe('mode');
    });
    if (mode.meta.teams !== 'none') {
      it('with teams', () => {
        const r = simulateGame({ modeId: id, mode, questions: MIXED_SET, players: 6, common: { teamCount: 2 }, seed: 11 });
        expectClean(r);
        expect(r.results?.teamStandings).toHaveLength(2);
      });
    }
    it('the same way twice with the same seed', () => {
      const a = simulateGame({ modeId: id, mode, questions: MIXED_SET, players: 3, seed: 99 });
      const b = simulateGame({ modeId: id, mode, questions: MIXED_SET, players: 3, seed: 99 });
      expectClean(a);
      expect(a.results?.standings.map((s) => [s.playerId, s.score, s.label])).toEqual(b.results?.standings.map((s) => [s.playerId, s.score, s.label]));
      expect(a.actions).toBe(b.actions);
    });
    for (const variant of variants) {
      it(`as the variant ${variant.meta.title}`, () => {
        expect(variant.meta.modeId).toBe(id);
        const r = simulateGame({ modeId: id, mode, variant, questions: MIXED_SET, players: Math.min(5, max), seed: 3 });
        expectClean(r);
        expect(r.results?.endedBy).toBe('mode');
      });
    }
  });
}

describe('catalogue metadata', () => {
  it('has unique ids, rules and settings that parse', () => {
    const ids = SUITE.flatMap(({ mode, variants }) => [mode.meta.id, ...variants.map((v) => v.meta.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { mode, variants } of SUITE) {
      expect(mode.meta.description.length).toBeGreaterThan(40);
      expect(mode.meta.rules.length).toBeGreaterThan(1);
      for (const v of variants) {
        for (const key of v.locked ?? []) expect(key in (v.settings ?? {}) || key in (v.common ?? {}), `${v.meta.id} locks ${key}`).toBe(true);
        const parsed = parseSettings(mode.settings, v.settings);
        for (const [k, value] of Object.entries(v.settings ?? {})) expect(parsed[k], `${v.meta.id}.${k}`).toEqual(value);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Driving a runtime directly, on a fake clock                          */
/* ------------------------------------------------------------------ */

interface GameOpts {
  questions?: Question[];
  settings?: Record<string, unknown>;
  common?: Partial<CommonSettings>;
  variant?: ModeVariant;
  players?: number;
  bots?: boolean;
  seed?: number;
}

function startGame(mode: GameMode, opts: GameOpts = {}) {
  const clock = { t: 1_000_000 };
  const errors: unknown[] = [];
  const common = commonSettingsSchema.parse({ shuffleQuestions: false, shuffleChoices: false, ...mode.defaults, ...opts.variant?.common, ...opts.common });
  const settings = parseSettings(mode.settings, { ...opts.variant?.settings, ...opts.settings });
  const prepared = prepareQuestions(mode, opts.questions ?? MIXED_SET, opts.seed ?? 1);
  if (prepared.problem) throw new Error(prepared.problem);
  const rt = new GameRuntime({
    mode,
    settings,
    common,
    questions: prepared.questions,
    players: Array.from({ length: opts.players ?? 1 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, teamId: null, isBot: opts.bots ?? false })),
    teams: [],
    seed: opts.seed ?? 1,
    clock: { now: () => clock.t },
    strict: true,
    listener: { error: (e) => errors.push(e) },
  });
  expect(rt.start()).toEqual({ ok: true });
  const rng = createRng(42);
  return {
    rt,
    errors,
    view: (playerId = 'p1') => rt.view({ kind: 'player', playerId }) as any,
    act: (action: unknown, playerId = 'p1') => rt.act(playerId, action),
    /** The action a perfect (skill 1) or hopeless (skill 0) bot would take. */
    botMove: (skill: number, playerId = 'p1') => rt.botAction(playerId, skill, rng),
    advance(ms: number) {
      clock.t += ms;
      rt.fireDueTimers();
    },
    state: <S>() => rt.debugState() as S,
  };
}

/* ----------------------------- Lantern Match ----------------------------- */

const SHORT_SET: Question[] = [
  { id: 's1', type: 'short', prompt: 'What is the capital of France?', accepted: ['Paris'] },
  { id: 's2', type: 'short', prompt: 'Which planet is the biggest?', accepted: ['Jupiter'] },
  { id: 's3', type: 'short', prompt: 'Which planet is called the red one?', accepted: ['Mars', 'Planet Mars'] },
  { id: 's4', type: 'short', prompt: 'Which big cat is the king of the jungle?', accepted: ['Lion'] },
  { id: 's5', type: 'short', prompt: 'Which frozen dessert comes in a cone?', accepted: ['Ice cream'] },
  { id: 's6', type: 'short', prompt: 'What colour do you get by mixing blue and yellow?', accepted: ['Green'] },
];

describe('Lantern Match rules', () => {
  const board = (g: ReturnType<typeof startGame>) => g.state<LanternState>().players.p1!.board;
  const pairOf = (g: ReturnType<typeof startGame>, qid: string) => board(g).cards.flatMap((c, i) => (c.qid === qid ? [i] : []));

  it('keeps the layout on the server: face-down cards show only their kind', () => {
    const g = startGame(lanternMatch, { questions: SHORT_SET });
    const v = g.view();
    expect(v.you.cards).toHaveLength(12);
    for (const c of v.you.cards) {
      expect(Object.keys(c).sort()).toEqual(['i', 'side', 'state']);
      expect(['question', 'answer']).toContain(c.side);
    }
    expect(v.you.cards.filter((c: any) => c.side === 'question')).toHaveLength(6);
    expect(findAnswerLeaks(v)).toEqual([]);
    expect(JSON.stringify(g.rt.view({ kind: 'host' }))).not.toMatch(/Paris|Jupiter/);
  });

  it('matches by the server layout and records the attempt', () => {
    const g = startGame(lanternMatch, { questions: SHORT_SET });
    const qid = board(g).cards[0]!.qid;
    const [a, b] = pairOf(g, qid);
    expect(g.act({ type: 'flip', index: a })).toEqual({ ok: true });
    const one = g.view().you.cards[a!];
    expect(one.state).toBe('up');
    expect(one.text).toBe(one.side === 'question' ? SHORT_SET.find((q) => q.id === qid)!.prompt : answerText(SHORT_SET.find((q) => q.id === qid)!));
    expect(g.act({ type: 'flip', index: b })).toEqual({ ok: true });
    const v = g.view();
    expect(v.you.cards[a!].state).toBe('matched');
    expect(v.you.cards[b!].state).toBe('matched');
    expect(v.you.pairs).toBe(1);
    expect(v.you.last.result).toBe('match');
    expect(g.rt.answerLog()).toMatchObject([{ playerId: 'p1', qid, correct: true }]);
    // Matched cards cannot be turned again.
    expect(g.act({ type: 'flip', index: a })).toMatchObject({ ok: false });
  });

  it('leaves a wrong pair showing, then turns it back over on the next flip', () => {
    const g = startGame(lanternMatch, { questions: SHORT_SET });
    const cards = board(g).cards;
    const first = 0;
    const wrong = cards.findIndex((c) => c.qid !== cards[first]!.qid && c.side !== cards[first]!.side);
    g.act({ type: 'flip', index: first });
    g.act({ type: 'flip', index: wrong });
    let v = g.view();
    expect(v.you.missed).toBe(true);
    expect(v.you.misses).toBe(1);
    expect(v.you.cards[first].state).toBe('up');
    expect(v.you.cards[wrong].state).toBe('up');
    expect(g.rt.answerLog()).toMatchObject([{ qid: cards[first]!.qid, correct: false }]);
    const third = cards.findIndex((_, i) => i !== first && i !== wrong);
    g.act({ type: 'flip', index: third });
    v = g.view();
    expect(v.you.missed).toBe(false);
    expect(v.you.cards[first].state).toBe('down');
    expect(v.you.cards[wrong].state).toBe('down');
    expect(v.you.cards[third].state).toBe('up');
    // The card already showing cannot be flipped twice.
    expect(g.act({ type: 'flip', index: third })).toMatchObject({ ok: false });
  });

  it('a pair of two questions is a miss', () => {
    const g = startGame(lanternMatch, { questions: SHORT_SET });
    const cards = board(g).cards;
    const qs = cards.flatMap((c, i) => (c.side === 'question' ? [i] : []));
    g.act({ type: 'flip', index: qs[0] });
    g.act({ type: 'flip', index: qs[1] });
    expect(g.view().you.misses).toBe(1);
  });

  it('deals a new board when one is cleared, and ranks by pairs then misses', () => {
    const g = startGame(lanternMatch, { questions: SHORT_SET, settings: { pairs: 4 }, players: 2 });
    const qids = [...new Set(board(g).cards.map((c) => c.qid))];
    expect(qids).toHaveLength(4);
    for (const qid of qids) for (const i of pairOf(g, qid)) g.act({ type: 'flip', index: i });
    const v = g.view();
    expect(v.you.cleared).toBe(1);
    expect(v.you.board).toBe(2);
    expect(v.you.pairs).toBe(4);
    expect(v.you.cards.every((c: any) => c.state === 'down')).toBe(true);
    // p2 makes one miss and no pairs.
    const p2 = g.state<LanternState>().players.p2!.board.cards;
    g.act({ type: 'flip', index: 0 }, 'p2');
    g.act({ type: 'flip', index: p2.findIndex((c) => c.qid !== p2[0]!.qid) }, 'p2');
    const res = g.rt.end('host')!;
    expect(res.standings.map((s) => [s.playerId, s.rank, s.label])).toEqual([
      ['p1', 1, '4 pairs, 0 misses'],
      ['p2', 2, '0 pairs, 1 miss'],
    ]);
  });

  it('in Lantern Sprint the first board cleared ends the game', () => {
    const sprint = lanternVariants.find((v) => v.meta.id === 'lantern-match-sprint')!;
    const g = startGame(lanternMatch, { questions: SHORT_SET, variant: sprint, players: 2 });
    const qids = [...new Set(board(g).cards.map((c) => c.qid))];
    for (const qid of qids) for (const i of pairOf(g, qid)) g.act({ type: 'flip', index: i });
    expect(g.rt.status).toBe('ended');
    expect(g.rt.results?.summary).toBe('Player 1 cleared their board first.');
    expect(g.rt.results?.standings[0]).toMatchObject({ playerId: 'p1', rank: 1 });
  });

  it('never puts two answers that read the same on one board', () => {
    const tf: Question[] = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, type: 'truefalse', prompt: `Statement number ${i + 1}`, correct: i % 2 === 0 }));
    const g = startGame(lanternMatch, { questions: [...tf, ...SHORT_SET.slice(0, 2)], settings: { pairs: 6 } });
    const answers = board(g).cards.filter((c) => c.side === 'answer').map((c) => answerText(g.rt['questionMap'].get(c.qid)));
    expect(new Set(answers).size).toBe(answers.length);
    expect(answers.filter((a) => a === 'True')).toHaveLength(1);
  });

  it('ends when time runs out', () => {
    const g = startGame(lanternMatch, { questions: SHORT_SET });
    g.advance(240_000);
    expect(g.rt.status).toBe('ended');
    expect(g.rt.results?.summary).toBe('Time is up.');
    expect(g.errors).toEqual([]);
  });
});

/* ------------------------------ Word Scramble ----------------------------- */

describe('Word Scramble rules', () => {
  const answerOf = (prompt: string) => (SHORT_SET.find((q) => q.prompt === prompt) as Extract<Question, { type: 'short' }>).accepted[0]!;

  it('decides which answers can be scrambled', () => {
    const q = (extra: Partial<Question> & { type: Question['type'] }) => ({ id: 'x', prompt: 'Question?', ...extra }) as Question;
    expect(scrambleSource(q({ type: 'short', accepted: ['Paris'] }))).toBe('Paris');
    expect(scrambleSource(q({ type: 'short', accepted: ['Ox'] }))).toBeNull();
    expect(scrambleSource(q({ type: 'short', accepted: ['The quick brown fox jumps over'] }))).toBeNull();
    expect(scrambleSource(q({ type: 'short', accepted: ['1066 AD'] }))).toBeNull();
    expect(scrambleSource(q({ type: 'short', accepted: ['Apollo 11'] }))).toBe('Apollo 11');
    expect(scrambleSource(q({ type: 'numeric', answer: 56 } as any))).toBeNull();
    expect(scrambleSource(q({ type: 'truefalse', correct: true } as any))).toBeNull();
    expect(scrambleSource(MIXED_SET[0]!)).toBe('Mercury');
    expect(scrambleSource(MIXED_SET[16]!)).toBeNull(); // "75%"
  });

  it('shuffles the letters, keeps the gaps and hides the order', () => {
    const sc = buildScramble('Ice cream', ['Ice cream'], true, createRng(7));
    expect(sc.words).toEqual([3, 5]);
    expect(sc.tiles.map((t) => t.ch).sort().join('')).toBe('ACCEEIMR');
    expect(sc.tiles.map((t) => t.id)).toEqual(sc.tiles.map((_, k) => `t${k}`));
    expect(sc.tiles.map((t) => t.ch).join('')).not.toBe('ICECREAM');
    expect(sc.solution.map((id) => sc.tiles.find((t) => t.id === id)!.ch).join('')).toBe('ICECREAM');
    expect(sc.maxHints).toBe(4);
  });

  it('splits words at spaces and dashes, drops other punctuation, and keeps accented letters', () => {
    expect(buildScramble('Mid-day', ['Mid-day'], true, createRng(1)).words).toEqual([3, 3]);
    expect(buildScramble("Rock 'n' roll", ["Rock 'n' roll"], true, createRng(1)).words).toEqual([4, 1, 4]);
    const cafe = buildScramble('Café', ['Café'], true, createRng(1));
    expect(cafe.tiles.map((t) => t.ch).sort()).toEqual(['A', 'C', 'F', 'É']);
    expect(matchesAnswer('cafe', ['Café'])).toBe(true);
    expect(matchesAnswer('MIDDAY', ['Mid-day'])).toBe(true);
    const imageOnly: Question = { id: 'i', type: 'mcq', prompt: 'Which is a fox?', choices: [{ id: 'a', text: '', media: { kind: 'image', url: '/art/fox.png', alt: 'A fox' } }, { id: 'b', text: 'Badger' }], correct: 'a' };
    expect(scrambleSource(imageOnly)).toBeNull();
  });

  it('accepts answers in any case and without punctuation, and rejects wrong ones', () => {
    expect(matchesAnswer('paris', ['Paris'])).toBe(true);
    expect(matchesAnswer(' PARIS! ', ['Paris'])).toBe(true);
    expect(matchesAnswer('ICECREAM', ['Ice cream'])).toBe(true);
    expect(matchesAnswer('ice-cream', ['Ice cream'])).toBe(true);
    expect(matchesAnswer('PARSI', ['Paris'])).toBe(false);
    expect(matchesAnswer('Lyon', ['Paris'])).toBe(false);
    expect(matchesAnswer('', ['Paris'])).toBe(false);
  });

  it('scores 10 a letter for a solved word and keeps wrong tries open', () => {
    const g = startGame(wordScramble, { questions: SHORT_SET });
    let w = g.view().you.word;
    expect(w.kind).toBe('scramble');
    const answer = answerOf(w.q.prompt);
    expect(JSON.stringify(g.view()).toLowerCase()).not.toContain(answer.toLowerCase());
    expect(g.act({ type: 'solve', iid: w.iid, text: 'wrong guess' })).toEqual({ ok: true });
    w = g.view().you.word;
    expect(w.tries).toBe(1);
    expect(g.view().you.points).toBe(0);
    expect(g.act({ type: 'solve', iid: w.iid, text: answer.toLowerCase() })).toEqual({ ok: true });
    const v = g.view();
    expect(v.you.points).toBe(10 * answer.length);
    expect(v.you.word).toBeNull();
    expect(v.you.last).toMatchObject({ correct: true, points: 10 * answer.length });
    expect(v.you.answerText).toBe(answer);
    expect(g.rt.answerLog()).toMatchObject([{ qid: 's1', correct: true }]);
    // Moving on shows the next word.
    expect(g.act({ type: 'next' })).toEqual({ ok: true });
    expect(g.view().you.word.q.prompt).toBe(SHORT_SET[1]!.prompt);
  });

  it('hints show the next letter and cost 10 points each, up to half the letters', () => {
    const g = startGame(wordScramble, { questions: SHORT_SET });
    const w = g.view().you.word; // "Paris": 5 letters, 2 hints
    expect(w.maxHints).toBe(2);
    g.act({ type: 'hint', iid: w.iid });
    const hinted = g.view().you.word;
    expect(hinted.hinted).toHaveLength(1);
    expect(hinted.tiles.find((t: any) => t.id === hinted.hinted[0]).ch).toBe('P');
    expect(hinted.value).toBe(40);
    g.act({ type: 'hint', iid: w.iid });
    expect(g.view().you.word.hinted.map((id: string) => hinted.tiles.find((t: any) => t.id === id).ch).join('')).toBe('PA');
    expect(g.act({ type: 'hint', iid: w.iid })).toMatchObject({ ok: false, message: 'No hints left for this word.' });
    g.act({ type: 'solve', iid: w.iid, text: 'Paris' });
    expect(g.view().you.points).toBe(30);
  });

  it('has no hints in No Peeking', () => {
    const g = startGame(wordScramble, { questions: SHORT_SET, variant: scrambleVariants.find((v) => v.meta.id === 'word-scramble-no-hints')! });
    const w = g.view().you.word;
    expect(w.maxHints).toBe(0);
    expect(g.act({ type: 'hint', iid: w.iid })).toMatchObject({ ok: false, message: 'Hints are switched off.' });
  });

  it('skipping counts as wrong and reveals the answer', () => {
    const g = startGame(wordScramble, { questions: SHORT_SET });
    const w = g.view().you.word;
    g.act({ type: 'skip', iid: w.iid });
    const v = g.view();
    expect(v.you.points).toBe(0);
    expect(v.you.last).toMatchObject({ correct: false, text: 'Skipped' });
    expect(v.you.answerText).toBe('Paris');
    expect(g.rt.answerLog()).toMatchObject([{ qid: 's1', correct: false }]);
    // The next word follows on its own after a pause.
    g.advance(3000);
    expect(g.view().you.word.q.prompt).toBe(SHORT_SET[1]!.prompt);
  });

  it('asks unsuitable answers as ordinary questions', () => {
    const g = startGame(wordScramble, { questions: [MIXED_SET[3]!, MIXED_SET[1]!, ...SHORT_SET.slice(0, 2)] });
    const w = g.view().you.word;
    expect(w.kind).toBe('plain');
    expect(w.question.q).toMatchObject({ type: 'numeric', prompt: 'What is 7 × 8?' });
    g.act(g.botMove(1));
    expect(g.view().you.points).toBe(50);
    g.act({ type: 'next' });
    expect(g.view().you.word).toMatchObject({ kind: 'plain', question: { q: { type: 'truefalse' } } });
  });

  it('lets only bots answer a scrambled word in its own form', () => {
    const choice: Question[] = [MIXED_SET[0]!, MIXED_SET[8]!, MIXED_SET[13]!, MIXED_SET[18]!];
    const human = startGame(wordScramble, { questions: choice });
    const w = human.view().you.word;
    expect(w.kind).toBe('scramble');
    expect(w.q).toEqual({ type: 'short', prompt: 'Which planet is closest to the Sun?' });
    expect(human.act({ type: 'answer', iid: w.iid, answer: { type: 'mcq', choiceId: 'c0' } })).toMatchObject({ ok: false });
    const bot = startGame(wordScramble, { questions: choice, bots: true });
    const moves: string[] = [];
    for (let i = 0; i < 10 && bot.view().you.solved === 0; i++) {
      const move = bot.botMove(1) as any;
      moves.push(move.type);
      expect(bot.act(move)).toEqual({ ok: true });
    }
    expect(bot.view().you.solved).toBe(1);
    expect(moves.at(-1)).toBe('answer');
  });

  it('in Scramble Rush an unsolved word runs out after 20 seconds and counts as wrong', () => {
    const g = startGame(wordScramble, { questions: SHORT_SET, variant: scrambleVariants.find((v) => v.meta.id === 'word-scramble-timed')! });
    const w = g.view().you.word;
    expect(w.deadline - w.shownAt).toBe(20_000);
    g.advance(20_000);
    expect(g.view().you.word).not.toBeNull();
    g.advance(700);
    const v = g.view();
    expect(v.you.word).toBeNull();
    expect(v.you.last).toMatchObject({ correct: false, text: 'Out of time' });
    expect(g.rt.answerLog()).toMatchObject([{ qid: 's1', correct: false }]);
    expect(g.act({ type: 'solve', iid: w.iid, text: 'Paris' })).toMatchObject({ ok: false });
  });

  it('ends when everyone has done every word', () => {
    const g = startGame(wordScramble, { questions: SHORT_SET.slice(0, 4) });
    for (let i = 0; i < 4; i++) {
      const w = g.view().you.word;
      g.act({ type: 'skip', iid: w.iid });
      if (i < 3) g.act({ type: 'next' });
    }
    expect(g.rt.status).toBe('ended');
    expect(g.rt.results?.summary).toBe('Every word is done.');
    const s = g.state<ScrambleState>();
    expect(s.players.p1!.done).toBe(4);
  });
});

/* ------------------------------- Time Attack ------------------------------ */

describe('Time Attack rules', () => {
  it('raises the multiplier every five in a row, up to ×3', () => {
    expect([0, 4, 5, 9, 10, 14, 15, 40].map(multiplierFor)).toEqual([1, 1, 2, 2, 3, 3, 3, 3]);
    const g = startGame(timeAttack, { questions: MIXED_SET });
    for (let i = 0; i < 15; i++) expect(g.act(g.botMove(1))).toEqual({ ok: true });
    let v = g.view();
    expect(v.you.score).toBe(5 * 100 + 5 * 200 + 5 * 300);
    expect(v.you.multiplier).toBe(3);
    g.act(g.botMove(0));
    v = g.view();
    expect(v.you.multiplier).toBe(1);
    expect(v.you.inRow).toBe(0);
    g.act(g.botMove(1));
    expect(g.view().you.score).toBe(3000 + 100);
  });

  it('takes seconds off the clock for a wrong answer', () => {
    const g = startGame(timeAttack, { questions: MIXED_SET });
    const before = g.view().you.endsAt;
    expect(g.view().you.endsAt - g.view().you.startedAt).toBe(60_000);
    g.act(g.botMove(0));
    const v = g.view();
    expect(v.you.endsAt).toBe(before - 3000);
    expect(v.you.last).toMatchObject({ correct: false, text: '−3 s' });
    g.advance(57_000 + 600);
    expect(g.rt.status).toBe('ended');
  });

  it('ends the run when penalties empty the clock', () => {
    const g = startGame(timeAttack, { questions: MIXED_SET, settings: { clock: '30', penaltySeconds: 10 } });
    g.advance(15_000);
    g.act(g.botMove(0));
    expect(g.rt.status).toBe('running');
    g.act(g.botMove(0));
    expect(g.rt.status).toBe('ended');
    expect(g.rt.results?.summary).toBe('The clock has stopped.');
  });

  it('ends the run when the clock runs out', () => {
    const g = startGame(timeAttack, { questions: MIXED_SET });
    g.act(g.botMove(1));
    g.advance(60_000);
    expect(g.rt.status).toBe('running'); // a short grace for answers already on their way
    g.advance(600);
    expect(g.rt.status).toBe('ended');
    expect(g.rt.results?.standings[0]).toMatchObject({ score: 100, label: '100 points, 1 correct' });
  });

  it('ends on the first mistake in One Slip', () => {
    const g = startGame(timeAttack, { questions: MIXED_SET, variant: timeAttackVariants.find((v) => v.meta.id === 'time-attack-sudden')! });
    g.act(g.botMove(1));
    g.act(g.botMove(0));
    expect(g.rt.status).toBe('ended');
    expect(g.rt.results?.summary).toBe('One slip ended the run.');
  });

  it('runs for two minutes in Marathon Attack', () => {
    const g = startGame(timeAttack, { questions: MIXED_SET, variant: timeAttackVariants.find((v) => v.meta.id === 'time-attack-long')! });
    expect(g.view().you.endsAt - g.view().you.startedAt).toBe(120_000);
  });
});

/* ------------------------------ Survival Run ------------------------------ */

describe('Survival Run rules', () => {
  /** Answer the current question and move straight on to the next. */
  const answer = (g: ReturnType<typeof startGame>, right: boolean) => {
    expect(g.act(g.botMove(right ? 1 : 0))).toEqual({ ok: true });
    if (g.view().you.phase === 'result') expect(g.act({ type: 'next' })).toEqual({ ok: true });
  };

  it('shrinks the timer by half a second per correct answer, down to 6 seconds', () => {
    expect(timerAfter(0)).toBe(START_MS);
    expect(timerAfter(1)).toBe(14_500);
    expect(timerAfter(18)).toBe(FLOOR_MS);
    expect(timerAfter(40)).toBe(FLOOR_MS);
    const g = startGame(survivalRun, { questions: MIXED_SET });
    let q = g.view().you.question;
    expect(q.deadline - q.shownAt).toBe(15_000);
    for (let i = 0; i < 20; i++) answer(g, true);
    q = g.view().you.question;
    expect(g.view().you.timerMs).toBe(6000);
    expect(q.deadline - q.shownAt).toBe(6000);
  });

  it('wins a heart back every 10 correct answers, up to the start', () => {
    const g = startGame(survivalRun, { questions: MIXED_SET });
    answer(g, false);
    expect(g.view().you.hearts).toBe(2);
    for (let i = 0; i < 9; i++) answer(g, true);
    expect(g.view().you.hearts).toBe(2);
    expect(g.act(g.botMove(1))).toEqual({ ok: true });
    expect(g.view().you).toMatchObject({ hearts: 3, heartChange: 1, last: { text: 'Heart restored' } });
    g.act({ type: 'next' });
    for (let i = 0; i < 10; i++) answer(g, true);
    expect(g.view().you.hearts).toBe(3); // never more than the start
  });

  it('costs a heart for running out of time, and ends at no hearts', () => {
    const g = startGame(survivalRun, { questions: MIXED_SET });
    g.advance(15_000 + 600);
    expect(g.view().you).toMatchObject({ hearts: 2, phase: 'result', last: { correct: false, text: 'Out of time' } });
    expect(g.rt.answerLog()).toHaveLength(1);
    g.advance(2500); // the next question appears by itself
    expect(g.view().you.phase).toBe('question');
    answer(g, false);
    answer(g, false);
    expect(g.rt.status).toBe('ended');
    expect(g.rt.results?.summary).toBe('Out of hearts after 0 correct answers.');
  });

  it('reshuffles the deck when it runs out', () => {
    const g = startGame(survivalRun, { questions: SHORT_SET.slice(0, 5) });
    for (let i = 0; i < 12; i++) answer(g, true);
    expect(g.view().you.correct).toBe(12);
    expect(g.rt.status).toBe('running');
  });

  it('has one heart and no restores in Hardcore Run', () => {
    const g = startGame(survivalRun, { questions: MIXED_SET, variant: survivalVariants[0]! });
    expect(g.view().you.hearts).toBe(1);
    for (let i = 0; i < 10; i++) answer(g, true);
    expect(g.view().you.hearts).toBe(1);
    answer(g, false);
    expect(g.rt.status).toBe('ended');
    expect(g.rt.results?.standings[0]?.score).toBe(10);
  });
});

/* ----------------------------- Flashcard Study ---------------------------- */

describe('Flashcard Study rules', () => {
  const study = (g: ReturnType<typeof startGame>) => g.state<StudyState>().students.p1!;
  const grade = (g: ReturnType<typeof startGame>, knew: boolean) => {
    const card = g.view().you.card;
    expect(g.act({ type: 'flip', iid: card.iid })).toEqual({ ok: true });
    expect(g.act({ type: 'grade', iid: card.iid, knew })).toEqual({ ok: true });
    return card;
  };
  const current = (g: ReturnType<typeof startGame>) => study(g).card?.qid;

  it('shows the back only after the card is turned over', () => {
    const g = startGame(flashcardStudy, { questions: FLASHCARD_SET });
    const card = g.view().you.card;
    expect(card.q).toEqual({ type: 'flashcard', prompt: 'Herbivore' });
    expect(card).not.toHaveProperty('back');
    expect(JSON.stringify(g.view())).not.toContain('only plants');
    expect(g.act({ type: 'grade', iid: card.iid, knew: true })).toMatchObject({ ok: false, message: 'Turn the card over first.' });
    g.act({ type: 'flip', iid: card.iid });
    expect(g.view().you.card).toMatchObject({ flipped: true, back: 'An animal that eats only plants' });
    expect(findAnswerLeaks(g.view())).toEqual([]);
  });

  it('turns every question type into a card with its answer on the back', () => {
    const g = startGame(flashcardStudy, { questions: MIXED_SET });
    const backs: string[] = [];
    for (let i = 0; i < MIXED_SET.length; i++) {
      const card = g.view().you.card;
      g.act({ type: 'flip', iid: card.iid });
      backs.push(g.view().you.card.back);
      g.act({ type: 'grade', iid: card.iid, knew: true });
    }
    expect(backs).toContain('Mercury');
    expect(backs).toContain('True');
    expect(backs).toContain('56');
    expect(backs).toContain('Atom, Cell, Mouse, Elephant');
    expect(backs).toContain('Japan → Tokyo, Kenya → Nairobi, Peru → Lima');
    expect(backs).toContain('Dolphin, Bat');
  });

  it('moves cards between boxes and brings lower boxes back sooner', () => {
    const g = startGame(flashcardStudy, { questions: FLASHCARD_SET });
    expect(current(g)).toBe('f1');
    grade(g, false); // "Not yet": f1 stays in box 1 and comes back after two other cards
    expect(study(g).boxes.f1).toBe(1);
    expect(current(g)).toBe('f2');
    grade(g, true); // "Knew it": f2 moves up to box 2 and comes back after five
    expect(study(g).boxes.f2).toBe(2);
    const between: string[] = [];
    while (current(g) !== 'f2') {
      between.push(current(g)!);
      grade(g, true);
    }
    // The missed card came back after two others; the known one waited at least five.
    expect(between.slice(0, 2)).toEqual(['f3', 'f1']);
    expect(between.length).toBeGreaterThanOrEqual(5);
    grade(g, true); // second "Knew it" in a row: mastered
    expect(study(g).boxes.f2).toBe(3);
    expect(g.view().you.mastered).toBe(1);
    expect(g.view().you.last).toEqual({ knew: true, box: 3, mastered: true });
    for (let i = 0; i < 30 && current(g); i++) {
      expect(current(g)).not.toBe('f2');
      grade(g, true);
    }
    expect(g.rt.status).toBe('ended');
  });

  it('keeps bringing in new cards while the same ones are missed', () => {
    const g = startGame(flashcardStudy, { questions: FLASHCARD_SET });
    const shown: string[] = [];
    for (let i = 0; i < 20; i++) {
      shown.push(current(g)!);
      grade(g, false);
    }
    expect(new Set(shown).size).toBe(8);
    // Missed cards come back every few cards rather than waiting for the whole pile.
    expect(shown.slice(0, 4)).toEqual(['f1', 'f2', 'f3', 'f1']);
    expect(g.view().you).toMatchObject({ box1: 8, box2: 0, mastered: 0, notYet: 20 });
  });

  it('"Not yet" sends a card in box 2 back to box 1, and a lone card can repeat', () => {
    const g = startGame(flashcardStudy, { questions: FLASHCARD_SET.slice(0, 2) });
    grade(g, true); // f1 to box 2
    grade(g, true); // f2 to box 2
    expect(current(g)).toBe('f1');
    grade(g, false);
    expect(study(g).boxes.f1).toBe(1);
    expect(current(g)).toBe('f2');
    grade(g, true); // f2 mastered: only f1 is left, so it comes straight back
    expect(current(g)).toBe('f1');
    grade(g, false);
    expect(current(g)).toBe('f1');
  });

  it('records every self-grade and ends when every card is mastered', () => {
    const g = startGame(flashcardStudy, { questions: FLASHCARD_SET.slice(0, 3) });
    let guard = 0;
    while (g.rt.status === 'running' && guard++ < 50) grade(g, guard % 4 !== 0);
    expect(g.rt.status).toBe('ended');
    const res = g.rt.results!;
    expect(res.summary).toBe('Every card is mastered.');
    expect(res.outcome).toBe('coop-win');
    const log = g.rt.answerLog();
    expect(log.length).toBe(guard);
    expect(log.filter((a) => !a.correct).length).toBeGreaterThan(0);
    const knew = log.filter((a) => a.correct).length;
    expect(res.standings[0]?.label).toBe(`3 of 3 mastered, knew ${Math.round((knew / log.length) * 100)}%`);
  });

  it('masters a card with one "Knew it" in Quick Review', () => {
    const g = startGame(flashcardStudy, { questions: FLASHCARD_SET.slice(0, 2), variant: studyVariants[0]! });
    grade(g, true);
    expect(study(g).boxes.f1).toBe(3);
    grade(g, true);
    expect(g.rt.status).toBe('ended');
  });

  it('ends at the time limit', () => {
    const g = startGame(flashcardStudy, { questions: FLASHCARD_SET });
    g.advance(600_000);
    expect(g.rt.status).toBe('ended');
    expect(g.rt.results?.summary).toBe('Time is up.');
    expect(g.rt.results?.outcome).toBe('competitive');
  });
});
