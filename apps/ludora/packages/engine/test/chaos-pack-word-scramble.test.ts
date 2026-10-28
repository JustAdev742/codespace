import { afterEach, describe, expect, it } from 'vitest';
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
});

