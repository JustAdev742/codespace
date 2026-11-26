/*
 * The board's world, from the outside: whether this screen draws it, whether it is up, and the few
 * things the page tells it (who is on the podium, whose Glim just hopped). Small, and loaded with
 * the page; the world itself (three.js and the scene) is fetched only where it will be drawn.
 */

import { useSyncExternalStore } from 'react';
import { dataSaverOn } from '../../../lib/prefs.ts';
import { webglSupported } from '../../../three/quality.ts';
import { fxLevel, fxSoftware } from '../../../fx/index.ts';
import type { GlimLook } from '../../../three/glimTexture.ts';

/** The moments of a game the camera knows. */
export type Shot = 'lobby' | 'ready' | 'question' | 'reveal' | 'standings' | 'podium';

/** The worlds a game can be played in (themes.ts). */
export type WorldId = 'festival' | 'cosmos' | 'market' | 'gloom' | 'hills';

/** The modes that have a world of their own; every other mode plays at the lantern festival. */
const WORLD_OF: Record<string, WorldId> = {
  'comet-dash': 'cosmos',
  'sky-lanterns': 'cosmos',
  'summit-scramble': 'cosmos',
  'time-attack': 'cosmos',
  'night-market': 'market',
  'corner-shop': 'market',
  'festival-workshop': 'market',
  'gold-rush': 'market',
  'gloom-giant': 'gloom',
  'lantern-guard': 'gloom',
  'lantern-out': 'gloom',
  'glow-tag': 'gloom',
  'survival-run': 'gloom',
};

/** Which world a game is played in. A school's copy keeps to its own place, whatever the game (D60). */
export function worldFor(modeId: string, school: string | null): WorldId {
  if (school === 'hills-grammar') return 'hills';
  return WORLD_OF[modeId] ?? 'festival';
}

/** What the camera needs to know of a room: where the game has got to. */
export interface RoomMoment {
  status: string;
  /** The phase of a game played in rounds, if it is one. */
  phase?: string | undefined;
  /** How the game ended and how many stood at the end, once it has. */
  outcome?: string | undefined;
  standings?: number | undefined;
}

/** Which moment of the game the camera is on. */
export function shotFor(m: RoomMoment): Shot {
  if (m.status === 'lobby') return 'lobby';
  // A podium needs places to give: a game that was a race between at least two.
  if (m.status === 'ended') return m.outcome === 'competitive' && (m.standings ?? 0) >= 2 ? 'podium' : 'lobby';
  if (m.phase === 'intro') return 'ready';
  if (m.phase === 'reveal') return 'reveal';
  if (m.phase === 'leaderboard' || m.phase === 'done') return 'standings';
  return 'question';
}

export interface Actor {
  id: string;
  name: string;
  look: GlimLook;
}

/**
 * The Glim a player shows in the world: their own buddy, or a stand-in that is always the same for
 * them. (The same rule as three/glim3d.ts `lookFor`, kept here so that asking for it does not fetch
 * the 3D engine: this file loads with the page.)
 */
export function lookOf(avatar: { art: GlimLook['art']; accessories?: GlimLook['accessories']; rarity?: GlimLook['rarity']; uniform?: GlimLook['dress'] } | null | undefined, fallback: GlimLook['art']): GlimLook {
  return avatar ? { art: avatar.art, accessories: avatar.accessories, rarity: avatar.rarity, dress: avatar.uniform ?? null } : { art: fallback, dress: null };
}

/** A place on the podium: who stands there and what their plate says. */
export interface PodiumPlace extends Actor {
  /** 0 is the winner. */
  place: number;
  score: string;
}

export interface PodiumState {
  places: PodiumPlace[];
  /** The ceremony's order: the index of each place as it is revealed (third place first). */
  order: number[];
  risen: number;
  landed: number;
}

/**
 * Whether this screen draws the world: where the stage's effects are up and a graphics chip will draw
 * it (fx/decide.ts), and not on data saver. Less motion does not rule it out: there it is a still
 * picture. Everywhere else the board keeps the look it has always had.
 */
export function boardWorldWanted(): boolean {
  return fxLevel() !== 'plain' && webglSupported() && !fxSoftware() && !dataSaverOn();
}

let up = false;
const upListeners = new Set<() => void>();

/** The world is drawing (or has stopped): the page's own flat pieces give way to it, or come back. */
export function worldSetUp(on: boolean) {
  if (up === on) return;
  up = on;
  if (on) document.documentElement.dataset.world = 'on';
  else delete document.documentElement.dataset.world;
  upListeners.forEach((l) => l());
}

export function useWorldUp(): boolean {
  return useSyncExternalStore(
    (l) => {
      upListeners.add(l);
      return () => upListeners.delete(l);
    },
    () => up,
    () => false,
  );
}

/* What the page tells the world. The world reads these when it is told something changed. */

export const told: { podium: PodiumState | null; acts: { id: string; what: 'hop' | 'cheer' | 'wave' }[]; cheers: number } = { podium: null, acts: [], cheers: 0 };
const toldListeners = new Set<() => void>();
const tell = () => toldListeners.forEach((l) => l());

export function onTold(l: () => void): () => void {
  toldListeners.add(l);
  return () => toldListeners.delete(l);
}

/** The podium as the ceremony stands (ceremony.ts), or null when there is none. */
export function worldPodium(p: PodiumState | null) {
  told.podium = p;
  tell();
}

/** One player's Glim does something on the stage. */
export function worldAct(id: string, what: 'hop' | 'cheer' | 'wave') {
  if (!up) return;
  told.acts.push({ id, what });
  tell();
}

/** The whole class cheers. */
export function worldCheer() {
  if (!up) return;
  told.cheers++;
  tell();
}
