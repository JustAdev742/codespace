import { afterEach, describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { HINT_COST, matchesAnswer, wordValue } from '../src/modes/word-scramble/index.ts';
import { solveWord, toTiles } from './chaos-scenarios/word-scramble.ts';

/* Exact behaviour of the word-scramble pack. Bots stay idle; tests move players onto words with tiles first. */

const sims: ChaosSim[] = [];
afterEach(() => {
  for (const sim of sims.splice(0)) expect(sim.errors).toEqual([]);
});

function game(settings: Record<string, unknown> = {}) {
  const sim = new ChaosSim({ modeId: 'word-scramble', questions: MIXED_SET, players: 4, seed: 5, settings });
  for (const id of sim.ids) sim.idle.add(id);
  sims.push(sim);
  return sim;
}

const player = (sim: ChaosSim, id: string) => sim.state().players[id];
const sc = (sim: ChaosSim, id: string) => player(sim, id).word.scramble;
const cast = (sim: ChaosSim, caster: string, cheat: string, target?: string) => sim.cast(caster, { cheatId: `word-scramble.${cheat}`, target: target ?? null });
/** The letters of a scramble in answer order. */
const spelt = (s: { tiles: { id: string; ch: string }[]; solution: string[] }) => s.solution.map((id) => s.tiles.find((t) => t.id === id)!.ch).join('');

function onTiles(sim: ChaosSim, ...ids: string[]) {
  for (const id of ids) expect(toTiles(sim, id)).toBeTruthy();
}

describe('word-scramble pack: tiles', () => {
  it('lantern hint shows a letter and pays back its cost, but never the last two letters', () => {
    const sim = game();
    onTiles(sim, 'p1');
    const before = sc(sim, 'p1');
    expect(cast(sim, 'p1', 'lantern-hint').ok).toBe(true);
    expect(sc(sim, 'p1').hints).toBe(before.hints + 1);
    expect(player(sim, 'p1').points).toBe(HINT_COST);
    // Use hints up to the last two letters, then the cheat refuses.
    const s = structuredClone(sim.state());
    s.players.p1.word.scramble.hints = s.players.p1.word.scramble.tiles.length - 2;
    (sim.rt as unknown as { state: unknown }).state = s;
    sim.run(31_000);
    expect(cast(sim, 'p1', 'lantern-hint')).toMatchObject({ ok: false });
  });

  it('lantern hint works with hints switched off', () => {
    const sim = game({ hints: false });
    onTiles(sim, 'p1');
    expect(cast(sim, 'p1', 'lantern-hint').ok).toBe(true);
    expect(sc(sim, 'p1').hints).toBe(1);
    expect(sc(sim, 'p1').maxHints).toBe(1);
  });

  it('tile spoiler forces two hints, lowering the word value by 20', () => {
    const sim = game();
    onTiles(sim, 'p2');
    const before = wordValue(sc(sim, 'p2'));
    expect(cast(sim, 'p1', 'tile-spoiler', 'p2').ok).toBe(true);
    expect(sc(sim, 'p2').hints).toBe(2);
    expect(wordValue(sc(sim, 'p2'))).toBe(Math.max(0, before - 2 * HINT_COST));
  });

  it('tile tornado jumbles the tiles into a new order that still spells the answer', () => {
    const sim = game();
    onTiles(sim, 'p2');
    const before = sc(sim, 'p2');
    expect(cast(sim, 'p1', 'tile-tornado', 'p2').ok).toBe(true);
    const after = sc(sim, 'p2');
    expect(after.tiles.map((t: { ch: string }) => t.ch).join('')).not.toBe(before.tiles.map((t: { ch: string }) => t.ch).join(''));
    expect(spelt(after)).toBe(spelt(before));
    expect(matchesAnswer(spelt(after), after.accepted)).toBe(true);
  });

  it('tile tornado keeps hinted letters hinted', () => {
    const sim = game();
    onTiles(sim, 'p2');
    sim.rt.act('p2', { type: 'hint', iid: player(sim, 'p2').word.iid });
    const hinted = (s: any) => s.solution.slice(0, s.hints).map((id: string) => s.tiles.find((t: { id: string }) => t.id === id).ch).join('');
    const before = hinted(sc(sim, 'p2'));
    expect(cast(sim, 'p1', 'tile-tornado', 'p2').ok).toBe(true);
    expect(hinted(sc(sim, 'p2'))).toBe(before);
  });

  it('mystery bag does one of its three stated things', () => {
    const sim = game();
    onTiles(sim, 'p1', 'p2', 'p3', 'p4');
    const before = JSON.stringify(sim.state().players);
    expect(cast(sim, 'p1', 'mystery-bag').ok).toBe(true);
    expect(JSON.stringify(sim.state().players)).not.toBe(before);
  });
});

describe('word-scramble pack: the pile', () => {
  it('back of the pile gives the next word and puts this one last', () => {
    const sim = game();
    const p = player(sim, 'p1');
    const qid = p.stream.deck.ids[p.stream.deck.pos - 1];
    expect(cast(sim, 'p1', 'back-of-pile').ok).toBe(true);
    const after = player(sim, 'p1');
    expect(after.word.iid).not.toBe(p.word.iid);
    expect(after.stream.deck.ids.at(-1)).toBe(qid);
    expect(after.done).toBe(p.done);
  });

  it('word thief takes the points of the last solved word, once', () => {
    const sim = game();
    solveWord(sim, 'p2');
    const won = player(sim, 'p2').stream.last.points;
    expect(won).toBeGreaterThan(0);
    expect(cast(sim, 'p1', 'word-thief', 'p2').ok).toBe(true);
    expect([player(sim, 'p1').points, player(sim, 'p2').points]).toEqual([won, 0]);
    expect(cast(sim, 'p3', 'word-thief', 'p2')).toMatchObject({ ok: false });
  });
});

describe('word-scramble pack: trying words', () => {
  it('sticky tiles block spelling and skipping for 8 seconds', () => {
    const sim = game();
    onTiles(sim, 'p2');
    expect(cast(sim, 'p1', 'sticky-tiles', 'p2').ok).toBe(true);
    expect(sim.rt.act('p2', { type: 'skip', iid: player(sim, 'p2').word.iid })).toMatchObject({ ok: false });
    sim.run(8100);
    expect(sim.rt.act('p2', { type: 'skip', iid: player(sim, 'p2').word.iid }).ok).toBe(true);
  });

  it('hint padlock refuses hints and nothing else', () => {
    const sim = game();
    onTiles(sim, 'p2');
    expect(cast(sim, 'p1', 'hint-padlock', 'p2').ok).toBe(true);
    const iid = player(sim, 'p2').word.iid;
    expect(sim.rt.act('p2', { type: 'hint', iid })).toMatchObject({ ok: false });
    expect(sim.rt.act('p2', { type: 'solve', iid, text: 'nope' }).ok).toBe(true);
  });

  it('second draft lets one wrong spelling be tried again in one-try games', () => {
    const sim = game({ oneTry: true });
    onTiles(sim, 'p1');
    expect(cast(sim, 'p1', 'second-draft').ok).toBe(true);
    const iid = player(sim, 'p1').word.iid;
    expect(sim.rt.act('p1', { type: 'solve', iid, text: 'qqqqq' })).toMatchObject({ ok: false });
    expect(player(sim, 'p1').word?.iid).toBe(iid);
    expect(sim.rt.act('p1', { type: 'solve', iid, text: 'qqqqq' }).ok).toBe(true);
    expect(player(sim, 'p1').word).toBeNull();
  });
});

describe('word-scramble pack: the word timer', () => {
  it('timer squeeze takes 5 seconds, never leaving under 4', () => {
    const sim = game({ wordTimer: true });
    const before = player(sim, 'p2').word.deadline;
    expect(cast(sim, 'p1', 'timer-squeeze', 'p2').ok).toBe(true);
    expect(before - player(sim, 'p2').word.deadline).toBe(5000);
    // With 6 seconds left, only 2 can go.
    sim.run(player(sim, 'p2').word.deadline - sim.now - 6000);
    expect(cast(sim, 'p3', 'timer-squeeze', 'p2').ok).toBe(true);
    expect(player(sim, 'p2').word.deadline - sim.now).toBe(4000);
    expect(cast(sim, 'p4', 'timer-squeeze', 'p2')).toMatchObject({ ok: false });
  });

  it('timer sand adds up to 8 seconds, never above the word\'s full time', () => {
    const sim = game({ wordTimer: true });
    expect(cast(sim, 'p1', 'timer-sand')).toMatchObject({ ok: false });
    sim.run(10_000);
    const before = player(sim, 'p1').word.deadline;
    expect(cast(sim, 'p1', 'timer-sand').ok).toBe(true);
    expect(player(sim, 'p1').word.deadline - before).toBe(8000);
  });

  it('timer cheats are only offered with the word timer on', () => {
    expect(cast(game(), 'p1', 'timer-sand')).toMatchObject({ ok: false });
  });
});

describe('word-scramble pack: spelling streak', () => {
  it('spelling surge sets the streak to 2, no longer than words solved', () => {
    const sim = game({ streak: true });
    expect(cast(sim, 'p1', 'spelling-surge')).toMatchObject({ ok: false });
    solveWord(sim, 'p1');
    solveWord(sim, 'p1');
    const s = structuredClone(sim.state());
    s.players.p1.inRow = 0;
    (sim.rt as unknown as { state: unknown }).state = s;
    expect(cast(sim, 'p1', 'spelling-surge').ok).toBe(true);
    expect(player(sim, 'p1').inRow).toBe(2);
  });

  it('spelling streak breaker resets an opponent streak', () => {
    const sim = game({ streak: true });
    solveWord(sim, 'p2');
    expect(player(sim, 'p2').inRow).toBe(1);
    expect(cast(sim, 'p1', 'streak-breaker', 'p2').ok).toBe(true);
    expect(player(sim, 'p2').inRow).toBe(0);
    expect(cast(sim, 'p3', 'streak-breaker', 'p2')).toMatchObject({ ok: false });
  });

  it('spelling streak keeper survives one missed word', () => {
    const sim = game({ streak: true });
    solveWord(sim, 'p1');
    expect(cast(sim, 'p1', 'streak-keeper').ok).toBe(true);
    sim.rt.act('p1', { type: 'next' });
    sim.rt.act('p1', { type: 'skip', iid: player(sim, 'p1').word.iid });
    sim.run(300);
    expect(player(sim, 'p1').inRow).toBe(1);
    expect(sim.chaos().effects).toHaveLength(0);
  });

  it('streak swap trades streaks, each no longer than the words its new owner has solved', () => {
    const sim = game({ streak: true });
    solveWord(sim, 'p1');
    solveWord(sim, 'p1');
    solveWord(sim, 'p2');
    expect([player(sim, 'p1').inRow, player(sim, 'p2').inRow]).toEqual([2, 1]);
    expect(cast(sim, 'p1', 'streak-swap', 'p2').ok).toBe(true);
    // p2 has solved one word, so the streak of 2 arrives as 1.
    expect([player(sim, 'p1').inRow, player(sim, 'p2').inRow]).toEqual([1, 1]);
    expect(cast(sim, 'p3', 'streak-swap', 'p4')).toMatchObject({ ok: false });
  });

  it('streak stall lets words score with the streak they had, but keeps it from growing', () => {
    const sim = game({ streak: true });
    solveWord(sim, 'p2');
    expect(player(sim, 'p2').inRow).toBe(1);
    expect(cast(sim, 'p1', 'streak-stall', 'p2').ok).toBe(true);
    // Move on to a word with tiles without breaking the streak: ordinary questions on the way are answered right.
    for (let i = 0; i < 12; i++) {
      const p = player(sim, 'p2');
      if (!p.word) sim.rt.act('p2', { type: 'next' });
      else if (!p.word.scramble) sim.rt.act('p2', sim.rt.botAction('p2', 1, createRng(1)));
      else break;
    }
    const iid = player(sim, 'p2').word.iid;
    const [value, points] = [wordValue(sc(sim, 'p2')), player(sim, 'p2').points];
    expect(sim.rt.act('p2', { type: 'solve', iid, text: spelt(sc(sim, 'p2')) }).ok).toBe(true);
    expect([player(sim, 'p2').points, player(sim, 'p2').inRow]).toEqual([points + 2 * value, 1]);
    sim.run(20_100);
    solveWord(sim, 'p2');
    expect(player(sim, 'p2').inRow).toBe(2);
  });
});

describe('word-scramble pack: swaps, boomerangs, taxes and wagers', () => {
  const qid = (sim: ChaosSim, iid: string) => (sim.rt as unknown as { instances: Map<string, { qid: string }> }).instances.get(iid)!.qid;
  const solveNow = (sim: ChaosSim, id: string) => sim.rt.act(id, { type: 'solve', iid: player(sim, id).word.iid, text: spelt(sc(sim, id)) });

  it('word swap trades the words on screen, hinted letters and all, and keeps every word once in each pile', () => {
    const sim = game();
    onTiles(sim, 'p1');
    const hinted = toTiles(sim, 'p2', true)!;
    sim.rt.act('p2', { type: 'hint', iid: hinted });
    const [a, b] = [player(sim, 'p1'), player(sim, 'p2')];
    const [qa, qb] = [qid(sim, a.word.iid), qid(sim, b.word.iid)];
    expect(cast(sim, 'p1', 'word-swap', 'p2').ok).toBe(true);
    const [a2, b2] = [player(sim, 'p1'), player(sim, 'p2')];
    expect([a2.word.iid, b2.word.iid, a2.stream.iid, b2.stream.iid]).toEqual([b.word.iid, a.word.iid, b.word.iid, a.word.iid]);
    expect([a2.word.scramble.hints, b2.word.scramble.hints]).toEqual([1, 0]);
    for (const [p, gave, got] of [
      [a2, qa, qb],
      [b2, qb, qa],
    ] as const) {
      const ids = p.stream.deck.ids as string[];
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids[p.stream.deck.pos - 1]).toBe(got);
      expect(ids.indexOf(gave)).toBeGreaterThanOrEqual(p.stream.deck.pos);
    }
    // The new owner can solve it.
    expect(solveNow(sim, 'p1').ok).toBe(true);
    expect(player(sim, 'p1').stream.last).toMatchObject({ iid: b.word.iid, correct: true });
  });

  it('word swap is refused for a word the caster has already had', () => {
    const sim = game();
    onTiles(sim, 'p1');
    expect(solveNow(sim, 'p1').ok).toBe(true);
    const done = player(sim, 'p1').stream.last.iid;
    sim.rt.act('p1', { type: 'next' });
    // Put p2 on the word p1 has just finished.
    const s = structuredClone(sim.state());
    const deck = s.players.p2.stream.deck;
    const at = deck.ids.indexOf(qid(sim, done));
    [deck.ids[at], deck.ids[deck.pos - 1]] = [deck.ids[deck.pos - 1], deck.ids[at]];
    s.players.p2.word.iid = done;
    s.players.p2.stream.iid = done;
    (sim.rt as unknown as { state: unknown }).state = s;
    expect(cast(sim, 'p1', 'word-swap', 'p2')).toMatchObject({ ok: false, message: expect.stringContaining('already had') });
  });

  it('word boomerang brings the last missed word back once', () => {
    const sim = game();
    const iid = player(sim, 'p1').word.iid;
    sim.rt.act('p1', { type: 'skip', iid });
    const before = player(sim, 'p1');
    expect(cast(sim, 'p1', 'word-boomerang').ok).toBe(true);
    expect([player(sim, 'p1').again, player(sim, 'p1').target]).toEqual([[qid(sim, iid)], before.target + 1]);
    sim.run(41_000);
    expect(cast(sim, 'p1', 'word-boomerang')).toMatchObject({ ok: false, message: expect.stringContaining('already coming back') });
  });

  it('word boomerang needs a missed word and a game without second chances', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'word-boomerang')).toMatchObject({ ok: false });
    solveWord(sim, 'p2');
    expect(cast(sim, 'p2', 'word-boomerang')).toMatchObject({ ok: false, message: expect.stringContaining('not a miss') });
    const other = game({ secondChance: true });
    other.rt.act('p1', { type: 'skip', iid: player(other, 'p1').word.iid });
    expect(cast(other, 'p1', 'word-boomerang')).toMatchObject({ ok: false, message: expect.stringContaining('Second chances are on') });
  });

  it('a boomeranged word comes back as a half-point second chance after the main words', () => {
    const sim = game();
    const iid = player(sim, 'p1').word.iid;
    sim.rt.act('p1', { type: 'skip', iid });
    expect(cast(sim, 'p1', 'word-boomerang').ok).toBe(true);
    for (let i = 0; i < 80 && player(sim, 'p1').done < player(sim, 'p1').main; i++) {
      const p = player(sim, 'p1');
      sim.rt.act('p1', p.word ? { type: 'skip', iid: p.word.iid } : { type: 'next' });
    }
    expect(player(sim, 'p1').finished).toBe(false);
    sim.rt.act('p1', { type: 'next' });
    const p = player(sim, 'p1');
    expect([p.retry, qid(sim, p.word.iid)]).toEqual([true, qid(sim, iid)]);
    // Skipping it again ends the run of words: it does not come back a third time.
    sim.rt.act('p1', { type: 'skip', iid: p.word.iid });
    expect(player(sim, 'p1').finished).toBe(true);
  });

  it('typo tax takes 10 points for each wrong spelling, until it ends', () => {
    const sim = game();
    solveWord(sim, 'p2');
    const points = player(sim, 'p2').points;
    expect(cast(sim, 'p1', 'typo-tax', 'p2').ok).toBe(true);
    const iid = toTiles(sim, 'p2')!;
    sim.rt.act('p2', { type: 'solve', iid, text: 'qqqqq' });
    sim.rt.act('p2', { type: 'solve', iid, text: 'zzzzz' });
    sim.run(300);
    expect(player(sim, 'p2').points).toBe(points - 2 * 10);
    sim.run(20_000);
    sim.rt.act('p2', { type: 'solve', iid, text: 'qqqqq' });
    sim.run(300);
    expect(player(sim, 'p2').points).toBe(points - 2 * 10);
  });

  it('typo tax is not offered with one try per word', () => {
    expect(cast(game({ oneTry: true }), 'p1', 'typo-tax', 'p2')).toMatchObject({ ok: false });
  });

  it('hint tax takes 10 more points for a hint asked for, but not for letters a cheat shows', () => {
    const sim = game();
    solveWord(sim, 'p2');
    const points = player(sim, 'p2').points;
    expect(cast(sim, 'p1', 'hint-tax', 'p2').ok).toBe(true);
    const iid = toTiles(sim, 'p2', true)!;
    const value = wordValue(sc(sim, 'p2'));
    sim.rt.act('p2', { type: 'hint', iid });
    sim.run(300);
    expect([player(sim, 'p2').points, wordValue(sc(sim, 'p2'))]).toEqual([points - HINT_COST, value - HINT_COST]);
    expect(cast(sim, 'p2', 'lantern-hint').ok).toBe(true);
    sim.run(300);
    // The lantern pays its letter back, and the tax does not charge for it.
    expect(player(sim, 'p2').points).toBe(points);
  });

  it('spelling wager doubles a solved word', () => {
    const sim = game();
    onTiles(sim, 'p1');
    const value = wordValue(sc(sim, 'p1'));
    expect(cast(sim, 'p1', 'spelling-wager').ok).toBe(true);
    expect(solveNow(sim, 'p1').ok).toBe(true);
    expect(player(sim, 'p1').points).toBe(2 * value);
    expect(sim.chaos().effects).toHaveLength(0);
  });

  it('spelling wager loses the stake on a skipped word, and is off if time runs out', () => {
    const sim = game();
    solveWord(sim, 'p1');
    const points = player(sim, 'p1').points;
    const iid = toTiles(sim, 'p1')!;
    const value = wordValue(sc(sim, 'p1'));
    expect(cast(sim, 'p1', 'spelling-wager').ok).toBe(true);
    sim.rt.act('p1', { type: 'skip', iid });
    sim.run(300);
    expect(player(sim, 'p1').points).toBe(Math.max(0, points - value));
    sim.run(40_000);
    const next = toTiles(sim, 'p1')!;
    expect(cast(sim, 'p1', 'spelling-wager').ok).toBe(true);
    const before = player(sim, 'p1').points;
    sim.run(45_100);
    expect(sim.chaos().effects).toHaveLength(0);
    expect([player(sim, 'p1').points, player(sim, 'p1').word.iid]).toEqual([before, next]);
  });

  it('word timer swap trades the time left, never leaving under 4 seconds', () => {
    const sim = game({ wordTimer: true });
    sim.run(12_000);
    // p2 moves on to a new word with its full 20 seconds; p1 has 8 left.
    sim.rt.act('p2', { type: 'skip', iid: player(sim, 'p2').word.iid });
    sim.rt.act('p2', { type: 'next' });
    expect(cast(sim, 'p1', 'timer-swap', 'p2').ok).toBe(true);
    expect([player(sim, 'p1').word.deadline - sim.now, player(sim, 'p2').word.deadline - sim.now]).toEqual([20_000, 8000]);
    sim.run(5000);
    expect(cast(sim, 'p2', 'timer-swap', 'p1').ok).toBe(true);
    expect([player(sim, 'p1').word.deadline - sim.now, player(sim, 'p2').word.deadline - sim.now]).toEqual([4000, 15_000]);
  });

  it('overtime bell adds up to 20 seconds, never above the time the game started with', () => {
    const sim = game();
    const left = () => sim.state().endsAt - sim.now;
    expect(cast(sim, 'p1', 'overtime-bell')).toMatchObject({ ok: false });
    sim.run(30_000);
    expect(cast(sim, 'p1', 'overtime-bell').ok).toBe(true);
    expect(left()).toBe(230_000);
    sim.run(5000);
    expect(cast(sim, 'p2', 'overtime-bell').ok).toBe(true);
    expect(left()).toBe(240_000);
    // The game ends when the moved clock runs out, not before.
    sim.run(239_000);
    expect(sim.rt.status).toBe('running');
    sim.run(2000);
    expect(sim.rt.status).not.toBe('running');
  });
});

describe('word-scramble pack: second chances and one-try curses', () => {
  const qidOf = (sim: ChaosSim, iid: string) => (sim.rt as unknown as { instances: Map<string, { qid: string }> }).instances.get(iid)!.qid;
  /** Skip the word on screen, or move on to the next one. */
  const step = (sim: ChaosSim, id: string) => {
    const p = player(sim, id);
    sim.rt.act(id, p.word ? { type: 'skip', iid: p.word.iid } : { type: 'next' });
  };

  it('second chance shredder throws out the second chance due back soonest, and that word never comes back', () => {
    const sim = game({ secondChance: true });
    const first = qidOf(sim, player(sim, 'p2').word.iid);
    step(sim, 'p2');
    step(sim, 'p2');
    const second = qidOf(sim, player(sim, 'p2').word.iid);
    step(sim, 'p2');
    const before = player(sim, 'p2');
    expect(before.again).toEqual([first, second]);
    expect(cast(sim, 'p1', 'second-chance-shredder', 'p2').ok).toBe(true);
    expect([player(sim, 'p2').again, player(sim, 'p2').target]).toEqual([[second], before.target - 1]);
    // Play out the main words: the first second chance shown is the one that was not shredded.
    for (let i = 0; i < 80 && player(sim, 'p2').done < player(sim, 'p2').main; i++) step(sim, 'p2');
    expect(player(sim, 'p2').again).not.toContain(first);
    sim.rt.act('p2', { type: 'next' });
    expect([player(sim, 'p2').retry, qidOf(sim, player(sim, 'p2').word.iid)]).toEqual([true, second]);
  });

  it('second chance shredder needs a second chance waiting and a game with second chances', () => {
    const sim = game({ secondChance: true });
    expect(cast(sim, 'p1', 'second-chance-shredder', 'p2')).toMatchObject({ ok: false, message: expect.stringContaining('no second chance waiting') });
    const plain = game();
    step(plain, 'p2');
    expect(cast(plain, 'p1', 'second-chance-shredder', 'p2')).toMatchObject({ ok: false, message: expect.stringContaining('does not work here') });
  });

  it('second chance shredder never takes the last word a player has left', () => {
    const sim = new ChaosSim({ modeId: 'word-scramble', questions: MIXED_SET, players: 5, seed: 5, settings: { secondChance: true }, common: { questionLimit: 4 } });
    for (const id of sim.ids) sim.idle.add(id);
    sims.push(sim);
    // p2 misses all four words: four second chances wait, and nothing is on screen.
    for (let i = 0; i < 12 && player(sim, 'p2').done < 4; i++) step(sim, 'p2');
    expect([player(sim, 'p2').done, player(sim, 'p2').again.length, player(sim, 'p2').word]).toEqual([4, 4, null]);
    for (const by of ['p1', 'p3', 'p4']) expect(cast(sim, by, 'second-chance-shredder', 'p2').ok).toBe(true);
    expect([player(sim, 'p2').again.length, player(sim, 'p2').target]).toEqual([1, 5]);
    expect(cast(sim, 'p5', 'second-chance-shredder', 'p2')).toMatchObject({ ok: false, message: expect.stringContaining('last word') });
    // The one left still comes back; missing it again finishes p2.
    sim.rt.act('p2', { type: 'next' });
    expect(player(sim, 'p2').retry).toBe(true);
    step(sim, 'p2');
    expect(player(sim, 'p2').finished).toBe(true);
  });

  it('first spell curse refuses another go at a word spelt wrong, but not hints, until it lifts', () => {
    const sim = game();
    const iid = toTiles(sim, 'p2', true)!;
    expect(cast(sim, 'p1', 'first-spell-curse', 'p2').ok).toBe(true);
    // A word not yet spelt wrong gets its try.
    expect(sim.rt.act('p2', { type: 'solve', iid, text: 'qqqqq' }).ok).toBe(true);
    expect(sim.rt.act('p2', { type: 'solve', iid, text: spelt(sc(sim, 'p2')) })).toMatchObject({ ok: false, message: expect.stringContaining('First Spell Curse') });
    expect([sc(sim, 'p2').tries, player(sim, 'p2').word.iid]).toEqual([1, iid]);
    expect(sim.rt.act('p2', { type: 'hint', iid }).ok).toBe(true);
    sim.run(20_100);
    expect(sim.rt.act('p2', { type: 'solve', iid, text: spelt(sc(sim, 'p2')) }).ok).toBe(true);
    expect(player(sim, 'p2').stream.last).toMatchObject({ iid, correct: true });
  });

  it('first spell curse still lets the word be skipped, and is not offered with one try per word', () => {
    const sim = game();
    const iid = toTiles(sim, 'p3')!;
    expect(cast(sim, 'p1', 'first-spell-curse', 'p3').ok).toBe(true);
    sim.rt.act('p3', { type: 'solve', iid, text: 'qqqqq' });
    expect(sim.rt.act('p3', { type: 'skip', iid }).ok).toBe(true);
    expect(player(sim, 'p3').stream.last).toMatchObject({ iid, correct: false });
    expect(cast(game({ oneTry: true }), 'p1', 'first-spell-curse', 'p2')).toMatchObject({ ok: false });
  });
});

