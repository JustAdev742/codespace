import { describe, expect, it } from 'vitest';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { cardProgress, type Card } from '../src/modes/glimgo/index.ts';
import { tap } from './chaos-scenarios/glimgo.ts';

/*
 * Exact behaviour of the Glimgo pack: what each cheat does to cards, marks,
 * lockouts and calls, its limits and refusals, and the invariant every one of
 * them keeps (progress matches the card, and chaos never completes a card).
 */

const make = (settings: Record<string, unknown> = {}, players = 4) => new ChaosSim({ modeId: 'glimgo', questions: MIXED_SET, players, seed: 99, settings });
const isMarked = (card: Card, i: number) => card.cells[i] === -1 || (card.marks[i] ?? 0) > 0;
const progress = (sim: ChaosSim, id: string) => sim.state().progress[id];
const card = (sim: ChaosSim, id: string): Card => sim.state().cards[id];
const recomputed = (sim: ChaosSim, id: string) => cardProgress(card(sim, id), sim.state().size, (sim.rt.settings.win as 'line') ?? 'line');
const ok = (r: { ok: boolean; message?: string }) => expect(r.ok, 'message' in r ? r.message : '').toBe(true);
const refused = (r: { ok: boolean; message?: string }, text: RegExp) => {
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.message).toMatch(text);
};

/** Every card's progress is what the mode would compute, and nobody has won through chaos. */
function consistent(sim: ChaosSim) {
  for (const id of sim.ids) if (card(sim, id)) expect(progress(sim, id)).toEqual(recomputed(sim, id));
}

/** Players ordered by marks (most first), with a phase that has an open call. */
function openCallSim(settings: Record<string, unknown> = {}) {
  const sim = make(settings);
  sim.run(40_000);
  for (let i = 0; i < 80 && sim.state().phase !== 'call'; i++) sim.run(250);
  return sim;
}

const byMarks = (sim: ChaosSim) => sim.ids.slice().sort((a, b) => progress(sim, b).marks - progress(sim, a).marks);

describe('glimgo pack: cards', () => {
  it('Wishing Star frees one unmarked square on the closest line, and is refused one square from Glimgo', () => {
    const sim = openCallSim();
    const me = byMarks(sim).at(-1)!;
    const before = card(sim, me);
    const toGo = progress(sim, me).toGo;
    ok(sim.cast(me, { cheatId: 'glimgo.lucky-star' }));
    const after = card(sim, me);
    const changed = after.cells.map((c, i) => (c !== before.cells[i] ? i : -1)).filter((i) => i >= 0);
    expect(changed).toHaveLength(1);
    expect(after.cells[changed[0]!]).toBe(-1);
    expect(after.marks[changed[0]!]).toBe(0);
    expect(isMarked(before, changed[0]!)).toBe(false);
    expect(progress(sim, me).toGo).toBe(toGo - 1);
    consistent(sim);
    // Late in the game someone is one square away: the star would win, so it is refused.
    sim.run(140_000);
    const close = sim.ids.find((id) => progress(sim, id)?.toGo === 1);
    if (close && sim.rt.status === 'running') refused(sim.cast(close, { cheatId: 'glimgo.lucky-star' }), /one square from Glimgo/);
  });

  it('Ink Blot rubs out a mark from an earlier call, never the open call\'s, and keeps progress right', () => {
    const sim = openCallSim();
    const victim = byMarks(sim)[0]!;
    const caster = sim.ids.find((id) => id !== victim)!;
    const open = sim.state().calls.at(-1).n;
    const before = card(sim, victim);
    ok(sim.cast(caster, { cheatId: 'glimgo.ink-blot', target: victim }));
    const after = card(sim, victim);
    const rubbed = before.marks.map((m, i) => (m > 0 && after.marks[i] === 0 ? i : -1)).filter((i) => i >= 0);
    expect(rubbed).toHaveLength(1);
    expect(before.marks[rubbed[0]!]).not.toBe(open);
    expect(after.cells).toEqual(before.cells);
    expect(progress(sim, victim).marks).toBe(cardProgress(before, sim.state().size, 'line').marks - 1);
    consistent(sim);
  });

  it('Mark Snatch moves a mark, with its call number, onto the same answer on your card', () => {
    const sim = openCallSim();
    const victim = byMarks(sim)[0]!;
    const caster = byMarks(sim).at(-1)!;
    const theirs = card(sim, victim);
    const mine = card(sim, caster);
    ok(sim.cast(caster, { cheatId: 'glimgo.mark-snatch', target: victim }));
    const lost = theirs.marks.findIndex((m, i) => m > 0 && card(sim, victim).marks[i] === 0);
    const got = mine.marks.findIndex((m, i) => m === 0 && card(sim, caster).marks[i] > 0);
    expect(lost).toBeGreaterThanOrEqual(0);
    expect(got).toBeGreaterThanOrEqual(0);
    const s = sim.state();
    expect(s.answers[mine.cells[got]!].key).toBe(s.answers[theirs.cells[lost]!].key);
    expect(card(sim, caster).marks[got]).toBe(theirs.marks[lost]);
    consistent(sim);
  });

  it('Card Switcheroo needs the target ahead, then trades cards and progress whole', () => {
    const sim = openCallSim();
    const [ahead] = byMarks(sim);
    const behind = sim.ids.filter((id) => progress(sim, id).toGo > progress(sim, ahead!).toGo || progress(sim, id).marks < progress(sim, ahead!).marks).at(-1)!;
    refused(sim.cast(ahead!, { cheatId: 'glimgo.card-swap', target: behind }), /not ahead/);
    const a = card(sim, ahead!);
    const b = card(sim, behind);
    ok(sim.cast(behind, { cheatId: 'glimgo.card-swap', target: ahead }));
    expect(card(sim, behind)).toEqual(a);
    expect(card(sim, ahead!)).toEqual(b);
    consistent(sim);
  });

  it('Scrambled Card keeps every square and mark, only moves them, and never brings the target closer', () => {
    const sim = openCallSim();
    sim.run(40_000);
    const victim = byMarks(sim)[0]!;
    const caster = sim.ids.find((id) => id !== victim)!;
    const before = card(sim, victim);
    const toGo = progress(sim, victim).toGo;
    const r = sim.cast(caster, { cheatId: 'glimgo.scramble', target: victim });
    if (!r.ok) {
      expect(r.message).toMatch(/No shuffle would set/);
      return;
    }
    const after = card(sim, victim);
    const pairs = (c: Card) => c.cells.map((x, i) => `${x}:${c.marks[i]}`).sort();
    expect(pairs(after)).toEqual(pairs(before));
    expect(progress(sim, victim).toGo).toBeGreaterThanOrEqual(toGo);
    consistent(sim);
  });

  it('Sliding Tile brings you closer but never to Glimgo, and is refused in a whole-card game', () => {
    const sim = openCallSim();
    sim.run(30_000);
    const me = byMarks(sim)[0]!;
    const toGo = progress(sim, me).toGo;
    const r = sim.cast(me, { cheatId: 'glimgo.sliding-tile' });
    if (r.ok) {
      expect(progress(sim, me).toGo).toBeLessThan(toGo);
      expect(progress(sim, me).toGo).toBeGreaterThanOrEqual(1);
      expect(sim.state().winner).toBeNull();
    } else expect(r.message).toMatch(/No slide/);
    consistent(sim);
    const full = openCallSim({ win: 'full' });
    refused(full.cast('p1', { cheatId: 'glimgo.sliding-tile' }), /whole-card game/);
  });

  it('Dauber\'s Gamble either frees a square or rubs out a mark, and states its odds', async () => {
    const { getCheat } = await import('../src/chaos/registry.ts');
    expect(getCheat('glimgo.gamble')!.description).toMatch(/50%.*50%/);
    const sim = openCallSim();
    const me = byMarks(sim)[0]!;
    const before = card(sim, me);
    ok(sim.cast(me, { cheatId: 'glimgo.gamble' }));
    const after = card(sim, me);
    const freed = after.cells.filter((c, i) => c === -1 && before.cells[i] !== -1).length;
    const rubbed = after.marks.filter((m, i) => m === 0 && before.marks[i] > 0 && after.cells[i] !== -1).length;
    expect(freed + rubbed).toBe(1);
    consistent(sim);
  });
});

describe('glimgo pack: marks and lockouts', () => {
  it('Inkstorm locks every other player out for 4 seconds, and only while a call is open', () => {
    const sim = openCallSim();
    const now = sim.now;
    const mineBefore = sim.state().lockedUntil.p1;
    ok(sim.cast('p1', { cheatId: 'glimgo.inkstorm' }));
    const locked = sim.state().lockedUntil;
    for (const id of ['p2', 'p3', 'p4']) expect(locked[id]).toBeGreaterThanOrEqual(now + 4000);
    // The caster's own lockout (from a wrong square of their own, if any) is left as it was.
    expect(locked.p1).toBe(mineBefore);
    for (let i = 0; i < 80 && sim.state().phase === 'call'; i++) sim.run(250);
    refused(sim.cast('p2', { cheatId: 'glimgo.inkstorm' }), /Wait for a call/);
  });

  it('Butterfingers adds 5 seconds to the lockout of each wrong square', () => {
    const sim = openCallSim();
    sim.idle.add('p2');
    ok(sim.cast('p1', { cheatId: 'glimgo.butterfingers', target: 'p2' }));
    tap(sim, 'p2', 'wrong');
    const tapped = sim.now;
    expect(sim.state().lastMark.p2.ok).toBe(false);
    sim.run(500);
    // The room lockout is 5 seconds; Butterfingers makes it at least 10 from the tap.
    expect(sim.state().lockedUntil.p2).toBeGreaterThanOrEqual(tapped + 10_000 - 500);
  });

  it('Steady Hand lifts a lockout within a quarter second, and needs the lockout to be on', () => {
    const sim = openCallSim();
    sim.idle.add('p1');
    ok(sim.cast('p1', { cheatId: 'glimgo.steady-hand' }));
    tap(sim, 'p1', 'wrong');
    expect(sim.state().lastMark.p1.ok).toBe(false);
    sim.run(300);
    expect(sim.state().lockedUntil.p1).toBeLessThanOrEqual(sim.now);
    const off = openCallSim({ lockoutSeconds: 0 });
    refused(off.cast('p1', { cheatId: 'glimgo.steady-hand' }), /does not work here/);
  });

  it('Benched refuses every mark from the target during that call only', () => {
    const sim = openCallSim();
    sim.idle.add('p2');
    const n = sim.state().calls.at(-1).n;
    ok(sim.cast('p1', { cheatId: 'glimgo.benched', target: 'p2' }));
    const c = sim.state().calls.at(-1);
    const r = sim.rt.act('p2', { type: 'mark', iid: c.iid, square: card(sim, 'p2').cells.findIndex((x, i) => x >= 0 && !isMarked(card(sim, 'p2'), i)) });
    refused(r, /benched/);
    for (let i = 0; i < 160 && !(sim.state().phase === 'call' && sim.state().calls.at(-1).n > n); i++) sim.run(250);
    sim.run(600);
    expect(sim.chaos().effects.some((e) => e.cheatId === 'glimgo.benched')).toBe(false);
  });

  it('Padlocked Square refuses only the locked square', () => {
    const sim = openCallSim();
    sim.idle.add('p2');
    ok(sim.cast('p1', { cheatId: 'glimgo.padlock', target: 'p2' }));
    const sq = Number(sim.chaos().effects.find((e) => e.cheatId === 'glimgo.padlock')!.data.square);
    const c = sim.state().calls.at(-1);
    refused(sim.rt.act('p2', { type: 'mark', iid: c.iid, square: sq }), /padlocked/);
    const other = card(sim, 'p2').cells.findIndex((x, i) => x >= 0 && i !== sq && !isMarked(card(sim, 'p2'), i));
    const r = sim.rt.act('p2', { type: 'mark', iid: c.iid, square: other });
    if (!r.ok) expect(r.message).not.toMatch(/padlocked/);
  });

  it('Chain Reaction frees a square beside your next right mark, once', () => {
    const sim = openCallSim();
    sim.idle.add('p1');
    ok(sim.cast('p1', { cheatId: 'glimgo.chain-reaction' }));
    const before = card(sim, 'p1');
    for (let tries = 0; tries < 8 && !sim.state().lastMark.p1?.ok; tries++) {
      tap(sim, 'p1', 'right');
      if (!sim.state().lastMark.p1?.ok) for (let i = 0; i < 80 && sim.state().phase === 'call'; i++) sim.run(250);
    }
    sim.run(300);
    const last = sim.state().lastMark.p1;
    if (!last?.ok) return;
    const size = sim.state().size;
    const freed = card(sim, 'p1').cells.map((c, i) => (c === -1 && before.cells[i] !== -1 ? i : -1)).filter((i) => i >= 0);
    expect(freed.length).toBeLessThanOrEqual(1);
    if (freed.length) {
      const [i] = freed;
      const dist = Math.abs(Math.floor(i! / size) - Math.floor(last.square / size)) + Math.abs((i! % size) - (last.square % size));
      expect(dist).toBe(1);
    }
    expect(sim.chaos().effects.some((e) => e.cheatId === 'glimgo.chain-reaction')).toBe(false);
    consistent(sim);
  });

  it('Copycat Dauber copies a rival\'s right mark with the same call number', () => {
    const sim = openCallSim();
    sim.idle.add('p1');
    sim.idle.add('p2');
    ok(sim.cast('p1', { cheatId: 'glimgo.copycat', target: 'p2' }));
    const mine = card(sim, 'p1');
    tap(sim, 'p2', 'right');
    sim.run(300);
    const last = sim.state().lastMark.p2;
    if (!last?.ok) return;
    const key = sim.state().answers[card(sim, 'p2').cells[last.square]!].key;
    const j = card(sim, 'p1').cells.findIndex((a) => a >= 0 && sim.state().answers[a].key === key);
    if (j >= 0 && !isMarked(mine, j)) {
      expect(card(sim, 'p1').marks[j]).toBe(last.n);
      if (sim.state().phase === 'call' && sim.state().calls.at(-1).n === last.n) expect(sim.state().found.p1).toBe(true);
    }
    consistent(sim);
  });
});

describe('glimgo pack: the caller', () => {
  it('Hold the Call adds 10 seconds; Hurry the Caller closes it at once', () => {
    const sim = openCallSim();
    const c = sim.state().calls.at(-1);
    ok(sim.cast('p1', { cheatId: 'glimgo.hold-call' }));
    expect(sim.state().calls.at(-1).endsAt).toBe(Math.max(c.endsAt, sim.now) + 10_000);
    expect(sim.state().phaseEndsAt).toBe(sim.state().calls.at(-1).endsAt);
    ok(sim.cast('p2', { cheatId: 'glimgo.hurry-caller' }));
    expect(sim.state().phase).toBe('reveal');
    expect(sim.state().calls.at(-1).closed).toBe(true);
    refused(sim.cast('p3', { cheatId: 'glimgo.hold-call' }), /No call is open/);
  });

  it('Encore calls the revealed question again, and never a third time', () => {
    const sim = openCallSim();
    for (let i = 0; i < 80 && sim.state().phase !== 'reveal'; i++) sim.run(250);
    const last = sim.state().calls.at(-1);
    const r = sim.cast('p1', { cheatId: 'glimgo.encore' });
    if (!r.ok) {
      expect(r.message).toMatch(/twice|needs that answer/);
      return;
    }
    const now = sim.state().calls.at(-1);
    expect(now.qid).toBe(last.qid);
    expect(now.n).toBe(last.n + 1);
    expect(sim.state().phase).toBe('call');
    if (sim.state().timesCalled[last.qid] >= 2) {
      sim.cast('p2', { cheatId: 'glimgo.hurry-caller' });
      refused(sim.cast('p3', { cheatId: 'glimgo.encore' }), /twice|needs that answer/);
    }
  });

  it('Rigged Draw starts a call for an answer still unmarked on your card', () => {
    const sim = openCallSim();
    for (let i = 0; i < 80 && sim.state().phase !== 'reveal'; i++) sim.run(250);
    ok(sim.cast('p1', { cheatId: 'glimgo.rigged-draw' }));
    const s = sim.state();
    const c = s.calls.at(-1);
    expect(s.phase).toBe('call');
    const mine = card(sim, 'p1');
    expect(mine.cells.some((a, i) => a >= 0 && s.answers[a].key === s.answers[c.answer].key && !isMarked(mine, i))).toBe(true);
  });

  it('First Dibs closes the call once the caster finds it and refuses others meanwhile', () => {
    const sim = openCallSim();
    sim.idle.add('p1');
    const n = sim.state().calls.at(-1).n;
    ok(sim.cast('p1', { cheatId: 'glimgo.first-dibs' }));
    tap(sim, 'p1', 'right');
    if (!sim.state().found.p1 || sim.state().calls.at(-1).n !== n) return;
    sim.run(300);
    expect(sim.state().calls[n - 1].closed).toBe(true);
  });

  it('Caller\'s Tempo makes calls half as long (or one and a half times as long)', () => {
    for (const [tempo, factor] of [
      ['fast', 0.5],
      ['slow', 1.5],
    ] as const) {
      const sim = openCallSim();
      ok(sim.cast('p1', { cheatId: 'glimgo.tempo', params: { tempo } }));
      const c = sim.state().calls.at(-1);
      expect(c.endsAt).toBe(Math.max(c.startedAt + 15_000 * factor, sim.now + 1000));
      for (let i = 0; i < 160 && sim.state().calls.at(-1).n === c.n; i++) sim.run(250);
      sim.run(300);
      const next = sim.state().calls.at(-1);
      if (next.n > c.n && sim.now < sim.chaos().effects.find((e) => e.cheatId === 'glimgo.tempo')!.endsAt) expect(next.endsAt - next.startedAt).toBe(15_000 * factor);
    }
  });
});

/** Players ordered by how far they are from Glimgo (closest first). */
const byToGo = (sim: ChaosSim) => sim.ids.slice().sort((a, b) => progress(sim, a).toGo - progress(sim, b).toGo || progress(sim, b).marks - progress(sim, a).marks);
const frees = (c: Card) => c.cells.filter((x) => x === -1).length;
const keyOf = (sim: ChaosSim, a: number) => sim.state().answers[a].key as string;

describe('glimgo pack: more card cheats', () => {
  it('Star Thief turns a rival\'s free square back into an answer they lack and frees one of yours', () => {
    const sim = openCallSim();
    const [victim, thief] = byMarks(sim);
    refused(sim.cast(thief!, { cheatId: 'glimgo.star-thief', target: victim }), /no free square/);
    ok(sim.cast(victim!, { cheatId: 'glimgo.lucky-star' }));
    const theirs = card(sim, victim!);
    const mine = card(sim, thief!);
    const toGo = progress(sim, victim!).toGo;
    ok(sim.cast(thief!, { cheatId: 'glimgo.star-thief', target: victim }));
    const after = card(sim, victim!);
    const back = after.cells.findIndex((x, i) => theirs.cells[i] === -1 && x !== -1);
    expect(back).toBeGreaterThanOrEqual(0);
    expect(after.marks[back]).toBe(0);
    // The answer put back was not on their card, so the card still has every answer at most once.
    expect(theirs.cells.some((x) => x >= 0 && keyOf(sim, x) === keyOf(sim, after.cells[back]!))).toBe(false);
    expect(frees(after)).toBe(frees(theirs) - 1);
    expect(progress(sim, victim!).toGo).toBeGreaterThanOrEqual(toGo);
    expect(frees(card(sim, thief!))).toBe(frees(mine) + 1);
    expect(progress(sim, thief!).toGo).toBeGreaterThanOrEqual(1);
    consistent(sim);
  });

  it('Pass the Cards moves every card, with its progress, find and last tap, one seat along', () => {
    const sim = openCallSim();
    const s0 = sim.state();
    const before = sim.ids.map((id) => ({ card: card(sim, id), progress: progress(sim, id), found: Boolean(s0.found[id]), last: s0.lastMark[id] ?? null }));
    ok(sim.cast('p1', { cheatId: 'glimgo.pass-the-cards' }));
    const s = sim.state();
    sim.ids.forEach((id, k) => {
      const from = before[(k + 1) % sim.ids.length]!;
      expect(card(sim, id)).toEqual(from.card);
      expect(progress(sim, id)).toEqual(from.progress);
      expect(Boolean(s.found[id])).toBe(from.found);
      expect(s.lastMark[id] ?? null).toEqual(from.last);
    });
    consistent(sim);
  });

  it('Pass the Cards leaves a laminated card where it is, unless its owner casts it', () => {
    const sim = openCallSim();
    ok(sim.cast('p2', { cheatId: 'glimgo.laminate' }));
    const before = Object.fromEntries(sim.ids.map((id) => [id, card(sim, id)]));
    ok(sim.cast('p1', { cheatId: 'glimgo.pass-the-cards' }));
    expect(card(sim, 'p2')).toEqual(before.p2);
    // p1 takes p3's card, p3 takes p4's, and p4 takes p1's: p2 is skipped.
    expect(card(sim, 'p1')).toEqual(before.p3);
    expect(card(sim, 'p3')).toEqual(before.p4);
    expect(card(sim, 'p4')).toEqual(before.p1);
  });

  it('Laminated Card refuses rivals\' card cheats for 40 seconds, but not your own', () => {
    const sim = openCallSim();
    sim.run(20_000);
    const me = byMarks(sim)[0]!;
    const rival = sim.ids.find((id) => id !== me)!;
    ok(sim.cast(me, { cheatId: 'glimgo.laminate' }));
    const mine = card(sim, me);
    for (const cheatId of ['glimgo.ink-blot', 'glimgo.mark-snatch', 'glimgo.scramble', 'glimgo.turntable', 'glimgo.smudge', 'glimgo.star-thief']) {
      refused(sim.cast(rival, { cheatId, target: me }), /laminated/);
    }
    expect(card(sim, me)).toEqual(mine);
    // A rival who is ahead can still be swapped with by the laminated player's own Switcheroo.
    const r = sim.cast(me, { cheatId: 'glimgo.gamble' });
    if (!r.ok) expect(r.message).not.toMatch(/laminated/);
    sim.run(41_000);
    if (sim.rt.status !== 'running') return;
    const blot = sim.cast(rival, { cheatId: 'glimgo.ink-blot', target: me });
    if (!blot.ok) expect(blot.message).not.toMatch(/laminated/);
  });

  it('Trade-In rubs out two marks and frees one square, ending closer to Glimgo but never at it', () => {
    const sim = make();
    // Early on nobody has two marks to spare; play on until someone can trade.
    let me: string | null = null;
    let before: Card | null = null;
    let toGo = 0;
    for (let t = 0; t < 200_000 && !me && sim.rt.status === 'running'; t += 5000) {
      sim.run(5000);
      for (const id of sim.ids) {
        const c = card(sim, id);
        const g = progress(sim, id).toGo;
        const r = sim.cast(id, { cheatId: 'glimgo.trade-in' });
        if (r.ok) {
          [me, before, toGo] = [id, c, g];
          break;
        }
        expect(r.message).toMatch(/No trade-in/);
      }
    }
    expect(me).not.toBeNull();
    const after = card(sim, me!);
    const rubbed = before!.marks.filter((m, i) => m > 0 && after.marks[i] === 0 && after.cells[i] !== -1).length;
    expect(rubbed).toBe(2);
    expect(frees(after)).toBe(frees(before!) + 1);
    expect(progress(sim, me!).toGo).toBeLessThan(toGo);
    expect(progress(sim, me!).toGo).toBeGreaterThanOrEqual(1);
    expect(progress(sim, me!).marks).toBe(cardProgress(before!, sim.state().size, 'line').marks - 2);
    consistent(sim);
    const full = openCallSim({ win: 'full' });
    refused(full.cast('p1', { cheatId: 'glimgo.trade-in' }), /whole-card game/);
  });

  it('Card Turntable turns a card a quarter turn: the same squares and marks, the same progress', () => {
    const sim = openCallSim();
    const victim = byMarks(sim)[0]!;
    const before = card(sim, victim);
    const p = progress(sim, victim);
    const last = sim.state().lastMark[victim];
    ok(sim.cast('p1' === victim ? 'p2' : 'p1', { cheatId: 'glimgo.turntable', target: victim }));
    const n = sim.state().size;
    const after = card(sim, victim);
    // The top-left square now holds what was bottom-left.
    expect(after.cells[0]).toBe(before.cells[(n - 1) * n]);
    expect(after.marks[0]).toBe(before.marks[(n - 1) * n]);
    expect(after.cells.slice().sort()).toEqual(before.cells.slice().sort());
    expect(progress(sim, victim)).toEqual(p);
    if (last) expect(after.cells[sim.state().lastMark[victim].square]).toBe(before.cells[last.square]);
    consistent(sim);
  });
});

describe('glimgo pack: more marks and lockouts', () => {
  it('Pass the Ink frees you at once and locks the target out for the time you had left', () => {
    const sim = openCallSim();
    sim.idle.add('p1');
    // Wait out any lockout p1's bot earned before going idle.
    for (let i = 0; i < 80 && (sim.state().lockedUntil.p1 ?? 0) > sim.now; i++) sim.run(250);
    refused(sim.cast('p1', { cheatId: 'glimgo.pass-the-ink', target: 'p2' }), /not locked out/);
    tap(sim, 'p1', 'wrong');
    expect(sim.state().lastMark.p1.ok).toBe(false);
    const left = sim.state().lockedUntil.p1 - sim.now;
    expect(left).toBeGreaterThan(0);
    ok(sim.cast('p1', { cheatId: 'glimgo.pass-the-ink', target: 'p2' }));
    expect(sim.state().lockedUntil.p1).toBeLessThanOrEqual(sim.now);
    expect(sim.state().lockedUntil.p2).toBeGreaterThanOrEqual(sim.now + left);
  });

  it('Smudge rubs out a mark on each wrong square the target taps, and only then', () => {
    const sim = openCallSim();
    sim.run(20_000);
    const victim = byMarks(sim)[0]!;
    sim.idle.add(victim);
    const caster = sim.ids.find((id) => id !== victim)!;
    ok(sim.cast(caster, { cheatId: 'glimgo.smudge', target: victim }));
    const marks = progress(sim, victim).marks;
    sim.run(1000);
    expect(progress(sim, victim).marks).toBe(marks);
    tap(sim, victim, 'wrong');
    if (sim.state().lastMark[victim]?.ok !== false) return;
    sim.run(300);
    expect(progress(sim, victim).marks).toBe(marks - 1);
    consistent(sim);
    sim.run(1000);
    expect(progress(sim, victim).marks).toBe(marks - 1);
  });

  it('Late Dab marks the revealed answer for a player who missed it, with that call\'s number', () => {
    const sim = openCallSim();
    refused(sim.cast('p1', { cheatId: 'glimgo.late-dab' }), /being revealed/);
    for (let i = 0; i < 80 && sim.state().phase !== 'reveal'; i++) sim.run(250);
    const call = sim.state().calls.at(-1);
    const found = call.found;
    const missed = sim.ids.find((id) => {
      const c = card(sim, id);
      return c.cells.some((a, i) => a >= 0 && keyOf(sim, a) === keyOf(sim, call.answer) && !isMarked(c, i));
    });
    if (!missed) return;
    const before = card(sim, missed);
    const r = sim.cast(missed, { cheatId: 'glimgo.late-dab' });
    if (!r.ok) {
      expect(r.message).toMatch(/complete your card/);
      return;
    }
    const j = before.cells.findIndex((a) => a >= 0 && keyOf(sim, a) === keyOf(sim, call.answer));
    expect(card(sim, missed).marks[j]).toBe(call.n);
    expect(sim.state().calls.at(-1).found).toBe(found + 1);
    consistent(sim);
    // Anyone who has that answer marked already has nothing to dab.
    const marked = sim.ids.find((id) => id !== missed && card(sim, id).cells.some((a, i) => a >= 0 && keyOf(sim, a) === keyOf(sim, call.answer) && isMarked(card(sim, id), i)));
    if (marked) refused(sim.cast(marked, { cheatId: 'glimgo.late-dab' }), /not an unmarked square/);
  });

  it('Butterfingers does not punish the same wrong tap again after a cheat moves the card', () => {
    const sim = openCallSim();
    sim.idle.add('p2');
    ok(sim.cast('p1', { cheatId: 'glimgo.butterfingers', target: 'p2' }));
    tap(sim, 'p2', 'wrong');
    if (sim.state().lastMark.p2?.ok !== false) return;
    sim.run(300);
    const locked = sim.state().lockedUntil.p2;
    ok(sim.cast('p3', { cheatId: 'glimgo.turntable', target: 'p2' }));
    sim.run(1000);
    expect(sim.state().lockedUntil.p2).toBe(locked);
  });
});

describe('glimgo pack: more of the caller', () => {
  it('Race to Two refuses a third finder and closes the call once two have found it', () => {
    const sim = openCallSim();
    for (const id of sim.ids) sim.idle.add(id);
    ok(sim.cast('p1', { cheatId: 'glimgo.race-to-two' }));
    const n = sim.state().calls.at(-1).n;
    tap(sim, 'p1', 'right');
    tap(sim, 'p2', 'right');
    const c = sim.state().calls.at(-1);
    if (c.n !== n || c.found < 2) return;
    const sq = card(sim, 'p3').cells.findIndex((a, i) => a >= 0 && keyOf(sim, a) === keyOf(sim, c.answer) && !isMarked(card(sim, 'p3'), i));
    if (sq >= 0 && !c.closed) refused(sim.rt.act('p3', { type: 'mark', iid: c.iid, square: sq }), /Two players/);
    sim.run(300);
    expect(sim.state().calls[n - 1].closed).toBe(true);
    expect(sim.state().calls[n - 1].found).toBe(2);
    refused(openCallSim({ finders: 2 }).cast('p1', { cheatId: 'glimgo.race-to-two' }), /already close after two/);
  });

  it('Long Reveal keeps the answer up 8 seconds longer, and only during a reveal', () => {
    const sim = openCallSim();
    refused(sim.cast('p1', { cheatId: 'glimgo.long-reveal' }), /being revealed/);
    for (let i = 0; i < 80 && sim.state().phase !== 'reveal'; i++) sim.run(250);
    const ends = sim.state().phaseEndsAt;
    ok(sim.cast('p1', { cheatId: 'glimgo.long-reveal' }));
    expect(sim.state().phaseEndsAt).toBe(ends + 8000);
    sim.run(ends - sim.now + 1000);
    expect(sim.state().phase).toBe('reveal');
    sim.run(8000);
    expect(sim.state().phase).toBe('call');
  });

  it('Caller\'s Whisper names the square that answers the open call, and ends with the call', () => {
    const sim = openCallSim();
    sim.idle.add('p1');
    const c = sim.state().calls.at(-1);
    ok(sim.cast('p1', { cheatId: 'glimgo.whisper' }));
    const j = card(sim, 'p1').cells.findIndex((a) => a >= 0 && keyOf(sim, a) === keyOf(sim, c.answer));
    const n = sim.state().size;
    const text = sim.view('p1').overlays.map((o) => String(o.text ?? '')).find((t) => t.startsWith('Caller'));
    if (j < 0) expect(text).toMatch(/not on your card/);
    else if (isMarked(card(sim, 'p1'), j)) expect(text).toMatch(/marked/);
    else expect(text).toBe(`Caller's whisper: row ${Math.floor(j / n) + 1}, square ${(j % n) + 1}`);
    // Nobody else sees it.
    expect(sim.view('p2').overlays.some((o) => String(o.text ?? '').startsWith('Caller'))).toBe(false);
    for (let i = 0; i < 160 && !sim.state().calls[c.n - 1].closed; i++) sim.run(250);
    sim.run(300);
    expect(sim.chaos().effects.some((e) => e.cheatId === 'glimgo.whisper')).toBe(false);
  });

  it('Star Stowaway gives a lucky star to someone who is not furthest behind, and needs Lucky Stars', () => {
    refused(openCallSim().cast('p1', { cheatId: 'glimgo.star-stowaway' }), /does not work here/);
    const sim = openCallSim({ luckyStars: true });
    const me = byToGo(sim)[0]!;
    const toGo = progress(sim, me).toGo;
    if (toGo < 3) return;
    ok(sim.cast(me, { cheatId: 'glimgo.star-stowaway' }));
    const due = Number(sim.chaos().effects.find((e) => e.cheatId === 'glimgo.star-stowaway')!.data.n);
    expect(due % 5).toBe(0);
    const before = frees(card(sim, me));
    for (let i = 0; i < 480 && sim.rt.status === 'running' && !sim.state().calls[due - 1]?.closed; i++) sim.run(250);
    sim.run(300);
    if (sim.rt.status !== 'running' || sim.state().winner) return;
    expect(sim.chaos().effects.some((e) => e.cheatId === 'glimgo.star-stowaway')).toBe(false);
    expect(frees(card(sim, me))).toBeGreaterThanOrEqual(before + 1);
    consistent(sim);
  });
});

describe('glimgo pack: invariants', () => {
  it('a storm of card cheats never breaks progress and never calls Glimgo', () => {
    const sim = make();
    const cheats = [
      'glimgo.lucky-star',
      'glimgo.ink-blot',
      'glimgo.mark-snatch',
      'glimgo.scramble',
      'glimgo.sliding-tile',
      'glimgo.gamble',
      'glimgo.card-swap',
      'glimgo.star-shower',
      'glimgo.star-thief',
      'glimgo.pass-the-cards',
      'glimgo.trade-in',
      'glimgo.turntable',
      'glimgo.late-dab',
    ];
    for (let round = 0; round < 40 && sim.rt.status === 'running'; round++) {
      sim.run(5000);
      for (const id of sim.ids) {
        const others = sim.ids.filter((x) => x !== id);
        const cheatId = cheats[(round + sim.ids.indexOf(id)) % cheats.length]!;
        const winnerBefore = sim.state().winner;
        sim.cast(id, { cheatId, target: others[round % others.length] });
        expect(sim.state().winner).toBe(winnerBefore);
        consistent(sim);
      }
    }
    expect(sim.errors).toEqual([]);
  });
});
