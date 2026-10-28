import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Post, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for lantern-match cheats. See chaos-scenarios.ts for what each field does. */

type Card = { qid: string; side: string };
type Board = { no: number; cards: Card[]; matched: boolean[]; up: number[] };
const boardOf = (sim: ChaosSim, id: string) => (sim.state() as { players: Record<string, { board: Board }> }).players[id]!.board;
const partner = (b: Board, i: number) => b.cards.findIndex((c, k) => k !== i && c.qid === b.cards[i]!.qid && c.side !== b.cards[i]!.side);

/** The caster finds every pair left on their board, so it is cleared. */
const casterClears: Post = (sim, caster) => {
  const no = boardOf(sim, caster).no;
  for (let guard = 0; guard < 40 && boardOf(sim, caster).no === no && sim.rt.status === 'running'; guard++) {
    const b = boardOf(sim, caster);
    const first = b.up.length === 1 ? b.up[0]! : b.cards.findIndex((_c, i) => !b.matched[i]);
    if (b.up.length !== 1) sim.rt.act(caster, { type: 'flip', index: first });
    sim.rt.act(caster, { type: 'flip', index: partner(boardOf(sim, caster), first) });
  }
};

export const scenarios: ScenarioSet = {
  post: { 'lantern-match.clean-sweep': casterClears },
  screen: ['lantern-match.moonlit-peek'],
};
