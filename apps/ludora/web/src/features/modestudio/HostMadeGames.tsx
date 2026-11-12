import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Hammer, Play, Presentation } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { Panel } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { MadeGameCard } from './MadeGameCard.tsx';
import type { MadeGameCardData, MadeGameFull } from './data.ts';

/*
 * The host page's one section for made games, beside the built-in modes: "Made by you" and "Made
 * by others", or the one game the page was opened for (?blueprint=). It uses the set chosen in
 * step 1 and creates the room itself; the server checks the host may play the game.
 */
export function HostMadeGames({ setId, setTitle, solo }: { setId: string | null; setTitle: string | null; solo: boolean }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const chosenId = params.get('blueprint');
  const [busy, setBusy] = useState<string | null>(null);
  const chosen = useQuery({ queryKey: ['blueprint', chosenId], queryFn: () => api.get<{ game: MadeGameFull }>(`/api/blueprints/${chosenId}`), enabled: Boolean(chosenId) });
  const mine = useQuery({ queryKey: ['blueprints', 'mine', ''], queryFn: () => api.get<{ games: MadeGameCardData[] }>('/api/blueprints?scope=mine') });
  const others = useQuery({ queryKey: ['blueprints', 'public', ''], queryFn: () => api.get<{ games: MadeGameCardData[] }>('/api/blueprints?scope=public') });

  const start = async (g: MadeGameCardData) => {
    if (!setId) return;
    setBusy(g.id);
    try {
      const res = await api.post<{ code: string }>('/api/rooms', { setId, modeId: 'made-game', blueprintId: g.id, solo, ...(solo ? { practiceBots: { count: 3, level: 'mixed' } } : {}) });
      navigate(`/room/${res.code}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not start the game.');
    } finally {
      setBusy(null);
    }
  };
  const action = (g: MadeGameCardData) =>
    g.playable ? (
      <Button size="sm" variant="primary" icon={solo ? <Play className="size-4" aria-hidden /> : <Presentation className="size-4" aria-hidden />} disabled={!setId} loading={busy === g.id} onClick={() => void start(g)} aria-label={`${solo ? 'Play' : 'Host'} with these questions: ${g.name}`}>
        {solo ? 'Play' : 'Host'} with these questions
      </Button>
    ) : (
      <p className="text-sm text-text-2">This game cannot be played right now.</p>
    );

  const top = chosen.data?.game ?? null;
  const mineList = (mine.data?.games ?? []).filter((g) => g.id !== top?.id).slice(0, 6);
  const otherList = (others.data?.games ?? []).filter((g) => g.id !== top?.id && !g.mine).slice(0, 6);
  return (
    <Panel className="p-5" aria-labelledby="host-made-games">
      <h2 id="host-made-games" className="mb-1 flex items-center gap-2 font-display text-2xl font-bold">
        <Hammer className="size-5" aria-hidden /> Games made in Game Maker
      </h2>
      <p className="mb-3 text-sm text-text-2">{setId ? `They play with “${setTitle}”.` : 'Pick questions in step 1 first, then choose a made game here.'}</p>
      {chosenId && chosen.isError ? <p className="mb-3 font-semibold">That made game could not be opened. It may be private or deleted.</p> : null}
      {top ? (
        <ul className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MadeGameCard g={top} actions={action(top)} />
        </ul>
      ) : null}
      {mineList.length ? (
        <>
          <h3 className="mb-2 font-display text-xl font-bold">Made by you</h3>
          <ul className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {mineList.map((g) => (
              <MadeGameCard key={g.id} g={g} actions={action(g)} />
            ))}
          </ul>
        </>
      ) : null}
      {otherList.length ? (
        <>
          <h3 className="mb-2 font-display text-xl font-bold">Made by others</h3>
          <ul className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {otherList.map((g) => (
              <MadeGameCard key={g.id} g={g} actions={action(g)} />
            ))}
          </ul>
        </>
      ) : null}
      <ButtonLink to="/game-maker" size="sm" variant="secondary">
        Open Game Maker
      </ButtonLink>
    </Panel>
  );
}
