import type { ChaosSim } from '../../src/testing/chaos.ts';
import { padlockSquare } from '../../src/chaos/packs/glimgo.ts';
import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for glimgo cheats. See chaos-scenarios.ts for what each field does. */

/** Play on (both games alike) until `ok` holds, a quarter second at a time. */
function until(sim: ChaosSim, ok: () => boolean) {
  for (let i = 0; i < 160 && sim.rt.status === 'running' && !ok(); i++) sim.run(250);
}

/** Until a call is open and this player may mark it (not locked out, not found yet). */
function untilCanMark(sim: ChaosSim, id: string) {
  until(sim, () => {
    const s = sim.state();
    return s.phase === 'call' && !s.found[id] && (s.lockedUntil[id] ?? 0) <= sim.now;
  });
}

/** A player taps a square on the open call: a right one, a wrong one, or a given square. */
export function tap(sim: ChaosSim, id: string | null, which: 'right' | 'wrong' | number) {
  if (!id || !sim.rt.hasPlayer(id)) return;
  untilCanMark(sim, id);
  const s = sim.state();
  const call = s.calls.at(-1);
  const card = s.cards[id];
  if (s.phase !== 'call' || !call || !card) return;
  const key = (a: number) => s.answers[a]?.key;
  const open = card.cells.map((a: number, i: number) => ({ a, i })).filter(({ a, i }: { a: number; i: number }) => a >= 0 && !card.marks[i]);
  const pick =
    typeof which === 'number' ? { i: which } : open.find(({ a }: { a: number }) => (key(a) === key(call.answer)) === (which === 'right'));
  if (pick) sim.rt.act(id, { type: 'mark', iid: call.iid, square: pick.i });
}

const untilReveal: Pre = (sim) => until(sim, () => sim.state().phase === 'reveal');
const targetTaps =
  (which: 'right' | 'wrong'): Post =>
  (sim, _caster, _def, t) =>
    tap(sim, t, which);
const casterTaps =
  (which: 'right' | 'wrong'): Post =>
  (sim, caster) =>
    tap(sim, caster, which);

/** The target tries the square Padlocked Glimgo Square locks (worked out from the card, so both games pick the same one). */
const targetTriesPadlock: Post = (sim, _caster, _def, t) => {
  if (!t) return;
  const s = sim.state();
  const sq = padlockSquare(s.cards[t], s.size, sim.rt.settings.win as 'line');
  if (sq !== null) tap(sim, t, sq);
};

export const scenarios: ScenarioSet = {
  pre: { 'glimgo.encore': untilReveal, 'glimgo.rigged-draw': untilReveal },
  post: {
    'glimgo.butterfingers': targetTaps('wrong'),
    'glimgo.steady-hand': casterTaps('wrong'),
    'glimgo.benched': targetTaps('right'),
    'glimgo.padlock': targetTriesPadlock,
    'glimgo.first-dibs': casterTaps('right'),
    'glimgo.copycat': targetTaps('right'),
    'glimgo.chain-reaction': casterTaps('right'),
  },
  reactive: ['glimgo.butterfingers', 'glimgo.steady-hand', 'glimgo.first-dibs', 'glimgo.copycat', 'glimgo.chain-reaction'],
};
