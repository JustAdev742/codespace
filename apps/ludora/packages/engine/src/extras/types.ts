import type { Rng, SettingValues } from '@ludora/shared';
import type { StreamState } from '../mechanics/selfPaced.ts';
import type { SyncState } from '../mechanics/syncRounds.ts';
import type { EnginePlayer, EngineTeam, ModeContext, PlayerId } from '../sdk/types.ts';

/*
 * The secret chaos layer: cheats that players who found the Easter egg can
 * cast inside a live game. Everything here runs on the server, inside the
 * same transactions as the mode itself, so a cheat either changes the real
 * game state or is refused; nothing is decided by the browser.
 *
 * A cheat is a definition (code, in the registry) plus, while it lasts, an
 * active effect (plain data, in the runtime's chaos state). Definitions act
 * through a few hooks:
 *  - apply: runs once when cast (instant cheats do all their work here);
 *  - gate: sees the target's actions before the mode does and may refuse them;
 *  - delta: sees how much each meter (score, coins...) changed in a mode
 *    transaction and may bend it: double it, redirect it, reverse it;
 *  - tick: runs every tickMs while the effect lasts;
 *  - end: runs when the effect expires, is stopped, or its target leaves;
 *  - overlay: what the target's screen shows while it lasts (visual cheats).
 */

export type ChaosCategory = 'score' | 'advantage' | 'troll' | 'economy' | 'round' | 'visual' | 'random';

export const CHAOS_CATEGORIES: readonly { id: ChaosCategory; label: string }[] = [
  { id: 'score', label: 'Score' },
  { id: 'advantage', label: 'Player advantage' },
  { id: 'troll', label: 'Trolling' },
  { id: 'economy', label: 'Economy and items' },
  { id: 'round', label: 'Round and game' },
  { id: 'visual', label: 'Visual and interface' },
  { id: 'random', label: 'Random and absurd' },
];

/**
 * Who a cheat is aimed at.
 * - self: the caster.
 * - opponent: one other player (not a teammate when there are teams).
 * - player: any one player, teammates and yourself included.
 * - teammate: one player on your own team, not yourself.
 * - everyone-else: every other player.
 * - everyone: every player, the caster included.
 * - enemy-team: a team other than the caster's.
 * - my-team: the caster's own team.
 * - room: the game itself (round, timer, rules); no player is targeted.
 */
export type ChaosTarget = 'self' | 'opponent' | 'player' | 'teammate' | 'everyone-else' | 'everyone' | 'enemy-team' | 'my-team' | 'room';

export type ParamField =
  | { key: string; label: string; kind: 'int'; min: number; max: number; default: number; step?: number; unit?: string }
  | { key: string; label: string; kind: 'choice'; options: readonly { value: string; label: string }[]; default: string }
  | { key: string; label: string; kind: 'player'; filter: 'other' | 'any' };

export type ParamValues = Record<string, number | string>;

/** A client-drawn effect on a viewer's screen. `kind` picks the renderer; the rest are its options. */
export interface ChaosOverlay {
  kind: string;
  [option: string]: unknown;
}

/** A number in a mode's state that cheats may read and change: a score, coins, rope position. */
export interface MeterDef<S = any> {
  key: string;
  label: string;
  scope: 'player' | 'team' | 'global';
  get(s: S, id: string, ctx: ModeContext): number;
  /** Write a value. The engine clamps to min/max first; set must keep the mode's own invariants. */
  set(s: S, id: string, value: number, ctx: ModeContext): void;
  /** Lowest value cheats may write (default 0). */
  min?: number | ((s: S, id: string, ctx: ModeContext) => number);
  max?(s: S, id: string, ctx: ModeContext): number;
  /** Round written values (most meters are whole numbers). Defaults to true. */
  integer?: boolean;
  /**
   * Whether cheats may rely on this meter with these settings (default: always). A meter that is
   * not offered still reads (rankings use it), but its 'meter:<key>' capability is left out, so
   * cheats that need it are not offered. Give it a min and max that stop writes as well.
   */
  offered?(settings: SettingValues): boolean;
}

/** How a mode's state looks to the chaos layer. Every mode has one. */
export interface ChaosAdapter<S = any> {
  modeId: string;
  /** Conventional keys: 'score' (the standing), 'currency' (a match economy), 'teamScore'. */
  meters: readonly MeterDef<S>[];
  /** Host-paced rounds, when the mode uses them. */
  sync?(s: S): SyncState | null;
  /** A player's own question stream, when the mode uses one. */
  stream?(s: S, id: PlayerId): StreamState | null;
  /** The question instance this player is answering now, if any. */
  question?(s: S, id: PlayerId, ctx: ModeContext): string | null;
  /** Whether a player has been knocked out, and how to bring them back. */
  isOut?(s: S, id: PlayerId): boolean;
  revive?(s: S, id: PlayerId, ctx: ModeContext): boolean;
  /** Extra capabilities a mode pack can rely on, e.g. 'rope', or 'losses' when play can take score away. May depend on the game's settings. */
  features?: readonly string[] | ((settings: SettingValues) => readonly string[]);
}

export interface ActiveEffect {
  eid: string;
  cheatId: string;
  castId: string;
  caster: PlayerId;
  /** Players it affects. Empty for room effects. */
  targets: PlayerId[];
  team: string | null;
  startedAt: number;
  endsAt: number;
  nextTickAt: number | null;
  params: ParamValues;
  /** Effect-owned scratch data (charges left, totals moved). Plain data only. */
  data: Record<string, unknown>;
  hostile: boolean;
}

export interface MeterChange {
  meter: string;
  id: string;
  delta: number;
}

export interface CastRecord {
  castId: string;
  caster: PlayerId;
  cheatIds: string[];
  at: number;
  /** Meter changes the instant part made, for undo. */
  changes: MeterChange[];
  effects: string[];
  undoableUntil: number;
  undone: boolean;
}

export interface CasterState {
  energy: number;
  energyAt: number;
  cooldowns: Record<string, number>;
  casts: number;
}

export interface ChaosLogEntry {
  at: number;
  kind: 'cast' | 'end' | 'undo' | 'stop' | 'calm' | 'combo' | 'reflect' | 'blocked';
  text: string;
  caster?: PlayerId;
  cheatId?: string;
  /** Players a cast affected. */
  targets?: PlayerId[];
}

/** All chaos state for one game. Plain data: cloned and rolled back with the mode's state. */
export interface ChaosState {
  effects: ActiveEffect[];
  casters: Record<PlayerId, CasterState>;
  casts: CastRecord[];
  log: ChaosLogEntry[];
  calmed: boolean;
  seq: number;
  totalCasts: number;
  usedBy: PlayerId[];
  /** How many times a lasting effect bent a mode change or refused an action (for tests and the teacher report). */
  acted: number;
}

export interface CastInput {
  caster: PlayerId;
  targets: PlayerId[];
  team: string | null;
  params: ParamValues;
}

/** Helpers every cheat hook receives. Bound to one transaction's draft state. */
export interface ChaosApi {
  readonly s: any;
  readonly ctx: ModeContext;
  readonly rng: Rng;
  readonly adapter: ChaosAdapter;
  now(): number;
  has(capability: string): boolean;
  meter(key: string): MeterDef | null;
  /** A meter's value (0 when the mode has no such meter). */
  get(key: string, id: string): number;
  /** Write a meter, clamped to its range. Returns the change actually made. */
  set(key: string, id: string, value: number): number;
  add(key: string, id: string, delta: number): number;
  score(id: PlayerId): number;
  addScore(id: PlayerId, delta: number): number;
  setScore(id: PlayerId, value: number): number;
  players(): readonly EnginePlayer[];
  ids(): PlayerId[];
  others(id: PlayerId): PlayerId[];
  opponents(id: PlayerId): PlayerId[];
  teammates(id: PlayerId): PlayerId[];
  teamOf(id: PlayerId): string | null;
  teams(): readonly EngineTeam[];
  members(teamId: string): PlayerId[];
  /** Player ids by a player meter, highest first (ties keep join order). */
  ranked(key?: string): PlayerId[];
  leader(key?: string): PlayerId | null;
  last(key?: string): PlayerId | null;
  name(id: PlayerId): string;
  feed(text: string, tone?: 'info' | 'good' | 'bad' | 'big', to?: PlayerId[]): void;
  effects(): readonly ActiveEffect[];
  effectsOn(id: PlayerId): ActiveEffect[];
  hasTag(id: PlayerId, tag: string): boolean;
  /** Start another cheat's effect from inside a hook (random and combo cheats). Returns its eid or an error. */
  spawn(cheatId: string, input: CastInput): string | { error: string };
  /** End an effect early. */
  endEffect(eid: string, reason: EndReason): void;
  sync(): SyncState | null;
  stream(id: PlayerId): StreamState | null;
  question(id: PlayerId): string | null;
  isOut(id: PlayerId): boolean;
  /** A caster's chaos energy and cooldowns (for cheats about chaos itself). */
  casterState(id: PlayerId): CasterState;
  /** Current chaos energy of a caster, after refilling. */
  energy(id: PlayerId): number;
  /** Set a caster's energy now. */
  setEnergy(id: PlayerId, value: number): void;
  /** The chaos log, newest last. */
  log(): readonly ChaosLogEntry[];
}

export type EndReason = 'expired' | 'stopped' | 'left' | 'calmed' | 'replaced' | 'used' | 'undone' | 'cleansed';

export type GateResult = void | { block: string };

export interface CheatHooks {
  gate?(api: ChaosApi, fx: ActiveEffect, playerId: PlayerId, action: unknown): GateResult;
  /** Keyed by meter. `d` maps id → change this transaction; edit it in place. */
  delta?: Record<string, (api: ChaosApi, fx: ActiveEffect, d: Record<string, number>) => void>;
  tick?(api: ChaosApi, fx: ActiveEffect): void;
  end?(api: ChaosApi, fx: ActiveEffect, reason: EndReason): void;
}

export interface CheatDef {
  id: string;
  name: string;
  category: ChaosCategory;
  description: string;
  target: ChaosTarget;
  /** Capabilities the game must have: 'meter:score', 'sync', 'stream', 'teams', 'question', 'revive', or an adapter feature. */
  needs?: readonly string[];
  /** Only these modes (mode packs). */
  modes?: readonly string[];
  params?: readonly ParamField[];
  /** Chaos energy spent (out of 100; it refills over time). */
  cost: number;
  cooldownMs: number;
  /** Present for cheats that last: the effect ends this long after casting. */
  durationMs?: number;
  tickMs?: number;
  /** Labels for conflict rules. Effects with a shared exclusive tag cannot sit on the same target. */
  tags?: readonly string[];
  /** Tags this cheat cannot share a target with. */
  conflicts?: readonly string[];
  /** Same cheat on the same target again: refresh its timer (default), stack a second copy, or refuse. */
  stacking?: 'refresh' | 'stack' | 'reject';
  /** Harms its targets; shields block it and it counts towards the pile-on limit. Defaults by target. */
  hostile?: boolean;
  /** Undo reverses the instant part's meter changes. Defaults to true. */
  undoable?: boolean;
  /** Lower runs first among delta hooks: redirects (10), multipliers (20), reversals (30), caps (40), floors (50). */
  priority?: number;
  apply?(api: ChaosApi, cast: CastInput, fx: ActiveEffect | null): void | { error: string };
  hooks?: CheatHooks;
  /** Drawn on the screens of its targets (or the caster, or everyone). */
  overlay?(fx: ActiveEffect): ChaosOverlay | null;
  overlayFor?: 'targets' | 'caster' | 'all';
}

/** Two or more cheats cast together that do something extra. */
export interface ComboDef {
  id: string;
  name: string;
  cheats: readonly string[];
  description: string;
  apply(api: ChaosApi, caster: PlayerId, effects: ActiveEffect[]): void;
}

export interface CastRequest {
  cheatId: string;
  /** A player id, a team id, or nothing (self, room, everyone). */
  target?: string | null;
  params?: Record<string, unknown>;
}

export type CastOutcome =
  | { ok: true; castId: string; effects: string[]; text: string; combo: string | null }
  | { ok: false; code: 'invalid_state' | 'rejected' | 'internal'; message: string };

/** One catalogue line as the menu shows it. No functions. */
export interface CheatInfo {
  id: string;
  name: string;
  category: ChaosCategory;
  description: string;
  target: ChaosTarget;
  params: readonly ParamField[];
  cost: number;
  cooldownMs: number;
  durationMs: number | null;
  tags: readonly string[];
  hostile: boolean;
  undoable: boolean;
  modes: readonly string[] | null;
  needs: readonly string[];
}

export interface ChaosEffectView {
  eid: string;
  cheatId: string;
  name: string;
  category: ChaosCategory;
  caster: PlayerId;
  casterName: string;
  targets: PlayerId[];
  team: string | null;
  startedAt: number;
  endsAt: number;
  hostile: boolean;
}

export interface ChaosView {
  calmed: boolean;
  casts: number;
  effects: ChaosEffectView[];
  overlays: ChaosOverlay[];
  /** Only for players who have unlocked chaos. */
  me: {
    energy: number;
    maxEnergy: number;
    regenPerSec: number;
    cooldowns: Record<string, number>;
    undo: { castId: string; names: string[]; until: number }[];
    /** What this game supports. The menu checks each cheat's needs against it (see cheatAvailability). */
    capabilities: string[];
  } | null;
}
