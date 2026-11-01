import { CHAOS_CATEGORIES, type CheatDef, type CheatInfo, type ComboDef } from './types.ts';

/*
 * The cheat registry. Every cheat registers once, at import, and is checked
 * here: a unique id and name, a real category, a description, a cost and
 * cooldown in range, and some way of doing something (an apply, a hook or an
 * overlay). A cheat that cannot do anything is a registration error, so the
 * catalogue cannot fill up with buttons that do nothing.
 */

const cheats = new Map<string, CheatDef>();
const names = new Map<string, string>();
const combos = new Map<string, ComboDef>();

const ID = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;
const TEAM_TARGETS = new Set(['enemy-team', 'my-team', 'teammate']);

export function defineCheat(def: CheatDef): CheatDef {
  if (!ID.test(def.id)) throw new Error(`Cheat id "${def.id}" must be lowercase words joined by - or .`);
  if (cheats.has(def.id)) throw new Error(`Cheat id "${def.id}" is registered twice`);
  const key = def.name.trim().toLowerCase();
  if (!key) throw new Error(`Cheat ${def.id} has no name`);
  const clash = names.get(key);
  if (clash) throw new Error(`Cheat ${def.id} has the same name as ${clash}: "${def.name}"`);
  if (!CHAOS_CATEGORIES.some((c) => c.id === def.category)) throw new Error(`Cheat ${def.id} has an unknown category`);
  if (def.description.trim().length < 12) throw new Error(`Cheat ${def.id} needs a description of what it does`);
  if (!(def.cost >= 0 && def.cost <= 100)) throw new Error(`Cheat ${def.id}: cost must be 0..100`);
  if (!(def.cooldownMs >= 0 && def.cooldownMs <= 10 * 60_000)) throw new Error(`Cheat ${def.id}: cooldown out of range`);
  if (def.durationMs !== undefined && !(def.durationMs >= 500 && def.durationMs <= 5 * 60_000)) throw new Error(`Cheat ${def.id}: duration out of range`);
  if (def.tickMs !== undefined && (def.durationMs === undefined || def.tickMs < 250)) throw new Error(`Cheat ${def.id}: ticks need a duration and at least 250 ms`);
  const doesSomething = Boolean(def.apply || def.overlay || def.hooks?.gate || def.hooks?.tick || (def.hooks?.delta && Object.keys(def.hooks.delta).length));
  if (!doesSomething) throw new Error(`Cheat ${def.id} does nothing: give it an apply, a hook or an overlay`);
  if ((def.hooks?.gate || def.hooks?.delta || def.hooks?.tick || def.overlay) && def.durationMs === undefined) {
    throw new Error(`Cheat ${def.id} has lasting hooks but no duration`);
  }
  if (TEAM_TARGETS.has(def.target) && !(def.needs ?? []).includes('teams')) throw new Error(`Cheat ${def.id} targets teams, so it must need 'teams'`);
  for (const p of def.params ?? []) {
    if (p.kind === 'int' && !(p.min <= p.default && p.default <= p.max)) throw new Error(`Cheat ${def.id}: param ${p.key} default out of range`);
    if (p.kind === 'choice' && !p.options.some((o) => o.value === p.default)) throw new Error(`Cheat ${def.id}: param ${p.key} default is not an option`);
  }
  cheats.set(def.id, def);
  names.set(key, def.id);
  return def;
}

export function defineCheats(defs: readonly CheatDef[]): void {
  for (const d of defs) defineCheat(d);
}

export function defineCombo(def: ComboDef): ComboDef {
  if (combos.has(def.id)) throw new Error(`Combo ${def.id} is registered twice`);
  if (def.cheats.length < 2) throw new Error(`Combo ${def.id} needs at least two cheats`);
  combos.set(def.id, def);
  return def;
}

export function getCheat(id: string): CheatDef | undefined {
  return cheats.get(id);
}

export function allCheats(): CheatDef[] {
  return [...cheats.values()];
}

export function allCombos(): ComboDef[] {
  return [...combos.values()];
}

/** The combo a set of cheats cast together triggers, if any (the one using the most of them). */
export function comboFor(ids: readonly string[]): ComboDef | null {
  const set = new Set(ids);
  let best: ComboDef | null = null;
  for (const c of combos.values()) if (c.cheats.every((id) => set.has(id)) && (!best || c.cheats.length > best.cheats.length)) best = c;
  return best;
}

export function isHostile(def: CheatDef): boolean {
  if (def.hostile !== undefined) return def.hostile;
  return def.target === 'opponent' || def.target === 'everyone-else' || def.target === 'enemy-team';
}

export function cheatInfo(def: CheatDef): CheatInfo {
  return {
    id: def.id,
    name: def.name,
    category: def.category,
    description: def.description,
    target: def.target,
    params: def.params ?? [],
    cost: def.cost,
    cooldownMs: def.cooldownMs,
    durationMs: def.durationMs ?? null,
    tags: def.tags ?? [],
    hostile: isHostile(def),
    undoable: def.durationMs === undefined ? def.undoable !== false : true,
    modes: def.modes ?? null,
    needs: def.needs ?? [],
  };
}

export function chaosCatalog(): CheatInfo[] {
  return allCheats().map(cheatInfo);
}

export function comboCatalog(): { id: string; name: string; cheats: readonly string[]; description: string }[] {
  return allCombos().map((c) => ({ id: c.id, name: c.name, cheats: c.cheats, description: c.description }));
}

const NEED_LABELS: Record<string, string> = {
  'meter:score': 'this game has no score a cheat can change',
  'meter:currency': 'this game has no coins or match currency',
  'meter:teamScore': 'this game has no team score',
  sync: 'this game has no shared rounds',
  stream: 'players here do not each have their own questions',
  question: 'this game has no question on screen to work with',
  teams: 'teams are off in this game',
  revive: 'nobody can be knocked out here',
  out: 'nobody can be knocked out here',
  losses: 'nothing in this game takes score away, so there is nothing to protect',
  knockouts: 'nobody can be knocked out with these settings',
};

/** Null when a cheat works in this game, otherwise the reason it does not. Runs on the server and in the menu. */
export function cheatAvailability(info: Pick<CheatInfo, 'modes' | 'needs'>, modeId: string, capabilities: readonly string[]): string | null {
  if (info.modes && !info.modes.includes(modeId)) return 'made for another game mode';
  const caps = new Set(capabilities);
  for (const n of info.needs) if (!caps.has(n)) return NEED_LABELS[n] ?? `this game has no ${n.replace(/^meter:/, '')}`;
  return null;
}
