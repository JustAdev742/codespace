import type { Answer, Question } from '@ludora/shared';
import { draw } from '../../questions/deck.ts';
import { DEADLINE_GRACE_MS } from '../../mechanics/syncRounds.ts';
import { buildScramble, HINT_COST, matchesAnswer, scrambleSource, type Scramble } from '../../modes/word-scramble/index.ts';
import { answerText } from '../../modes/flashcard-study/answer-text.ts';
import type { StreamState } from '../../mechanics/selfPaced.ts';
import type { PlayerId } from '../../sdk/types.ts';
import { inGame, odds, rollOdds, target, transfer } from '../cheats/kit.ts';
import { defineCheats } from '../registry.ts';
import type { ChaosApi, CheatDef } from '../types.ts';

/*
 * Cheats that only make sense in Word Scramble: they work on the letter
 * tiles (hints, re-scrambles), on each player's pile of words, on the word
 * timer and on the spelling streak. A cheat never spells a word out for
 * anyone: at least two letters of a word always stay hidden.
 */

const MODE = 'word-scramble';
/** Letters of a word that cheats always leave unrevealed. */
const KEEP_HIDDEN = 2;
/** Cheats that shorten a word timer never leave less than this. */
const MIN_WORD_LEFT_MS = 4000;

interface Word {
  iid: string;
  scramble: Scramble | null;
  deadline: number | null;
}

interface Speller {
  stream: StreamState;
  word: Word | null;
  points: number;
  done: number;
  solved: number;
  finished: boolean;
  nextAt: number | null;
  retry: boolean;
  inRow: number;
}

const spellerOf = (api: ChaosApi, id: PlayerId): Speller | undefined => api.s.players[id];
const isErr = (x: unknown): x is { error: string } => Boolean(x && typeof x === 'object' && 'error' in x);

/** A player who still has words to play. */
function playing(api: ChaosApi, id: PlayerId): Speller | null {
  const p = spellerOf(api, id);
  return p && !p.finished && inGame(api, id) ? p : null;
}

function needWord(api: ChaosApi, id: PlayerId, self: boolean): (Speller & { word: Word }) | { error: string } {
  const p = playing(api, id);
  if (!p) return { error: self ? 'You have finished every word.' : `${api.name(id)} has finished every word.` };
  if (!p.word) return { error: self ? 'You are between words.' : `${api.name(id)} is between words.` };
  return p as Speller & { word: Word };
}

function needTiles(api: ChaosApi, id: PlayerId, self: boolean): (Speller & { word: Word & { scramble: Scramble } }) | { error: string } {
  const p = needWord(api, id, self);
  if (isErr(p)) return p;
  if (!p.word.scramble) return { error: self ? 'Your word is an ordinary question, with no tiles.' : `${api.name(id)}'s word is an ordinary question, with no tiles.` };
  return p as Speller & { word: Word & { scramble: Scramble } };
}

/** Letters of a scramble that can still be revealed without giving the word away. */
const hideable = (sc: Scramble) => sc.tiles.length - KEEP_HIDDEN - sc.hints;

/** Reveal `n` more letters, the way the mode's hint does (each one lowers the word's value). */
function reveal(sc: Scramble, n: number) {
  sc.hints += n;
  // The hint limit grows with it, so a hint given past it stays a state the mode can show.
  sc.maxHints = Math.max(sc.maxHints, sc.hints);
}

/** Shuffle a word's tiles into a new order that neither repeats the old one nor spells the answer. Hinted letters stay hinted. */
function rescramble(api: ChaosApi, sc: Scramble): boolean {
  const byId = new Map(sc.tiles.map((t) => [t.id, t.ch]));
  const letters = sc.solution.map((id) => byId.get(id)!);
  const shown = sc.tiles.map((t) => t.ch).join('');
  const positions = letters.map((_, i) => i);
  for (let i = 0; i < 12; i++) {
    const order = api.rng.shuffle(positions);
    const seq = order.map((pos) => letters[pos]).join('');
    if (seq === shown || seq === letters.join('')) continue;
    sc.tiles = order.map((pos, k) => ({ id: `t${k}`, ch: letters[pos]! }));
    const solution = letters.map(() => '');
    order.forEach((pos, k) => (solution[pos] = `t${k}`));
    sc.solution = solution;
    return true;
  }
  return false;
}

const acceptedFor = (q: Question): string[] => (q.type === 'short' ? [...q.accepted] : [answerText(q)]);

/** The action a gate is looking at, if it is a try at the word on this player's screen. */
function attempt(p: Speller, action: unknown): { type: string; text?: string; answer?: Answer } | null {
  const a = action as { type?: string; iid?: string; text?: string; answer?: Answer } | null;
  if (!a?.type || !p.word || a.iid !== p.word.iid) return null;
  return a as { type: string; text?: string; answer?: Answer };
}

/** Whether a try at a scrambled word would be wrong. */
function wrongTry(api: ChaosApi, p: Speller, a: { type: string; text?: string; answer?: Answer }): boolean {
  const sc = p.word?.scramble;
  if (!sc) return false;
  if (a.type === 'solve') return !matchesAnswer(a.text ?? '', sc.accepted);
  if (a.type === 'answer' && a.answer) return !api.ctx.questions.grade(p.word!.iid, a.answer).correct;
  return false;
}

function setWordDeadline(api: ChaosApi, id: PlayerId, w: Word, at: number) {
  w.deadline = at;
  api.ctx.setTimer(`word:${id}`, at + DEADLINE_GRACE_MS);
}

const letters = (n: number) => `${n} ${n === 1 ? 'letter' : 'letters'}`;

const cheats: CheatDef[] = [
  /* --------------------------------- tiles -------------------------------- */
  {
    id: 'word-scramble.lantern-hint',
    name: 'Tile Lantern Hint',
    category: 'advantage',
    description: `Shows the next letter of your word, even with hints switched off or used up. The ${HINT_COST} points a hint takes off the word are paid back to you straight away. Never the last two letters.`,
    target: 'self',
    modes: [MODE],
    cost: 20,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const p = needTiles(api, c.caster, true);
      if (isErr(p)) return p;
      if (hideable(p.word.scramble) < 1) return { error: 'Only the last two letters are left: you can spell those yourself.' };
      reveal(p.word.scramble, 1);
      api.add('score', c.caster, HINT_COST);
    },
  },
  {
    id: 'word-scramble.tile-spoiler',
    name: 'Letter Tile Spoiler',
    category: 'troll',
    description: `Forces two hints onto an opponent's word: they see the next two letters, and the word is worth ${2 * HINT_COST} points less, as if they had asked. Never the last two letters (one letter if that is all there is room for).`,
    target: 'opponent',
    modes: [MODE],
    cost: 25,
    cooldownMs: 35_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const p = needTiles(api, t, false);
      if (isErr(p)) return p;
      const n = Math.min(2, hideable(p.word.scramble));
      if (n < 1) return { error: `Only the last two letters of ${api.name(t)}'s word are left.` };
      reveal(p.word.scramble, n);
      api.feed(`${api.name(c.caster)} spoiled ${letters(n)} of ${api.name(t)}'s word.`, 'info');
    },
  },
  {
    id: 'word-scramble.tile-tornado',
    name: 'Letter Tile Tornado',
    category: 'troll',
    description: 'Blows an opponent\'s letter tiles into a new jumbled order (never the answer spelt out). Letters they were hinted stay hinted.',
    target: 'opponent',
    modes: [MODE],
    cost: 20,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const p = needTiles(api, t, false);
      if (isErr(p)) return p;
      if (!rescramble(api, p.word.scramble)) return { error: `${api.name(t)}'s tiles cannot be jumbled any other way.` };
      api.feed(`A tile tornado hit ${api.name(t)}'s word.`, 'info');
    },
  },
  {
    id: 'word-scramble.mystery-bag',
    name: 'Mystery Tile Bag',
    category: 'random',
    description: `Pull from the mystery bag. Odds: ${odds([['the next letter of your word, free', 45], ['two letters forced onto a random opponent\'s word, so it is worth less', 35], ['your own tiles jumbled into a new order', 20]])}. Needs a word with tiles for you and for at least one opponent.`,
    target: 'self',
    modes: [MODE],
    cost: 20,
    cooldownMs: 35_000,
    undoable: false,
    apply: (api, c) => {
      const me = needTiles(api, c.caster, true);
      if (isErr(me)) return me;
      if (hideable(me.word.scramble) < 1) return { error: 'Only the last two letters of your word are left.' };
      const victims = api.opponents(c.caster).filter((id) => {
        const p = playing(api, id);
        return p?.word?.scramble && hideable(p.word.scramble) >= 1;
      });
      if (!victims.length) return { error: 'No opponent has a word with tiles to spoil right now.' };
      const pull = rollOdds(api, [['hint', 45], ['spoil', 35], ['jumble', 20]] as const);
      if (pull === 'hint') {
        reveal(me.word.scramble, 1);
        api.add('score', c.caster, HINT_COST);
        api.feed(`Mystery bag: ${api.name(c.caster)} pulled a free letter.`, 'good');
      } else if (pull === 'spoil') {
        const v = api.rng.pick(victims);
        const sc = playing(api, v)!.word!.scramble!;
        const n = Math.min(2, hideable(sc));
        reveal(sc, n);
        api.feed(`Mystery bag: ${api.name(c.caster)} spoiled ${letters(n)} of ${api.name(v)}'s word.`, 'info');
      } else {
        if (!rescramble(api, me.word.scramble)) return { error: 'The bag tried to jumble your tiles, but they only go one way.' };
        api.feed(`Mystery bag: ${api.name(c.caster)}'s own tiles were jumbled.`, 'bad');
      }
    },
  },

  /* --------------------------------- the pile -------------------------------- */
  {
    id: 'word-scramble.back-of-pile',
    name: 'Back of the Word Pile',
    category: 'advantage',
    description: 'Puts the word on your screen at the back of your pile and gives you the next one now. It comes back after the rest of your pile, if you get that far. Not for a second-chance word.',
    target: 'self',
    modes: [MODE],
    cost: 15,
    cooldownMs: 25_000,
    undoable: false,
    apply: (api, c) => {
      const p = needWord(api, c.caster, true);
      if (isErr(p)) return p;
      if (p.retry) return { error: 'A second-chance word cannot go back in the pile.' };
      const deck = p.stream.deck;
      const qid = api.ctx.questions.instance(p.word.iid).qid;
      if (deck.ids[deck.pos - 1] !== qid || deck.pos >= deck.ids.length) return { error: 'This is the last word in your pile.' };
      deck.ids.splice(deck.pos - 1, 1);
      deck.ids.push(qid);
      deck.pos--;
      const iid = api.ctx.questions.present(draw(deck, api.rng));
      const q = api.ctx.questions.get(api.ctx.questions.instance(iid).qid);
      const source = scrambleSource(q);
      p.stream.iid = iid;
      p.word = { iid, scramble: source ? buildScramble(source, acceptedFor(q), Boolean(api.ctx.settings.hints), api.rng) : null, deadline: null };
      if (api.ctx.settings.wordTimer) setWordDeadline(api, c.caster, p.word, api.now() + api.ctx.questions.timeLimitMs(iid));
    },
  },
  {
    id: 'word-scramble.word-thief',
    name: 'Scramble Word Thief',
    category: 'troll',
    description: 'Steal the points an opponent won for the last word they solved (as much of it as they still have). Each word can only be stolen once.',
    target: 'opponent',
    modes: [MODE],
    cost: 35,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const p = playing(api, t) ?? spellerOf(api, t);
      const last = p?.stream.last;
      if (!p || !last || !last.correct || !(last.points! > 0)) return { error: `${api.name(t)} has no solved word to steal from.` };
      if (last.text?.startsWith('Stolen')) return { error: `${api.name(t)}'s last word has already been stolen.` };
      const got = transfer(api, 'score', t, c.caster, last.points!);
      if (!got) return { error: `${api.name(t)} has no points left to steal.` };
      last.text = `Stolen by ${api.name(c.caster)}`;
      api.feed(`${api.name(c.caster)} stole ${got} points from ${api.name(t)}'s last word.`, 'big');
    },
  },

  /* --------------------------------- trying words -------------------------------- */
  {
    id: 'word-scramble.sticky-tiles',
    name: 'Sticky Letter Tiles',
    category: 'troll',
    description: 'An opponent\'s tiles stick for 8 seconds: they cannot spell, answer, take a hint or skip until they come unstuck.',
    target: 'opponent',
    modes: [MODE],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 8_000,
    apply: (api, c) => {
      const t = target(c);
      if (!playing(api, t)) return { error: `${api.name(t)} has finished every word.` };
    },
    hooks: {
      gate: (api, _fx, id, action) => {
        const p = playing(api, id);
        const a = p && attempt(p, action);
        if (!a || a.type === 'next') return;
        return { block: 'Your tiles are stuck! Wait a moment.' };
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Sticky tiles', until: fx.endsAt }),
  },
  {
    id: 'word-scramble.hint-padlock',
    name: 'Letter Hint Padlock',
    category: 'troll',
    description: 'For 20 seconds an opponent cannot take hints.',
    target: 'opponent',
    modes: [MODE],
    needs: ['hints'],
    cost: 20,
    cooldownMs: 40_000,
    durationMs: 20_000,
    apply: (api, c) => {
      const t = target(c);
      if (!playing(api, t)) return { error: `${api.name(t)} has finished every word.` };
    },
    hooks: {
      gate: (api, _fx, id, action) => {
        const p = playing(api, id);
        const a = p && attempt(p, action);
        const sc = p?.word?.scramble;
        // Only a hint the mode would have given is refused.
        if (!a || a.type !== 'hint' || !sc || sc.hints >= sc.maxHints) return;
        return { block: 'Your hints are padlocked for a moment.' };
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Hints padlocked', tone: 'bad' }),
  },
  {
    id: 'word-scramble.second-draft',
    name: 'Spelling Second Draft',
    category: 'advantage',
    description: 'Within the next 30 seconds, your first wrong spelling does not end the word: you are told it is wrong and can try again.',
    target: 'self',
    modes: [MODE],
    needs: ['one-try'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 30_000,
    stacking: 'reject',
    apply: (api, c) => {
      if (!playing(api, c.caster)) return { error: 'You have finished every word.' };
    },
    hooks: {
      gate: (api, fx, id, action) => {
        const p = playing(api, id);
        const a = p && attempt(p, action);
        if (!a || !wrongTry(api, p, a)) return;
        api.endEffect(fx.eid, 'used');
        return { block: 'Second draft: that spelling is wrong. Try again.' };
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Second draft', tone: 'good' }),
  },

  /* --------------------------------- the word timer -------------------------------- */
  {
    id: 'word-scramble.timer-squeeze',
    name: 'Word Timer Squeeze',
    category: 'troll',
    description: `Takes 5 seconds off the timer on an opponent's word, never leaving them under ${MIN_WORD_LEFT_MS / 1000} seconds.`,
    target: 'opponent',
    modes: [MODE],
    needs: ['word-timer'],
    cost: 25,
    cooldownMs: 35_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const p = needWord(api, t, false);
      if (isErr(p)) return p;
      if (p.word.deadline === null) return { error: `${api.name(t)}'s word has no timer.` };
      const cut = Math.min(5000, p.word.deadline - api.now() - MIN_WORD_LEFT_MS);
      if (cut < 500) return { error: `${api.name(t)} is nearly out of time on this word already.` };
      setWordDeadline(api, t, p.word, p.word.deadline - cut);
      api.feed(`${api.name(c.caster)} squeezed ${Math.round(cut / 100) / 10} seconds off ${api.name(t)}'s word.`, 'info');
    },
  },
  {
    id: 'word-scramble.timer-sand',
    name: 'Word Timer Sand',
    category: 'advantage',
    description: 'Pours 8 more seconds into the timer on your word, never giving you more than the word\'s full time.',
    target: 'self',
    modes: [MODE],
    needs: ['word-timer'],
    cost: 20,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const p = needWord(api, c.caster, true);
      if (isErr(p)) return p;
      if (p.word.deadline === null) return { error: 'Your word has no timer.' };
      const most = api.now() + api.ctx.questions.timeLimitMs(p.word.iid);
      const add = Math.min(8000, most - p.word.deadline);
      if (add < 500) return { error: 'Your word timer is already full.' };
      setWordDeadline(api, c.caster, p.word, p.word.deadline + add);
    },
  },

  /* --------------------------------- spelling streak -------------------------------- */
  {
    id: 'word-scramble.streak-keeper',
    name: 'Spelling Streak Keeper',
    category: 'advantage',
    description: 'Within the next 45 seconds, the first word you miss or skip does not break your spelling streak.',
    target: 'self',
    modes: [MODE],
    needs: ['spelling-streak'],
    cost: 25,
    cooldownMs: 50_000,
    durationMs: 45_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const p = playing(api, c.caster);
      if (!p) return { error: 'You have finished every word.' };
      fx!.data.inRow = p.inRow;
      fx!.data.done = p.done;
    },
    hooks: {
      tick: (api, fx) => {
        const p = spellerOf(api, fx.caster);
        if (!p || !inGame(api, fx.caster)) return;
        const saved = Number(fx.data.inRow);
        if (p.done > Number(fx.data.done) && p.inRow === 0 && saved > 0) {
          p.inRow = saved;
          api.feed(`${api.name(fx.caster)}'s spelling streak of ${saved} survived a miss.`, 'good');
          api.endEffect(fx.eid, 'used');
          return;
        }
        fx.data.inRow = p.inRow;
        fx.data.done = p.done;
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Streak kept', tone: 'good' }),
  },
  {
    id: 'word-scramble.streak-breaker',
    name: 'Spelling Streak Breaker',
    category: 'troll',
    description: 'Breaks an opponent\'s spelling streak: their next solved word is back to single points.',
    target: 'opponent',
    modes: [MODE],
    needs: ['spelling-streak'],
    cost: 25,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const p = playing(api, t);
      if (!p) return { error: `${api.name(t)} has finished every word.` };
      if (p.inRow <= 0) return { error: `${api.name(t)} has no spelling streak to break.` };
      p.inRow = 0;
      api.feed(`${api.name(c.caster)} broke ${api.name(t)}'s spelling streak.`, 'bad');
    },
  },
  {
    id: 'word-scramble.spelling-surge',
    name: 'Spelling Streak Surge',
    category: 'advantage',
    description: 'Your spelling streak jumps to 2, so your next solved word scores triple. A streak can never be longer than the words you have solved.',
    target: 'self',
    modes: [MODE],
    needs: ['spelling-streak'],
    cost: 30,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const p = playing(api, c.caster);
      if (!p) return { error: 'You have finished every word.' };
      const to = Math.min(2, p.solved);
      if (to <= p.inRow) return { error: p.inRow >= 2 ? 'Your streak already scores triple.' : 'Solve a word first: a streak needs solved words.' };
      p.inRow = to;
    },
  },
];

defineCheats(cheats);
