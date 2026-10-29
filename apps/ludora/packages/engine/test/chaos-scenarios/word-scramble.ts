import { createRng } from '@ludora/shared';
import type { ChaosSim } from '../../src/testing/chaos.ts';
import type { Post, Pre, ScenarioSet } from '../chaos-scenarios.ts';

/* Catalogue-suite scenarios for word-scramble cheats. See chaos-scenarios.ts for what each field does. */

type You = { finished: boolean; done: number; word: { kind: string; iid: string; hints: number; maxHints: number } | null } | null;
const you = (sim: ChaosSim, id: string): You => (sim.rt.view({ kind: 'player', playerId: id }) as { you: You } | null)?.you ?? null;
const live = (sim: ChaosSim, id: string) => sim.rt.status === 'running' && sim.rt.hasPlayer(id);

/** Move on (or skip ordinary questions) until the player has a word with tiles, with a hint left if asked. Returns its iid. */
export function toTiles(sim: ChaosSim, id: string, needHint = false): string | null {
  for (let i = 0; i < 12 && live(sim, id); i++) {
    const me = you(sim, id);
    if (!me || me.finished) return null;
    const w = me.word;
    if (!w) sim.rt.act(id, { type: 'next' });
    else if (w.kind === 'scramble' && (!needHint || w.hints < w.maxHints)) return w.iid;
    else sim.rt.act(id, { type: 'skip', iid: w.iid });
  }
  return null;
}

/** The player solves the word they are on (moving on to one first if needed). */
export function solveWord(sim: ChaosSim, id: string) {
  const start = you(sim, id)?.done ?? 0;
  for (let i = 0; i < 6 && live(sim, id) && (you(sim, id)?.done ?? start) === start; i++) {
    const action = sim.rt.botAction(id, 1, createRng(31 + i));
    if (action) sim.rt.act(id, action);
  }
}

const targetTriesHint: Post = (sim, _caster, _def, target) => {
  if (!target) return;
  const iid = toTiles(sim, target, true);
  if (iid) sim.rt.act(target, { type: 'hint', iid });
};
const casterMisspells: Post = (sim, caster) => {
  const iid = toTiles(sim, caster);
  if (iid) sim.rt.act(caster, { type: 'solve', iid, text: 'qqqqq' });
};
const casterStreakThenSkip: Post = (sim, caster) => {
  solveWord(sim, caster);
  sim.run(600);
  const iid = toTiles(sim, caster) ?? you(sim, caster)?.word?.iid;
  if (iid) sim.rt.act(caster, { type: 'skip', iid });
};
const targetMisspells: Post = (sim, _caster, _def, target) => {
  const iid = target ? toTiles(sim, target) : null;
  if (iid) sim.rt.act(target!, { type: 'solve', iid, text: 'qqqqq' });
};
/** The target spells the word wrong, then tries again: a one-try curse refuses the second go. */
const targetMisspellsTwice: Post = (sim, _caster, _def, target) => {
  const iid = target ? toTiles(sim, target) : null;
  if (!iid) return;
  sim.rt.act(target!, { type: 'solve', iid, text: 'qqqqq' });
  sim.rt.act(target!, { type: 'solve', iid, text: 'zzzzz' });
};
const casterSolves: Post = (sim, caster) => solveWord(sim, caster);
const targetSolves: Post = (sim, _caster, _def, target) => target && solveWord(sim, target);
/** The caster skips a word (moving on to one first), so their last word is a miss. */
const casterSkips: Pre = (sim, caster) => {
  if (!live(sim, caster) || you(sim, caster)?.finished) return;
  if (!you(sim, caster)?.word) sim.rt.act(caster, { type: 'next' });
  const iid = you(sim, caster)?.word?.iid;
  if (iid) sim.rt.act(caster, { type: 'skip', iid });
};

export const scenarios: ScenarioSet = {
  // The word timer, the spelling streak, one try per word and second chances are game settings.
  settings: { 'word-scramble': [{ wordTimer: true }, { streak: true }, { oneTry: true }, { secondChance: true }] },
  pre: {
    'word-scramble.word-boomerang': casterSkips,
  },
  post: {
    'word-scramble.hint-padlock': targetTriesHint,
    'word-scramble.second-draft': casterMisspells,
    'word-scramble.streak-keeper': casterStreakThenSkip,
    'word-scramble.typo-tax': targetMisspells,
    'word-scramble.first-spell-curse': targetMisspellsTwice,
    'word-scramble.hint-tax': targetTriesHint,
    'word-scramble.spelling-wager': casterSolves,
    'word-scramble.streak-stall': targetSolves,
  },
};
