import { roomOptionsSchema, type RoomOptions } from '@ludora/shared';
import type { Config } from '../../config.ts';
import { defaultCalmPlay, type Preferences } from '../users/preferences.ts';

type CopyConfig = Pick<Config, 'SCHOOL_THEME' | 'TUTORIAL_DEFAULT' | 'CALM_PLAY_DEFAULT'>;

/**
 * Calm play on this copy when a host has not chosen for themselves: CALM_PLAY_DEFAULT when the
 * operator set it, else on for a school's own copy (SCHOOL_THEME) and off elsewhere.
 */
export function copyCalmPlay(config: CopyConfig): boolean {
  return config.CALM_PLAY_DEFAULT ? config.CALM_PLAY_DEFAULT === 'on' : Boolean(config.SCHOOL_THEME);
}

/**
 * What a new game of this host's starts with when they say nothing: their saved calm play choice or
 * this copy's, and the walkthrough unless this copy turns it off. The host page shows these as its
 * switches (served with the account, auth/routes.ts).
 */
export function hostingDefaults(config: CopyConfig, host: Pick<Preferences, 'host'>): { calmPlay: boolean; tutorial: boolean } {
  return { calmPlay: defaultCalmPlay(host, copyCalmPlay(config)), tutorial: config.TUTORIAL_DEFAULT !== 'off' };
}

/**
 * The options of a new room: what the request says, and for what it leaves out the host's saved
 * choices and this copy's defaults. Every way of making a room goes through here (a hosted game, a
 * solo game, a lesson, an assignment, a friend challenge, daily practice), so they all agree.
 */
export function newRoomOptions(config: CopyConfig, host: Pick<Preferences, 'host'>, given: Partial<RoomOptions> = {}): RoomOptions {
  const d = hostingDefaults(config, host);
  return roomOptionsSchema.parse({
    ...given,
    calmPlay: given.calmPlay ?? d.calmPlay,
    tutorial: given.tutorial ?? d.tutorial,
  });
}
