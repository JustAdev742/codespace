import { useQuery } from '@tanstack/react-query';
import { seasonView, type SeasonView } from '@ludora/content/seasons';
import { api } from './api.ts';

/*
 * Today's season, as the server sees it (staff can move a celebration for a
 * year). Until the server answers, and in the demo, which has no server, the
 * browser works it out from the same calendar.
 */

/* The latest view, for code outside React Query (the 3D stage reads it when a scene starts). */
let latest: SeasonView | null = null;

/** Today's theme: the server's if it has answered, otherwise worked out here. */
export function seasonTheme(): SeasonView['theme'] {
  return (latest ?? seasonView(new Date())).theme;
}

export function useSeason() {
  return useQuery({
    queryKey: ['season'],
    queryFn: async (): Promise<SeasonView> => {
      try {
        latest = await api.get<SeasonView>('/api/season');
      } catch {
        latest = seasonView(new Date());
      }
      return latest;
    },
    placeholderData: () => seasonView(new Date()),
    staleTime: 10 * 60_000,
    // Past midnight the season may have turned; an open tab picks it up within the hour.
    refetchInterval: 60 * 60_000,
  });
}

export type { SeasonView };
