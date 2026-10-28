import { defineCheats } from '../registry.ts';
import type { ChaosApi, CheatDef } from '../types.ts';
import { odds, rollOdds, target } from '../cheats/kit.ts';

/*
 * Cheats that only make sense in lantern-match: they find, hide, shuffle and
 * unmatch cards on a player's own memory board, tamper with misses, and slow
 * down flipping. Every cheat here has modes: ['lantern-match'] and an id
 * starting with 'lantern-match.'.
 *
 * Board rules the mode relies on, which every cheat keeps:
 *  - cards in `up` are face up and unmatched; a cheat never matches, moves or
 *    hides them, so the player's attempt in progress is never broken;
 *  - a board is never left fully matched (the mode deals the next board, or
 *    in Sprint ends the game, the moment a player clears one), so a cheat
 *    never matches the last pair: clearing a board is always the player's own
 *    move.
 */

const MODE = 'lantern-match';

interface Card {
  qid: string;
  side: 'question' | 'answer';
}

interface Board {
  no: number;
  cards: Card[];
  matched: boolean[];
  up: number[];
  firstAt: number;
}

interface Player {
  board: Board;
  pairs: number;
  misses: number;
  cleared: number;
  lost: number;
  last: { result: 'match' | 'miss' | 'cleared'; at: number } | null;
  lastPair: number[] | null;
}

const player = (api: ChaosApi, id: string): Player | undefined => api.s.players[id];

/** Index of the other card of card i's pair. */
function partnerOf(b: Board, i: number): number | null {
  const c = b.cards[i];
  if (!c) return null;
  const j = b.cards.findIndex((x, k) => k !== i && x.qid === c.qid && x.side !== c.side);
  return j >= 0 ? j : null;
}

/** Unmatched pairs as [question index, answer index]. */
function openPairs(b: Board): [number, number][] {
  const out: [number, number][] = [];
  b.cards.forEach((c, i) => {
    if (c.side !== 'question' || b.matched[i]) return;
    const j = partnerOf(b, i);
    if (j !== null && !b.matched[j]) out.push([i, j]);
  });
  return out;
}

/** Matched pairs on the current board. */
function matchedPairs(b: Board): [number, number][] {
  const out: [number, number][] = [];
  b.cards.forEach((c, i) => {
    if (c.side !== 'question' || !b.matched[i]) return;
    const j = partnerOf(b, i);
    if (j !== null && b.matched[j]) out.push([i, j]);
  });
  return out;
}

/** Mark a pair matched for a player as if they had found it: +1 pair. */
function markMatched(api: ChaosApi, id: string, i: number, j: number) {
  const p = player(api, id)!;
  p.board.matched[i] = true;
  p.board.matched[j] = true;
  p.last = { result: 'match', at: api.now() };
  p.lastPair = [i, j];
  api.addScore(id, 1);
}

/**
 * Match one random unmatched pair on a player's board. Never a pair with a
 * face-up card in it, and never the last pair (clearing is the player's move).
 */
function guideMatch(api: ChaosApi, id: string): boolean {
  const b = player(api, id)?.board;
  if (!b) return false;
  const open = openPairs(b);
  if (open.length < 2) return false;
  const pool = open.filter(([i, j]) => !b.up.includes(i) && !b.up.includes(j));
  if (!pool.length) return false;
  const [i, j] = api.rng.pick(pool);
  markMatched(api, id, i, j);
  return true;
}

/** Shuffle the positions of a player's face-down cards (matched and face-up cards stay where they are). */
function shuffleDown(api: ChaosApi, id: string): boolean {
  const b = player(api, id)?.board;
  if (!b) return false;
  const slots = b.cards.map((_, i) => i).filter((i) => !b.matched[i] && !b.up.includes(i));
  if (slots.length < 2) return false;
  const before = slots.map((i) => b.cards[i]!);
  let dealt = api.rng.shuffle(before);
  // Every card is different, so any order but the old one moves something.
  for (let k = 0; k < 20 && dealt.every((c, n) => c === before[n]); k++) dealt = api.rng.shuffle(before);
  if (dealt.every((c, n) => c === before[n])) dealt = [...before.slice(1), before[0]!];
  slots.forEach((slot, n) => (b.cards[slot] = dealt[n]!));
  return true;
}

const CARDS = ['cards'] as const;

const instant: CheatDef[] = [
  {
    id: 'lantern-match.guide',
    name: 'Matchmaker Lantern',
    category: 'advantage',
    description: 'A guiding lantern matches one random face-down pair on your board for you (+1 pair). It never matches the last pair on a board: clearing it is up to you.',
    target: 'self',
    modes: [MODE],
    needs: CARDS,
    undoable: false,
    cost: 35,
    cooldownMs: 45_000,
    apply: (api, c) => (guideMatch(api, c.caster) ? undefined : { error: 'There is no pair the lantern can find for you: the last pair on a board is yours to find.' }),
  },
  {
    id: 'lantern-match.whirlwind',
    name: 'Memory Board Whirlwind',
    category: 'troll',
    description: 'A whirlwind shuffles every face-down card on an opponent\'s board, so everything they remembered is in the wrong place. Matched and face-up cards stay put.',
    target: 'opponent',
    modes: [MODE],
    needs: CARDS,
    undoable: false,
    cost: 30,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const t = target(c);
      if (!shuffleDown(api, t)) return { error: `${api.name(t)} has fewer than two face-down cards to shuffle.` };
      api.feed('A whirlwind shuffled your face-down cards!', 'bad', [t]);
    },
  },
  {
    id: 'lantern-match.gust',
    name: 'Unmatching Gust',
    category: 'troll',
    description: 'A gust blows one matched pair on an opponent\'s current board face down again (a random one), and they lose that pair from their total if they have any. They can find it again.',
    target: 'opponent',
    modes: [MODE],
    needs: CARDS,
    undoable: false,
    cost: 35,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const t = target(c);
      const p = player(api, t);
      const done = p ? matchedPairs(p.board) : [];
      if (!p || !done.length) return { error: `${api.name(t)} has no matched pairs on this board.` };
      const [i, j] = api.rng.pick(done);
      p.board.matched[i] = false;
      p.board.matched[j] = false;
      if (p.lastPair && (p.lastPair.includes(i) || p.lastPair.includes(j))) p.lastPair = null;
      api.addScore(t, -1);
      api.feed('A gust blew one of your matched pairs face down again!', 'bad', [t]);
    },
  },
  {
    id: 'lantern-match.board-swap',
    name: 'Memory Board Swap',
    category: 'troll',
    description: 'Swap your current board with an opponent\'s, cards, matches and all. Pairs already counted stay with whoever found them.',
    target: 'opponent',
    modes: [MODE],
    needs: CARDS,
    undoable: false,
    cost: 45,
    cooldownMs: 75_000,
    apply: (api, c) => {
      const t = target(c);
      const me = player(api, c.caster);
      const them = player(api, t);
      if (!me || !them) return { error: 'Both players need a board to swap.' };
      [me.board, them.board] = [them.board, me.board];
      me.lastPair = null;
      them.lastPair = null;
      api.feed(`${api.name(c.caster)} swapped boards with you!`, 'bad', [t]);
    },
  },
  {
    id: 'lantern-match.clean-slate',
    name: 'Forgotten Misses',
    category: 'advantage',
    description: 'Wipe your misses back to zero. Misses break ties (fewer is better) and, with Careful Match on, count towards the next pair it takes.',
    target: 'self',
    modes: [MODE],
    needs: ['cards', 'meter:misses'],
    cost: 25,
    cooldownMs: 60_000,
    apply: (api, c) => (api.set('misses', c.caster, 0) ? undefined : { error: 'You have no misses to wipe.' }),
  },
  {
    id: 'lantern-match.ink-blot',
    name: 'Miss Ink Blot',
    category: 'troll',
    description: 'Blot three extra misses onto an opponent\'s record. Misses break ties, so it drops them below anyone level with them on pairs.',
    target: 'opponent',
    modes: [MODE],
    needs: ['cards', 'meter:misses'],
    cost: 15,
    cooldownMs: 30_000,
    apply: (api, c) => void api.add('misses', target(c), 3),
  },
  {
    id: 'lantern-match.extra-moonlight',
    name: 'Matching Moonlight',
    category: 'round',
    description: 'The moon stays up a little longer: 20 more seconds on the game clock for everyone.',
    target: 'room',
    modes: [MODE],
    needs: CARDS,
    undoable: false,
    cost: 30,
    cooldownMs: 90_000,
    apply: (api) => {
      api.s.endsAt += 20_000;
      api.ctx.setTimer('time', api.s.endsAt);
      api.feed('Extra moonlight: 20 more seconds to find pairs.', 'good');
    },
  },
  {
    id: 'lantern-match.lottery',
    name: 'Memory Card Lottery',
    category: 'random',
    description: `Draw a lantern from the lottery. Odds: ${odds([['a random pair on your board is matched for you', 40], ['your own face-down cards are shuffled', 30], ['every opponent\'s face-down cards are shuffled', 30]])}. If the draw cannot happen on the boards as they are, the next one in that list happens instead.`,
    target: 'self',
    modes: [MODE],
    needs: CARDS,
    undoable: false,
    cost: 25,
    cooldownMs: 35_000,
    apply: (api, c) => {
      const me = c.caster;
      const outcomes = [
        () => guideMatch(api, me) && 'matched a pair for you',
        () => shuffleDown(api, me) && 'shuffled your own face-down cards',
        () => api.opponents(me).map((id) => shuffleDown(api, id)).some(Boolean) && 'shuffled every opponent\'s face-down cards',
      ];
      const first = rollOdds(api, [[0, 40], [1, 30], [2, 30]]);
      for (let k = 0; k < outcomes.length; k++) {
        const what = outcomes[(first + k) % outcomes.length]!();
        if (what) {
          api.feed(`Memory Card Lottery: it ${what}.`, 'info', [me]);
          return;
        }
      }
      return { error: 'No lottery prize can happen on the boards as they are.' };
    },
  },
];

const lasting: CheatDef[] = [
  {
    id: 'lantern-match.firefly',
    name: 'Firefly Match Guide',
    category: 'advantage',
    description: 'A firefly watches your next miss (within 20 seconds): instead of the wrong card, it turns over the true partner of your first card, so the miss becomes a match (+1 pair, and the miss is not counted).',
    target: 'self',
    modes: [MODE],
    needs: ['cards', 'meter:misses'],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 10,
    apply: (api, c, fx) => {
      if (fx) fx.data.lost = player(api, c.caster)?.lost ?? 0;
    },
    hooks: {
      delta: {
        misses: (api, fx, d) => {
          const me = fx.caster;
          const p = player(api, me);
          if ((d[me] ?? 0) <= 0 || !p || p.board.up.length !== 2) return;
          const [first, second] = p.board.up as [number, number];
          const j = partnerOf(p.board, first);
          if (j === null || j === second || p.board.matched[j]) return;
          p.board.up = [];
          d[me]! -= 1;
          markMatched(api, me, first, j);
          // Careful Match may have taken a pair for this miss; it never happened, so the pair comes back.
          if (p.lost > Number(fx.data.lost)) {
            p.lost--;
            api.addScore(me, 1);
          }
          api.feed('The firefly turned over the right card: that miss became a match.', 'good', [me]);
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Firefly guide: your next miss becomes a match', tone: 'good' }),
  },
  {
    id: 'lantern-match.careless-curse',
    name: 'Careless Matcher\'s Curse',
    category: 'troll',
    description: 'For 20 seconds, every miss an opponent makes costs them one of the pairs they have found (if they have any), on top of any Careful Match penalty.',
    target: 'opponent',
    modes: [MODE],
    needs: ['cards', 'meter:misses'],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 30,
    hooks: {
      delta: {
        misses: (api, fx, d) => {
          const t = target(fx);
          const p = player(api, t);
          if ((d[t] ?? 0) <= 0 || !p || !api.addScore(t, -1)) return;
          p.lost++;
          api.feed('Cursed: that miss cost you a pair.', 'bad', [t]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Cursed: every miss costs a pair', tone: 'bad' }),
  },
  {
    id: 'lantern-match.copycat',
    name: 'Copycat Matcher',
    category: 'advantage',
    description: 'For 20 seconds, copy a player you choose: every time they match a pair, a random face-down pair on your board is matched too (+1 pair). Never the last pair on your board.',
    target: 'self',
    params: [{ key: 'rival', label: 'Player to copy', kind: 'player', filter: 'other' }],
    modes: [MODE],
    needs: CARDS,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 20_000,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const rival = String(fx.params.rival);
          if ((d[rival] ?? 0) <= 0 || player(api, rival)?.last?.at !== api.now()) return;
          if (guideMatch(api, fx.caster)) api.feed(`Copycat: ${api.name(rival)} found a pair, so you got one too.`, 'good', [fx.caster]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Copycat: their matches are yours', tone: 'good' }),
  },
  {
    id: 'lantern-match.lights-out',
    name: 'Cards in the Dark',
    category: 'troll',
    description: 'Blow out an opponent\'s lanterns: for 8 seconds they cannot turn over any card.',
    target: 'opponent',
    modes: [MODE],
    needs: CARDS,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 8_000,
    hooks: { gate: () => ({ block: 'Your lanterns are out! Wait for them to relight.' }) },
    overlay: (fx) => ({ kind: 'countdown', label: 'Lanterns out: no flipping', until: fx.endsAt }),
  },
  {
    id: 'lantern-match.heavy-lanterns',
    name: 'Heavy Memory Cards',
    category: 'troll',
    description: 'For 15 seconds, an opponent\'s cards are heavy: they can turn over only one card every 2 seconds.',
    target: 'opponent',
    modes: [MODE],
    needs: CARDS,
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 15_000,
    hooks: {
      gate: (api, fx) => {
        const last = fx.data.lastAt === undefined ? null : Number(fx.data.lastAt);
        if (last !== null && api.now() - last < 2_000) return { block: 'These cards are heavy! One flip every 2 seconds.' };
        fx.data.lastAt = api.now();
        return undefined;
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Heavy lanterns: one flip every 2 seconds', tone: 'bad' }),
  },
  {
    id: 'lantern-match.last-lantern-lock',
    name: 'Last Pair Lock',
    category: 'troll',
    description: 'Lock the last lantern on an opponent\'s board: for 8 seconds they cannot turn over the card that would clear it. Only on an opponent with 2 or fewer pairs left to find.',
    target: 'opponent',
    modes: [MODE],
    needs: CARDS,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 8_000,
    apply: (api, c) => {
      const p = player(api, target(c));
      if (!p || openPairs(p.board).length > 2) return { error: `${api.name(target(c))} is not close to clearing their board.` };
    },
    hooks: {
      gate: (api, fx, id, action) => {
        const p = player(api, id);
        const index = (action as { index?: number }).index;
        if (!p || p.board.up.length !== 1 || index === undefined) return undefined;
        const open = openPairs(p.board);
        if (open.length !== 1) return undefined;
        return partnerOf(p.board, p.board.up[0]!) === index ? { block: 'The last lantern is locked for a moment!' } : undefined;
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Your last lantern is locked', until: fx.endsAt }),
  },
];

defineCheats([...instant, ...lasting]);
