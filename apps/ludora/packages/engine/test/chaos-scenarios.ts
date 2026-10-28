import type { ChaosSim } from '../src/testing/chaos.ts';
import type { CheatDef } from '../src/chaos/types.ts';
import { cheatAvailability, getCheat } from '../src/chaos/registry.ts';

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
 * - screen: cheats whose whole effect is information on a screen (a peek, a
 *   tally); they must reach the screen, like visual cheats.
 * - meta: cheats about chaos itself (energy, cooldowns); they must change the
 *   caster's chaos state.
 * - effects: cheats that act on other cheats (shields, cleanses, thefts); the
 *   comparison includes which other effects are running and on whom.
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
  screen?: string[];
  meta?: string[];
  effects?: string[];
}

/** The first of these cheats the game supports, for scenarios that need "some harmful cheat". */
export function firstAvailable(sim: ChaosSim, ids: string[]): string | null {
  const caps = sim.rt.chaosView({ kind: 'host' }, false) ? (sim.rt as unknown as { chaos: { capabilities: string[] } }).chaos.capabilities : [];
  for (const id of ids) {
    const def = getCheat(id);
    if (def && !cheatAvailability({ modes: def.modes ?? null, needs: def.needs ?? [] }, sim.rt.mode.meta.id, caps)) return id;
  }
  return null;
}

const CURSES = ['score.freeze-score', 'look.upside-down'];
const STEALS = ['score.mutual-ruin', 'look.upside-down'];
const BUFFS = ['score.double-points', 'adv.shield'];

/** Someone else casts a cheat on `victim`, so there is a culprit to get revenge on. */
function attackedBy(sim: ChaosSim, victim: string) {
  const other = sim.ids.find((id) => id !== victim && sim.rt.hasPlayer(id));
  if (other) sim.cast(other, { cheatId: 'score.halve-gains', target: victim });
}

/** Players who count as opponents of `id` (another team, or anyone when there are no teams). */
export function opponentsOf(sim: ChaosSim, id: string): string[] {
  const team = sim.rt.playerList().find((p) => p.id === id)?.teamId ?? null;
  return sim.rt.playerList().filter((p) => p.id !== id && (team === null || p.teamId !== team)).map((p) => p.id);
}

/** Someone attacks the caster (or, for a bodyguard, the player they guard) with an instant steal, which a defence changes. */
const attackCaster: Post = (sim, caster, def, target) => {
  const victim = def.target === 'player' && target ? target : caster;
  const attacker = opponentsOf(sim, victim).find((id) => id !== caster);
  const cheat = firstAvailable(sim, STEALS);
  if (attacker && cheat) sim.cast(attacker, { cheatId: cheat, target: victim });
};

/** Every other player is cursed by someone, so there is something to cleanse or rescue. */
const curseEveryone: Pre = (sim, caster) => {
  const cheat = firstAvailable(sim, CURSES);
  for (const t of sim.ids) {
    const by = sim.rt.hasPlayer(t) ? opponentsOf(sim, t)[0] : undefined;
    if (by && cheat) sim.cast(by, { cheatId: cheat, target: t });
  }
  void caster;
};

/** Every other player casts a buff on themselves, so there is something to dispel or steal. */
const othersBuff: Pre = (sim, caster) => {
  const cheat = firstAvailable(sim, BUFFS);
  for (const id of sim.ids) if (cheat && id !== caster && sim.rt.hasPlayer(id)) sim.cast(id, { cheatId: cheat });
};

/** The caster spends some energy and starts a cooldown, so there is something to refill or reset. */
const spendFirst: Pre = (sim, caster) => {
  const cheat = firstAvailable(sim, ['adv.thrift']);
  if (cheat) sim.cast(caster, { cheatId: cheat });
};

/** Play on until somebody has been knocked out (up to five minutes), so there is someone to bring back. */
const untilSomeoneIsOut: Pre = (sim) => {
  const out = () => sim.ids.some((id) => (sim.rt as unknown as { chaos: { adapter: { isOut?(s: unknown, id: string): boolean } } }).chaos.adapter.isOut?.(sim.state(), id));
  for (let t = 0; t < 300_000 && !out() && sim.rt.status === 'running'; t += 5000) sim.run(5000);
};

/** Every other player spends energy and starts a cooldown, so there is energy to drain and cooldowns to jam. */
const othersSpend: Pre = (sim, caster) => {
  const cheat = firstAvailable(sim, ['adv.thrift']);
  for (const id of sim.ids) if (cheat && id !== caster && sim.rt.hasPlayer(id)) sim.cast(id, { cheatId: cheat });
};

/** The target tries to cast something, which a silence stops. */
const targetCasts: Post = (sim, _caster, _def, target) => {
  const cheat = firstAvailable(sim, ['adv.decoy']);
  if (target && cheat) sim.cast(target, { cheatId: cheat });
};

/** Play on in small steps until a fresh question is open, so round cheats have one to work on. */
const untilQuestionOpens: Pre = (sim) => {
  // Bots that were waiting answer the moment a question appears, so "fresh" means most of its time left and at least two players still to answer.
  const open = () => {
    const sync = (sim.state() as { sync?: { phase: string; answers: object; deadline: number } }).sync;
    return sync?.phase === 'question' && sync.deadline - sim.now > 10_000 && Object.keys(sync.answers).length <= sim.ids.length - 2;
  };
  for (let t = 0; t < 60_000 && !open() && sim.rt.status === 'running'; t += 100) sim.run(100);
};

/** Another player casts something cheap, so a change to what cheats cost shows up in their energy. */
const someoneCasts: Post = (sim, caster) => {
  const other = sim.ids.find((id) => id !== caster && sim.rt.hasPlayer(id));
  const cheat = firstAvailable(sim, ['adv.thrift']);
  if (other && cheat) sim.cast(other, { cheatId: cheat });
};

/** The target stops playing, so a cheat that punishes not scoring (or rewards catching up) can go off. */
export const idleTarget: Post = (sim, _caster, _def, target) => {
  if (target) sim.idle.add(target);
};

const universal: ScenarioSet = {
  // Modes where play can take score away only with these settings on.
  settings: { classic: [{ wrongPenalty: 200 }, { suddenDeath: true }], 'quick-draw': [{ penalty: true }] },
  pre: {
    'score.revenge': attackedBy,
    'adv.cleanse': curseEveryone,
    'adv.rescue': curseEveryone,
    'adv.dispel': othersBuff,
    'adv.steal-buff': othersBuff,
    'adv.second-wind': spendFirst,
    'adv.cooldown-reset': spendFirst,
    'adv.revive': untilSomeoneIsOut,
    'troll.switcheroo': curseEveryone,
    'troll.pass-the-curse': curseEveryone,
    'troll.curse-spreader': curseEveryone,
    'troll.extend-curses': curseEveryone,
    'troll.energy-drain': othersSpend,
    'troll.cooldown-jam': othersSpend,
    'round.rush': untilQuestionOpens,
    'round.overtime': untilQuestionOpens,
    'round.skip': untilQuestionOpens,
    'round.last-call': untilQuestionOpens,
  },
  post: {
    'score.time-bomb': idleTarget,
    'score.bounty': idleTarget,
    'adv.shield': attackCaster,
    'adv.mirror': attackCaster,
    'adv.fortress': attackCaster,
    'adv.decoy': attackCaster,
    'adv.bodyguard': attackCaster,
    'adv.team-aura': attackCaster,
    'troll.silence': targetCasts,
    'random.karma': attackCaster,
    'random.peace-zone': attackCaster,
    'random.mayhem': someoneCasts,
  },
  // Protection against losses needs something to lose.
  casters: {
    'score.lock': 'richest',
    'score.insurance': 'richest',
    'adv.shield': 'richest',
    'adv.mirror': 'richest',
    'adv.fortress': 'richest',
    'adv.decoy': 'richest',
    'adv.team-aura': 'richest',
    'random.karma': 'richest',
    'random.peace-zone': 'richest',
  },
  targets: { 'score.bounty': 'closest-above' },
  reactive: ['score.bounty', 'adv.streak-saver', 'adv.spyglass', 'adv.crowd-hint'],
  screen: ['adv.peek', 'adv.fifty-fifty', 'adv.crowd-hint', 'adv.spyglass', 'adv.stealth', 'adv.thrift', 'random.name-shuffle'],
  meta: ['adv.second-wind', 'adv.cooldown-reset', 'troll.energy-drain', 'troll.cooldown-jam', 'random.mayhem'],
  effects: [
    'adv.shield',
    'adv.mirror',
    'adv.fortress',
    'adv.decoy',
    'adv.bodyguard',
    'adv.team-aura',
    'adv.cleanse',
    'adv.rescue',
    'adv.dispel',
    'adv.steal-buff',
    'troll.switcheroo',
    'troll.pass-the-curse',
    'troll.curse-spreader',
    'troll.extend-curses',
    'troll.silence',
    'random.roulette',
    'random.mystery-buff',
    'random.mystery-curse',
    'random.chaos-storm',
    'random.karma',
    'random.peace-zone',
    'random.identity-swap',
  ],
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
export const SCREEN = new Set(all.flatMap((s) => s.screen ?? []));
export const META = new Set(all.flatMap((s) => s.meta ?? []));
export const EFFECTS = new Set(all.flatMap((s) => s.effects ?? []));
