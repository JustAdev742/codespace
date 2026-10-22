import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { ITEM_TYPE_INFO, type AccessoryArt, type GlimArt, type ItemArt, type ItemType, type Rarity } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { ItemArtView } from '../../art/cosmetics.tsx';
import { AccountError, EmptyState, ErrorNotice, PageHeader, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { StickerTabPanel, StickerTabs } from '../home/kit.tsx';
import { ProfileCard } from './ProfileCard.tsx';
import { RarityPanel, frameProps } from './rarity.tsx';

interface LockerItem {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  rarity: Rarity;
  art: ItemArt;
  quantity: number;
}

/** How each kind of slot is worn: the words on its buttons and where to find more. */
type Kind = 'buddy' | 'wear' | 'use';
const WORDS: Record<Kind, { on: string; put: string; remove: string }> = {
  buddy: { on: 'Your buddy', put: 'Make my buddy', remove: '' },
  wear: { on: 'Wearing', put: 'Wear', remove: 'Take off' },
  use: { on: 'In use', put: 'Use', remove: 'Stop using' },
};

const SLOTS: { value: string; label: string; kind: Kind; shop: string; match: (i: LockerItem) => boolean; note?: string }[] = [
  { value: 'buddy', label: 'Buddy', kind: 'buddy', shop: 'lanterns', match: (i) => i.type === 'glim', note: 'Your buddy stands beside your name in games and on your profile.' },
  { value: 'hat', label: 'Hats', kind: 'wear', shop: 'accessories', match: (i) => i.type === 'accessory' && (i.art as AccessoryArt).slot === 'hat' },
  { value: 'eyes', label: 'Eyewear', kind: 'wear', shop: 'accessories', match: (i) => i.type === 'accessory' && (i.art as AccessoryArt).slot === 'eyes' },
  { value: 'neck', label: 'Neckwear', kind: 'wear', shop: 'accessories', match: (i) => i.type === 'accessory' && (i.art as AccessoryArt).slot === 'neck' },
  { value: 'frame', label: 'Frames', kind: 'use', shop: 'profile', match: (i) => i.type === 'frame', note: 'A frame goes around your buddy on your profile card.' },
  { value: 'banner', label: 'Banners', kind: 'use', shop: 'profile', match: (i) => i.type === 'banner', note: 'Your banner runs across the top of your profile card.' },
  { value: 'title', label: 'Titles', kind: 'use', shop: 'profile', match: (i) => i.type === 'title', note: 'Your title shows under your name.' },
  { value: 'victory', label: 'Victory', kind: 'use', shop: 'effects', match: (i) => i.type === 'victory', note: 'Plays on the podium when you win a game.' },
  { value: 'effect', label: 'Answer effects', kind: 'use', shop: 'effects', match: (i) => i.type === 'effect', note: 'Plays when you answer correctly.' },
  { value: 'theme', label: 'Themes', kind: 'use', shop: 'effects', match: (i) => i.type === 'theme', note: 'Tints your profile card and banner area.' },
];

export default function Locker() {
  const me = useMe();
  const qc = useQueryClient();
  const [slot, setSlot] = useState('buddy');
  const locker = useQuery({ queryKey: ['locker'], queryFn: () => api.get<{ items: LockerItem[]; equipped: Record<string, string> }>('/api/locker'), enabled: Boolean(me.data?.user) });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['locker'] }), qc.invalidateQueries({ queryKey: ['overview'] }), qc.invalidateQueries({ queryKey: ['collection'] })]);
  const equip = useMutation({
    mutationFn: (itemId: string) => api.post('/api/locker/equip', { itemId }),
    onSuccess: refresh,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not put that on.'),
  });
  const unequip = useMutation({
    mutationFn: (s: string) => api.post('/api/locker/unequip', { slot: s }),
    onSuccess: refresh,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not take that off.'),
  });
  const data = locker.data;
  const byId = useMemo(() => new Map((data?.items ?? []).map((i) => [i.id, i])), [data]);
  const eq = (s: string) => (data?.equipped[s] ? byId.get(data.equipped[s]!) : undefined);
  const buddy = eq('buddy');
  const accessories = (['hat', 'eyes', 'neck'] as const).map((s) => eq(s)?.art as AccessoryArt | undefined).filter((a): a is AccessoryArt => Boolean(a));
  const emotes = (data?.items ?? []).filter((i) => i.type === 'emote');

  const header = <PageHeader title="Locker" description="Pick your buddy and dress it up. Other players see your buddy in games and on your profile." />;
  if (me.isError && !me.data) {
    return (
      <>
        {header}
        <AccountError onRetry={() => void me.refetch()} />
      </>
    );
  }
  if (!me.isLoading && !me.data?.user) {
    return (
      <>
        <PageHeader title="Locker" />
        <EmptyState title="Sign in to dress up your buddy" action={<ButtonLink to="/signin?next=/locker" variant="primary">Sign in</ButtonLink>} />
      </>
    );
  }
  if (locker.isError && !data) {
    return (
      <>
        {header}
        <ErrorNotice message="Your locker could not be loaded." onRetry={() => void locker.refetch()} />
      </>
    );
  }
  const loading = me.isLoading || locker.isLoading;
  // Shown under the card on wide screens, and after the items on phones.
  const emotesPanel = (className: string) =>
    emotes.length ? (
      <section className={`panel p-4 ${className}`} aria-label="Your emotes">
        <h2 className="mb-2 font-display text-lg font-bold">Your emotes</h2>
        <ul className="flex flex-wrap gap-2">
          {emotes.map((e) => (
            <li key={e.id} title={e.name} className="grid size-14 place-items-center rounded-[14px] bg-surface-2">
              <ItemArtView art={e.art} size={52} />
              <span className="sr-only">{e.name}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-text-2">Send emotes to react during games.</p>
      </section>
    ) : null;
  const active = SLOTS.find((s) => s.value === slot)!;
  const words = WORDS[active.kind];
  const list = (data?.items ?? []).filter(active.match);
  return (
    <>
      {header}
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          {data ? (
            <ProfileCard
              name={me.data!.user!.displayName}
              level={me.data!.user!.level.level}
              avatar={buddy ? { art: buddy.art as GlimArt, accessories, rarity: buddy.rarity } : null}
              equipment={{ frame: eq('frame')?.art, banner: eq('banner')?.art, title: eq('title')?.art, theme: eq('theme')?.art }}
            />
          ) : (
            <Skeleton className="h-96 rounded-[24px]" />
          )}
          {emotesPanel('hidden lg:block')}
        </div>
        <div className="min-w-0">
          {/* Counts appear once they are known, rather than as zeros while the locker loads. */}
          <StickerTabs value={slot} onValueChange={setSlot} label="What to change" items={SLOTS.map((s) => ({ value: s.value, label: s.label, ...(data ? { count: data.items.filter(s.match).length } : {}) }))}>
            <StickerTabPanel value={slot} className="focus-visible:outline-offset-8">
              {active.note ? <p className="mb-4 text-text-2">{active.note}</p> : null}
              {loading ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-60 rounded-[20px]" />
                  ))}
                </div>
              ) : null}
              {data && list.length === 0 ? (
                <EmptyState title={`No ${active.label.toLowerCase()} yet`} action={<ButtonLink to={`/shop?tab=${active.shop}`} variant="primary">Find some in the shop</ButtonLink>}>
                  You can also earn them from quests and achievements.
                </EmptyState>
              ) : null}
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {list.map((i) => {
                  const on = data?.equipped[slot] === i.id;
                  const f = frameProps(i.rarity, { selected: on });
                  const busy = (equip.isPending && equip.variables === i.id) || (on && unequip.isPending && unequip.variables === slot);
                  return (
                    <li key={i.id}>
                      <div className={`flex h-full flex-col ${f.className}`} style={f.style}>
                        <RarityPanel rarity={i.rarity} className="m-1.5 h-32">
                          <ItemArtView art={i.art} rarity={i.rarity} size={i.type === 'banner' ? 130 : i.type === 'frame' ? 82 : 96} />
                          {on ? (
                            <span className="absolute bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-ink bg-lantern px-2 text-xs font-bold whitespace-nowrap text-on-accent shadow-[0_2px_0_var(--ink)]">
                              <Check className="size-3.5" aria-hidden /> {words.on}
                            </span>
                          ) : null}
                        </RarityPanel>
                        <div className="flex flex-1 flex-col gap-2 px-3 pb-3">
                          <div className="min-w-0">
                            <div className="truncate font-display text-[15px] font-bold">{i.name}</div>
                            {ITEM_TYPE_INFO[i.type].stackable && i.quantity > 1 ? <div className="text-xs text-text-2">You have {i.quantity}</div> : null}
                          </div>
                          <div className="mt-auto">
                            {on ? (
                              active.kind === 'buddy' ? (
                                <Button size="sm" className="w-full" disabled>
                                  {words.on}
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost" className="w-full" onClick={() => unequip.mutate(slot)} loading={busy} aria-label={`${words.remove}: ${i.name}`}>
                                  {words.remove}
                                </Button>
                              )
                            ) : (
                              <Button size="sm" className="w-full" onClick={() => equip.mutate(i.id)} loading={busy} aria-label={`${words.put}: ${i.name}`}>
                                {words.put}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </StickerTabPanel>
          </StickerTabs>
        </div>
        {emotesPanel('lg:hidden')}
      </div>
    </>
  );
}
