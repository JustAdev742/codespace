import type { Answer, Question } from '@ludora/shared';
import { draw } from '../../questions/deck.ts';
import { DEADLINE_GRACE_MS } from '../../mechanics/syncRounds.ts';
import { buildScramble, HINT_COST, matchesAnswer, PLAIN_POINTS, scrambleSource, streakMultiplier, wordValue, type Scramble } from '../../modes/word-scramble/index.ts';
import { meta } from '../../modes/word-scramble/meta.ts';
import { answerText } from '../../modes/flashcard-study/answer-text.ts';
import type { Deck } from '../../questions/deck.ts';
import type { StreamState } from '../../mechanics/selfPaced.ts';
import type { PlayerId } from '../../sdk/types.ts';
import { inGame, odds, rollOdds, target, transfer } from '../cheats/kit.ts';
import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';

/*
 * Cheats that only make sense in Word Scramble: they work on the letter
 * tiles (hints, re-scrambles), on each player's pile of words, on the word
 * timer, on the game clock and on the spelling streak. A cheat never spells
 * a word out for anyone: at least two letters of a word always stay hidden.
 */

const MODE = 'word-scramble';
/** Letters of a word that cheats always leave unrevealed. */
const KEEP_HIDDEN = 2;
/** Cheats that shorten a word timer never leave less than this. */
const MIN_WORD_LEFT_MS = 4000;
/** What the typo tax takes for each wrong spelling. */
const TYPO_FINE = 10;
/** The most the overtime bell adds to the game clock. */
const OVERTIME_MS = 20_000;

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
  hintsUsed: number;
  finished: boolean;
  nextAt: number | null;
  main: number;
  target: number;
  again: string[];
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
const secs = (ms: number) => `${Math.round(ms / 100) / 10} s`;
const qidOf = (api: ChaosApi, iid: string) => api.ctx.questions.instance(iid).qid;

/** What a word is worth to this player now, as their screen shows it: streak multiplier, then half for a second chance. */
function shownValue(api: ChaosApi, p: Speller, w: Word): number {
  const base = w.scramble ? wordValue(w.scramble) : PLAIN_POINTS;
  const value = api.ctx.settings.streak ? base * streakMultiplier(p.inRow) : base;
  return p.retry ? Math.round(value / 2) : value;
}

/**
 * Put `incoming` in the place of `current` (the word just drawn) in a player's pile, and `current`
 * where `incoming` was further on, so the player still meets every word once. False if `current`
 * is not the word just drawn, or `incoming` is not still to come.
 */
function tradeInPile(deck: Deck, current: string, incoming: string): boolean {
  const later = deck.ids.indexOf(incoming, deck.pos);
  if (deck.ids[deck.pos - 1] !== current || later < 0) return false;
  deck.ids[deck.pos - 1] = incoming;
  deck.ids[later] = current;
  return true;
}

/** The full time of the game, as the mode set it. */
const gameMs = (api: ChaosApi) => (api.ctx.common.timeLimitSec > 0 ? api.ctx.common.timeLimitSec : meta.common.defaults.timeLimitSec!) * 1000;

/** Typo tax: charge the wrong spellings tried on the target's word since the last look. Every new word starts with no tries. */
function chargeTypos(api: ChaosApi, fx: ActiveEffect) {
  const t = target(fx);
  const p = playing(api, t);
  const iid = p?.word?.iid ?? null;
  const tries = p?.word?.scramble?.tries ?? 0;
  const before = iid !== null && iid === fx.data.iid ? Number(fx.data.tries) : 0;
  fx.data.iid = iid;
  fx.data.tries = tries;
  if (!p || tries <= before) return;
  const fine = -api.add('score', t, -TYPO_FINE * (tries - before));
  if (fine > 0) api.feed(`${api.name(t)} paid ${fine} points of typo tax.`, 'info');
}

/** Hint tax: charge the hints the target asked for since the last look. */
function chargeHints(api: ChaosApi, fx: ActiveEffect) {
  const t = target(fx);
  const p = spellerOf(api, t);
  if (!p || !inGame(api, t)) return;
  const asked = p.hintsUsed - Number(fx.data.hintsUsed);
  fx.data.hintsUsed = p.hintsUsed;
  if (asked <= 0) return;
  const fine = -api.add('score', t, -HINT_COST * asked);
  if (fine > 0) api.feed(`${api.name(t)} paid ${fine} points of hint tax.`, 'info');
}

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
  {
    id: 'word-scramble.first-spell-curse',
    name: 'First Spell Curse',
    category: 'troll',
    description:
      'For 20 seconds, an opponent gets one try at each word, as in First Spell: once the word on their screen has been spelt wrong, they cannot try it again until the curse lifts. They can still take a hint or skip it. Only in games where a wrong spelling can be tried again.',
    target: 'opponent',
    modes: [MODE],
    needs: ['retries'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    apply: (api, c) => {
      const t = target(c);
      if (!playing(api, t)) return { error: `${api.name(t)} has finished every word.` };
    },
    hooks: {
      gate: (api, _fx, id, action) => {
        const p = playing(api, id);
        const a = p && attempt(p, action);
        // Only another go at a scrambled word already spelt wrong is refused: hints, skips and ordinary questions go through.
        if (!a || (a.type !== 'solve' && a.type !== 'answer') || !p.word?.scramble || p.word.scramble.tries < 1) return;
        return { block: 'First Spell Curse: you have had your try at this word. Take a hint, skip it, or wait for the curse to lift.' };
      },
    },
    overlay: () => ({ kind: 'badge', text: 'One try per word', tone: 'bad' }),
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
  {
    id: 'word-scramble.streak-swap',
    name: 'Spelling Streak Swap',
    category: 'troll',
    description: 'You and an opponent swap spelling streaks. A streak is never longer than the words its new owner has solved.',
    target: 'opponent',
    modes: [MODE],
    needs: ['spelling-streak'],
    cost: 30,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const me = playing(api, c.caster);
      if (!me) return { error: 'You have finished every word.' };
      const them = playing(api, t);
      if (!them) return { error: `${api.name(t)} has finished every word.` };
      const [mine, theirs] = [Math.min(them.inRow, me.solved), Math.min(me.inRow, them.solved)];
      if (mine === me.inRow && theirs === them.inRow) return { error: 'Swapping would leave your streaks as they are.' };
      [me.inRow, them.inRow] = [mine, theirs];
      api.feed(`${api.name(c.caster)} swapped spelling streaks with ${api.name(t)}: ${mine} for ${theirs}.`, 'info');
    },
  },
  {
    id: 'word-scramble.streak-stall',
    name: 'Spelling Streak Stall',
    category: 'troll',
    description: 'For 20 seconds, the words an opponent solves still score as usual, but their spelling streak stays where it is instead of growing.',
    target: 'opponent',
    modes: [MODE],
    needs: ['spelling-streak'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    apply: (api, c, fx) => {
      const t = target(c);
      const p = playing(api, t);
      if (!p) return { error: `${api.name(t)} has finished every word.` };
      fx!.data.solved = p.solved;
    },
    hooks: {
      delta: {
        // A solved word is the only thing that adds to the streak, and it always scores.
        score: (api, fx) => {
          const p = spellerOf(api, target(fx));
          if (!p) return;
          const n = p.solved - Number(fx.data.solved);
          fx.data.solved = p.solved;
          if (n > 0) p.inRow = Math.max(0, p.inRow - n);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Streak stalled', tone: 'bad' }),
  },

  /* ------------------------------- more tiles and words ------------------------------- */
  {
    id: 'word-scramble.word-swap',
    name: 'Scramble Word Swap',
    category: 'troll',
    description:
      'Swap the word on your screen with an opponent\'s, tiles, hinted letters and all. Each of you keeps your own word timer, and each word you hand over takes the other one\'s place later in your pile, so everyone still meets every word once. Not for second-chance words.',
    target: 'opponent',
    modes: [MODE],
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const me = needWord(api, c.caster, true);
      if (isErr(me)) return me;
      const them = needWord(api, t, false);
      if (isErr(them)) return them;
      if (me.retry || them.retry) return { error: 'Second-chance words cannot be swapped.' };
      const [mine, theirs] = [qidOf(api, me.word.iid), qidOf(api, them.word.iid)];
      if (mine === theirs) return { error: `You and ${api.name(t)} are on the same word.` };
      // Check both piles before changing either, so a refusal changes nothing.
      const later = (d: Deck, q: string) => d.ids.indexOf(q, d.pos) >= 0;
      if (me.stream.deck.ids[me.stream.deck.pos - 1] !== mine || them.stream.deck.ids[them.stream.deck.pos - 1] !== theirs) return { error: 'One of these words did not come from its pile.' };
      if (!later(me.stream.deck, theirs)) return { error: `You have already had ${api.name(t)}'s word.` };
      if (!later(them.stream.deck, mine)) return { error: `${api.name(t)} has already had your word.` };
      tradeInPile(me.stream.deck, mine, theirs);
      tradeInPile(them.stream.deck, theirs, mine);
      const [a, b] = [me.word, them.word];
      me.word = { iid: b.iid, scramble: b.scramble, deadline: a.deadline };
      them.word = { iid: a.iid, scramble: a.scramble, deadline: b.deadline };
      // Wrong tries belong to whoever made them.
      if (me.word.scramble) me.word.scramble.tries = 0;
      if (them.word.scramble) them.word.scramble.tries = 0;
      me.stream.iid = me.word.iid;
      them.stream.iid = them.word.iid;
      api.feed(`${api.name(c.caster)} swapped words with ${api.name(t)}.`, 'info');
    },
  },
  {
    id: 'word-scramble.word-boomerang',
    name: 'Word Boomerang',
    category: 'advantage',
    description:
      'The last word you missed or skipped comes back to you once, after your last word, for half points, the way a second chance does. Only in games without second chances, and not for a word that was a second chance itself.',
    target: 'self',
    modes: [MODE],
    cost: 20,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      if (api.ctx.settings.secondChance) return { error: 'Second chances are on: missed words come back already.' };
      const p = playing(api, c.caster);
      if (!p) return { error: 'You have finished every word.' };
      const last = p.stream.last;
      if (!last || last.correct) return { error: 'Your last word was not a miss.' };
      // Words after the main ones are second chances.
      if (p.done > p.main) return { error: 'Your last word was a second chance already.' };
      const qid = qidOf(api, last.iid);
      if (p.again.includes(qid)) return { error: 'That word is already coming back.' };
      p.again.push(qid);
      p.target++;
      api.feed('Word Boomerang: your last missed word comes back once after your last word, for half points.', 'good', [c.caster]);
    },
  },
  {
    id: 'word-scramble.second-chance-shredder',
    name: 'Second Chance Shredder',
    category: 'troll',
    description:
      'Shreds the second chance due back to an opponent soonest: that missed word will not come back to them after their last word, so they cannot win back half its points. Only in games with second chances, and never the last word they have left to play.',
    target: 'opponent',
    modes: [MODE],
    needs: ['second-chances'],
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const p = playing(api, t);
      if (!p) return { error: `${api.name(t)} has finished every word.` };
      if (!p.again.length) return { error: `${api.name(t)} has no second chance waiting.` };
      // Words still to play: the one on screen (if any), main words not started yet, and the second chances.
      if (p.target - p.done <= 1) return { error: `That is the last word ${api.name(t)} has left to play, so it stays.` };
      // The mode plays second chances in the order they were missed, so the first one waiting is the soonest.
      p.again.shift();
      p.target--;
      api.feed(`${api.name(c.caster)} shredded one of your second chances: that word will not come back.`, 'bad', [t]);
    },
  },
  {
    id: 'word-scramble.typo-tax',
    name: 'Spelling Typo Tax',
    category: 'troll',
    description: `For 20 seconds, every wrong spelling an opponent tries costs them ${TYPO_FINE} points from their score (as many as they have). Only in games where a wrong spelling can be tried again.`,
    target: 'opponent',
    modes: [MODE],
    needs: ['retries'],
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 20_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const t = target(c);
      const p = playing(api, t);
      if (!p) return { error: `${api.name(t)} has finished every word.` };
      fx!.data.iid = p.word?.iid ?? null;
      fx!.data.tries = p.word?.scramble?.tries ?? 0;
    },
    hooks: {
      tick: chargeTypos,
      end: (api, fx, reason) => {
        if (reason === 'expired') chargeTypos(api, fx);
      },
    },
    overlay: () => ({ kind: 'badge', text: `Typo tax: ${TYPO_FINE} a try`, tone: 'bad' }),
  },
  {
    id: 'word-scramble.hint-tax',
    name: 'Letter Hint Tax',
    category: 'troll',
    description: `For 20 seconds, every hint an opponent asks for costs them ${HINT_COST} more points, taken from their score straight away (as many as they have), on top of what the hint takes off the word.`,
    target: 'opponent',
    modes: [MODE],
    needs: ['hints'],
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 20_000,
    tickMs: 250,
    apply: (api, c, fx) => {
      const t = target(c);
      const p = playing(api, t);
      if (!p) return { error: `${api.name(t)} has finished every word.` };
      fx!.data.hintsUsed = p.hintsUsed;
    },
    hooks: {
      tick: chargeHints,
      end: (api, fx, reason) => {
        if (reason === 'expired') chargeHints(api, fx);
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Hints cost double', tone: 'bad' }),
  },
  {
    id: 'word-scramble.spelling-wager',
    name: 'Spelling Wager',
    category: 'score',
    description:
      'Bet on the word on your screen. Solve it within 45 seconds and it scores double; miss or skip it and you lose the points it showed when you bet (as many as you have). If the 45 seconds run out first, or the word leaves your screen some other way, the bet is off.',
    target: 'self',
    modes: [MODE],
    cost: 20,
    cooldownMs: 40_000,
    durationMs: 45_000,
    tickMs: 250,
    stacking: 'reject',
    apply: (api, c, fx) => {
      const p = needWord(api, c.caster, true);
      if (isErr(p)) return p;
      fx!.data.iid = p.word.iid;
      fx!.data.stake = shownValue(api, p, p.word);
    },
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const p = spellerOf(api, fx.caster);
          const last = p?.stream.last;
          if (!p || !last?.correct || last.iid !== fx.data.iid || p.word?.iid === fx.data.iid || !((d[fx.caster] ?? 0) > 0)) return;
          d[fx.caster]! *= 2;
          api.feed(`${api.name(fx.caster)} won their spelling wager: the word scored double.`, 'good');
          api.endEffect(fx.eid, 'used');
        },
      },
      // A miss or a skip ends the word without a score, so it is settled here.
      tick: (api, fx) => {
        const p = spellerOf(api, fx.caster);
        if (!p || !inGame(api, fx.caster) || p.word?.iid === fx.data.iid) return;
        const last = p.stream.last;
        if (last && last.iid === fx.data.iid && !last.correct) {
          const lost = -api.add('score', fx.caster, -Number(fx.data.stake));
          api.feed(lost > 0 ? `${api.name(fx.caster)} lost their spelling wager: −${lost} points.` : `${api.name(fx.caster)} lost their spelling wager, with no points to pay.`, 'bad');
        }
        api.endEffect(fx.eid, 'used');
      },
    },
    overlay: (fx) => ({ kind: 'badge', text: `Wager on this word: ${Number(fx.data.stake)}`, tone: 'info' }),
    overlayFor: 'caster',
  },

  /* --------------------------------- more timers -------------------------------- */
  {
    id: 'word-scramble.timer-swap',
    name: 'Word Timer Swap',
    category: 'troll',
    description: `You and an opponent swap the time left on your word timers. Nobody is left with less than ${MIN_WORD_LEFT_MS / 1000} seconds, or given more than a word's full time.`,
    target: 'opponent',
    modes: [MODE],
    needs: ['word-timer'],
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const me = needWord(api, c.caster, true);
      if (isErr(me)) return me;
      const them = needWord(api, t, false);
      if (isErr(them)) return them;
      if (me.word.deadline === null || them.word.deadline === null) return { error: 'Both words need a timer.' };
      const now = api.now();
      const [mine, theirs] = [me.word.deadline - now, them.word.deadline - now];
      if (mine <= 0 || theirs <= 0) return { error: 'Time is already up on one of these words.' };
      const fit = (ms: number, w: Word) => Math.max(MIN_WORD_LEFT_MS, Math.min(ms, api.ctx.questions.timeLimitMs(w.iid)));
      const [toMe, toThem] = [fit(theirs, me.word), fit(mine, them.word)];
      if (Math.abs(toMe - mine) < 500 && Math.abs(toThem - theirs) < 500) return { error: `You and ${api.name(t)} have about the same time left.` };
      setWordDeadline(api, c.caster, me.word, now + toMe);
      setWordDeadline(api, t, them.word, now + toThem);
      api.feed(`${api.name(c.caster)} swapped word timers with ${api.name(t)}: ${secs(toMe)} for ${secs(toThem)}.`, 'info');
    },
  },

  /* --------------------------------- the game clock -------------------------------- */
  {
    id: 'word-scramble.overtime-bell',
    name: 'Scramble Overtime Bell',
    category: 'round',
    description: `Rings for overtime: the game clock gets up to ${OVERTIME_MS / 1000} more seconds for everyone, never leaving more time than the game started with.`,
    target: 'room',
    modes: [MODE],
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const s = api.s as { endsAt: number };
      const add = Math.min(OVERTIME_MS, gameMs(api) - (s.endsAt - api.now()));
      if (add < 1000) return { error: 'The game clock still has all the time it started with.' };
      s.endsAt += add;
      api.ctx.setTimer('time', s.endsAt);
      api.feed(`Overtime bell: the game clock gets ${secs(add)} more.`, 'info');
    },
  },
];

defineCheats(cheats);
