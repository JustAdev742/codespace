import { useSyncExternalStore } from 'react';
import type { RoomView } from '@ludora/shared';

/*
 * The podium ceremony: how the end of a competitive game is told. The podium is the last moment of the
 * game and its biggest, so in a room it is given time: third place, then second, then a held breath and
 * the winner, about seven seconds in all, on the big screen and on every phone together. Each screen
 * works out where the ceremony has got to from the server's clock (when the game ended), so they keep
 * step without a message between them, and a screen that opens late (or is reloaded) joins part-way
 * or, once it is over, simply shows the result.
 *
 * This file is the timeline and nothing else, so it can be tested: no React rendering, no sound.
 */

/** `show`: a room with other people in it. `brisk`: a solo game, where the player wants to get on. */
export type Pace = 'show' | 'brisk';

/** One place being revealed. Times are in ms from the game's end. */
export interface Beat {
  /** 0 is the winner, 1 second place, 2 third. */
  place: number;
  /** The block starts to rise out of the floor, and the caption names the place. */
  rise: number;
  riseMs: number;
  /** The player lands on it: their Glim, name and score. */
  land: number;
}

export interface Ceremony {
  pace: Pace;
  /** In the order they are revealed: the lowest place on the podium first, the winner last. */
  beats: Beat[];
  /** Everything else may appear: awards, the standings, the host's next steps, a player's own card. */
  done: number;
}

/** The room's ceremony: a beat to take in "Game over", then the places a breath apart, the winner after a hold. */
const SHOW = { first: 900, between: 1700, riseMs: 420, landAfter: 300, winnerAfter: 1500, winnerRiseMs: 1100, winnerLandAfter: 1000, after: 1600 };
/** A solo game's: the quick reveal Ludora has always had (about a second and a half). */
const BRISK = { rise: [900, 500, 150], riseMs: 360, landAfter: 260, after: 220 };

/** The fanfare opens with half a second of drum roll before its big chord, so it starts that long before the winner lands. */
export const FANFARE_LEAD_MS = 500;

/** The timeline for a podium of `places` (2 or 3; anything else is clamped) at a pace. */
export function ceremonyFor(places: number, pace: Pace): Ceremony {
  const n = Math.max(1, Math.min(3, Math.floor(places)));
  if (pace === 'brisk') {
    const beats = Array.from({ length: n }, (_, place) => ({ place, rise: BRISK.rise[place]!, riseMs: BRISK.riseMs, land: BRISK.rise[place]! + BRISK.landAfter })).sort((a, b) => a.rise - b.rise);
    return { pace, beats, done: beats[beats.length - 1]!.land + BRISK.after };
  }
  const beats: Beat[] = [];
  let at = SHOW.first;
  for (let place = n - 1; place >= 1; place--) {
    beats.push({ place, rise: at, riseMs: SHOW.riseMs, land: at + SHOW.landAfter });
    at += SHOW.between;
  }
  // The winner waits a little longer than the gap between the others, and rises slowly.
  const rise = beats.length ? beats[beats.length - 1]!.land + SHOW.winnerAfter : SHOW.first;
  beats.push({ place: 0, rise, riseMs: SHOW.winnerRiseMs, land: rise + SHOW.winnerLandAfter });
  return { pace, beats, done: rise + SHOW.winnerLandAfter + SHOW.after };
}

export interface Stage {
  /** How many beats have begun (their block is rising and their place has been named). */
  risen: number;
  /** How many beats have landed (their player is on the podium). */
  landed: number;
  done: boolean;
}

/** Where a ceremony has got to, `elapsed` ms after the game ended. */
export function stageAt(c: Ceremony, elapsed: number): Stage {
  return { risen: c.beats.filter((b) => elapsed >= b.rise).length, landed: c.beats.filter((b) => elapsed >= b.land).length, done: elapsed >= c.done };
}

/** A ceremony with nothing left to show: every place on the podium, everything else on screen. */
export const overStage = (c: Ceremony | null): Stage => ({ risen: c?.beats.length ?? 0, landed: c?.beats.length ?? 0, done: true });

/**
 * What the big screen calls a place as it is revealed: "3rd place", "2nd place", "The winner". Players
 * level on points share a rank, and are named for what they share ("Joint 1st"), so nobody level with
 * the winner is called second.
 */
export function placeTitle(standings: readonly { rank: number }[], place: number, ordinal: (n: number) => string): string {
  const rank = standings[place]?.rank ?? place + 1;
  if (standings.some((s, i) => i !== place && s.rank === rank)) return `Joint ${ordinal(rank)}`;
  return place === 0 ? 'The winner' : `${ordinal(rank)} place`;
}

/** When the winner lands. */
export const winnerLands = (c: Ceremony): number => c.beats[c.beats.length - 1]!.land;

/** When a player's own place is shown on the podium, or null if they are not on it. */
export function placeLands(c: Ceremony, place: number): number | null {
  return c.beats.find((b) => b.place === place)?.land ?? null;
}

/**
 * The pace of a room's ending on one screen, or null when it has no podium: a co-op game (the room
 * wins or loses together), a game with one player, or a mode with an ending of its own.
 */
export function ceremonyPace(room: Pick<RoomView, 'results'> & { room: Pick<RoomView['room'], 'solo'> }, ownEnding = false): Pace | null {
  const r = room.results;
  if (!r || ownEnding || r.outcome !== 'competitive' || r.standings.length < 2) return null;
  return room.room.solo ? 'brisk' : 'show';
}

/** How long ago the game ended, by the server's clock, when the view that says so arrived (0 if the server did not say). */
export function sinceEnd(room: Pick<RoomView, 'results' | 'serverNow'>, receivedAt: number, now = Date.now()): number {
  const endedAt = room.results?.endedAt;
  if (typeof endedAt !== 'number') return 0;
  return Math.max(0, room.serverNow + (now - receivedAt) - endedAt);
}

/* --------------------------------- the fanfare and the music --------------------------------- */

/*
 * The results music follows the fanfare, and in a room the fanfare waits for the winner. The results
 * screen says here when the fanfare has started (or that there will not be one), and the room's music
 * (music.ts) holds its peace until then.
 */

const started = new Set<string>();
const listeners = new Set<() => void>();

/** Names one game's ending in one room. */
export const endingKey = (room: Pick<RoomView, 'results'> & { room: Pick<RoomView['room'], 'code'> }): string => `${room.room.code}|${room.results?.endedAt ?? room.results?.durationMs ?? 0}`;

/** The fanfare for this ending has started (or the ceremony was over before this screen opened): the music may follow. */
export function fanfareStarted(key: string) {
  if (started.has(key)) return;
  // Only the newest endings matter; a long session of Play again does not grow this for ever.
  if (started.size > 20) started.clear();
  started.add(key);
  for (const l of listeners) l();
}

export const hasFanfareStarted = (key: string): boolean => started.has(key);

export function useFanfareStarted(key: string): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => started.has(key),
    () => true,
  );
}
