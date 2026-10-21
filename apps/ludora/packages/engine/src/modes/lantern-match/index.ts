/*
 * Lantern Match: a memory game. Each player has their own face-down board of
 * question cards and answer cards. The layout lives only in the server state;
 * a player's view shows the face of a card only while it is turned over (or
 * once it is matched), so nothing in the payload says where a pair is.
 */
import { z } from 'zod';
import type { Media } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { createDeck, draw, type Deck } from '../../questions/deck.ts';
import { normalizeAnswerText } from '../../questions/grade.ts';
import { answerFace } from '../flashcard-study/answer-text.ts';
import { meta, settings } from './meta.ts';

type Settings = { pairs: number; sprint: boolean };

export type CardSide = 'question' | 'answer';

interface Card {
  qid: string;
  side: CardSide;
}

interface Board {
  /** Board number for this player: 1 for the first board, 2 after clearing it, and so on. */
  no: number;
  /** The secret layout. Never sent to a client. */
  cards: Card[];
  matched: boolean[];
  /** Face-up cards that are not matched: none, the first card of an attempt, or a missed pair. */
  up: number[];
  /** Game time of the first flip of the current attempt. */
  firstAt: number;
}

interface Player {
  deck: Deck;
  board: Board;
  pairs: number;
  misses: number;
  cleared: number;
  last: { result: 'match' | 'miss' | 'cleared'; at: number } | null;
  /** The pair just matched on this board, so its two faces can be read out. */
  lastPair: number[] | null;
}

export interface State {
  players: Record<PlayerId, Player>;
  endsAt: number;
  winner: PlayerId | null;
}

const action = z.object({ type: z.literal('flip'), index: z.number().int().min(0).max(39) });
type Action = z.infer<typeof action>;

const DEFAULT_LIMIT_SEC = meta.common.defaults.timeLimitSec!;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Deal a board of up to `pairs` questions. Questions whose answers (or prompts)
 * read the same as one already on the board are left out, so a pair can never
 * look right and still count as a miss.
 */
function dealBoard(ctx: ModeContext<Settings>, deck: Deck, no: number): Board {
  const want = ctx.settings.pairs;
  const qids: string[] = [];
  const answers = new Set<string>();
  const prompts = new Set<string>();
  const maxDraws = ctx.questions.count() * 2 + want;
  for (let i = 0; i < maxDraws && qids.length < want; i++) {
    const qid = draw(deck, ctx.rng);
    if (qids.includes(qid)) continue;
    const q = ctx.questions.get(qid);
    const face = answerFace(q);
    const answerKey = normalizeAnswerText(face.text) || face.media?.url || '';
    const promptKey = normalizeAnswerText(q.prompt) || q.prompt;
    if (!answerKey || answers.has(answerKey) || prompts.has(promptKey)) continue;
    answers.add(answerKey);
    prompts.add(promptKey);
    qids.push(qid);
  }
  // Never deal an empty board: it would count as cleared straight away.
  if (qids.length === 0) qids.push(draw(deck, ctx.rng));
  const cards = ctx.rng.shuffle(qids.flatMap((qid): Card[] => [
    { qid, side: 'question' },
    { qid, side: 'answer' },
  ]));
  return { no, cards, matched: cards.map(() => false), up: [], firstAt: 0 };
}

function newPlayer(ctx: ModeContext<Settings>): Player {
  const deck = createDeck(ctx.questions.ids(), ctx.rng, ctx.common.shuffleQuestions);
  return { deck, board: dealBoard(ctx, deck, 1), pairs: 0, misses: 0, cleared: 0, last: null, lastPair: null };
}

function cardView(card: Card, i: number, b: Board, ctx: ModeContext) {
  const state = b.matched[i] ? 'matched' : b.up.includes(i) ? 'up' : 'down';
  if (state === 'down') return { i, side: card.side, state } as const;
  const q = ctx.questions.get(card.qid);
  const face = card.side === 'question' ? { text: q.prompt, media: q.media } : answerFace(q);
  return { i, side: card.side, state, text: face.text, ...(face.media ? { media: face.media as Media } : {}) };
}

type Standing = { pairs: number; misses: number; name: string };
/** More pairs first, then fewer misses. */
const byScore = (a: Standing, b: Standing) => b.pairs - a.pairs || a.misses - b.misses;

function leaders(s: State, ctx: ModeContext, me: PlayerId | null, limit: number) {
  const sorted = ctx
    .players()
    .filter((p) => s.players[p.id])
    .map((p) => {
      const pl = s.players[p.id]!;
      return {
        playerId: p.id,
        name: p.name,
        teamId: p.teamId,
        pairs: pl.pairs,
        misses: pl.misses,
        cleared: pl.cleared,
        boardPairs: pl.board.matched.filter(Boolean).length / 2,
        boardTotal: pl.board.cards.length / 2,
        isYou: p.id === me,
      };
    })
    .sort((a, b) => byScore(a, b) || a.name.localeCompare(b.name));
  // Rank over everyone, so a player shown below the cut still gets their real place. Ties share a rank.
  const all: ((typeof sorted)[number] & { rank: number })[] = [];
  sorted.forEach((r, i) => {
    const prev = all[i - 1];
    all.push({ ...r, rank: prev && byScore(prev, r) === 0 ? prev.rank : i + 1 });
  });
  const top = all.slice(0, limit);
  const mine = all.find((r) => r.isYou);
  if (mine && !top.includes(mine)) top.push(mine);
  return top;
}

function teamRows(s: State, ctx: ModeContext) {
  return ctx.teams().map((t) => {
    const members = ctx.players().filter((p) => p.teamId === t.id && s.players[p.id]);
    const avg = members.length ? members.reduce((n, p) => n + s.players[p.id]!.pairs, 0) / members.length : 0;
    return { teamId: t.id, name: t.name, hue: t.hue, score: Math.round(avg * 10), avg, members: members.length };
  });
}

export const lanternMatch = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const players: State['players'] = {};
    for (const p of ctx.players()) players[p.id] = newPlayer(ctx);
    const limitSec = ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec : DEFAULT_LIMIT_SEC;
    const endsAt = ctx.now() + limitSec * 1000;
    ctx.setTimer('time', endsAt);
    return { players, endsAt, winner: null };
  },
  onPlayerJoin(s, p, ctx) {
    s.players[p.id] ??= newPlayer(ctx);
  },
  onAction(s, playerId, a, ctx) {
    const p = s.players[playerId];
    if (!p) return { error: 'You are not in this game.' };
    if (s.winner) return { error: 'The game is over.' };
    const b = p.board;
    if (a.index >= b.cards.length) return { error: 'There is no card there.' };
    if (b.matched[a.index]) return { error: 'That card is already matched.' };
    // A missed pair stays showing until the next flip, which turns it back over first.
    if (b.up.length === 2) b.up = [];
    if (b.up.includes(a.index)) return { error: 'That card is already face up.' };
    if (b.up.length === 0) {
      b.up = [a.index];
      b.firstAt = ctx.now();
      p.last = null;
      p.lastPair = null;
      return;
    }
    const first = b.up[0]!;
    const one = b.cards[first]!;
    const two = b.cards[a.index]!;
    const match = one.qid === two.qid && one.side !== two.side;
    ctx.recordAnswer({ playerId, qid: one.qid, correct: match, partial: match ? 1 : 0, responseMs: ctx.now() - b.firstAt, kind: 'attempt' });
    if (!match) {
      b.up = [first, a.index];
      p.misses++;
      p.last = { result: 'miss', at: ctx.now() };
      return;
    }
    b.matched[first] = true;
    b.matched[a.index] = true;
    b.up = [];
    p.pairs++;
    p.last = { result: 'match', at: ctx.now() };
    p.lastPair = [first, a.index];
    if (!b.matched.every(Boolean)) return;
    p.cleared++;
    p.last = { result: 'cleared', at: ctx.now() };
    p.lastPair = null;
    const name = ctx.player(playerId)?.name ?? 'A player';
    if (ctx.settings.sprint) {
      s.winner = playerId;
      ctx.feed(`${name} cleared their board first!`, { tone: 'big' });
      ctx.endGame(`${name} cleared their board first.`);
      return;
    }
    ctx.feed(`${name} cleared a board.`, { tone: 'good' });
    p.board = dealBoard(ctx, p.deck, b.no + 1);
  },
  onTimer(_s, id, ctx) {
    if (id === 'time') ctx.endGame('Time is up.');
  },
  view(s, viewer, ctx) {
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const p = me ? s.players[me] : undefined;
    return {
      endsAt: s.endsAt,
      sprint: ctx.settings.sprint,
      pairsPerBoard: ctx.settings.pairs,
      leaders: leaders(s, ctx, me, viewer.kind === 'host' ? 40 : 6),
      teams: ctx.teams().length ? teamRows(s, ctx) : null,
      you: p
        ? {
            board: p.board.no,
            cards: p.board.cards.map((c, i) => cardView(c, i, p.board, ctx)),
            missed: p.board.up.length === 2,
            lastPair: p.lastPair,
            pairs: p.pairs,
            misses: p.misses,
            cleared: p.cleared,
            boardPairs: p.board.matched.filter(Boolean).length / 2,
            boardTotal: p.board.cards.length / 2,
            last: p.last,
          }
        : null,
    };
  },
  results(s, ctx) {
    const standings = ctx.everyone().map((pl) => {
      const p = s.players[pl.id];
      const pairs = p?.pairs ?? 0;
      const misses = p?.misses ?? 0;
      const summary = `${plural(pairs, 'pair', 'pairs')}, ${plural(misses, 'miss', 'misses')}`;
      return {
        playerId: pl.id,
        // Pairs decide the order; fewer misses breaks a tie.
        score: pairs * 1000 + Math.max(0, 999 - misses),
        label: s.winner === pl.id ? `Cleared the board: ${summary}` : summary,
      };
    });
    const teams = ctx.teams().length
      ? teamRows(s, ctx).map((t) => ({ teamId: t.teamId, score: t.score, label: `${t.avg.toFixed(1)} pairs on average` }))
      : undefined;
    const winner = s.winner ? ctx.everyone().find((p) => p.id === s.winner)?.name : undefined;
    return { standings, ...(teams ? { teamStandings: teams } : {}), summary: winner ? `${winner} cleared their board first.` : 'Time is up.' };
  },
  /*
   * A stateless bot: it cannot remember cards it has seen, so it turns over a
   * random face-down card, then a random face-down card of the other kind.
   */
  bot(view, ctx) {
    const you = view?.you;
    if (!you?.cards?.length) return null;
    const cards = you.cards as { i: number; side: CardSide; state: 'down' | 'up' | 'matched' }[];
    const up = cards.filter((c) => c.state === 'up');
    let options = cards.filter((c) => c.state === 'down');
    if (up.length === 1) {
      const other = options.filter((c) => c.side !== up[0]!.side);
      if (other.length) options = other;
    }
    if (!options.length) return null;
    return { type: 'flip', index: ctx.rng.pick(options).i };
  },
  botDelay(view, rng) {
    return view?.you?.missed ? 900 + rng.int(0, 900) : 500 + rng.int(0, 900);
  },
});
