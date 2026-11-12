import { useEffect, useRef } from 'react';
import { amountOf, type RoomPlayerView } from '@ludora/shared';
import type { MadeView } from '@ludora/engine';
import { Stage3D } from '../../../three/index.ts';
import { avatarOf, fallbackArt } from '../game/stage.tsx';
import { MadePathScene, lookOf, type PathRunner } from './made-game-scene.ts';

/*
 * The 3D picture of a made race or climb. The board under it is the drawn 2D picture and the
 * text equivalent; with 3D off this draws nothing, since that board is already on screen.
 */
export default function MadeScene3D({ view, players, me, big }: { view: MadeView; players: RoomPlayerView[]; me: string | null; big: boolean }) {
  const scene = useRef<MadePathScene | null>(null);
  const runners: PathRunner[] = view.rows.map((r) => ({ playerId: r.playerId, name: r.name, score: r.score, me: r.playerId === me, look: lookOf(avatarOf(players, r.playerId), fallbackArt(r.playerId)) }));
  const key = JSON.stringify(view.game.look) + view.game.kind.type;
  const latest = useRef(runners);
  latest.current = runners;
  useEffect(() => scene.current?.setRunners(runners), [runners]);
  const leader = view.rows[0];
  return (
    <Stage3D<MadePathScene>
      key={key}
      label={`${view.game.name}: ${leader ? `${leader.name} leads with ${amountOf(leader.score, view.game.unit)}` : 'the start line'}.`}
      create={(env) => new MadePathScene(env, view.game, big)}
      onWorld={(w) => {
        scene.current = w;
        w?.setRunners(latest.current);
      }}
      className={big ? 'h-[clamp(14rem,38vh,30rem)] rounded-[var(--radius-l)]' : 'h-[min(34vh,16rem)] min-h-[180px] rounded-[var(--radius-l)]'}
      fallback={null}
    />
  );
}
