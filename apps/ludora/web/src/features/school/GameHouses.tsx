import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.ts';
import { formatNumber } from '../../lib/format.ts';
import { useMe } from '../../lib/session.ts';
import { HouseCrest } from './emblems.tsx';
import type { RankedHouse } from './schoolData.ts';

/*
 * House points a finished game earned, by house, on the results screen. The server pays them as
 * the game is saved, a moment after it ends, so this asks again a few times until they are in.
 * Shows nothing when no player was in a house. Totals only.
 */
export function GameHouses({ gameId }: { gameId: string | null }) {
  // Houses belong to accounts: a player who joined with only a name has no session to ask with
  // (and no house), so their device does not ask.
  const me = useMe();
  const q = useQuery({
    queryKey: ['school', 'game-houses', gameId],
    queryFn: () => api.get<{ houses: (RankedHouse & { players: number })[] }>(`/api/school/games/${gameId}/houses`),
    enabled: Boolean(gameId) && Boolean(me.data?.user),
    retry: false,
    refetchInterval: (query) => (query.state.data?.houses.length || query.state.dataUpdateCount >= 4 ? false : 1500),
  });
  const houses = q.data?.houses ?? [];
  if (!houses.length) return null;
  return (
    <section aria-labelledby="game-houses" className="stage-card p-4">
      <h2 id="game-houses" className="mb-3 font-display text-2xl font-bold">
        House points
      </h2>
      <ol className="grid gap-2 sm:grid-cols-2">
        {houses.map((h) => (
          <li key={h.id} className="flex items-center gap-3">
            <HouseCrest house={h} size={40} />
            <span className="min-w-0 flex-1 truncate font-semibold">{h.name}</span>
            <span className="font-display text-2xl font-extrabold italic tabular">
              +{formatNumber(h.points)}
              <span className="sr-only"> points</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
