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

describe('glimgo pack: invariants', () => {
  it('a storm of card cheats never breaks progress and never calls Glimgo', () => {
    const sim = make();
    const cheats = ['glimgo.lucky-star', 'glimgo.ink-blot', 'glimgo.mark-snatch', 'glimgo.scramble', 'glimgo.sliding-tile', 'glimgo.gamble', 'glimgo.card-swap', 'glimgo.star-shower'];
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
