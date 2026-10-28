import { draw, type Deck } from '../../questions/deck.ts';
import { normalizeAnswerText } from '../../questions/grade.ts';
import { answerFace } from '../../modes/flashcard-study/answer-text.ts';
import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';
import { odds, rollOdds, target } from '../cheats/kit.ts';

/*
 * Cheats that only make sense in lantern-match: they find, hide, shuffle and
 * unmatch cards on a player's own memory board, tamper with misses, and slow
 * down flipping. Every cheat here has modes: ['lantern-match'] and an id
 * starting with 'lantern-match.'.
 *
 * Board rules the mode relies on, which every cheat keeps:
 *  - cards in `up` are face up and unmatched. A cheat never matches, moves or
 *    hides the first card of an attempt, so the player's attempt in progress
 *    is never broken. A missed pair (two cards in `up`) may be turned back
 *    face down early, which the mode itself does on the player's next flip;
 *    a cheat that moves whole boards from one player to another moves their
 *    face-up cards with them, as they lay;
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
  deck: Deck;
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

/* ----------------------- redeals, peeks and traps ----------------------- */

/**
 * Deal a fresh board from a player's own deck, exactly as the mode deals one
 * (questions whose answers or prompts read the same as one already on the
 * board are left out), but with the chaos random stream. It keeps the board's
 * number: no board was cleared.
 */
function dealFresh(api: ChaosApi, p: Player): Board {
  const want = Number(api.ctx.settings.pairs) || 6;
  const qids: string[] = [];
  const answers = new Set<string>();
  const prompts = new Set<string>();
  const maxDraws = api.ctx.questions.count() * 2 + want;
  for (let i = 0; i < maxDraws && qids.length < want; i++) {
    const qid = draw(p.deck, api.rng);
    if (qids.includes(qid)) continue;
    const q = api.ctx.questions.get(qid);
    const face = answerFace(q);
    const answerKey = normalizeAnswerText(face.text) || face.media?.url || '';
    const promptKey = normalizeAnswerText(q.prompt) || q.prompt;
    if (!answerKey || answers.has(answerKey) || prompts.has(promptKey)) continue;
    answers.add(answerKey);
    prompts.add(promptKey);
    qids.push(qid);
  }
  if (qids.length === 0) qids.push(draw(p.deck, api.rng));
  const cards = api.rng.shuffle(qids.flatMap((qid): Card[] => [
    { qid, side: 'question' },
    { qid, side: 'answer' },
  ]));
  return { no: p.board.no, cards, matched: cards.map(() => false), up: [], firstAt: 0 };
}

/** A prickly card pricks: one of the player's pairs goes (if they have one). In a score hook the loss goes through `d`. */
function prick(api: ChaosApi, fx: ActiveEffect, d?: Record<string, number>) {
  const t = target(fx);
  const p = player(api, t);
  api.endEffect(fx.eid, 'used');
  if (!p) return;
  const taken = d ? ((d[t] ?? 0) >= 1 ? ((d[t]! -= 1), 1) : 0) : -api.addScore(t, -1);
  if (taken > 0) {
    p.lost++;
    api.feed('Ouch, a prickly card! It cost you a pair.', 'bad', [t]);
  } else api.feed('Ouch, a prickly card! Luckily you had no pair for it to take.', 'info', [t]);
}

const tricks: CheatDef[] = [
  {
    id: 'lantern-match.moonlit-peek',
    name: 'Moonlit Peek',
    category: 'advantage',
    description: 'For 10 seconds, moonlight shows you where one pair on your board lies: a banner names its two cards, counting along the rows from the top left. Never the last pair on a board, and the banner goes if either card moves or is matched.',
    target: 'self',
    modes: [MODE],
    needs: CARDS,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 10_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const b = player(api, c.caster)?.board;
      const open = b ? openPairs(b) : [];
      const pool = b ? open.filter(([i, j]) => !b.up.includes(i) && !b.up.includes(j)) : [];
      if (!b || open.length < 2 || !pool.length) return { error: 'There is no pair the moonlight can show you: the last pair on a board is yours to find.' };
      const [i, j] = api.rng.pick(pool);
      const [x, y] = i < j ? [i, j] : [j, i];
      fx!.data.qid = b.cards[x]!.qid;
      fx!.data.cards = [x, y];
      fx!.data.text = `Moonlight shows a pair: cards ${x + 1} and ${y + 1}.`;
    },
    hooks: {
      // The banner is true only while those two cards still lie there face down.
      tick: (api, fx) => {
        const b = player(api, fx.caster)?.board;
        const [x, y] = fx.data.cards as [number, number];
        const still = (i: number) => b && b.cards[i]?.qid === fx.data.qid && !b.matched[i];
        if (!still(x) || !still(y)) api.endEffect(fx.eid, 'used');
      },
    },
    overlay: (fx) => ({ kind: 'banner', text: String(fx.data.text ?? ''), tone: 'info' }),
  },
  {
    id: 'lantern-match.redeal',
    name: 'Memory Board Redeal',
    category: 'troll',
    description: 'An opponent\'s board is swept away and a fresh one is dealt from their own deck, so everything they remembered about it is gone. The pairs they already found stay in their total. Not while they are halfway through turning over a pair.',
    target: 'opponent',
    modes: [MODE],
    needs: CARDS,
    undoable: false,
    cost: 40,
    cooldownMs: 75_000,
    apply: (api, c) => {
      const t = target(c);
      const p = player(api, t);
      if (!p) return { error: `${api.name(t)} has no board.` };
      if (p.board.up.length === 1) return { error: `${api.name(t)} is halfway through turning over a pair. Try again in a moment.` };
      const fresh = dealFresh(api, p);
      if (JSON.stringify(fresh.cards) === JSON.stringify(p.board.cards) && !p.board.matched.some(Boolean)) return { error: 'The fresh deal came out exactly the same, so nothing changed.' };
      p.board = fresh;
      p.lastPair = null;
      api.feed('Your board was swept away and dealt again!', 'bad', [t]);
    },
  },
  {
    id: 'lantern-match.pass-the-boards',
    name: 'Pass the Boards',
    category: 'troll',
    description: 'Every board in the game is passed on one place round the circle: each player takes over the board of the player before them, cards, matches and all. Pairs already counted stay with whoever found them.',
    target: 'room',
    hostile: true,
    modes: [MODE],
    needs: CARDS,
    undoable: false,
    cost: 45,
    cooldownMs: 90_000,
    apply: (api) => {
      const ids = api.ids().filter((id) => player(api, id));
      if (ids.length < 2) return { error: 'There is nobody to pass a board to.' };
      const boards = ids.map((id) => player(api, id)!.board);
      ids.forEach((id, k) => {
        const p = player(api, id)!;
        p.board = boards[(k - 1 + ids.length) % ids.length]!;
        p.lastPair = null;
      });
      api.feed('Pass the boards! Everyone took over the board of the player before them.', 'big');
    },
  },
  {
    id: 'lantern-match.moonset',
    name: 'Early Moonset',
    category: 'round',
    description: 'The moon sets early: 20 seconds come off the game clock for everyone. It never brings the end closer than 30 seconds from now.',
    target: 'room',
    hostile: true,
    modes: [MODE],
    needs: CARDS,
    undoable: false,
    cost: 30,
    cooldownMs: 90_000,
    apply: (api) => {
      const left = api.s.endsAt - api.now();
      if (left <= 30_000) return { error: 'There are 30 seconds or less to go, so the moon stays up.' };
      api.s.endsAt = Math.max(api.now() + 30_000, api.s.endsAt - 20_000);
      api.ctx.setTimer('time', api.s.endsAt);
      api.feed(`The moon is setting early: ${Math.round((left - (api.s.endsAt - api.now())) / 1000)} seconds came off the clock.`, 'bad');
    },
  },
  {
    id: 'lantern-match.prickly-card',
    name: 'Prickly Card',
    category: 'troll',
    description: 'Hide a prickly card on an opponent\'s board: one of their face-down cards, picked at random (each equally likely). The first time they turn it over in the next 30 seconds, it costs them one of their pairs, if they have one. They are not told which card it is.',
    target: 'opponent',
    modes: [MODE],
    needs: CARDS,
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 30_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const b = player(api, target(c))?.board;
      const down = b ? b.cards.map((_, i) => i).filter((i) => !b.matched[i] && !b.up.includes(i)) : [];
      if (!b || !down.length) return { error: `${api.name(target(c))} has no face-down card to hide it in.` };
      const card = b.cards[api.rng.pick(down)]!;
      fx!.data.no = b.no;
      fx!.data.qid = card.qid;
      fx!.data.side = card.side;
    },
    hooks: {
      // Turned over as the first card of a pair, or in a miss: it is face up. It goes with its board.
      tick: (api, fx) => {
        const b = player(api, target(fx))?.board;
        if (!b || b.no !== Number(fx.data.no)) return api.endEffect(fx.eid, 'used');
        const i = b.cards.findIndex((c) => c.qid === fx.data.qid && c.side === fx.data.side);
        if (i < 0 || b.matched[i]) return api.endEffect(fx.eid, 'used');
        if (b.up.includes(i)) prick(api, fx);
      },
      delta: {
        // Turned over as the card that completed a match (or cleared the board: then it was one of the last two cards).
        score: (api, fx, d) => {
          const t = target(fx);
          const p = player(api, t);
          if (!p || (d[t] ?? 0) <= 0 || p.last?.at !== api.now()) return;
          const no = Number(fx.data.no);
          const isIt = (i: number) => p.board.cards[i]?.qid === fx.data.qid && p.board.cards[i]?.side === fx.data.side;
          const matchedIt = p.last.result === 'match' && p.board.no === no && Boolean(p.lastPair?.some(isIt));
          const clearedIt = p.last.result === 'cleared' && p.board.no === no + 1;
          if (matchedIt || clearedIt) prick(api, fx, d);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'One of your cards is prickly', tone: 'bad' }),
  },
];

const memory: CheatDef[] = [
  {
    id: 'lantern-match.quick-blink',
    name: 'Quick Blink',
    category: 'troll',
    description: 'For 20 seconds, when an opponent turns over two cards that do not match, they flip straight back face down instead of staying showing, so the second card is gone before they can see it.',
    target: 'opponent',
    modes: [MODE],
    needs: ['cards', 'meter:misses'],
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 20_000,
    priority: 40,
    hooks: {
      delta: {
        misses: (api, fx) => {
          const p = player(api, target(fx));
          if (!p || p.last?.result !== 'miss' || p.last.at !== api.now() || p.board.up.length !== 2) return;
          p.board.up = [];
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Quick blink: misses flip straight back', tone: 'bad' }),
  },
  {
    id: 'lantern-match.pass-the-blame',
    name: 'Pass the Blame',
    category: 'troll',
    description: 'For 20 seconds, every miss you make is written on an opponent\'s record instead of yours (misses break ties, so it is their tie-breaker that suffers). With Careful Match, a pair the penalty takes from you for one of those misses is given back, and the misses count towards their penalty instead.',
    target: 'opponent',
    modes: [MODE],
    needs: ['cards', 'meter:misses'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 20_000,
    // A redirect: before curses and caps see the miss.
    priority: 10,
    apply: (api, c) => (player(api, c.caster) ? undefined : { error: 'You have no board.' }),
    hooks: {
      delta: {
        misses: (api, fx, d) => {
          const me = fx.caster;
          const t = target(fx);
          const n = d[me] ?? 0;
          if (n <= 0 || !player(api, me) || !player(api, t)) return;
          d[me] = 0;
          d[t] = (d[t] ?? 0) + n;
          api.feed(`${api.name(me)} passed the blame: their miss went on your record.`, 'bad', [t]);
        },
        // In a miss the only pair the mode ever takes is Careful Match's. That miss is not on your record, so its cost is not yours either.
        score: (api, fx, d) => {
          const me = fx.caster;
          const p = player(api, me);
          if (!p || p.last?.result !== 'miss' || p.last.at !== api.now() || (d[me] ?? 0) >= 0 || !player(api, target(fx))) return;
          d[me]! += 1;
          p.lost = Math.max(0, p.lost - 1);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Someone\'s misses land on your record', tone: 'bad' }),
  },
  {
    id: 'lantern-match.clean-sweep',
    name: 'Clean Sweep Bonus',
    category: 'score',
    description: 'For 60 seconds, clearing your board pays 2 bonus pairs on top of the pair that cleared it. Not in Lantern Sprint, where clearing a board ends the game.',
    target: 'self',
    modes: [MODE],
    needs: ['cards', 'fresh boards'],
    cost: 30,
    cooldownMs: 75_000,
    durationMs: 60_000,
    // A bonus on the mode's own pair: before multipliers (20) see it.
    priority: 15,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const me = fx.caster;
          const p = player(api, me);
          if (!p || (d[me] ?? 0) <= 0 || p.last?.result !== 'cleared' || p.last.at !== api.now()) return;
          d[me]! += 2;
          api.feed('Clean sweep! Clearing your board paid 2 bonus pairs.', 'good', [me]);
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Clean sweep: clear your board for 2 bonus pairs', tone: 'good' }),
  },
];

defineCheats([...instant, ...lasting, ...tricks, ...memory]);
