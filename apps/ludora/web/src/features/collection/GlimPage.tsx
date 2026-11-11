import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Hammer, Pencil, ShoppingBag } from 'lucide-react';
import { RARITY_INFO, type GlimArt, type LanternArt, type Rarity } from '@ludora/shared';
import { api, newRequestKey } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { useOverview } from '../../lib/queries.ts';
import { formatDate, formatNumber } from '../../lib/format.ts';
import { Glim } from '../../art/glim/Glim.tsx';
import { Lantern } from '../../art/Lantern.tsx';
import { AccountError, Amount, EmptyState, ErrorNotice, Input, Panel, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { formatPercent } from '../../ui/game.tsx';
import { usePageTitle } from '../social/data.ts';
import { errorMessage, extrasKey, useExtras } from '../profile/extras.ts';
import { FavouriteStar } from '../profile/parts.tsx';
import { RarityLabel, RarityPanel, frameProps } from './rarity.tsx';

interface GlimInfo {
  id: string;
  rarity: Rarity;
  name: string | null;
  description: string | null;
  art: GlimArt | null;
  silhouette: Pick<GlimArt, 'body'> & Partial<GlimArt> | null;
  owned: number;
  firstFound: string | null;
  collection: { id: string; name: string; description: string; hue: number } | null;
  lanterns: { id: string; name: string; art: LanternArt; percent: number; onSale: boolean; until: string | null }[];
  shop: { id: string; section: string; price: { currency: string; amount: number }; rotation: string | null }[];
  craftCost: number;
  dustValue: number;
}

const shadowArt = (shape: GlimInfo['silhouette']): GlimArt => ({ kind: 'glim', hue: 0, accentHue: 0, saturation: 0, eyes: 'dot', mouth: 'none', pattern: 'none', topper: 'none', cheeks: false, ...shape! }) as GlimArt;

/** A nickname for your Glim, through the same name filter as display names. Only you see it. */
function Nickname({ itemId, name }: { itemId: string; name: string }) {
  const qc = useQueryClient();
  const extras = useExtras();
  const current = extras.data?.nicknames[itemId] ?? '';
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (nickname: string | null) => api.put(`/api/me/nicknames/${encodeURIComponent(itemId)}`, { nickname }),
    onSuccess: async (_r, nickname) => {
      await qc.invalidateQueries({ queryKey: extrasKey });
      setEditing(false);
      setError(null);
      toast.success(nickname ? `${name} is now called ${nickname}, for you` : 'Nickname removed');
    },
    onError: (err) => setError(errorMessage(err, 'That name did not save. Try again.')),
  });
  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {current ? (
          <p className="text-lg">
            You call it <span className="font-display text-2xl font-bold">{current}</span>
          </p>
        ) : null}
        <Button
          size="sm"
          icon={<Pencil className="size-4" aria-hidden />}
          onClick={() => {
            setValue(current);
            setEditing(true);
          }}
        >
          {current ? 'Change nickname' : 'Give it a nickname'}
        </Button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(value.trim() ? value.trim() : null);
      }}
    >
      <label htmlFor="nickname" className="text-sm font-semibold">
        Nickname for {name}
      </label>
      <div className="flex flex-wrap gap-2">
        <Input id="nickname" autoFocus value={value} maxLength={24} onChange={(e) => setValue(e.target.value)} aria-invalid={Boolean(error)} aria-describedby="nickname-hint" className="h-11 w-60 max-w-full" />
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save
        </Button>
        <Button onClick={() => setEditing(false)}>Cancel</Button>
      </div>
      <p id="nickname-hint" className={`text-sm ${error ? 'font-semibold text-text' : 'text-text-2'}`} role={error ? 'alert' : undefined}>
        {error ?? 'Only you see it. Leave it empty to use its own name.'}
      </p>
    </form>
  );
}

export default function GlimPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const overview = useOverview();
  const q = useQuery({ queryKey: ['glim', id], queryFn: () => api.get<GlimInfo>(`/api/collection/${encodeURIComponent(id)}`), enabled: Boolean(me.data?.user) });
  const g = q.data;
  usePageTitle(g?.name ?? 'Glim');
  const dust = overview.data?.balances.dust ?? null;
  const craft = useMutation({
    mutationFn: () => api.post<{ name: string }>('/api/collection/craft', { itemId: id, requestKey: newRequestKey('craft') }),
    onSuccess: async (r) => {
      toast.success(`Crafted ${r.name}`);
      await Promise.all([qc.invalidateQueries({ queryKey: ['glim', id] }), qc.invalidateQueries({ queryKey: ['collection'] }), qc.invalidateQueries({ queryKey: ['overview'] })]);
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not craft.')),
  });
  const back = (
    <Link to="/collection" className="-my-2 mb-4 inline-flex min-h-11 items-center gap-1.5 self-start rounded-[var(--radius-s)] text-sm font-bold">
      <ArrowLeft className="size-4" aria-hidden /> Collection
    </Link>
  );
  if (me.isError && !me.data) return <AccountError onRetry={() => void me.refetch()} />;
  if (!me.isLoading && !me.data?.user) {
    return (
      <EmptyState title="Sign in to see your Glims" action={<ButtonLink to={`/signin?next=/collection/${id}`} variant="primary">Sign in</ButtonLink>}>
        Every Glim you find has its own story.
      </EmptyState>
    );
  }
  if (q.isError) {
    return (
      <div className="flex flex-col">
        {back}
        <h1 className="sr-only">Glim</h1>
        <ErrorNotice title="That Glim did not load" message={errorMessage(q.error, 'Check your connection and try again.')} onRetry={() => void q.refetch()} />
      </div>
    );
  }
  if (!g) {
    return (
      <div className="flex flex-col">
        {back}
        <Skeleton className="h-96" />
      </div>
    );
  }
  const owned = g.owned > 0;
  const f = frameProps(g.rarity, { missing: !owned });
  const title = g.name ?? 'Not found yet';
  return (
    <div className="flex flex-col">
      {back}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className={`relative mx-auto w-full max-w-[22rem] self-start overflow-hidden p-1.5 lg:mx-0 ${f.className}`} style={f.style}>
          <RarityPanel rarity={g.rarity} missing={!owned} className="aspect-square w-full">
            {g.art ? <Glim art={g.art} size={240} aura={g.rarity} rarity={g.rarity} pose="wave" className="h-auto w-[84%]" /> : <Glim art={shadowArt(g.silhouette)} size={220} silhouette className="h-auto w-[76%]" />}
          </RarityPanel>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <RarityLabel rarity={g.rarity} className="text-text-2" />
              <h1 className="font-display text-[3rem] leading-[0.95] font-extrabold break-words sm:text-[3.6rem]">{title}</h1>
              {g.collection ? (
                <p className="mt-1 text-text-2">
                  {RARITY_INFO[g.rarity].label} Glim from <span className="font-semibold text-text">{g.collection.name}</span>
                </p>
              ) : null}
            </div>
            {owned ? <FavouriteStar kind="glims" id={g.id} label={g.name!} /> : null}
          </div>
          <Panel className="p-5" aria-labelledby="story-heading">
            <h2 id="story-heading" className="mb-1 font-display text-2xl font-bold">
              Its story
            </h2>
            <p className="text-text-2">{g.description ?? 'Find this Glim to read its story. Until then, all you know is its shape and how rare it is.'}</p>
            {owned ? (
              <p className="mt-2 text-sm text-text-2">
                You have <span className="font-semibold text-text tabular">{g.owned}</span>
                {g.firstFound ? `, first found ${formatDate(g.firstFound, { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.
              </p>
            ) : null}
            {owned ? (
              <div className="mt-4 border-t border-line pt-4">
                <Nickname itemId={g.id} name={g.name!} />
              </div>
            ) : null}
          </Panel>
          <Panel className="p-5" aria-labelledby="where-heading">
            <h2 id="where-heading" className="mb-3 font-display text-2xl font-bold">
              Where it comes from
            </h2>
            <ul className="flex flex-col gap-2">
              {g.lanterns.map((l) => (
                <li key={l.id} className="flex items-center gap-3 rounded-[var(--radius-m)] bg-surface-2 p-3">
                  <Lantern art={l.art} size={40} lit={l.onSale} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{l.name}</p>
                    <p className="text-sm text-text-2">
                      {formatPercent(l.percent)} chance from each one{l.onSale ? '' : '. Not in the shop now'}
                    </p>
                  </div>
                  {l.onSale ? (
                    <ButtonLink to="/shop?tab=lanterns" size="sm">
                      Shop
                    </ButtonLink>
                  ) : null}
                </li>
              ))}
              {g.shop.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-[var(--radius-m)] bg-surface-2 p-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-m)] bg-sky text-on-accent" aria-hidden>
                    <ShoppingBag className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">In the shop{s.rotation ? ` some ${s.rotation === 'daily' ? 'days' : 'weeks'}` : ''}</p>
                    <p className="text-sm text-text-2">
                      For <Amount currency={s.price.currency} value={s.price.amount} size="sm" />
                    </p>
                  </div>
                </li>
              ))}
              <li className="flex flex-wrap items-center gap-3 rounded-[var(--radius-m)] bg-surface-2 p-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-m)] bg-dusk text-on-accent" aria-hidden>
                  <Hammer className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">Craft it with Glow Dust</p>
                  <p className="text-sm text-text-2">
                    {formatNumber(g.craftCost)} Glow Dust{dust !== null ? `, you have ${formatNumber(dust)}` : ''}. Recycle spare Glims for Dust.
                  </p>
                </div>
                <Button size="sm" variant={owned ? 'secondary' : 'primary'} disabled={dust !== null && dust < g.craftCost} loading={craft.isPending} onClick={() => craft.mutate()}>
                  Craft for <Amount currency="dust" value={g.craftCost} size="sm" />
                </Button>
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
