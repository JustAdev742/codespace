import { describe, expect, it } from 'vitest';
import { DEADLINE_GRACE_MS } from '../src/mechanics/syncRounds.ts';
import { classic } from '../src/modes/classic/index.ts';
import { drive } from './rule-helpers.ts';

/*
 * Extra time: the host gives chosen players a quarter, half or double the time on timed
 * questions. Their question stays open that much longer for them alone; the big screen and
 * every other player keep the shared clock, and speed points stay fair.
 */

const FLAT = { speedBonus: false, streakBonus: false, leaderboard: false };
/** Classic's question time (20 s by default). */
const LIMIT = 20_000;

function start(extra: Record<string, number>, players = ['a', 'b', 'c']) {
  const h = drive(classic, { players, settings: FLAT });
  for (const [id, share] of Object.entries(extra)) h.rt.setExtraTime(id, share);
  h.tick(4000); // intro: the first question opens with the extra time fixed
  expect(h.view('a').sync.phase).toBe('question');
  return h;
}

describe('extra time in host-paced rounds', () => {
  it('keeps the question open for the player with extra time, and only for them', () => {
    const h = start({ c: 0.5 });
    const shared = h.host().sync.question.deadline;
    // Each player is shown their own clock; the big screen and the others see the shared one.
    expect(h.view('a').sync.question.deadline).toBe(shared);
    expect(h.view('c').sync.question.deadline).toBe(shared + LIMIT / 2);
    h.answer('a', 'right');
    // The shared time runs out: b is too late, the round waits for c.
    h.tick(LIMIT + DEADLINE_GRACE_MS + 100);
    expect(h.view('a').sync.phase).toBe('question');
    expect(h.answer('b', 'right').ok).toBe(false);
    expect(h.answer('c', 'right').ok).toBe(true);
    // c was the last one who could still answer: the reveal comes at once.
    expect(h.view('a').sync.phase).toBe('reveal');
    expect(h.view('c').score).toBe(1000);
    expect(h.errors).toEqual([]);
  });

  it('closes at the end of the extra time when the player says nothing', () => {
    const h = start({ c: 1 });
    h.answer('a', 'right');
    h.answer('b', 'right');
    h.tick(LIMIT + DEADLINE_GRACE_MS + 10);
    expect(h.view('a').sync.phase).toBe('question');
    h.tick(LIMIT);
    expect(h.view('a').sync.phase).toBe('reveal');
  });

  it('changes nothing when nobody has extra time', () => {
    const h = start({});
    h.answer('a', 'right');
    h.tick(LIMIT + DEADLINE_GRACE_MS + 10);
    expect(h.view('a').sync.phase).toBe('reveal');
  });

  it('measures speed against the player’s own longer time', () => {
    const fast = drive(classic, { players: ['a', 'c'], settings: { speedBonus: true, streakBonus: false, leaderboard: false } });
    fast.rt.setExtraTime('c', 1);
    fast.tick(4000);
    // Half of each player's own time: a at 10 s of 20, c at 20 s of 40. They score the same.
    fast.wait(LIMIT / 2);
    fast.answer('a', 'right');
    fast.wait(LIMIT / 2);
    fast.answer('c', 'right');
    expect(fast.view('a').score).toBe(fast.view('c').score);
  });

  it('moves on with time the host adds for everyone', () => {
    const h = start({ c: 0.25 });
    const shared = h.host().sync.question.deadline;
    expect(h.rt.addTime(10_000).ok).toBe(true);
    expect(h.host().sync.question.deadline).toBe(shared + 10_000);
    expect(h.view('c').sync.question.deadline).toBe(shared + 10_000 + LIMIT / 4);
  });

  it('applies from the next question when given mid-question', () => {
    const h = start({});
    h.rt.setExtraTime('b', 1);
    const shared = h.host().sync.question.deadline;
    expect(h.view('b').sync.question.deadline).toBe(shared);
    h.answer('a', 'right');
    h.answer('b', 'right');
    h.answer('c', 'right');
    h.tick(5000); // the reveal, then the next question
    const next = h.host().sync.question.deadline;
    expect(h.view('b').sync.question.deadline).toBe(next + LIMIT);
  });

});

describe('extra time on a clock of the player’s own', () => {
  it('Time Attack: their own game clock runs longer by their share, nobody else’s', async () => {
    const { timeAttack } = await import('../src/modes/time-attack/index.ts');
    const h = drive(timeAttack, { players: ['a', { id: 'b', extra: 0.5 }] });
    const runs = h.state().runs;
    const a = runs.a.endsAt - runs.a.startedAt;
    const b = runs.b.endsAt - runs.b.startedAt;
    expect(a).toBeGreaterThan(0);
    expect(b).toBe(Math.round(a * 1.5));
    expect(h.errors).toEqual([]);
  });
  it('Survival Run: their own question timer is longer', async () => {
    const { survivalRun } = await import('../src/modes/survival-run/index.ts');
    const h = drive(survivalRun, { players: ['a', { id: 'b', extra: 1 }] });
    const r = h.state().runners;
    const start = h.rt.gameNow();
    expect(r.b.deadline - start).toBe(2 * (r.a.deadline - start));
  });
  it('Word Scramble with word timers: their own word timer is longer', async () => {
    const { wordScramble } = await import('../src/modes/word-scramble/index.ts');
    const h = drive(wordScramble, { players: ['a', { id: 'b', extra: 0.25 }], settings: { wordTimer: true } });
    const p = h.state().players;
    const start = h.rt.gameNow();
    expect(p.b.word.deadline - start).toBe(Math.round((p.a.word.deadline - start) * 1.25));
  });
  it('says where it applies, and where one shared clock means it does not', async () => {
    const { extraTimeFor } = await import('../src/catalog.ts');
    expect(extraTimeFor('classic').kind).toBe('rounds');
    expect(extraTimeFor('time-attack')).toEqual({ kind: 'own', what: 'their own game clock' });
    expect(extraTimeFor('word-scramble', null, { wordTimer: false }).kind).toBe('none');
    expect(extraTimeFor('word-scramble', null, { wordTimer: true }).kind).toBe('own');
    expect(extraTimeFor('gold-rush').kind).toBe('none');
    expect(extraTimeFor('tower-together').kind).toBe('none');
  });
});
