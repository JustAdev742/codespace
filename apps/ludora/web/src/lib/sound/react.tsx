import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import type { Pacing } from '@ludora/shared';
import { useMe } from '../session.ts';
import { sound, type MusicEntry } from './engine.ts';
import type { SfxName, SfxOptions } from './sfx.ts';
import type { MusicId } from './assets.generated.ts';

/*
 * Sound for React screens. A game room says whose screen it is: the host's
 * (the projector), a player's phone, or a solo game. Phones keep to short
 * effects about their own answers; the big screen and solo games also get the
 * clock ticks and the music, so a class of thirty phones never plays thirty
 * copies of the same thing.
 */

export type SoundRole = 'host' | 'player' | 'solo' | 'page';

/** Whose screen this is, and how the game moves on (results come at once in self-paced games). */
export const SoundRoleContext = createContext<{ role: SoundRole; pacing: Pacing | null }>({ role: 'page', pacing: null });

export const useSoundRole = () => useContext(SoundRoleContext).role;

export const useSoundPacing = () => useContext(SoundRoleContext).pacing;

/** Whether this screen carries the room's shared sounds (clock, music, reveals). */
export const useSharedSounds = () => {
  const role = useSoundRole();
  return role === 'host' || role === 'solo';
};

export function useSoundState() {
  return useSyncExternalStore(sound.subscribe, sound.getState, sound.getState);
}

/** Keeps the engine in step with the account's Settings. Signed out, both stay on. */
export function SoundSettingsSync() {
  const prefs = useMe().data?.user?.preferences;
  const effects = prefs?.sound ?? true;
  const music = prefs?.music ?? true;
  useEffect(() => sound.setPrefs({ effects, music }), [effects, music]);
  return null;
}

/** Plays `name` when `key` changes (and when the component appears), if `enabled`. */
export function useSfx(name: SfxName, key: unknown, enabled = true, options?: SfxOptions) {
  const latest = useRef({ name, enabled, options });
  latest.current = { name, enabled, options };
  useEffect(() => {
    const { name: n, enabled: on, options: o } = latest.current;
    if (on) sound.play(n, o);
  }, [key]);
}

/** The music for this screen; null for none. Stops when the screen goes. `entry` delays a track's start. */
export function useMusic(track: MusicId | null, entry?: MusicEntry) {
  const delay = entry?.delay;
  const fade = entry?.fade;
  useEffect(() => {
    sound.setMusic(track, delay === undefined || fade === undefined ? undefined : { delay, fade });
  }, [track, delay, fade]);
  useEffect(() => () => sound.setMusic(null), []);
}

/** Fetches tracks this screen is likely to want next, so they start without a wait. */
export function usePrefetchMusic(tracks: MusicId[], enabled = true) {
  const key = tracks.join(' ');
  useEffect(() => {
    if (enabled && key) sound.prefetchMusic(key.split(' ') as MusicId[]);
  }, [key, enabled]);
}

export const playSfx = (name: SfxName, options?: SfxOptions) => sound.play(name, options);
