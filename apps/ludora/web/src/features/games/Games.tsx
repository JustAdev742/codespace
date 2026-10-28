import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Box, Link2, Play, Trash2, Wand2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { Badge, Dialog, EmptyState, ErrorNotice, PageHeader, Skeleton, Tabs } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import type { MadeGame } from './SaveGameDialog.tsx';

/*
 * The Game Maker: games players made from any mode, 2D or 3D. Making one
 * happens on the host page (pick a set and a mode, tune it, Save as a game);
 * this page lists your games and the community's, to host in one tap or
 * share by link.
 */

type ListedGame = Omit<MadeGame, 'settings' | 'common' | 'options'>;

const VISIBILITY: Record<MadeGame['visibility'], string> = { private: 'Only you', unlisted: 'Link only', public: 'Community' };

function GameCard({ g }: { g: ListedGame }) {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/games/${g.id}`),
    onSuccess: async () => {
      toast.success(`${g.title} deleted`);
      setDeleting(false);
      await qc.invalidateQueries({ queryKey: ['games'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not delete it.'),
  });
  const share = async () => {
    const url = `${location.origin}/host?game=${g.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied. Anyone with it can host your game.');
    } catch {
      toast.message(url);
    }
  };
  return (
    <li className="flex flex-col overflow-hidden rounded-[var(--radius-l)] border border-line bg-raised">
      <div className="relative">
        <ModeArt thumb={{ glyph: g.glyph, hue: g.hue, accentHue: (g.hue + 40) % 360 }} className="block aspect-[16/9] w-full" label={g.title} />
        {g.mode?.stage === '3d' ? (
          <Badge tone="violet" className="absolute top-2 left-2">
            <Box className="size-3.5" aria-hidden /> 3D
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <h3 className="font-display text-xl leading-tight font-bold">{g.title}</h3>
          <p className="text-sm text-text-2">
            {g.variant?.title ?? g.mode?.title ?? 'A mode that is no longer available'}
            {g.set ? ` with “${g.set.title}”` : ''}
          </p>
          {g.description ? <p className="mt-1 text-sm">{g.description}</p> : null}
        </div>
        <p className="mt-auto text-xs text-text-3">
          {g.mine ? VISIBILITY[g.visibility] : `By ${g.owner.name}`} · {g.plays === 1 ? '1 play' : `${g.plays} plays`}
          {g.hidden ? ' · hidden by a moderator' : ''}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <ButtonLink to={`/host?game=${g.id}`} size="sm" variant="primary" icon={<Play className="size-4" aria-hidden />}>
            Host
          </ButtonLink>
          {g.visibility !== 'private' || g.mine ? (
            <Button size="sm" variant="secondary" onClick={share} icon={<Link2 className="size-4" aria-hidden />}>
              Share
            </Button>
          ) : null}
          {g.mine ? <Button size="sm" variant="ghost" onClick={() => setDeleting(true)} icon={<Trash2 className="size-4" aria-hidden />} aria-label={`Delete ${g.title}`} /> : null}
        </div>
      </div>
      <Dialog
        open={deleting}
        onOpenChange={setDeleting}
        size="sm"
        title={`Delete ${g.title}?`}
        description="The game goes for good. Its question set is not touched."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Keep it
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete
            </Button>
          </div>
        }
      />
    </li>
  );
}

export default function Games() {
  const me = useMe();
  const signedIn = Boolean(me.data?.user);
  const [params, setParams] = useSearchParams();
  const scope = params.get('tab') === 'community' || !signedIn ? 'public' : 'mine';
  const q = useQuery({ queryKey: ['games', scope], queryFn: () => api.get<{ games: ListedGame[] }>(`/api/games?scope=${scope}`) });
  useEffect(() => {
    document.title = 'Game Maker | Ludora';
  }, []);
  const games = q.data?.games ?? [];

  return (
    <>
      <PageHeader
        title="Game Maker"
        description="Make your own game from any mode, 2D or 3D: pick the questions, tune the rules, give it a name and a cover. Host it again in one tap, or share the link."
        actions={
          signedIn ? (
            <ButtonLink to="/host?make=1" variant="primary" icon={<Wand2 className="size-5" aria-hidden />}>
              Make a game
            </ButtonLink>
          ) : null
        }
      />
      {signedIn ? (
        <Tabs
          value={scope === 'public' ? 'community' : 'mine'}
          onValueChange={(v) => setParams({ tab: v }, { replace: true })}
          items={[
            { value: 'mine', label: 'Your games' },
            { value: 'community', label: 'Community games' },
          ]}
          label="Which games"
        />
      ) : null}
      <div className="mt-5">
        {q.isError ? (
          <ErrorNotice message="The games did not load." onRetry={() => void q.refetch()} />
        ) : q.isPending ? (
          <Skeleton className="h-72" />
        ) : !games.length ? (
          scope === 'mine' ? (
            <EmptyState
              icon={<Wand2 className="size-8" />}
              title="You have not made a game yet"
              action={
                <ButtonLink to="/host?make=1" variant="primary">
                  Make a game
                </ButtonLink>
              }
            >
              Set up any mode with your own questions and rules, then press Save as a game.
            </EmptyState>
          ) : (
            <EmptyState title="No community games yet">Trusted players and teachers can list their games here.</EmptyState>
          )
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((g) => (
              <GameCard key={g.id} g={g} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
