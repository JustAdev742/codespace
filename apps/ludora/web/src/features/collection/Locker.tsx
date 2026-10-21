import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { ITEM_TYPE_INFO, type AccessoryArt, type GlimArt, type ItemArt, type ItemType, type Rarity } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { ItemArtView } from '../../art/cosmetics.tsx';
import { Badge, EmptyState, PageHeader, RarityBadge, Skeleton, Tabs } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { ProfileCard } from './ProfileCard.tsx';

interface LockerItem {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  rarity: Rarity;
  art: ItemArt;
  quantity: number;
}

const SLOTS: { value: string; label: string; match: (i: LockerItem) => boolean; removable: boolean; note?: string }[] = [
  { value: 'buddy', label: 'Buddy', match: (i) => i.type === 'glim', removable: false },
  { value: 'hat', label: 'Hats', match: (i) => i.type === 'accessory' && (i.art as AccessoryArt).slot === 'hat', removable: true },
  { value: 'eyes', label: 'Eyewear', match: (i) => i.type === 'accessory' && (i.art as AccessoryArt).slot === 'eyes', removable: true },
  { value: 'neck', label: 'Neckwear', match: (i) => i.type === 'accessory' && (i.art as AccessoryArt).slot === 'neck', removable: true },
  { value: 'frame', label: 'Frames', match: (i) => i.type === 'frame', removable: true },
  { value: 'banner', label: 'Banners', match: (i) => i.type === 'banner', removable: true },
  { value: 'title', label: 'Titles', match: (i) => i.type === 'title', removable: true },
  { value: 'victory', label: 'Victory', match: (i) => i.type === 'victory', removable: true, note: 'Plays on the podium when you win a game.' },
  { value: 'effect', label: 'Answer effects', match: (i) => i.type === 'effect', removable: true, note: 'Plays when you answer correctly.' },
  { value: 'theme', label: 'Themes', match: (i) => i.type === 'theme', removable: true, note: 'Tints your profile card and banner area.' },
];

export default function Locker() {
  const me = useMe();
  const qc = useQueryClient();
  const [slot, setSlot] = useState('buddy');
  const locker = useQuery({ queryKey: ['locker'], queryFn: () => api.get<{ items: LockerItem[]; equipped: Record<string, string> }>('/api/locker'), enabled: Boolean(me.data?.user) });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['locker'] }), qc.invalidateQueries({ queryKey: ['overview'] })]);
  const equip = useMutation({
    mutationFn: (itemId: string) => api.post('/api/locker/equip', { itemId }),
    onSuccess: refresh,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not equip that.'),
  });
  const unequip = useMutation({
    mutationFn: (s: string) => api.post('/api/locker/unequip', { slot: s }),
    onSuccess: refresh,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not remove that.'),
  });
  const data = locker.data;
  const byId = useMemo(() => new Map((data?.items ?? []).map((i) => [i.id, i])), [data]);
  const eq = (s: string) => (data?.equipped[s] ? byId.get(data.equipped[s]!) : undefined);
  const buddy = eq('buddy');
  const accessories = (['hat', 'eyes', 'neck'] as const).map((s) => eq(s)?.art as AccessoryArt | undefined).filter((a): a is AccessoryArt => Boolean(a));
  const emotes = (data?.items ?? []).filter((i) => i.type === 'emote');

  if (!me.isLoading && !me.data?.user) {
    return (
      <>
        <PageHeader title="Locker" />
        <EmptyState title="Sign in to dress up your buddy" action={<ButtonLink to="/signin?next=/locker" variant="primary">Sign in</ButtonLink>} />
      </>
    );
  }
  const active = SLOTS.find((s) => s.value === slot)!;
  const list = (data?.items ?? []).filter(active.match);
  return (
    <>
      <PageHeader title="Locker" description="Choose your buddy Glim and what it wears. Other players see this in games and on your profile." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          {data ? (
            <ProfileCard
              name={me.data!.user!.displayName}
              level={me.data!.user!.level.level}
              avatar={buddy ? { art: buddy.art as GlimArt, accessories } : null}
              equipment={{ frame: eq('frame')?.art, banner: eq('banner')?.art, title: eq('title')?.art, theme: eq('theme')?.art }}
            />
          ) : (
            <Skeleton className="h-80" />
          )}
          {emotes.length ? (
            <div className="mt-4 rounded-[var(--radius-m)] border border-line bg-raised p-4">
              <h2 className="mb-2 font-semibold">Your emotes</h2>
              <div className="flex flex-wrap gap-2">
                {emotes.map((e) => (
                  <span key={e.id} title={e.name} className="grid size-12 place-items-center rounded-[12px] bg-surface-2">
                    <ItemArtView art={e.art} size={48} />
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-text-3">Use emotes to react during games.</p>
            </div>
          ) : null}
        </div>
        <div className="min-w-0">
          <Tabs value={slot} onValueChange={setSlot} label="Slots" items={SLOTS.map((s) => ({ value: s.value, label: s.label, count: (data?.items ?? []).filter(s.match).length }))} />
          {active.note ? <p className="mb-3 text-sm text-text-2">{active.note}</p> : null}
          {locker.isLoading ? <Skeleton className="h-60" /> : null}
          {data && list.length === 0 ? (
            <EmptyState title={`No ${active.label.toLowerCase()} yet`} action={<ButtonLink to="/shop" variant="primary">Visit the shop</ButtonLink>}>
              Find more in the shop, from quests and from achievements.
            </EmptyState>
          ) : null}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {list.map((i) => {
              const on = data?.equipped[slot] === i.id;
              return (
                <li key={i.id}>
                  <div className={`flex h-full flex-col gap-2 rounded-[var(--radius-m)] border p-3 ${on ? 'border-lantern bg-dusk/20' : 'border-line bg-raised'}`}>
                    <div className="grid h-28 place-items-center rounded-[12px] bg-surface-2">
                      <ItemArtView art={i.art} rarity={i.rarity} size={i.type === 'banner' ? 120 : 92} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{i.name}</div>
                      <div className="flex items-center justify-between gap-2">
                        <RarityBadge rarity={i.rarity} />
                        {ITEM_TYPE_INFO[i.type].stackable && i.quantity > 1 ? <span className="text-xs text-text-3">x{i.quantity}</span> : null}
                      </div>
                    </div>
                    {on ? (
                      active.removable ? (
                        <Button size="sm" onClick={() => unequip.mutate(slot)} loading={unequip.isPending && unequip.variables === slot}>
                          Take off
                        </Button>
                      ) : (
                        <Badge tone="mint" className="justify-center py-1.5">
                          <Check className="size-3.5" /> Equipped
                        </Badge>
                      )
                    ) : (
                      <Button size="sm" variant="primary" onClick={() => equip.mutate(i.id)} loading={equip.isPending && equip.variables === i.id}>
                        {slot === 'buddy' ? 'Make buddy' : 'Wear'}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}
