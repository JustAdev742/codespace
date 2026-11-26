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
