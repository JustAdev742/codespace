import { lazy, Suspense, useMemo, useState } from 'react';
import type { RoomView } from '@ludora/shared';
import { fallbackArt } from '../game/stage.tsx';
import { boardWorldWanted, lookOf, shotFor, type Actor } from './gate.ts';

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
  if (!wanted) return null;
  const live = room.room.status === 'running' || room.room.status === 'paused';
  const rounds = Boolean((room.game as { sync?: unknown } | null)?.sync);
  return (
    <Suspense fallback={null}>
      <BoardStage actors={actors} shot={shotFor({ status: room.room.status, phase: (room.game as { sync?: { phase?: string } } | null)?.sync?.phase, outcome: room.results?.outcome, standings: room.results?.standings.length })} modeId={room.room.modeId} hidden={live && !rounds} />
    </Suspense>
  );
}
