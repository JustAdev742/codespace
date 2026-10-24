import { describe, expect, it } from 'vitest';
import { commonSettingsSchema, createRng, type CommonSettings, type Rng } from '@ludora/shared';
import { GameRuntime } from '../src/runtime/runtime.ts';
import { parseSettings } from '../src/sdk/settings.ts';
import { makeTeams } from '../src/teams.ts';
import { findAnswerLeaks, simulateGame } from '../src/testing/harness.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { lanternTrail, pathBetween, shortcutPays, STEPS } from '../src/modes/lantern-trail/index.ts';
import {
  CHANCE_CARDS,
  CHOICE_SECONDS,
  EVENT_TIMING,
  FINALE,
  ROOM_EVENTS,
  SECOND_STALL_AT,
  START_COINS,
  STALL_MOVE_MIN,
  variants,
  type CardId,
  type EventId,
} from '../src/modes/lantern-trail/meta.ts';
import { CROSSROADS, FERRY_PAIR, GATE, LONG_WAY, LOOP, REJOIN, SHORTCUT, SPACES, placeName } from '../src/modes/lantern-trail/board.ts';
import { TRUE_SET } from './rule-helpers.ts';

/*
 * Lantern Trail rules, driven through a GameRuntime on a fake clock. A board
 * game needs exact landings, so the driver scripts the dice (and, where a test
 * needs it, the chance card or the stall's next space) by wrapping the game's
 * seeded generator; anything not scripted still comes from the seed. Tests set
 * the scene (positions, coins, stalls) by editing the state between actions,
 * which is why this runtime is not the strict, frozen one: the conformance
 * suite plays every variant in strict mode.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const CHOICE_MS = CHOICE_SECONDS * 1000;

interface Setup {
  players?: string[];
  settings?: Record<string, unknown>;
  common?: Partial<CommonSettings>;
  teams?: number;
  seed?: number;
}

function setup(o: Setup = {}) {
  const clock = { t: 10_000, now: () => clock.t };
  const feed: string[] = [];
  const errors: unknown[] = [];
  const teamCount = o.teams ?? 0;
  const ids = o.players ?? ['a', 'b'];
  const rt = new GameRuntime({
    mode: lanternTrail,
    settings: parseSettings(lanternTrail.settings, o.settings ?? {}),
    common: commonSettingsSchema.parse({ ...lanternTrail.defaults, shuffleQuestions: false, shuffleChoices: false, ...o.common, teamCount }),
    questions: TRUE_SET,
    players: ids.map((id, i) => ({ id, name: id.toUpperCase(), teamId: teamCount ? `t${(i % teamCount) + 1}` : null, isBot: false })),
    teams: makeTeams(teamCount),
    seed: o.seed ?? 42,
    clock,
    listener: { error: (e) => errors.push(e), feed: (f) => feed.push(f.text) },
  });
  expect(rt.start().ok).toBe(true);

  // Scripted dice, chance draws and picks, falling back to the seeded generator.
  const dice: number[] = [];
  const floats: number[] = [];
  const picks: unknown[] = [];
  let rig: Rng | null = null;
  const install = () => {
    const current = (rt as any).rng as Rng;
    if (current === rig) return;
    const real = current;
    rig = {
      next: () => (floats.length ? floats.shift()! : real.next()),
      int: (min, max) => (dice.length ? dice.shift()! : real.int(min, max)),
      pick: (items) => {
        const k = picks.length ? items.indexOf(picks[0] as never) : -1;
        if (k < 0) return real.pick(items);
        picks.shift();
        return items[k]!;
      },
      shuffle: (items) => real.shuffle(items),
      chance: (p) => real.chance(p),
      state: () => real.state(),
    };
    (rt as any).rng = rig;
  };
  install();

  const state = (): any => rt.debugState();
  const walker = (id: string): any => state().walkers[id];
  const view = (id: string): any => rt.view({ kind: 'player', playerId: id });
  const host = (): any => rt.view({ kind: 'host' });
  const act = (id: string, a: unknown) => {
    install();
    const r = rt.act(id, a);
    install();
    return r;
  };
  const answer = (id: string, right: boolean) => act(id, { type: 'answer', iid: view(id).you.question.iid, answer: { type: 'truefalse', value: right } });
  /** The chance float that draws `card` from a deck of these cards (in table order). */
  const cardFloat = (card: CardId, deck: CardId[]) => {
    const cards = CHANCE_CARDS.filter((c) => deck.includes(c.id));
    const total = cards.reduce((n, c) => n + c.weight, 0);
    let before = 0;
    for (const c of cards) {
      if (c.id === card) return (before + c.weight / 2) / total;
      before += c.weight;
    }
    throw new Error(`no ${card} in the deck`);
  };
  const ALL: CardId[] = CHANCE_CARDS.map((c) => c.id);
  return {
    rt,
    clock,
    feed,
    errors,
    state,
    walker,
    view,
    host,
    act,
    right: (id: string) => answer(id, true),
    wrong: (id: string) => answer(id, false),
    dice: (...ns: number[]) => void dice.push(...ns),
    pick: (...xs: unknown[]) => void picks.push(...xs),
    card: (card: CardId, deck: CardId[] = ALL) => void floats.push(cardFloat(card, deck)),
    place: (id: string, pos: number) => void (walker(id).pos = pos),
    coins: (id: string, n: number) => void (walker(id).coins = n),
    /** No streak, so the next right answer rolls one die. */
    calm: (id: string) => void (walker(id).stream.streak = 0),
    stall: (pos: number, i = 0) => void (state().stalls[i].pos = pos),
    stallAt: (i = 0): number => state().stalls[i].pos,
    advance: (ms: number) => {
      install();
      clock.t += ms;
      rt.fireDueTimers();
      install();
    },
    advanceTo: (gameMs: number) => {
      install();
      clock.t += Math.max(0, gameMs - rt.gameNow());
      rt.fireDueTimers();
      install();
    },
    notes: (id: string): any[] => view(id).you.move?.notes ?? [],
  };
}

const kinds = (list: readonly number[]) => list.map((id) => SPACES[id]!.kind);
const count = (k: string, list: readonly number[]) => kinds(list).filter((x) => x === k).length;
const loop = Array.from({ length: LOOP }, (_, i) => i);

describe('Lantern Trail board', () => {
  it('is a loop of 32 spaces with the kinds the rules describe, plus a 4-space shortcut', () => {
    expect(SPACES).toHaveLength(36);
    expect(SPACES[GATE]!.kind).toBe('gate');
    expect(SPACES[CROSSROADS]!.kind).toBe('fork');
    // The rules' table (12 coin spaces) covers 30 of the 32: the other two are coin spaces too.
    expect({ coins: count('coins', loop), fair: count('fair', loop), gloom: count('gloom', loop), chance: count('chance', loop), ferry: count('ferry', loop), fork: count('fork', loop), gate: count('gate', loop) }).toEqual({
      coins: 14,
      fair: 3,
      gloom: 5,
      chance: 6,
      ferry: 2,
      fork: 1,
      gate: 1,
    });
    expect({ gloom: count('gloom', SHORTCUT), chance: count('chance', SHORTCUT), coins: count('coins', SHORTCUT) }).toEqual({ gloom: 2, chance: 1, coins: 1 });
    expect(FERRY_PAIR.map((id) => SPACES[id]!.kind)).toEqual(['ferry', 'ferry']);
  });

  it('saves 6 steps by the shortcut, which skips 10 loop spaces, and puts the ferries straight across', () => {
    expect(SPACES[CROSSROADS]!.next).toEqual([4, SHORTCUT[0]]);
    expect(SPACES[SHORTCUT[3]!]!.next).toEqual([REJOIN]);
    expect(pathBetween(CROSSROADS, REJOIN)).toEqual([CROSSROADS, ...SHORTCUT, REJOIN]);
    expect(STEPS[CROSSROADS]![REJOIN]).toBe(5);
    expect(REJOIN - CROSSROADS).toBe(11);
    expect(LONG_WAY).toHaveLength(10);
    expect(STEPS[FERRY_PAIR[0]]![FERRY_PAIR[1]]).toBe(16);
    expect(STEPS[FERRY_PAIR[1]]![FERRY_PAIR[0]]).toBe(16);
  });

  it('names every space once, keeps it on the board, and never puts two puddles side by side', () => {
    expect(new Set(SPACES.map((s) => s.name)).size).toBe(SPACES.length);
    for (const s of SPACES) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(100);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(100);
      if (s.kind === 'gloom') for (const n of s.next) expect(SPACES[n]!.kind, `${s.name} to ${SPACES[n]!.name}`).not.toBe('gloom');
    }
    expect(placeName(33)).toBe('the Old Bridge');
    expect(placeName(16)).toBe('Lantern Square');
  });
});

describe('Lantern Trail rolls and spaces', () => {
  it('a wrong answer means no roll, and the next question comes straight away', () => {
    const g = setup();
    const before = g.view('a').you.question.iid;
    expect(g.wrong('a').ok).toBe(true);
    const you = g.view('a').you;
    expect(you).toMatchObject({ pos: GATE, coins: START_COINS, move: null, pending: null });
    expect(you.last).toMatchObject({ correct: false, text: 'No roll this time.' });
    expect(you.question.iid).not.toBe(before);
  });

  it('a right answer rolls one die and walks that many spaces; coin spaces pay 3, lucky fairs 6, puddles take 3 but never below 0', () => {
    const g = setup();
    g.dice(1);
    expect(g.right('a').ok).toBe(true);
    let you = g.view('a').you;
    expect(you).toMatchObject({ pos: 1, coins: START_COINS + 3 });
    expect(you.last.text).toBe('You rolled 1.');
    expect(you.move).toMatchObject({ dice: [1], steps: 1, hot: false, path: [0, 1], done: true });
    expect(g.notes('a')).toEqual([{ k: 'space', i: 1, kind: 'coins', coins: 3 }]);
    expect(you.question).not.toBeNull();

    g.place('a', 4);
    g.dice(1);
    g.right('a');
    expect(g.view('a').you).toMatchObject({ pos: 5, coins: START_COINS + 9 });

    g.calm('a');
    g.place('a', 6);
    g.coins('a', 1);
    g.dice(1);
    g.right('a');
    expect(g.view('a').you).toMatchObject({ pos: 7, coins: 0 });
    expect(g.notes('a')).toEqual([{ k: 'space', i: 1, kind: 'gloom', coins: -1 }]);
    expect(g.errors).toEqual([]);
  });

  it('walking past or onto the Town Gate pays 5', () => {
    const g = setup();
    g.place('a', 30);
    g.dice(3);
    g.right('a');
    expect(g.view('a').you).toMatchObject({ pos: 1, coins: START_COINS + 5 + 3 });
    expect(g.notes('a')).toEqual([
      { k: 'gate', i: 2, coins: 5 },
      { k: 'space', i: 3, kind: 'coins', coins: 3 },
    ]);
    g.place('b', 30);
    g.dice(2);
    g.right('b');
    expect(g.view('b').you).toMatchObject({ pos: GATE, coins: START_COINS + 5 });
    expect(g.notes('b')).toEqual([{ k: 'gate', i: 2, coins: 5 }]);
  });

  it('three right answers in a row start a hot streak of two dice, until a wrong answer', () => {
    const g = setup();
    for (let i = 0; i < 2; i++) {
      g.place('a', 4);
      g.dice(1);
      g.right('a');
      expect(g.view('a').you.move.dice).toHaveLength(1);
    }
    g.place('a', 4);
    g.dice(2, 3);
    g.right('a');
    let you = g.view('a').you;
    expect(you.move).toMatchObject({ dice: [2, 3], steps: 5, hot: true });
    expect(you.pos).toBe(9);
    expect(you.last.text).toBe('Hot streak: you rolled 2 + 3 = 5.');
    g.place('a', 4);
    g.dice(1, 1);
    g.right('a');
    expect(g.view('a').you.move).toMatchObject({ dice: [1, 1], hot: true });
    g.wrong('a');
    g.place('a', 4);
    g.dice(1);
    g.right('a');
    you = g.view('a').you;
    expect(you.move).toMatchObject({ dice: [1], hot: false });
  });

  it('Lucky dice rolls two dice and keeps the higher', () => {
    const g = setup({ settings: { luckyDice: true } });
    g.place('a', 4);
    g.dice(2, 5);
    g.right('a');
    const you = g.view('a').you;
    expect(you.move).toMatchObject({ dice: [2, 5], kept: 1, steps: 5 });
    expect(you.pos).toBe(9);
    expect(you.last.text).toBe('Lucky dice: 2 and 5, you keep 5.');
  });

  it('a ferry carries you straight across, both ways, without passing the Town Gate', () => {
    const g = setup();
    g.place('a', 7);
    g.dice(1);
    g.right('a');
    expect(g.view('a').you).toMatchObject({ pos: 24, coins: START_COINS });
    expect(g.view('a').you.move).toMatchObject({ path: [7, 8, 24], jumps: [2] });
    expect(g.notes('a')).toEqual([{ k: 'ferry', i: 2, to: 24 }]);
    g.place('b', 23);
    g.dice(1);
    g.right('b');
    expect(g.view('b').you).toMatchObject({ pos: 8, coins: START_COINS });
  });
});

describe('Lantern Trail Crossroads', () => {
  it('pauses the move with no question, then walks the way chosen with the steps left', () => {
    const g = setup();
    g.place('a', 1);
    g.dice(5);
    g.right('a');
    let you = g.view('a').you;
    expect(you.pos).toBe(CROSSROADS);
    expect(you.pending).toEqual({ kind: 'fork', deadline: CHOICE_MS });
    expect(you.question).toBeNull();
    expect(g.act('a', { type: 'answer', iid: 'q1', answer: { type: 'truefalse', value: true } })).toMatchObject({ ok: false });
    expect(g.act('a', { type: 'buy', buy: true })).toMatchObject({ ok: false, message: 'There is nothing to buy right now.' });
    expect(g.act('a', { type: 'fork', route: 'short' }).ok).toBe(true);
    you = g.view('a').you;
    // 1 → 2 → 3, then 3 more on the shortcut: Shadow Alley, the Old Bridge, Mossy Steps (a puddle).
    expect(you.move.path).toEqual([1, 2, 3, 32, 33, 34]);
    expect(you).toMatchObject({ pos: 34, coins: START_COINS - 3, pending: null });
    expect(you.question).not.toBeNull();
    expect(g.notes('a')[0]).toEqual({ k: 'route', i: 2, route: 'short', auto: false });

    g.calm('b');
    g.place('b', 1);
    g.dice(5);
    g.right('b');
    g.act('b', { type: 'fork', route: 'long' });
    expect(g.view('b').you.move.path).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('takes the long way after 15 seconds with no choice', () => {
    const g = setup();
    g.place('a', 2);
    g.dice(3);
    g.right('a');
    g.advance(CHOICE_MS - 1);
    expect(g.view('a').you.pending.kind).toBe('fork');
    g.advance(1);
    const you = g.view('a').you;
    expect(you.pending).toBeNull();
    expect(you.move.path).toEqual([2, 3, 4, 5]);
    expect(g.notes('a')[0]).toMatchObject({ k: 'route', route: 'long', auto: true });
    expect(you.question).not.toBeNull();
  });

  it('asks at the start of the next move when a move ends on the Crossroads', () => {
    const g = setup();
    g.place('a', 1);
    g.dice(2);
    g.right('a');
    expect(g.view('a').you).toMatchObject({ pos: CROSSROADS, pending: null });
    g.dice(5);
    g.right('a');
    expect(g.view('a').you.pending.kind).toBe('fork');
    g.act('a', { type: 'fork', route: 'short' });
    // Five steps by the shortcut reach the Clock Tower, 11 spaces along the loop.
    expect(g.view('a').you.pos).toBe(REJOIN);
  });
});

describe('Lantern Trail Golden Lanterns', () => {
  it('pauses as you pass the stall with enough coins; buying moves the stall at least 8 steps on', () => {
    const g = setup();
    g.stall(10);
    g.place('a', 9);
    g.coins('a', 25);
    g.dice(2);
    g.right('a');
    let you = g.view('a').you;
    expect(you.pos).toBe(10);
    expect(you.pending).toMatchObject({ kind: 'buy', price: 20, ticket: false, deadline: CHOICE_MS });
    expect(you.question).toBeNull();
    expect(g.act('a', { type: 'buy', buy: true }).ok).toBe(true);
    you = g.view('a').you;
    const to = g.stallAt();
    expect(you).toMatchObject({ lanterns: 1, pos: 11, coins: 25 - 20 + 3, pending: null });
    expect(STEPS[10]![to]).toBeGreaterThanOrEqual(STALL_MOVE_MIN);
    expect(['ferry', 'fork']).not.toContain(SPACES[to]!.kind);
    expect(g.feed).toContain(`A bought a Golden Lantern. The stall moved to ${placeName(to)}.`);
    expect(g.notes('a')).toContainEqual({ k: 'buy', i: 1, price: 20, ticket: false, to, auto: false });
    expect(g.host().stalls[0]).toMatchObject({ pos: to, from: 10, why: 'bought', n: 1 });
    expect(g.host().plays[0]).toMatchObject({ kind: 'buy', playerId: 'a', text: 'A bought a Golden Lantern.' });
  });

  it('Keep walking leaves the stall where it is', () => {
    const g = setup();
    g.stall(10);
    g.place('a', 9);
    g.coins('a', 25);
    g.dice(2);
    g.right('a');
    g.act('a', { type: 'buy', buy: false });
    expect(g.view('a').you).toMatchObject({ lanterns: 0, coins: 28, pos: 11 });
    expect(g.stallAt()).toBe(10);
    expect(g.notes('a')[0]).toEqual({ k: 'pass', i: 1 });
  });

  it('buys after 15 seconds with no choice, if it still can', () => {
    const g = setup();
    g.stall(10);
    g.place('a', 9);
    g.coins('a', 25);
    g.dice(2);
    g.right('a');
    g.advance(CHOICE_MS);
    expect(g.view('a').you).toMatchObject({ lanterns: 1, pending: null });
    expect(g.notes('a')[0]).toMatchObject({ k: 'buy', auto: true });
  });

  it('walks past without stopping when you are short of coins, and says what it costs', () => {
    const g = setup();
    g.stall(10);
    g.place('a', 9);
    g.coins('a', 12);
    g.dice(2);
    g.right('a');
    const you = g.view('a').you;
    expect(you).toMatchObject({ pos: 11, pending: null, lanterns: 0 });
    expect(g.notes('a')[0]).toEqual({ k: 'short', i: 1, price: 20 });
    expect(you.question).not.toBeNull();
  });

  it('lets the space you land on pay first, then offers the stall standing on it', () => {
    const g = setup();
    g.stall(11);
    g.place('a', 9);
    g.coins('a', 18);
    g.dice(2);
    g.right('a');
    expect(g.view('a').you.pending).toMatchObject({ kind: 'buy', price: 20 });
    expect(g.view('a').you.coins).toBe(21);
  });

  it('two players stopped at the same stall: the first to buy gets it, and the other walks on', () => {
    const g = setup();
    g.stall(10);
    for (const id of ['a', 'b']) {
      g.place(id, 9);
      g.coins(id, 30);
      g.dice(2);
      g.right(id);
      expect(g.view(id).you.pending.kind).toBe('buy');
    }
    g.act('b', { type: 'buy', buy: true });
    const a = g.view('a').you;
    expect(a).toMatchObject({ pending: null, pos: 11, lanterns: 0, coins: 33 });
    expect(g.notes('a')).toContainEqual({ k: 'missed', i: 1, why: 'moved' });
    expect(a.question).not.toBeNull();
    expect(g.view('b').you.lanterns).toBe(1);
  });

  it('a Golden ticket takes 10 off the next lantern, never below 5, and is used up', () => {
    const g = setup();
    g.walker('a').tickets = 1;
    expect(g.view('a').you.price).toBe(10);
    g.stall(10);
    g.place('a', 9);
    g.coins('a', 12);
    g.dice(2);
    g.right('a');
    expect(g.view('a').you.pending).toMatchObject({ kind: 'buy', price: 10, ticket: true });
    g.act('a', { type: 'buy', buy: true });
    expect(g.view('a').you).toMatchObject({ lanterns: 1, tickets: 0, coins: 12 - 10 + 3 });
    // In Last lanterns a lantern costs 10, and a ticket can only bring it to 5.
    g.walker('a').tickets = 1;
    g.state().last = true;
    expect(g.view('a').you.price).toBe(5);
  });

  it('the first player to the goal wins at once', () => {
    const g = setup({ settings: { goalLanterns: 2 } });
    g.walker('a').lanterns = 1;
    g.stall(10);
    g.place('a', 9);
    g.coins('a', 25);
    g.dice(2);
    g.right('a');
    g.act('a', { type: 'buy', buy: true });
    expect(g.rt.status).toBe('ended');
    expect(g.rt.results!.summary).toBe('A collected 2 Golden Lanterns first.');
    // The game ends the moment the lantern is bought: the rest of the move never happens.
    expect(g.rt.results!.standings[0]).toMatchObject({ playerId: 'a', rank: 1, label: '2 Golden Lanterns, 5 coins' });
  });
});

describe('Lantern Trail chance cards', () => {
  const landOnChance = (g: ReturnType<typeof setup>, id: string, card: CardId, deck?: CardId[]) => {
    g.calm(id);
    g.place(id, 1);
    g.dice(1);
    g.card(card, deck);
    expect(g.right(id).ok).toBe(true);
  };

  it('Wind at your back walks 3 more (stopping at the Crossroads like any walk) and takes the space it reaches', () => {
    const g = setup();
    landOnChance(g, 'a', 'wind');
    expect(g.view('a').you.pending.kind).toBe('fork');
    g.act('a', { type: 'fork', route: 'long' });
    const you = g.view('a').you;
    expect(you.move.path).toEqual([1, 2, 3, 4, 5]);
    expect(you).toMatchObject({ pos: 5, coins: START_COINS + 6 });
    expect(g.notes('a')).toEqual([
      { k: 'card', i: 1, card: 'wind', coins: 0 },
      { k: 'route', i: 2, route: 'long', auto: false },
      { k: 'space', i: 4, kind: 'fair', coins: 6 },
    ]);
  });

  it('Lucky purse pays 10; the Gloom puddle card takes 5, never below 0', () => {
    const g = setup();
    landOnChance(g, 'a', 'purse');
    expect(g.view('a').you.coins).toBe(START_COINS + 10);
    g.coins('b', 3);
    landOnChance(g, 'b', 'gloom');
    expect(g.view('b').you.coins).toBe(0);
    expect(g.notes('b')).toEqual([{ k: 'card', i: 1, card: 'gloom', coins: -3 }]);
  });

  it('Coin shower gives everyone else 3 and you 6, and tells the room', () => {
    const g = setup({ players: ['a', 'b', 'c'] });
    landOnChance(g, 'a', 'shower');
    expect([g.view('a').you.coins, g.view('b').you.coins, g.view('c').you.coins]).toEqual([START_COINS + 6, START_COINS + 3, START_COINS + 3]);
    expect(g.feed).toContain('A’s coin shower: everyone gets 3 coins.');
  });

  it('Golden ticket is kept for the next lantern', () => {
    const g = setup();
    landOnChance(g, 'a', 'ticket');
    expect(g.view('a').you).toMatchObject({ tickets: 1, price: 10 });
  });

  it('Stall rumour moves the nearest stall 3 spaces towards you, stepping off a ferry', () => {
    const g = setup();
    g.stall(9);
    landOnChance(g, 'a', 'rumour');
    expect(g.stallAt()).toBe(6);
    expect(g.notes('a')).toContainEqual({ k: 'rumour', i: 1, to: 6, came: false });
    expect(g.host().plays[0]).toMatchObject({ kind: 'rumour', playerId: 'a', text: 'A stall rumour moved the stall to Kite Field.' });
    // Three spaces from Orchard Path is the West Pier, where no stall stands: one more towards the player.
    g.stall(11);
    landOnChance(g, 'b', 'rumour');
    expect(g.stallAt()).toBe(7);
  });

  it('Stall rumour can bring the stall right to you, and then you may buy', () => {
    const g = setup();
    g.stall(4);
    g.coins('a', 25);
    landOnChance(g, 'a', 'rumour');
    expect(g.stallAt()).toBe(2);
    expect(g.view('a').you.pending).toMatchObject({ kind: 'buy', price: 20 });
    expect(g.host().plays[0]).toMatchObject({ kind: 'rumour', text: 'A stall rumour brought the stall right to A.' });
    // A stall behind you comes forward to meet you.
    g.act('a', { type: 'buy', buy: false });
    g.stall(31);
    landOnChance(g, 'b', 'rumour');
    expect(g.stallAt()).toBe(2);
  });

  it('Pickpocket Glim takes up to 5 coins from the player you pick, and the room hears about it', () => {
    const g = setup({ players: ['a', 'b', 'c'] });
    g.coins('b', 30);
    g.coins('c', 3);
    g.walker('c').lanterns = 2;
    g.stall(20);
    g.place('b', 16);
    landOnChance(g, 'a', 'pickpocket');
    const p = g.view('a').you.pending;
    expect(p).toMatchObject({ kind: 'target', card: 'pickpocket', deadline: CHOICE_MS });
    expect(p.targets).toEqual([
      { id: 'b', name: 'B', coins: 30, lanterns: 0, stallSteps: 4 },
      { id: 'c', name: 'C', coins: 3, lanterns: 2, stallSteps: STEPS[GATE]![20] },
    ]);
    expect(g.view('a').you.question).toBeNull();
    expect(g.act('a', { type: 'target', playerId: 'a' })).toMatchObject({ ok: false });
    g.act('a', { type: 'target', playerId: 'c' });
    expect(g.view('a').you.coins).toBe(START_COINS + 3);
    expect(g.view('c').you.coins).toBe(0);
    expect(g.view('c').you.hit).toMatchObject({ kind: 'pickpocket', name: 'A', coins: 3 });
    expect(g.feed).toContain('A’s Pickpocket Glim took 3 coins from C.');
    expect(g.notes('a')).toContainEqual({ k: 'steal', i: 1, name: 'C', coins: 3 });
  });

  it('with no pick in 15 seconds, the trick goes to the leader', () => {
    const g = setup({ players: ['a', 'b', 'c'] });
    g.coins('b', 40);
    g.walker('c').lanterns = 1;
    g.coins('c', 8);
    landOnChance(g, 'a', 'pickpocket');
    g.advance(CHOICE_MS);
    expect(g.view('c').you.coins).toBe(3);
    expect(g.view('b').you.coins).toBe(40);
    expect(g.view('a').you.question).not.toBeNull();
  });

  it('Trade places swaps you with the player you pick, and their stall is yours to buy', () => {
    const g = setup();
    g.place('b', 20);
    g.stall(20);
    g.coins('a', 25);
    landOnChance(g, 'a', 'trade');
    g.act('a', { type: 'target', playerId: 'b' });
    const a = g.view('a').you;
    expect(a.pos).toBe(20);
    expect(a.move).toMatchObject({ path: [1, 2, 20], jumps: [2] });
    expect(g.view('b').you.pos).toBe(2);
    expect(g.view('b').you.hit).toMatchObject({ kind: 'trade', name: 'A', to: 2 });
    expect(g.feed).toContain('A traded places with B.');
    expect(a.pending).toMatchObject({ kind: 'buy', price: 20 });
  });

  it('never picks a teammate, and never trades with someone in the middle of a move', () => {
    const t = setup({ players: ['a', 'b', 'c', 'd'], teams: 2 });
    landOnChance(t, 'a', 'pickpocket');
    expect(t.view('a').you.pending.targets.map((x: { id: string }) => x.id)).toEqual(['b', 'd']);

    const g = setup();
    g.place('b', 1);
    g.dice(5);
    g.right('b');
    expect(g.view('b').you.pending.kind).toBe('fork');
    // B is stopped at the Crossroads, so Trade places is out of the deck for A, and its odds go to the rest.
    expect(g.view('a').odds.map((o: { card: string }) => o.card)).not.toContain('trade');
    expect(g.view('a').odds.map((o: { card: string }) => o.card)).toContain('pickpocket');
  });

  it('has no tricks with nobody else to pick, or with tricks off, and the odds share out the whole', () => {
    const solo = setup({ players: ['a'] });
    const off = setup({ settings: { tricks: false } });
    for (const odds of [solo.view('a').odds, off.view('a').odds]) {
      expect(odds.map((o: { card: string }) => o.card)).toEqual(['wind', 'purse', 'shower', 'rumour', 'ticket', 'gloom']);
      expect(odds.find((o: { card: string }) => o.card === 'purse').pct).toBe(26.7);
      expect(Math.round(odds.reduce((n: number, o: { pct: number }) => n + o.pct, 0))).toBe(100);
    }
  });

  it('draws the cards at the odds shown', () => {
    expect(CHANCE_CARDS.reduce((n, c) => n + c.weight, 0)).toBe(100);
    const g = setup({ seed: 7 });
    const odds = g.view('a').odds as { card: CardId; pct: number }[];
    expect(odds.map((o) => o.pct)).toEqual(CHANCE_CARDS.map((c) => c.weight));
    const tally: Record<string, number> = {};
    const draws = 3000;
    for (let n = 0; n < draws; n++) {
      g.calm('a');
      g.place('a', 1);
      g.state().stalls[0].pos = 20;
      g.dice(1);
      g.right('a');
      const card = g.notes('a').find((x) => x.k === 'card')!.card as CardId;
      tally[card] = (tally[card] ?? 0) + 1;
      const p = g.view('a').you.pending;
      if (p?.kind === 'target') g.act('a', { type: 'target', playerId: 'b' });
      else if (p?.kind === 'buy') g.act('a', { type: 'buy', buy: false });
      else if (p?.kind === 'fork') g.act('a', { type: 'fork', route: 'long' });
    }
    for (const c of CHANCE_CARDS) expect(Math.abs((tally[c.id] ?? 0) / draws - c.weight / 100), c.id).toBeLessThan(0.025);
  });
});

describe('Lantern Trail room events and Last lanterns', () => {
  const timeline = (g: ReturnType<typeof setup>, until: number) => {
    const seen: { kind: EventId; startsAt: number; endsAt: number }[] = [];
    for (let t = 0; t <= until; t += 1000) {
      g.advanceTo(t);
      const e = g.host().event;
      if (e && !seen.some((x) => x.startsAt === e.startsAt)) seen.push(e);
    }
    return seen;
  };

  it('runs an event every 90 seconds from 60 seconds, for 30 seconds, never the same twice in a row', () => {
    const g = setup({ players: ['a'] });
    const events = timeline(g, 420_000);
    expect(events.map((e) => [e.startsAt, e.endsAt])).toEqual([
      [60_000, 90_000],
      [150_000, 180_000],
      [240_000, 270_000],
      [330_000, 360_000],
    ]);
    for (let i = 1; i < events.length; i++) expect(events[i]!.kind).not.toBe(events[i - 1]!.kind);
    for (const e of events) expect(g.feed.some((f) => f.startsWith(`${ROOM_EVENTS.find((x) => x.id === e.kind)!.title}.`))).toBe(true);
    expect(g.rt.status).toBe('ended');
  });

  it('keeps events out of Last lanterns, which always lights the final 45 seconds', () => {
    const short = setup({ players: ['a'], common: { timeLimitSec: 180 } });
    expect(timeline(short, 180_000).map((e) => e.startsAt)).toEqual([60_000]);
    const cut = setup({ players: ['a'], common: { timeLimitSec: 400 } });
    expect(timeline(cut, 400_000).map((e) => [e.startsAt, e.endsAt]).at(-1)).toEqual([330_000, 355_000]);
    const off = setup({ players: ['a'], settings: { events: false } });
    off.advanceTo(374_000);
    expect(off.host()).toMatchObject({ event: null, finalStretch: false, price: 20 });
    expect(off.feed).toEqual([]);
    off.advanceTo(375_000);
    expect(off.host()).toMatchObject({ finalStretch: true, price: FINALE.price });
    expect(off.feed).toEqual(['Last lanterns: Golden Lanterns cost 10 coins until the end, and the stall stays close.']);
    // No time limit set: the game still ends, after 7 minutes.
    const open = setup({ players: ['a'], common: { timeLimitSec: 0 } });
    expect(open.host().endsAt).toBe(420_000);
  });

  it('Last lanterns: lanterns cost 10, and the stall moves only 4 to 12 steps after a purchase', () => {
    const g = setup();
    g.advanceTo(375_000);
    expect(g.host().finalStretch).toBe(true);
    for (let n = 0; n < 12; n++) {
      g.calm('a');
      g.stall(11);
      g.place('a', 10);
      g.coins('a', 7);
      g.dice(1);
      g.right('a');
      expect(g.view('a').you.pending).toMatchObject({ kind: 'buy', price: 10 });
      g.act('a', { type: 'buy', buy: true });
      const steps = STEPS[11]![g.stallAt()]!;
      expect(steps).toBeGreaterThanOrEqual(FINALE.minSteps);
      expect(steps).toBeLessThanOrEqual(FINALE.maxSteps);
    }
  });

  it('Lantern sale halves the price; Double dice rolls two dice for everyone', () => {
    const g = setup();
    g.pick(ROOM_EVENTS.find((e) => e.id === 'sale'));
    g.advanceTo(EVENT_TIMING.firstSec * 1000);
    expect(g.host()).toMatchObject({ event: { kind: 'sale' }, price: 10 });
    expect(g.feed).toContain('Lantern sale. Golden Lanterns cost half.');
    g.advanceTo(90_000);
    expect(g.host()).toMatchObject({ event: null, price: 20, nextEventAt: 150_000 });
    g.pick(ROOM_EVENTS.find((e) => e.id === 'double'));
    g.advanceTo(150_000);
    expect(g.host().event.kind).toBe('double');
    g.place('a', 4);
    g.dice(2, 3);
    g.right('a');
    expect(g.view('a').you.move).toMatchObject({ dice: [2, 3], steps: 5, double: true, hot: false });
    expect(g.view('a').you.last.text).toBe('Double dice: you rolled 2 + 3 = 5.');
  });

  it('Coin rush triples coin spaces; Gloomy night doubles puddles and lucky fairs', () => {
    const g = setup();
    g.pick(ROOM_EVENTS.find((e) => e.id === 'rush'));
    g.advanceTo(60_000);
    g.place('a', 0);
    g.dice(1);
    g.right('a');
    expect(g.view('a').you.coins).toBe(START_COINS + 9);
    g.pick(ROOM_EVENTS.find((e) => e.id === 'gloomy'));
    g.advanceTo(150_000);
    g.calm('a');
    g.place('a', 6);
    g.coins('a', 20);
    g.dice(1);
    g.right('a');
    expect(g.view('a').you.coins).toBe(14);
    g.place('b', 4);
    g.dice(1);
    g.right('b');
    expect(g.view('b').you.coins).toBe(START_COINS + 12);
  });

  it('Stall parade hops the stall 3 spaces forward every 10 seconds, stepping over ferries', () => {
    const g = setup();
    g.stall(25);
    g.pick(ROOM_EVENTS.find((e) => e.id === 'parade'));
    g.advanceTo(60_000);
    expect(g.stallAt()).toBe(28);
    g.advanceTo(70_000);
    expect(g.stallAt()).toBe(31);
    g.advanceTo(80_000);
    expect(g.stallAt()).toBe(2);
    g.advanceTo(90_000);
    expect(g.stallAt()).toBe(2);
    expect(g.host().stalls[0]).toMatchObject({ why: 'parade', n: 3 });
    const h = setup();
    h.stall(21);
    h.pick(ROOM_EVENTS.find((e) => e.id === 'parade'));
    h.advanceTo(60_000);
    expect(h.stallAt()).toBe(25);
  });

  it('a stall that moves away closes the choice of anyone stopped at it', () => {
    const g = setup();
    g.advanceTo(50_000);
    g.stall(25);
    g.place('a', 24);
    g.coins('a', 25);
    g.dice(2);
    g.right('a');
    expect(g.view('a').you.pending.kind).toBe('buy');
    g.pick(ROOM_EVENTS.find((e) => e.id === 'parade'));
    g.advanceTo(60_000);
    expect(g.stallAt()).toBe(28);
    expect(g.view('a').you.pending).toBeNull();
    expect(g.notes('a')).toContainEqual({ k: 'missed', i: 1, why: 'moved' });
    expect(g.view('a').you).toMatchObject({ pos: 26, coins: 28 });
  });
});

describe('Lantern Trail settings and variants', () => {
  it('places one stall, or two from 10 players, or what the host chose', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
    expect(setup({ players: ids(SECOND_STALL_AT - 1) }).host().stalls).toHaveLength(1);
    const two = setup({ players: ids(SECOND_STALL_AT) }).host().stalls;
    expect(two).toHaveLength(2);
    expect(Math.min(STEPS[two[0].pos]![two[1].pos]!, STEPS[two[1].pos]![two[0].pos]!)).toBeGreaterThanOrEqual(STALL_MOVE_MIN);
    expect(setup({ players: ids(12), settings: { stalls: '1' } }).host().stalls).toHaveLength(1);
    expect(setup({ players: ['a'], settings: { stalls: '2' } }).host().stalls).toHaveLength(2);
    for (let seed = 1; seed < 30; seed++) {
      const g = setup({ players: ['a'], seed });
      const pos = g.stallAt();
      expect(STEPS[GATE]![pos]).toBeGreaterThanOrEqual(STALL_MOVE_MIN);
      expect(['ferry', 'fork']).not.toContain(SPACES[pos]!.kind);
    }
  });

  it('Bumper Night pays double on coin spaces and lucky fairs, and lanterns cost 30', () => {
    const bumper = variants.find((v) => v.meta.id === 'lantern-trail-bumper-night')!;
    const g = setup({ settings: bumper.settings });
    expect(g.host().price).toBe(30);
    g.dice(1);
    g.right('a');
    expect(g.view('a').you.coins).toBe(START_COINS + 6);
    g.place('b', 4);
    g.dice(1);
    g.right('b');
    expect(g.view('b').you.coins).toBe(START_COINS + 12);
  });

  it('Kind Night turns puddles into lucky fairs, with no tricks and no Gloom puddle card or gloomy night', () => {
    const kind = variants.find((v) => v.meta.id === 'lantern-trail-kind-night')!;
    const g = setup({ settings: kind.settings });
    g.place('a', 6);
    g.dice(1);
    g.right('a');
    expect(g.view('a').you.coins).toBe(START_COINS + 6);
    expect(g.notes('a')).toEqual([{ k: 'space', i: 1, kind: 'fair', coins: 6 }]);
    expect(g.view('a').odds.map((o: { card: string }) => o.card)).toEqual(['wind', 'purse', 'shower', 'rumour', 'ticket']);
    const seen = new Set<string>();
    for (let t = 60_000; t < 375_000; t += 30_000) {
      g.advanceTo(t);
      if (g.host().event) seen.add(g.host().event.kind);
    }
    expect(seen.has('gloomy')).toBe(false);
  });

  it('Short Night is three minutes with 10-coin lanterns', () => {
    const short = variants.find((v) => v.meta.id === 'lantern-trail-short-night')!;
    const g = setup({ settings: short.settings, common: short.common });
    expect(g.host()).toMatchObject({ endsAt: 180_000, lastAt: 135_000, price: 10 });
  });
});

describe('Lantern Trail players coming and going', () => {
  it('a late joiner starts at the Town Gate with the starting purse and a question', () => {
    const g = setup();
    g.advanceTo(30_000);
    expect(g.rt.addPlayer({ id: 'late', name: 'Late', teamId: null, isBot: false }).ok).toBe(true);
    expect(g.view('late').you).toMatchObject({ pos: GATE, coins: START_COINS, lanterns: 0 });
    expect(g.view('late').you.question).not.toBeNull();
  });

  it('a player who leaves mid-choice keeps nobody waiting, drops out of the targets, and carries on if they return', () => {
    const g = setup({ players: ['a', 'b', 'c'] });
    g.place('a', 1);
    g.dice(5);
    g.right('a');
    expect(g.view('a').you.pending.kind).toBe('fork');
    g.rt.removePlayer('a');
    expect(g.walker('a').pending).toBeNull();
    expect(g.rt.nextTimerAt()).not.toBe(CHOICE_MS);
    g.calm('b');
    g.place('b', 1);
    g.dice(1);
    g.card('pickpocket');
    g.right('b');
    expect(g.view('b').you.pending.targets.map((x: { id: string }) => x.id)).toEqual(['c']);
    g.rt.addPlayer({ id: 'a', name: 'A', teamId: null, isBot: false });
    expect(g.view('a').you.pending.kind).toBe('fork');
    g.act('a', { type: 'fork', route: 'long' });
    expect(g.view('a').you.question).not.toBeNull();
    // Everyone who played is in the results, including anyone who left.
    g.rt.removePlayer('c');
    g.advanceTo(420_000);
    expect(g.rt.results!.standings.map((s) => s.playerId).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('Lantern Trail results and views', () => {
  it('ranks by Golden Lanterns, then coins, and sums up the winner', () => {
    const g = setup({ players: ['a', 'b', 'c'] });
    Object.assign(g.walker('a'), { lanterns: 1, coins: 40 });
    Object.assign(g.walker('b'), { lanterns: 2, coins: 1 });
    Object.assign(g.walker('c'), { lanterns: 1, coins: 41 });
    expect(g.view('c').you.rank).toBe(2);
    g.advanceTo(420_000);
    const r = g.rt.results!;
    expect(r.standings.map((s) => [s.playerId, s.rank, s.label])).toEqual([
      ['b', 1, '2 Golden Lanterns, 1 coin'],
      ['c', 2, '1 Golden Lantern, 41 coins'],
      ['a', 3, '1 Golden Lantern, 40 coins'],
    ]);
    expect(r.summary).toBe('B collected 2 Golden Lanterns.');
  });

  it('says so when players tie or nobody buys', () => {
    const tie = setup();
    Object.assign(tie.walker('a'), { lanterns: 3 });
    Object.assign(tie.walker('b'), { lanterns: 3 });
    tie.advanceTo(420_000);
    expect(tie.rt.results!.summary).toBe('A and B collected 3 Golden Lanterns each.');
    const none = setup();
    none.advanceTo(420_000);
    expect(none.rt.results!.summary).toBe('Nobody bought a Golden Lantern this time.');
  });

  it('ranks teams by average lanterns, with average coins to break a tie', () => {
    const g = setup({ players: ['a', 'b', 'c', 'd'], teams: 2 });
    Object.assign(g.walker('a'), { lanterns: 2, coins: 10 });
    Object.assign(g.walker('c'), { lanterns: 0, coins: 10 });
    Object.assign(g.walker('b'), { lanterns: 1, coins: 30 });
    Object.assign(g.walker('d'), { lanterns: 1, coins: 0 });
    g.advanceTo(420_000);
    const teams = g.rt.results!.teamStandings;
    expect(teams.map((t) => [t.teamId, t.rank, t.label])).toEqual([
      ['t2', 1, '1 Golden Lantern on average, 15 coins'],
      ['t1', 2, '1 Golden Lantern on average, 10 coins'],
    ]);
  });

  it('never shows an answer, and stays small with 40 players', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `player-${i}`);
    const g = setup({ players: ids });
    for (const id of ids.slice(0, 20)) {
      g.dice(6);
      g.right(id);
      const p = g.view(id).you.pending;
      if (p?.kind === 'fork') g.act(id, { type: 'fork', route: 'short' });
    }
    g.wrong('player-30');
    const host = g.host();
    const mine = g.view('player-3');
    expect(findAnswerLeaks(host, 'host')).toEqual([]);
    expect(findAnswerLeaks(mine, 'player')).toEqual([]);
    expect(JSON.stringify(host).length).toBeLessThan(8 * 1024);
    expect(JSON.stringify(mine).length).toBeLessThan(8 * 1024);
    expect(Object.keys(mine.walkers[0]).sort()).toEqual(['c', 'id', 'l', 'pos', 'rank', 'seq']);
  });
});

describe('Lantern Trail bots', () => {
  it('take the shortcut when a stall is on it or just past it, and the long way otherwise', () => {
    expect(shortcutPays([33])).toBe(true);
    expect(shortcutPays([16])).toBe(true);
    expect(shortcutPays([10])).toBe(false);
    expect(shortcutPays([25])).toBe(false);
    expect(shortcutPays([25, 34])).toBe(true);
  });

  it('buy whenever they can, pickpocket the richest and trade with whoever is nearest a stall', () => {
    const rng = createRng(1);
    const g = setup({ players: ['a', 'b', 'c'] });
    g.stall(10);
    g.place('a', 9);
    g.coins('a', 25);
    g.dice(2);
    g.right('a');
    expect(g.rt.botAction('a', 1, rng)).toEqual({ type: 'buy', buy: true });
    g.act('a', { type: 'buy', buy: false });
    g.coins('b', 50);
    g.coins('c', 5);
    g.place('c', 19);
    g.stall(21);
    g.calm('a');
    g.place('a', 1);
    g.dice(1);
    g.card('pickpocket');
    g.right('a');
    expect(g.rt.botAction('a', 1, rng)).toEqual({ type: 'target', playerId: 'b' });
    g.act('a', { type: 'target', playerId: 'b' });
    g.calm('a');
    g.place('a', 1);
    g.dice(1);
    g.card('trade');
    g.right('a');
    expect(g.rt.botAction('a', 1, rng)).toEqual({ type: 'target', playerId: 'c' });
  });

  it('play whole games: answering, rolling, buying and using their cards', () => {
    const r = simulateGame({ modeId: 'lantern-trail', mode: lanternTrail, questions: MIXED_SET, players: 4, seed: 8 });
    expect(r.errors).toEqual([]);
    expect(r.leaks).toEqual([]);
    const standings = r.results!.standings;
    expect(standings.every((s) => s.stats.answered > 0)).toBe(true);
    expect(standings.some((s) => s.score >= 100_000)).toBe(true);
  });
});
