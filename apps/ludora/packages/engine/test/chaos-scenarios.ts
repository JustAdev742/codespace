import type { ChaosSim } from '../src/testing/chaos.ts';
import type { CheatDef } from '../src/chaos/types.ts';

/*
 * Situations some cheats need before they can show what they do, used by the
 * catalogue suite. Each pack has its own file in chaos-scenarios/; this file
 * merges them with the scenarios for the universal cheats.
 *
 * - settings: extra mode settings to try, per mode, when a cheat needs a
 *   capability only some settings give (penalties make 'losses').
 * - pre: runs on both games before the cast, for each caster tried.
 * - post: runs on both games after the cast, with the cheat's first target.
 * - casters: which casters to try first (default: furthest behind first).
 * - targets: which targets to try first (default: richest first).
 * - reactive: lasting cheats that wait for a situation before they act; if
 *   it never arises in a mode, that run counts as untriggered, not failed.
 */

export type Pre = (sim: ChaosSim, caster: string) => void;
export type Post = (sim: ChaosSim, caster: string, def: CheatDef, target: string | null) => void;

export interface ScenarioSet {
  settings?: Record<string, Record<string, unknown>[]>;
  pre?: Record<string, Pre>;
  post?: Record<string, Post>;
  casters?: Record<string, 'richest'>;
  targets?: Record<string, 'closest-above'>;
  reactive?: string[];
}

/** Someone else casts a cheat on `victim`, so there is a culprit to get revenge on. */
function attackedBy(sim: ChaosSim, victim: string) {
  const other = sim.ids.find((id) => id !== victim && sim.rt.hasPlayer(id));
  if (other) sim.cast(other, { cheatId: 'score.halve-gains', target: victim });
}

/** The target stops playing, so a cheat that punishes not scoring (or rewards catching up) can go off. */
export const idleTarget: Post = (sim, _caster, _def, target) => {
  if (target) sim.idle.add(target);
};

const universal: ScenarioSet = {
  // Modes where play can take score away only with these settings on.
  settings: { classic: [{ wrongPenalty: 200 }], 'quick-draw': [{ penalty: true }] },
  pre: { 'score.revenge': attackedBy },
  post: { 'score.time-bomb': idleTarget, 'score.bounty': idleTarget },
  // Protection against losses needs something to lose.
  casters: { 'score.lock': 'richest', 'score.insurance': 'richest' },
  targets: { 'score.bounty': 'closest-above' },
  reactive: ['score.bounty'],
};

const packs = Object.values(import.meta.glob<{ scenarios: ScenarioSet }>('./chaos-scenarios/*.ts', { eager: true })).map((m) => m.scenarios);
const all = [universal, ...packs];

export const SETTINGS: Record<string, Record<string, unknown>[]> = {};
for (const s of all) for (const [mode, list] of Object.entries(s.settings ?? {})) (SETTINGS[mode] ??= []).push(...list);
export const PRE: Record<string, Pre> = Object.assign({}, ...all.map((s) => s.pre ?? {}));
export const POST: Record<string, Post> = Object.assign({}, ...all.map((s) => s.post ?? {}));
export const CASTERS: Record<string, 'richest'> = Object.assign({}, ...all.map((s) => s.casters ?? {}));
export const TARGETS: Record<string, 'closest-above'> = Object.assign({}, ...all.map((s) => s.targets ?? {}));
export const REACTIVE = new Set(all.flatMap((s) => s.reactive ?? []));
