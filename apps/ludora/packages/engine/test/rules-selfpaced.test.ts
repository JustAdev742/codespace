import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { cometDash, placeWormholes } from '../src/modes/comet-dash/index.ts';
import { variants as cometVariants } from '../src/modes/comet-dash/meta.ts';
import { skyLanterns, strongerWind } from '../src/modes/sky-lanterns/index.ts';
import { variants as skyVariants } from '../src/modes/sky-lanterns/meta.ts';
import { gloomGiant } from '../src/modes/gloom-giant/index.ts';
import { variants as gloomVariants } from '../src/modes/gloom-giant/meta.ts';
import { trailingSide, tugOfWar } from '../src/modes/tug-of-war/index.ts';
import { variants as tugVariants } from '../src/modes/tug-of-war/meta.ts';
import { findAnswerLeaks } from '../src/testing/harness.ts';
import { drive, TRUE_SET, type Driven } from './rule-helpers.ts';

/*
 * Rule options of the self-paced modes: Comet Dash, Sky Lanterns, Gloom
 * Giant and Tug of War. Every question is a true statement, so `right`
 * answers true and `wrong` answers false.
 */

const pick = <T extends { meta: { id: string } }>(list: readonly T[], id: string) => list.find((v) => v.meta.id === id)!;
const texts = (h: Driven) => h.feed.map((f) => f.text);
const run = (h: Driven, id: string, answers: ('right' | 'wrong')[]) => answers.map((a) => (expect(h.answer(id, a).ok).toBe(true), h.view(id).you));

/* ------------------------------- Comet Dash ------------------------------ */

describe('Comet Dash rule options', () => {
  // No boosts or slipstream unless a test asks, so each rule moves racers on its own.
  const PLAIN = { boostEvery: 10, slipstream: false };
  const race = (settings: Record<string, unknown>, players = ['a']) => drive(cometDash, { players, questions: TRUE_SET, settings: { ...PLAIN, ...settings } });

  it('Shooting Star: a correct answer moves as far as the streak, up to three', () => {
    const h = race(pick(cometVariants, 'comet-dash-shooting-star').settings!);
    const pos = run(h, 'a', ['right', 'right', 'right', 'right', 'wrong', 'right']).map((y) => y.pos);
    expect(pos).toEqual([1, 3, 6, 9, 9, 10]);
    expect(h.view('a').you.lastMove).toEqual({ gain: 1, notes: [] });
    h.answer('a', 'right');
    expect(h.view('a').you.last.text).toBe('+2 spaces (Momentum)');
  });

  it('Star Gates: a wrong answer falls back to the last gate passed, or the start', () => {
    const h = race(pick(cometVariants, 'comet-dash-star-gates').settings!);
    run(h, 'a', ['right', 'right', 'right']);
    h.answer('a', 'wrong');
    expect(h.view('a').you).toMatchObject({ pos: 0, last: { text: 'Back to the start' } });
    run(h, 'a', Array(7).fill('right'));
    h.answer('a', 'wrong');
    expect(h.view('a').you).toMatchObject({ pos: 5, last: { text: 'Back to the star gate at space 5' } });
    // Standing on a gate is safe.
    h.answer('a', 'wrong');
    expect(h.view('a').you).toMatchObject({ pos: 5, last: { text: 'No move' } });
  });

  it('Tailwind: racers in the back half of the field move an extra space', () => {
    const h = race(pick(cometVariants, 'comet-dash-tailwind').settings!, ['a', 'b', 'c', 'd']);
    // Everyone level: nobody is behind yet.
    h.answer('a', 'right');
    expect(h.view('a').you.pos).toBe(1);
    h.answer('a', 'right');
    h.answer('b', 'right');
    // a and b are ahead of c, so c is in the back half of four.
    h.answer('c', 'right');
    expect(h.view('c').you).toMatchObject({ pos: 2, last: { text: '+2 spaces (Tailwind)' } });
    h.answer('a', 'right');
    expect(h.view('a').you).toMatchObject({ pos: 3, last: { text: '+1 space' } });
  });

  it('Wormhole Trail: hidden wormholes throw a racer three spaces ahead', () => {
    const holes = placeWormholes(20, createRng(3));
    expect(holes).toHaveLength(2);
    expect(holes.every((x) => x >= 2 && x <= 16)).toBe(true);
    expect(placeWormholes(20, createRng(3))).toEqual(holes);

    const h = race(pick(cometVariants, 'comet-dash-wormholes').settings!, ['a', 'b']);
    const first = (h.state().wormholes as number[])[0]!;
    run(h, 'a', Array(first - 1).fill('right'));
    expect(h.view('a').you.pos).toBe(first - 1);
    h.answer('a', 'right');
    expect(h.view('a').you).toMatchObject({ pos: first + 3, last: { text: '+4 spaces (Wormhole)' } });
    expect(h.feed.map((f) => f.text)).toContain(`A found a wormhole at space ${first}.`);
    // Where they are is never sent to anyone.
    expect(JSON.stringify([h.view('b'), h.host()])).not.toContain('wormhole');
  });

  it('Constellation Run: everyone must finish, finishers tow the rest, and the room wins together', () => {
    const v = pick(cometVariants, 'comet-dash-constellation');
    const h = race({ ...v.settings, distance: 8 }, ['a', 'b']);
    expect(h.host().finishersNeeded).toBe(2);
    run(h, 'a', Array(8).fill('right'));
    expect(h.view('a').you.place).toBe(1);
    expect(h.rt.status).toBe('running');
    h.answer('b', 'right');
    expect(h.view('b').you.last.text).toBe('+2 spaces (Towed)');
    run(h, 'b', ['right', 'right', 'right']);
    expect(h.rt.status).toBe('ended');
    expect(h.rt.results).toMatchObject({ outcome: 'coop-win', summary: 'Every racer crossed the line. The room wins together.' });

    const late = race({ ...v.settings, distance: 8 }, ['a', 'b']);
    run(late, 'a', Array(8).fill('right'));
    late.tick(300_000);
    expect(late.rt.results).toMatchObject({ outcome: 'coop-loss', summary: 'Time is up with 1 of 2 racers home.' });
  });
});

/* ------------------------------ Sky Lanterns ----------------------------- */

describe('Sky Lanterns rule options', () => {
  const sky = (settings: Record<string, unknown>, common: Record<string, number> = {}) => drive(skyLanterns, { players: ['a'], questions: TRUE_SET, settings, common });
  const nextWind = (h: Driven) => h.tick(h.view('a').wind.changeAt - h.rt.gameNow());

  it('Gathering Winds: the wind grows one step at every change until a storm resets it', () => {
    expect(['calm', 'breezy', 'gusty', 'gale'].map((k) => strongerWind(k as 'calm', false))).toEqual(['breezy', 'gusty', 'gusty', 'gale']);
    expect(strongerWind('gusty', true)).toBe('gale');
    const calm = sky({ ...pick(skyVariants, 'sky-lanterns-gathering-winds').settings, storms: false }, { timeLimitSec: 600 });
    const kinds = [calm.view('a').wind.kind];
    for (let i = 0; i < 4; i++) {
      nextWind(calm);
      kinds.push(calm.view('a').wind.kind);
    }
    expect(kinds).toEqual(['calm', 'breezy', 'gusty', 'gusty', 'gusty']);

    const stormy = sky({ windPattern: 'rising', stormChance: 50, stormRise: 25 }, { timeLimitSec: 3600 });
    let sawReset = false;
    for (let i = 0; i < 60 && !sawReset; i++) {
      const before = stormy.view('a').wind.kind;
      nextWind(stormy);
      const w = stormy.view('a').wind;
      if (w.storm) {
        expect(w.kind).toBe('calm');
        nextWind(stormy);
        // After a storm the climb starts again from calm.
        expect(['breezy', 'calm']).toContain(stormy.view('a').wind.kind);
        sawReset = true;
      } else expect(w.kind).toBe(strongerWind(before, false));
    }
    expect(sawReset).toBe(true);
  });

  it('Festival Finale: the last wind is always a gale with no storm, and the forecast says so', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const h = drive(skyLanterns, { players: ['a'], questions: TRUE_SET, seed, settings: { ...pick(skyVariants, 'sky-lanterns-festival-finale').settings, stormChance: 50, stormRise: 25 }, common: { timeLimitSec: 100 } });
      // Changes at 25, 50 and 75 seconds; the one at 75 brings the last wind.
      nextWind(h);
      nextWind(h);
      expect(h.view('a').wind.changeAt).not.toBeNull();
      expect(h.view('a').forecast.chance).toBe(0);
      nextWind(h);
      expect(h.view('a').wind).toMatchObject({ kind: 'gale', mult: 4, storm: null, changeAt: null });
      expect(h.feed.map((f) => f.text)).toContain('Festival finale! The last wind is a gale: every lantern launched now scores ×4.');
    }
  });

  it('Lightning Rods: a storm only blows out stacks bigger than the safe size', () => {
    const v = pick(skyVariants, 'sky-lanterns-lightning-rods');
    const h = drive(skyLanterns, { players: ['a', 'b'], questions: TRUE_SET, settings: { ...v.settings, stormChance: 50, stormRise: 25 }, common: { timeLimitSec: 1800 } });
    const lightUp = (id: string, lanterns: number) => {
      for (let guard = 0; h.view(id).you.ground < lanterns && guard < 30; guard++) {
        if (h.view(id).you.oil >= 3) expect(h.rt.act(id, { type: 'light' }).ok).toBe(true);
        else h.answer(id, 'right');
      }
    };
    lightUp('a', 2);
    lightUp('b', 3);
    expect([h.view('a').you.ground, h.view('b').you.ground]).toEqual([2, 3]);
    let stormed = false;
    for (let i = 0; i < 40 && !stormed; i++) {
      nextWind(h);
      stormed = Boolean(h.view('a').wind.storm);
    }
    expect(stormed).toBe(true);
    expect(h.view('a').you).toMatchObject({ ground: 2, lost: 0 });
    expect(h.view('b').you).toMatchObject({ ground: 0, lost: 3, lastLoss: { count: 3 } });
    expect(texts(h)).toContain('A storm blew out 3 lanterns! 2 lanterns in small stacks came through safely.');
  });

  it('Leaky Can: a wrong answer spills 1 oil, but an empty can has nothing to spill', () => {
    const h = sky(pick(skyVariants, 'sky-lanterns-leaky-can').settings!);
    h.answer('a', 'wrong');
    expect(h.view('a').you).toMatchObject({ oil: 0, last: { text: 'No oil' } });
    run(h, 'a', ['right', 'right']);
    h.answer('a', 'wrong');
    expect(h.view('a').you).toMatchObject({ oil: 1, last: { text: 'Spilt 1 oil' } });
  });
});

/* ------------------------------- Gloom Giant ----------------------------- */

describe('Gloom Giant rule options', () => {
  it('Healing Gloom: every 15 seconds the giant heals 1 for every player, never past full', () => {
    const h = drive(gloomGiant, { players: ['a', 'b'], questions: TRUE_SET, settings: pick(gloomVariants, 'gloom-giant-healing').settings });
    expect(h.host().hp).toBe(24);
    h.tick(15_000);
    expect(h.host().hp).toBe(24);
    expect(h.feed).toEqual([]);
    for (let i = 0; i < 4; i++) h.answer(i % 2 ? 'b' : 'a', 'right');
    const hurt = h.host().hp;
    expect(hurt).toBeLessThanOrEqual(20);
    h.tick(15_000);
    expect(h.host().hp).toBe(hurt + 2);
    expect(h.feed.map((f) => f.text)).toContain('The Gloom Giant heals 2.');
  });

  it('Glim Menders: every fifth correct answer in a row mends the shield, up to its start', () => {
    const h = drive(gloomGiant, { players: ['a'], questions: TRUE_SET, settings: { ...pick(gloomVariants, 'gloom-giant-menders').settings, hpPerPlayer: 40, shieldBase: 10, shieldPerPlayer: 'half' } });
    expect(h.host().shield).toBe(11);
    h.answer('a', 'wrong');
    expect(h.host().shield).toBe(10);
    run(h, 'a', ['right', 'right', 'right', 'right']);
    expect(h.host().shield).toBe(10);
    h.answer('a', 'right');
    expect(h.host().shield).toBe(11);
    expect(h.view('a').you.last.text).toMatch(/shield mended/);
    expect(h.feed.map((f) => f.text)).toContain('A mended the shield.');
    // Full again: five more in a row mend nothing.
    run(h, 'a', Array(5).fill('right'));
    expect(h.host().shield).toBe(11);
  });

  it('Swift Strikes: answers within 6 seconds are critical hits, slower ones never are', () => {
    const h = drive(gloomGiant, { players: ['a'], questions: TRUE_SET, settings: { ...pick(gloomVariants, 'gloom-giant-swift').settings, hpPerPlayer: 40 } });
    h.wait(5_000);
    h.answer('a', 'right');
    expect(h.view('a').you).toMatchObject({ crits: 1, damage: 2 });
    expect(h.host().recent[0]).toMatchObject({ kind: 'crit', amount: 2 });
    for (let i = 0; i < 12; i++) {
      h.wait(6_500);
      h.answer('a', i % 3 === 2 ? 'wrong' : 'right');
    }
    expect(h.view('a').you.crits).toBe(1);
  });
});

/* ------------------------------- Tug of War ------------------------------ */

describe('Tug of War rule options', () => {
  const tug = (settings: Record<string, unknown>, common: Record<string, number> = {}) =>
    drive(tugOfWar, { players: [{ id: 'a', team: 1 }, { id: 'b', team: 2 }], teams: 2, questions: TRUE_SET, settings, common });

  it('Heave Ho: every third correct answer in a row pulls double', () => {
    const h = tug(pick(tugVariants, 'tug-of-war-heave-ho').settings!);
    run(h, 'a', ['right', 'right']);
    expect(h.host().pos).toBe(-2);
    h.answer('a', 'right');
    expect(h.host().pos).toBe(-4);
    expect(h.view('a').you.last.text).toBe('Pulled 2 spaces (heave)');
    h.answer('a', 'wrong');
    run(h, 'a', ['right', 'right']);
    expect(h.host().pos).toBe(-6);
  });

  it('Underdog Rope: the side the knot leans away from pulls half as hard again', () => {
    expect([trailingSide(-1), trailingSide(2), trailingSide(0)]).toEqual(['right', 'left', null]);
    const h = tug(pick(tugVariants, 'tug-of-war-underdog').settings!);
    expect(h.view('b').you.strength).toBe(1);
    h.answer('a', 'right');
    expect(h.host().pos).toBe(-1);
    expect(h.view('b').you.strength).toBe(1.5);
    expect(h.view('a').you.strength).toBe(1);
    expect(h.host().sides.right.strength).toBe(1.5);
    h.answer('b', 'right');
    expect(h.host().pos).toBe(0.5);
    expect(h.view('b').you.last.text).toBe('Pulled 1.5 spaces (underdog grip)');
    // Now the left side is behind.
    h.answer('a', 'right');
    expect(h.host().pos).toBe(-1);
  });

  it('Final Surge: every pull counts double in the last 30 seconds', () => {
    const h = tug(pick(tugVariants, 'tug-of-war-final-surge').settings!, { timeLimitSec: 60 });
    h.tick(29_000);
    h.answer('a', 'right');
    expect(h.host().pos).toBe(-1);
    expect(h.feed).toEqual([]);
    h.tick(1_000);
    expect(h.feed.map((f) => f.text)).toContain('Final surge! Every pull now counts double.');
    expect(h.view('b').you.strength).toBe(2);
    h.answer('b', 'right');
    expect(h.host().pos).toBe(1);
    expect(h.view('b').you.last.text).toBe('Pulled 2 spaces (final surge)');
    expect([...findAnswerLeaks(h.host()), ...findAnswerLeaks(h.view('a'))]).toEqual([]);
  });
});
