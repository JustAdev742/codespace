import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CardExpression, CardPose, GlimArt, GoalMetric } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';

/*
 * A player's own choices outside games (GET /api/me/extras): favourites, the weekly goal,
 * the shop wishlist, saved outfits, Glim nicknames, the title they earned, their card pose
 * and the help cards they closed. One query, shared by every page that shows any of them.
 */

export type FavouriteKind = 'modes' | 'sets' | 'glims';

export interface Outfit {
  id: string;
  name: string;
  items: Partial<Record<string, string>>;
}

export interface Extras {
  favourites: Record<FavouriteKind, string[]>;
  goal: { metric: GoalMetric; target: number } | null;
  wishlist: string[];
  outfits: Outfit[];
  nicknames: Record<string, string>;
  title: string | null;
  earnedTitle: { id: string; text: string } | null;
  card: { pose: CardPose; expression: CardExpression };
  help: { dismissed: string[] };
  /** Starred sets the player can still open, with what a list needs to show them. */
  favouriteSets: { id: string; title: string; subject: string; cover: { glyph: string; hue: number } | null; questionCount: number }[];
}

export const extrasKey = ['extras'] as const;

export function useExtras() {
  const me = useMe();
  return useQuery({ queryKey: extrasKey, queryFn: () => api.get<Extras>('/api/me/extras'), enabled: Boolean(me.data?.user), staleTime: 30_000 });
}

export const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** Star or unstar a mode, set or Glim, updating every list straight away and putting it back if the server refuses. */
export function useFavourite(kind: FavouriteKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean; label: string }) => (on ? api.put(`/api/me/favourites/${kind}/${encodeURIComponent(id)}`) : api.delete(`/api/me/favourites/${kind}/${encodeURIComponent(id)}`)),
    onMutate: async ({ id, on }) => {
      await qc.cancelQueries({ queryKey: extrasKey });
      const before = qc.getQueryData<Extras>(extrasKey);
      if (before) qc.setQueryData<Extras>(extrasKey, { ...before, favourites: { ...before.favourites, [kind]: on ? [id, ...before.favourites[kind].filter((x) => x !== id)] : before.favourites[kind].filter((x) => x !== id) } });
      return { before };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(extrasKey, ctx.before);
      toast.error(errorMessage(err, 'That star did not save. Try again.'));
    },
    onSuccess: (_d, { on, label }) => toast.success(on ? `${label} added to your favourites` : `${label} taken out of your favourites`),
    onSettled: () => qc.invalidateQueries({ queryKey: extrasKey }),
  });
}

/** The face each card expression gives a Glim. "own" keeps the Glim's own face. */
export const EXPRESSION_FACE: Record<CardExpression, Partial<Pick<GlimArt, 'eyes' | 'mouth'>>> = {
  own: {},
  happy: { eyes: 'happy', mouth: 'grin' },
  cool: { eyes: 'half', mouth: 'smirk' },
  fierce: { eyes: 'dot', mouth: 'fang' },
  surprised: { eyes: 'big', mouth: 'o' },
};

export const EXPRESSION_LABEL: Record<CardExpression, string> = { own: 'Its own face', happy: 'Happy', cool: 'Cool', fierce: 'Fierce', surprised: 'Surprised' };
export const POSE_LABEL: Record<CardPose, string> = { stand: 'Standing', wave: 'Waving', cheer: 'Cheering' };
export const glimPose = (p: CardPose) => (p === 'stand' ? 'idle' : p);
