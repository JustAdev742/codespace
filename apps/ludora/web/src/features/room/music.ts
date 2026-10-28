import { useEffect, useState } from 'react';
import type { RoomView } from '@ludora/shared';
import type { MusicId } from '../../lib/sound/assets.generated.ts';
import { useMusic, usePrefetchMusic, type SoundRole } from '../../lib/sound/react.tsx';

/*
 * The music in a game room. It plays on the host's screen and in solo games,
 * never on players' phones: lobby music while people arrive, each mode's own
 * track during the game, the final-stretch track for the last half minute or
 * the last questions, and the results music once the fanfare has played. It
 * rests while the game is paused.
 */

/** Each mode's track; a mode not listed plays the game track. */
export const MODE_MUSIC: Record<string, MusicId> = {
  classic: 'game',
  'comet-dash': 'game',
  'lantern-out': 'game',
  'quick-draw': 'battle',
  'time-attack': 'battle',
  'survival-run': 'battle',
  'gloom-giant': 'battle',
  'tug-of-war': 'battle',
  'glim-duels': 'battle',
  'glow-tag': 'battle',
  'lantern-guard': 'battle',
  glimgo: 'market',
  'sky-lanterns': 'market',
  'night-market': 'market',
  'festival-workshop': 'market',
  'lantern-trail': 'market',
  'gold-rush': 'market',
  'lantern-lands': 'game',
  confidence: 'calm',
  'lantern-match': 'calm',
  'word-scramble': 'calm',
  'flashcard-study': 'calm',
  'big-catch': 'calm',
};

/** How long before a timed game's end the final-stretch track comes in. */
export const STRETCH_MS = 30_000;

/** At the end, the music waits for the fanfare (or the gentler sting after a lost co-op game). */
const AFTER_THE_FANFARE = { delay: 2.4, fade: 1.5 };

type GameShape = Record<string, unknown>;

/** Modes with their own idea of a final stretch; `false` for none (studying at your own pace). */
const STRETCH: Record<string, false | ((g: GameShape, now: number) => boolean)> = {
  'flashcard-study': false,
  'gloom-giant': (g, now) => g.enraged === true || genericStretch(g, now),
};

function genericStretch(g: GameShape, now: number): boolean {
  // A mode can say so itself.
  if (typeof g.finalStretch === 'boolean') return g.finalStretch;
  if (typeof g.endsAt === 'number') {
    const left = g.endsAt - now;
    return left > 0 && left <= STRETCH_MS;
  }
  // Question-by-question games: the last question, or the last two of a long game.
  const rounds = (g.sync && typeof g.sync === 'object' ? g.sync : g) as GameShape;
  if (typeof rounds.round === 'number' && typeof rounds.total === 'number' && rounds.total >= 3) {
    const left = rounds.total - rounds.round;
    return left <= (rounds.total >= 10 ? 2 : 1);
  }
  return false;
}

/** Whether a running game is in its final stretch, from the mode's view and the game clock. */
export function inFinalStretch(modeId: string, game: unknown, now: number): boolean {
  if (!game || typeof game !== 'object') return false;
  const rule = STRETCH[modeId];
  if (rule === false) return false;
  return (rule ?? genericStretch)(game as GameShape, now);
}

/** The track for this screen of the room, or null for silence. */
export function roomMusic(room: RoomView | null, role: SoundRole, stretch: boolean): MusicId | null {
  if (!room) return null;
  const status = room.room.status;
  if (status === 'lobby') return role === 'host' ? 'lobby' : null;
  if (role !== 'host' && role !== 'solo') return null;
  if (status === 'running') return stretch ? 'intense' : (MODE_MUSIC[room.room.modeId] ?? 'game');
  // A class that lost a co-op game gets the gentle track, not the celebration.
  if (status === 'ended') return room.results?.outcome === 'coop-loss' ? 'calm' : 'results';
  return null;
}

/** Plays the room's music, checking the clock once a second for the final stretch. */
export function useRoomMusic(room: RoomView | null, role: SoundRole, gameNow: (() => number) | undefined) {
  const [stretch, setStretch] = useState(false);
  const running = room?.room.status === 'running';
  const modeId = room?.room.modeId ?? '';
  const game = room?.game;
  useEffect(() => {
    if (!running || !gameNow) {
      setStretch(false);
      return;
    }
    // Setting the same value again does not re-render, so the room only renders when the stretch begins.
    const check = () => setStretch(inFinalStretch(modeId, game, gameNow()));
    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [running, modeId, game, gameNow]);
  useMusic(roomMusic(room, role, stretch), room?.room.status === 'ended' ? AFTER_THE_FANFARE : undefined);
  const shared = role === 'host' || role === 'solo';
  const next: MusicId[] = room?.room.status === 'lobby' ? [MODE_MUSIC[modeId] ?? 'game', 'intense', 'results'] : running ? ['intense', 'results'] : [];
  usePrefetchMusic(next, shared);
}
