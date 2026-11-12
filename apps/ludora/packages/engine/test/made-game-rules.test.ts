import { describe, expect, it } from 'vitest';
import { fromCode } from '@ludora/shared';
import { blueprintMode } from '../src/modes/made-game/index.ts';
import { drive } from './rule-helpers.ts';

/*
 * Game Maker rules played move by move. Each game is written in game code, read by fromCode and
 * run by the made-game interpreter, so these test the language and the interpreter together.
 */

const BASE = (kind = 'race to 60 steps', right = 'right answer: move 1 step') =>
  `game "Rule test"\n${kind}\nquestions: own pace, 50 each, 20 seconds each\n${right}\nwrong answer: nothing\nstops after 10 minutes\n`;

function play(code: string, players = ['a', 'b']) {
  const r = fromCode(code);
  if (!r.ok) throw new Error(r.problems.map((p) => p.message).join(' / '));
  const d = drive(blueprintMode(r.blueprint), { players });
  return d;
}
const score = (d: ReturnType<typeof drive>, id: string) => d.view(id).you.score as number;
const vars = (d: ReturnType<typeof drive>, id: string) => Object.fromEntries((d.view(id).you.vars ?? []).map((v: { name: string; value: number }) => [v.name, v.value]));

describe('made-game rules, written in game code', () => {
  it('“gets 3 right in a row” works on the third, and again on the sixth', () => {
    const d = play(`${BASE()}when a player gets 3 right in a row: gain 5 steps\n`);
    for (let i = 0; i < 3; i++) d.answer('a', 'right');
    expect(score(d, 'a')).toBe(8);
    for (let i = 0; i < 3; i++) d.answer('a', 'right');
    expect(score(d, 'a')).toBe(16);
    expect(score(d, 'b')).toBe(0);
    expect(d.errors).toEqual([]);
  });

  it('keeps numbers per player, says a fixed message and resets a number', () => {
    const d = play(`${BASE()}each player has 0 coins, up to 9\nwhen a player answers right: add 2 coins\nwhen a player reaches 4 coins: say "Nice one!" and set coins to 1\n`);
    d.answer('a', 'right');
    expect(vars(d, 'a')).toEqual({ coins: 2 });
    d.answer('a', 'right');
    expect(vars(d, 'a')).toEqual({ coins: 1 });
    expect(d.feedTo('a')).toContain('Nice one!');
    expect(d.feedTo('b')).not.toContain('Nice one!');
    expect(vars(d, 'b')).toEqual({ coins: 0 });
    // A number never goes past its top.
    for (let i = 0; i < 6; i++) d.answer('b', 'right');
    expect(vars(d, 'b').coins).toBeLessThanOrEqual(9);
  });

  it('a condition decides whether a rule works', () => {
    const d = play(`${BASE()}when a player answers wrong, if score is at least 2: lose 2 steps\n`);
    d.answer('a', 'wrong');
    expect(score(d, 'a')).toBe(0);
    d.answer('a', 'right');
    d.answer('a', 'right');
    d.answer('a', 'right');
    d.answer('a', 'wrong');
    expect(score(d, 'a')).toBe(1);
  });

  it('“in last place” helps the player behind', () => {
    const d = play(`${BASE()}when a player answers right, if in last place: gain 2 steps\n`);
    d.answer('a', 'right'); // a was level, not last: +1
    expect(score(d, 'a')).toBe(1);
    d.answer('b', 'right'); // b was last: +1 and +2
    expect(score(d, 'b')).toBe(3);
  });

  it('a rule can win the game, and the results say so', () => {
    const d = play(`${BASE()}each player has 0 keys\nwhen a player answers right: add 1 keys\nwhen a player reaches 3 keys: win\n`);
    for (let i = 0; i < 3; i++) d.answer('b', 'right');
    expect(d.rt.status).toBe('ended');
    const top = d.rt.results!.standings[0]!;
    expect(top.playerId).toBe('b');
    expect(top.label).toMatch(/^Won/);
  });

  it('a rule for the room: everyone starts with a head start, and double points near the end', () => {
    const d = play(`${BASE()}when the game starts: everyone gains 2\nwhen 9 minutes are left: double points and say "Bonus time!"\n`);
    expect(score(d, 'a')).toBe(2);
    expect(score(d, 'b')).toBe(2);
    d.answer('a', 'right');
    expect(score(d, 'a')).toBe(3);
    d.tick(61_000);
    expect(d.feed.map((f) => f.text)).toContain('Bonus time!');
    d.answer('a', 'right');
    expect(score(d, 'a')).toBe(5);
    expect(d.host().doubled).toBe(true);
  });

  it('a rule works at most 30 times for each player', () => {
    const d = play(`${BASE('3 lives', 'right answer: score 1 point')}when a player answers right: gain 1\n`, ['a']);
    for (let i = 0; i < 45; i++) d.answer('a', 'right');
    expect(score(d, 'a')).toBe(45 + 30);
  });

  it('lives: a rule takes a life and a player can run out', () => {
    const d = play(`${BASE('2 lives', 'right answer: score 1 point')}each player has 2 energy\nwhen a player answers right: take 1 energy\nwhen a player runs out of energy: lose a life\n`, ['a', 'b', 'c']);
    d.answer('a', 'right');
    expect(d.view('a').you.lives).toBe(2);
    d.answer('a', 'right');
    expect(d.view('a').you.lives).toBe(1);
    expect(d.errors).toEqual([]);
  });

  it('acts on others: the leader loses, everyone behind gains', () => {
    const d = play(`${BASE()}when a player answers wrong: the leader loses 1 and everyone behind gains 1\n`, ['a', 'b', 'c']);
    d.answer('a', 'right');
    d.answer('a', 'right');
    d.answer('b', 'right');
    d.answer('c', 'wrong');
    expect(score(d, 'a')).toBe(1); // the leader lost 1
    expect(score(d, 'c')).toBe(0); // nobody is behind c
    expect(d.errors).toEqual([]);
  });

  it('a power-up from a rule, then “when a player uses a power-up”', () => {
    const d = play(`${BASE()}when a player answers right: get a leap power-up\nwhen a player uses a power-up: say "Power up!"\n`);
    d.answer('a', 'right');
    expect(d.view('a').you.power).toBe('leap');
    d.rt.act('a', { type: 'power' });
    expect(score(d, 'a')).toBe(3);
    expect(d.feedTo('a')).toContain('Power up!');
  });
});
