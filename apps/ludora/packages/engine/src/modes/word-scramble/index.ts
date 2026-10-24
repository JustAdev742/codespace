/*
 * Word Scramble: the letters of each answer are shuffled into tiles and the
 * player spells the answer back. The scramble is built on the server from a
 * seeded shuffle; tiles get ids by their shuffled position, so the payload
 * says nothing about the order. The answer itself stays in the server state
 * until the word is solved, skipped or runs out of time.
 */
import { z } from 'zod';
import { answerSchema, type Question, type Rng } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import { DEADLINE_GRACE_MS } from '../../mechanics/syncRounds.ts';
import { normalizeAnswerText } from '../../questions/grade.ts';
import { answerText } from '../flashcard-study/answer-text.ts';
import { recordingAs } from '../rules.ts';
import { meta, settings } from './meta.ts';

type Settings = { hints: boolean; wordTimer: boolean; oneTry: boolean; secondChance: boolean; streak: boolean };

export const POINTS_PER_LETTER = 10;
export const HINT_COST = 10;
/** Points for an answer asked as an ordinary question because it cannot be scrambled. */
export const PLAIN_POINTS = 50;
const MAX_SCRAMBLE_LENGTH = 24;
const DEFAULT_LIMIT_SEC = meta.common.defaults.timeLimitSec!;
/** How long the result of a word stays up before the next one, unless the player moves on. */
const PAUSE_SOLVED_MS = 1400;
const PAUSE_MISSED_MS = 3000;

export interface Scramble {
  /** Tiles in the order shown. Ids are positions in that order, so they give nothing away. */
  tiles: { id: string; ch: string }[];
  /** Secret: tile ids in answer order. */
  solution: string[];
  /** Letters in each word of the answer, for the gaps. */
  words: number[];
  /** Secret: answers that count as solved. */
  accepted: string[];
  maxHints: number;
  hints: number;
  /** Wrong attempts at this word. */
  tries: number;
}

interface Word {
  iid: string;
  /** Null when the answer cannot be scrambled and the question is asked as it is. */
  scramble: Scramble | null;
  deadline: number | null;
}

interface Player {
  stream: StreamState;
  word: Word | null;
  points: number;
  done: number;
  solved: number;
  hintsUsed: number;
  finished: boolean;
  /** Between words: when the next word appears. */
  nextAt: number | null;
  /** Between words: the answer to the word that just ended. */
  answerText: string | null;
  /** Words in the set this player plays first; second chances come after them. */
  main: number;
  /** Words this player will play in all: the main words plus any second chances. */
  target: number;
  /** Second chances still to come (question ids). */
  again: string[];
  /** The word on screen is a second chance. */
  retry: boolean;
  /** Words solved in a row. */
  inRow: number;
}

export interface State {
  players: Record<PlayerId, Player>;
  /** Words each player gets. */
  total: number;
  endsAt: number;
}

const iid = z.string().max(24);
const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('solve'), iid, text: z.string().max(200) }),
  z.object({ type: z.literal('answer'), iid, answer: answerSchema }),
  z.object({ type: z.literal('hint'), iid }),
  z.object({ type: z.literal('skip'), iid }),
  z.object({ type: z.literal('next') }),
]);
type Action = z.infer<typeof action>;

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

/** The text to scramble for a question, or null when it should be asked as an ordinary question. */
export function scrambleSource(q: Question): string | null {
  // True or false would be given away by its own letters; the other types have no single text answer.
  if (q.type !== 'short' && q.type !== 'mcq') return null;
  if (q.type === 'mcq' && !q.choices.find((c) => c.id === q.correct)?.text) return null;
  const text = answerText(q).trim();
  if (!text || text.length > MAX_SCRAMBLE_LENGTH) return null;
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const digits = text.match(/\p{N}/gu)?.length ?? 0;
  if (letters < 3 || digits > letters) return null;
  return text;
}

/** Letters and digits of each word. Spaces, dashes and slashes split words; other punctuation is dropped. */
function tileWords(text: string): string[][] {
  const words: string[][] = [];
  let current: string[] = [];
  for (const ch of Array.from(text.normalize('NFC'))) {
    if (/[\s\-\u2010-\u2015/]/u.test(ch)) {
      if (current.length) words.push(current);
      current = [];
    } else if (/[\p{L}\p{N}]/u.test(ch)) {
      const upper = ch.toUpperCase();
      current.push(Array.from(upper).length === 1 ? upper : ch);
    }
  }
  if (current.length) words.push(current);
  return words;
}

export function buildScramble(text: string, accepted: readonly string[], hints: boolean, rng: Rng): Scramble {
  const words = tileWords(text);
  const letters = words.flat();
  const positions = letters.map((_, i) => i);
  // order[k] is the answer position of the tile shown k-th. Avoid showing the answer already spelt out.
  const spellsAnswer = (order: number[]) => order.every((pos, k) => letters[pos] === letters[k]);
  let order = rng.shuffle(positions);
  for (let i = 0; i < 6 && letters.length > 1 && spellsAnswer(order); i++) order = rng.shuffle(positions);
  if (letters.length > 1 && spellsAnswer(order)) order = [...positions.slice(1), positions[0]!];
  const tiles = order.map((pos, k) => ({ id: `t${k}`, ch: letters[pos]! }));
  const solution = Array.from({ length: letters.length }, () => '');
  order.forEach((pos, k) => (solution[pos] = `t${k}`));
  return {
    tiles,
    solution,
    words: words.map((w) => w.length),
    accepted: [...accepted],
    maxHints: hints ? Math.floor(letters.length / 2) : 0,
    hints: 0,
    tries: 0,
  };
}

/** Spaces ignored too, so "ice cream" and "icecream" both spell the tiles. */
const letterKey = (s: string) => normalizeAnswerText(s.replace(/\s+/g, '')).replace(/ /g, '');

/** Case- and punctuation-insensitive check of a spelt answer against the accepted answers. */
export function matchesAnswer(text: string, accepted: readonly string[]): boolean {
  const given = normalizeAnswerText(text);
  const key = letterKey(text);
  if (!given || !key) return false;
  return accepted.some((a) => normalizeAnswerText(a) === given || letterKey(a) === key);
}

export const wordValue = (sc: Scramble) => Math.max(0, POINTS_PER_LETTER * sc.tiles.length - HINT_COST * sc.hints);

/** Spelling streak: what the next solved word is multiplied by after `inRow` solved in a row. */
export const streakMultiplier = (inRow: number) => Math.min(3, inRow + 1);

/** What a word is worth to this player now: streak multiplier, then half for a second chance. */
function worth(p: Player, base: number, ctx: ModeContext<Settings>): number {
  const value = ctx.settings.streak ? base * streakMultiplier(p.inRow) : base;
  return p.retry ? Math.round(value / 2) : value;
}

const acceptedFor = (q: Question): string[] => (q.type === 'short' ? [...q.accepted] : [answerText(q)]);

function startWord(p: Player, playerId: PlayerId, ctx: ModeContext<Settings>) {
  // Second chances come once the main words are done, in the order they were missed.
  p.retry = p.done >= p.main && p.again.length > 0;
  if (p.retry) p.stream.iid = ctx.questions.present(p.again.shift()!);
  else streamNext(p.stream, ctx);
  const id = p.stream.iid!;
  const q = ctx.questions.get(ctx.questions.instance(id).qid);
  const source = scrambleSource(q);
  const deadline = ctx.settings.wordTimer ? ctx.now() + ctx.questions.timeLimitMs(id) : null;
  p.word = { iid: id, scramble: source ? buildScramble(source, acceptedFor(q), ctx.settings.hints, ctx.rng) : null, deadline };
  p.nextAt = null;
  p.answerText = null;
  ctx.clearTimer(`next:${playerId}`);
  if (deadline !== null) ctx.setTimer(`word:${playerId}`, deadline + DEADLINE_GRACE_MS);
}

function newPlayer(playerId: PlayerId, total: number, ctx: ModeContext<Settings>): Player {
  const p: Player = {
    stream: streamInit(ctx, { present: false }),
    word: null,
    points: 0,
    done: 0,
    solved: 0,
    hintsUsed: 0,
    finished: false,
    nextAt: null,
    answerText: null,
    main: total,
    target: total,
    again: [],
    retry: false,
    inRow: 0,
  };
  startWord(p, playerId, ctx);
  return p;
}

function checkEnd(s: State, ctx: ModeContext) {
  const active = ctx.players().filter((p) => s.players[p.id]);
  if (active.length > 0 && active.every((p) => s.players[p.id]!.finished)) ctx.endGame('Every word is done.');
}

interface WordEnd {
  correct: boolean;
  points: number;
  text: string;
  /** True when the stream helper already graded and recorded the answer. */
  recorded: boolean;
}

function endWord(s: State, p: Player, playerId: PlayerId, ctx: ModeContext<Settings>, end: WordEnd) {
  const w = p.word!;
  const inst = ctx.questions.instance(w.iid);
  if (!end.recorded) {
    p.stream.answered++;
    if (end.correct) {
      p.stream.correct++;
      p.stream.streak++;
      p.stream.bestStreak = Math.max(p.stream.bestStreak, p.stream.streak);
    } else p.stream.streak = 0;
    const explanation = ctx.questions.explanation(w.iid);
    p.stream.last = {
      iid: w.iid,
      correct: end.correct,
      partial: end.correct ? 1 : 0,
      reveal: ctx.questions.reveal(w.iid),
      ...(explanation ? { explanation } : {}),
    };
    p.stream.iid = null;
    // A second chance counts for reports, not again for rewards.
    ctx.recordAnswer({ playerId, qid: inst.qid, correct: end.correct, partial: end.correct ? 1 : 0, responseMs: ctx.now() - inst.shownAt, ...(p.retry ? { kind: 'attempt' as const } : {}) });
  }
  if (p.stream.last) {
    p.stream.last.points = end.points;
    p.stream.last.text = end.text;
  }
  p.points += end.points;
  if (end.correct) p.solved++;
  p.inRow = end.correct ? p.inRow + 1 : 0;
  if (!end.correct && ctx.settings.secondChance && !p.retry) {
    p.again.push(inst.qid);
    p.target++;
    ctx.feed('That word comes back once after your last word, for half points.', { to: [playerId], tone: 'info' });
  }
  p.done++;
  p.answerText = answerText(ctx.questions.get(inst.qid));
  p.word = null;
  ctx.clearTimer(`word:${playerId}`);
  if (p.done >= p.target) {
    p.finished = true;
    p.nextAt = null;
    ctx.clearTimer(`next:${playerId}`);
    ctx.feed(`${ctx.player(playerId)?.name ?? 'A player'} finished every word.`, { tone: 'good' });
    checkEnd(s, ctx);
    return;
  }
  p.nextAt = ctx.now() + (end.correct ? PAUSE_SOLVED_MS : PAUSE_MISSED_MS);
  ctx.setTimer(`next:${playerId}`, p.nextAt);
}

function solved(s: State, p: Player, playerId: PlayerId, sc: Scramble, ctx: ModeContext<Settings>) {
  const points = worth(p, wordValue(sc), ctx);
  endWord(s, p, playerId, ctx, { correct: true, points, text: `+${points}`, recorded: false });
}

function wordView(w: Word, p: Player, ctx: ModeContext<Settings>) {
  if (!w.scramble) return { kind: 'plain' as const, iid: w.iid, question: ctx.questions.view(w.iid, { deadline: w.deadline }), value: worth(p, PLAIN_POINTS, ctx), deadline: w.deadline };
  const sc = w.scramble;
  const shown = ctx.questions.view(w.iid);
  return {
    kind: 'scramble' as const,
    iid: w.iid,
    // Only the prompt: the choices of a choice question would give the answer away.
    q: { type: 'short' as const, prompt: shown.q.prompt, ...(shown.q.media ? { media: shown.q.media } : {}) },
    shownAt: shown.shownAt,
    deadline: w.deadline,
    tiles: sc.tiles,
    words: sc.words,
    hinted: sc.solution.slice(0, sc.hints),
    hints: sc.hints,
    maxHints: sc.maxHints,
    value: worth(p, wordValue(sc), ctx),
    tries: sc.tries,
  };
}

function leaders(s: State, ctx: ModeContext, me: PlayerId | null, limit: number) {
  const sorted = ctx
    .players()
    .filter((p) => s.players[p.id])
    .map((p) => {
      const pl = s.players[p.id]!;
      return { playerId: p.id, name: p.name, teamId: p.teamId, points: pl.points, done: pl.done, solved: pl.solved, finished: pl.finished, isYou: p.id === me };
    })
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  // Ranked over everyone, so a player shown below the cut still gets their real place. Ties share a rank.
  const all: ((typeof sorted)[number] & { rank: number })[] = [];
  sorted.forEach((r, i) => {
    const prev = all[i - 1];
    all.push({ ...r, rank: prev && prev.points === r.points ? prev.rank : i + 1 });
  });
  const top = all.slice(0, limit);
  const mine = all.find((r) => r.isYou);
  if (mine && !top.includes(mine)) top.push(mine);
  return top;
}

function teamRows(s: State, ctx: ModeContext) {
  return ctx.teams().map((t) => {
    const members = ctx.players().filter((p) => p.teamId === t.id && s.players[p.id]);
    const avg = members.length ? Math.round(members.reduce((n, p) => n + s.players[p.id]!.points, 0) / members.length) : 0;
    return { teamId: t.id, name: t.name, hue: t.hue, score: avg, members: members.length };
  });
}

export const wordScramble = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const total = Math.min(ctx.questions.count(), ctx.common.questionLimit || Infinity);
    const limitSec = ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec : DEFAULT_LIMIT_SEC;
    const s: State = { players: {}, total, endsAt: ctx.now() + limitSec * 1000 };
    for (const p of ctx.players()) s.players[p.id] = newPlayer(p.id, total, ctx);
    ctx.setTimer('time', s.endsAt);
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    s.players[p.id] ??= newPlayer(p.id, s.total, ctx);
  },
  onPlayerLeave(s, _p, ctx) {
    checkEnd(s, ctx);
  },
  onAction(s, playerId, a, ctx) {
    const p = s.players[playerId];
    if (!p) return { error: 'You are not in this game.' };
    if (p.finished) return { error: 'You have finished every word.' };
    if (a.type === 'next') {
      if (p.word || p.nextAt === null) return { error: 'Finish this word first.' };
      startWord(p, playerId, ctx);
      return;
    }
    const w = p.word;
    if (!w || a.iid !== w.iid) return { error: 'That word has already finished.' };
    if (w.deadline !== null && ctx.now() > w.deadline + DEADLINE_GRACE_MS) return { error: 'Time is up for that word.' };
    const sc = w.scramble;
    switch (a.type) {
      case 'skip':
        return endWord(s, p, playerId, ctx, { correct: false, points: 0, text: 'Skipped', recorded: false });
      case 'hint':
        if (!sc) return { error: 'There are no tiles to give a hint for.' };
        if (sc.maxHints === 0) return { error: 'Hints are switched off.' };
        if (sc.hints >= sc.maxHints) return { error: 'No hints left for this word.' };
        sc.hints++;
        p.hintsUsed++;
        return;
      case 'solve':
        if (!sc) return { error: 'Answer this one with the answer buttons.' };
        if (matchesAnswer(a.text, sc.accepted)) return solved(s, p, playerId, sc, ctx);
        if (ctx.settings.oneTry) return endWord(s, p, playerId, ctx, { correct: false, points: 0, text: 'Only one try per word', recorded: false });
        sc.tries++;
        return;
      case 'answer': {
        if (!sc) {
          const points = worth(p, PLAIN_POINTS, ctx);
          const res = streamSubmit(p.stream, playerId, w.iid, a.answer, p.retry ? recordingAs(ctx, 'attempt') : ctx);
          if ('error' in res) return res;
          return endWord(s, p, playerId, ctx, {
            correct: res.correct,
            points: res.correct ? points : 0,
            text: res.correct ? `+${points}` : 'No points',
            recorded: true,
          });
        }
        // Practice bots answer in the question's own form. Players spell the word.
        if (!ctx.player(playerId)?.isBot) return { error: 'Spell the answer with the tiles, or type it.' };
        if (ctx.questions.grade(w.iid, a.answer).correct) return solved(s, p, playerId, sc, ctx);
        if (ctx.settings.oneTry) return endWord(s, p, playerId, ctx, { correct: false, points: 0, text: 'Only one try per word', recorded: false });
        sc.tries++;
        return;
      }
    }
  },
  onTimer(s, id, ctx) {
    if (id === 'time') {
      ctx.endGame('Time is up.');
      return;
    }
    const playerId = id.slice(id.indexOf(':') + 1);
    const p = s.players[playerId];
    if (!p || p.finished) return;
    if (id.startsWith('word:') && p.word) endWord(s, p, playerId, ctx, { correct: false, points: 0, text: 'Out of time', recorded: false });
    else if (id.startsWith('next:') && !p.word) startWord(p, playerId, ctx);
  },
  view(s, viewer, ctx) {
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const p = me ? s.players[me] : undefined;
    const present = ctx.players().filter((pl) => s.players[pl.id]);
    const last = p && !p.word ? p.stream.last : null;
    return {
      endsAt: s.endsAt,
      // Players count their own second chances; the big screen counts the set.
      total: p ? p.target : s.total,
      hints: ctx.settings.hints,
      timed: ctx.settings.wordTimer,
      playing: present.length,
      finished: present.filter((pl) => s.players[pl.id]!.finished).length,
      leaders: leaders(s, ctx, me, viewer.kind === 'host' ? 40 : 6),
      teams: ctx.teams().length ? teamRows(s, ctx) : null,
      you: p
        ? {
            points: p.points,
            done: p.done,
            solved: p.solved,
            finished: p.finished,
            nextAt: p.nextAt,
            word: p.word ? wordView(p.word, p, ctx) : null,
            last,
            answerText: last ? p.answerText : null,
            lastQuestion: last ? ctx.questions.view(last.iid) : null,
          }
        : null,
    };
  },
  results(s, ctx) {
    const standings = ctx.everyone().map((pl) => {
      const p = s.players[pl.id];
      const points = p?.points ?? 0;
      return { playerId: pl.id, score: points, label: `${plural(points, 'point', 'points')}, ${plural(p?.solved ?? 0, 'word', 'words')} solved` };
    });
    const teams = ctx.teams().length ? teamRows(s, ctx).map((t) => ({ teamId: t.teamId, score: t.score, label: `${t.score.toLocaleString('en-GB')} points on average` })) : undefined;
    return { standings, ...(teams ? { teamStandings: teams } : {}), summary: 'Final scores.' };
  },
  bot(view, ctx) {
    const you = view?.you;
    if (!you || you.finished) return null;
    const w = you.word;
    if (!w) return you.nextAt !== null ? { type: 'next' } : null;
    if (w.kind === 'plain') return { type: 'answer', iid: w.iid, answer: ctx.answer(w.iid) };
    if (w.tries >= 2) return { type: 'skip', iid: w.iid };
    if (w.hints < w.maxHints && ctx.rng.chance(0.2)) return { type: 'hint', iid: w.iid };
    const a = ctx.answer(w.iid);
    return a.type === 'short' ? { type: 'solve', iid: w.iid, text: a.text } : { type: 'answer', iid: w.iid, answer: a };
  },
  botDelay(view, rng) {
    const w = view?.you?.word;
    if (!w) return 700 + rng.int(0, 800);
    return w.kind === 'plain' ? 2000 + rng.int(0, 4000) : 2500 + rng.int(0, 5500);
  },
});
