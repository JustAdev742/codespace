import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../lib/api.ts';
import { Panel } from '../../ui/primitives.tsx';
import { ButtonLink } from '../../ui/Button.tsx';
import { Hammer } from 'lucide-react';
import { MadeGameActions, MadeGameCard } from './MadeGameCard.tsx';
import type { MadeGameCardData } from './data.ts';

/** A maker's public made games, for their profile. Shows nothing when they have none. */
export function MakerGames({ userId, name, self }: { userId: string; name: string; self: boolean }) {
  const list = useQuery({ queryKey: ['blueprints', 'maker', userId], queryFn: () => api.get<{ games: MadeGameCardData[] }>(`/api/blueprints?scope=public&maker=${userId}`), enabled: /^[0-9a-f-]{36}$/i.test(userId) });
  const games = list.data?.games ?? [];
  if (!games.length) return null;
  return (
    <Panel className="rounded-[var(--radius-l)] p-5" aria-labelledby="maker-games">
      <h2 id="maker-games" className="mb-3 font-display text-2xl font-bold">
        {self ? 'Games you made' : `Games ${name} made`}
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {games.slice(0, 6).map((g) => (
          <MadeGameCard key={g.id} g={g} actions={<MadeGameActions g={g} />} />
        ))}
      </ul>
      {self ? (
        <Link to="/mode-studio" className="mt-3 inline-block font-semibold text-link underline underline-offset-2">
          Open Mode Studio
        </Link>
      ) : null}
    </Panel>
  );
}

/** A line for a set's page: play this set in a made game (the host page lists them for this set). */
export function PlayInMadeGame({ setId }: { setId: string }) {
  return (
    <ButtonLink to={`/host?set=${setId}#host-made-games`} variant="ghost" icon={<Hammer className="size-4" aria-hidden />}>
      In a made game
    </ButtonLink>
  );
}
