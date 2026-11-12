import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Box, Link2, Play, Trash2, Wand2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { useModes } from '../../lib/queries.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { Badge, Dialog, EmptyState, ErrorNotice, Skeleton } from '../../ui/primitives.tsx';
import { Segmented } from '../../ui/Segmented.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import type { MadeGame } from './SaveGameDialog.tsx';

/*
 * Saved games: a mode with its settings and a set, saved from the host page (Save as a game) to
 * host again in one tap or share by link. Shown as the "Saved games" tab of Game Maker; the old
 * address (/games) lands there.
 */

type ListedGame = Omit<MadeGame, 'settings' | 'common' | 'options'>;

const VISIBILITY: Record<MadeGame['visibility'], string> = { private: 'Only you', unlisted: 'Link only', public: 'Community' };

function GameCard({ g }: { g: ListedGame }) {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  // The game's cover is its mode's, with the glyph and colour its maker chose as the mark.
  const base = useModes().data?.modes.find((m) => m.meta.id === g.mode?.id)?.meta;
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
        <ModeArt thumb={{ glyph: g.glyph, hue: g.hue, accentHue: (g.hue + 40) % 360 }} mode={base} mark={{ glyph: g.glyph, hue: g.hue }} className="block aspect-[16/9] w-full" label={g.title} />
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

export function SavedGames() {
  const me = useMe();
  const signedIn = Boolean(me.data?.user);
  const [params, setParams] = useSearchParams();
  const scope = params.get('saved') === 'community' || !signedIn ? 'public' : 'mine';
  const q = useQuery({ queryKey: ['games', scope], queryFn: () => api.get<{ games: ListedGame[] }>(`/api/games?scope=${scope}`) });
  const games = q.data?.games ?? [];
  const tab = scope === 'public' ? 'community' : 'mine';
  const list = (
    <div>
      {q.isError ? (
        <ErrorNotice message="The games did not load." onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <Skeleton className="h-72" />
      ) : !games.length ? (
        scope === 'mine' ? (
          <EmptyState
            icon={<Wand2 className="size-8" />}
            title="You have not saved a game yet"
            action={
              <ButtonLink to="/host?make=1" variant="primary">
                Save a game
              </ButtonLink>
            }
          >
            On the host page, pick a mode and a question set, tune the settings, then press Save as a game.
          </EmptyState>
        ) : (
          <EmptyState title="No saved games shared yet">Trusted players and teachers can list their saved games here.</EmptyState>
        )
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((g) => (
            <GameCard key={g.id} g={g} />
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <section aria-labelledby="saved-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="saved-title" className="font-display text-2xl font-bold">
            Saved games
          </h2>
          <p className="max-w-2xl text-text-2">A saved game is one of Ludora’s modes with the settings and question set you chose, ready to host again in one tap or share by link. You save one from the host page.</p>
        </div>
        {signedIn ? (
          <ButtonLink to="/host?make=1" variant="secondary" icon={<Wand2 className="size-5" aria-hidden />}>
            Save a game
          </ButtonLink>
        ) : null}
      </div>
      {signedIn ? (
        <Segmented
          label="Whose saved games"
          value={tab}
          onChange={(v) => {
            const next = new URLSearchParams(params);
            if (v === 'community') next.set('saved', 'community');
            else next.delete('saved');
            setParams(next, { replace: true });
          }}
          options={[
            { value: 'mine', label: 'Yours' },
            { value: 'community', label: 'Shared by others' },
          ]}
        />
      ) : null}
      {list}
    </section>
  );
}
