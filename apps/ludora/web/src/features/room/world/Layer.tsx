import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { RoomView } from '@ludora/shared';
import { fallbackArt } from '../game/stage.tsx';
import { boardWorldWanted, lookOf, rightAtReveal, shotFor, worldAct, worldCheer, type Actor } from './gate.ts';

const BoardStage = lazy(() => import('./BoardStage.tsx'));

/**
 * The board's world behind a room (D63), where this screen draws it (gate.ts); nothing at all where
 * it does not, and the board keeps its own backdrop. The world is the place for the lobby, a game
 * played in rounds and the results. A game with a board of its own (a race, a market, a 3D scene)
 * has the screen to itself while it is played, and the world waits behind it.
 */
export function BoardWorldLayer({ room }: { room: RoomView }) {
  const [wanted] = useState(boardWorldWanted);
  const signature = room.players.map((p) => `${p.id}|${p.name}|${p.avatar ? JSON.stringify(p.avatar.art) : ''}`).join(';');
  // The same people in the same Glims are the same crowd, however often the room's view arrives.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const actors = useMemo<Actor[]>(() => room.players.map((p) => ({ id: p.id, name: p.name, look: lookOf(p.avatar, fallbackArt(p.id)) })), [signature]);
  const sync = (room.game as { sync?: { phase?: string; round?: number; answered?: number; reveal?: { type: string; correct?: unknown } | null; distribution?: Record<string, number> | null } } | null)?.sync;

  // A Glim waves when its player taps Ready. Whoever was ready when this screen opened is simply ready.
  const ready = room.players.filter((p) => p.ready).map((p) => p.id).join(',');
  const wasReady = useRef<Set<string> | null>(null);
  useEffect(() => {
    const now = new Set(ready ? ready.split(',') : []);
    if (wanted && wasReady.current) for (const id of now) if (!wasReady.current.has(id)) worldAct(id, 'wave');
    wasReady.current = now;
  }, [ready, wanted]);

  // The class cheers together when at least half of it was right. Nobody is singled out, and nothing marks a wrong answer:
  // the board is not told who was right, only how many picked each answer.
  const revealed = sync?.phase === 'reveal' ? (sync.round ?? null) : null;
  useEffect(() => {
    if (!wanted || revealed === null) return;
    const right = rightAtReveal(sync?.reveal, sync?.distribution);
    if (right === null || !sync?.answered || right * 2 < sync.answered) return;
    // After the answer has landed on the tiles (Reveal.tsx), so the cheer answers it.
    const t = setTimeout(worldCheer, 900);
    return () => clearTimeout(t);
    // Once per reveal: the round names it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, wanted]);

  if (!wanted) return null;
  const live = room.room.status === 'running' || room.room.status === 'paused';
  const rounds = Boolean(sync);
  return (
    <Suspense fallback={null}>
      <BoardStage actors={actors} shot={shotFor({ status: room.room.status, phase: sync?.phase, outcome: room.results?.outcome, standings: room.results?.standings.length })} modeId={room.room.modeId} hidden={live && !rounds} />
    </Suspense>
  );
}
