import { useMemo, useState } from 'react';
import { LockerUniform } from '../school/LockerUniform.tsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Award, Check, Shirt, Shuffle, Trash2 } from 'lucide-react';
import { ITEM_TYPE_INFO, MAX_OUTFITS, type AccessoryArt, type GlimArt, type ItemArt, type ItemType, type Rarity } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { ItemArtView } from '../../art/cosmetics.tsx';
import { AccountError, EmptyState, ErrorNotice, Input, PageHeader, Skeleton } from '../../ui/primitives.tsx';
import { errorMessage, extrasKey, useExtras, type Outfit } from '../profile/extras.ts';
import { Button, ButtonLink, IconButton } from '../../ui/Button.tsx';
import { StickerTabPanel, StickerTabs } from '../../ui/game.tsx';
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

interface EarnedAchievement {
  id: string;
  title: string;
  description: string;
  unlockedAt: string | null;
}

/** Titles earned from achievements: pick one to show under your name. The server checks you unlocked it. */
function EarnedTitles({ current, onChanged }: { current: string | null; onChanged: () => Promise<unknown> }) {
  const ach = useQuery({ queryKey: ['achievements'], queryFn: () => api.get<{ achievements: EarnedAchievement[] }>('/api/achievements') });
  const pick = useMutation({
    mutationFn: (achievementId: string | null) => api.put('/api/me/title', { achievementId }),
    onSuccess: async (_r, id) => {
      await onChanged();
      toast.success(id ? 'Title chosen' : 'Title taken off');
    },
    onError: (err) => toast.error(errorMessage(err, 'That title did not change. Try again.')),
  });
  const earned = (ach.data?.achievements ?? []).filter((a) => a.unlockedAt);
  return (
    <section className="mb-6" aria-labelledby="earned-titles">
      <h3 id="earned-titles" className="mb-2 font-display text-xl font-bold">
        Earned from achievements
      </h3>
      {ach.isError ? (
        <ErrorNotice message="Your achievements did not load." onRetry={() => void ach.refetch()} />
      ) : !ach.data ? (
        <Skeleton className="h-16" />
      ) : earned.length === 0 ? (
        <p className="text-sm text-text-2">Unlock an achievement in Quests and its name becomes a title you can show.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {earned.map((a) => {
            const on = current === a.id;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick.mutate(on ? null : a.id)}
                  disabled={pick.isPending}
                  title={a.description}
                  className={`press-soft inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-m)] border px-3 text-sm font-bold ${on ? 'border-lantern bg-lantern text-on-accent' : 'border-line bg-raised text-text hover:bg-surface-2'}`}
                >
                  {on ? <Check className="size-4" aria-hidden /> : <Award className="size-4 text-text-3" aria-hidden />}
                  {a.title}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Up to five saved outfits, worn in one tap; and Surprise me, which the server picks. */
function Outfits({ outfits, byId, onChanged }: { outfits: Outfit[]; byId: Map<string, LockerItem>; onChanged: () => Promise<unknown> }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.post('/api/me/outfits', { name: name.trim() }),
    onSuccess: async () => {
      await onChanged();
      toast.success(`Saved ${name.trim()}`);
      setName('');
      setError(null);
    },
    onError: (err) => setError(errorMessage(err, 'That outfit did not save. Try again.')),
  });
  const wear = useMutation({
    mutationFn: (o: Outfit) => api.post<{ missing: string[] }>(`/api/me/outfits/${o.id}/wear`),
    onSuccess: async (r, o) => {
      await onChanged();
      if (r.missing.length) toast.message(`Wearing ${o.name}, without ${r.missing.join(', ')}: you do not have ${r.missing.length === 1 ? 'it' : 'them'} any more.`);
      else toast.success(`Wearing ${o.name}`);
    },
    onError: (err) => toast.error(errorMessage(err, 'That outfit did not go on. Try again.')),
  });
  const remove = useMutation({
    mutationFn: (o: Outfit) => api.delete(`/api/me/outfits/${o.id}`),
    onSuccess: async (_r, o) => {
      await onChanged();
      toast.success(`Deleted ${o.name}`);
    },
    onError: (err) => toast.error(errorMessage(err, 'That outfit was not deleted. Try again.')),
  });
  const surprise = useMutation({
    mutationFn: () => api.post('/api/locker/surprise'),
    onSuccess: async () => {
      await onChanged();
      toast.success('Surprise! Here is your new look.');
    },
    onError: (err) => toast.error(errorMessage(err, 'No surprise this time. Try again.')),
  });
  const full = outfits.length >= MAX_OUTFITS;
  return (
    <section className="panel rounded-[var(--radius-l)] p-4" aria-labelledby="outfits-title">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="outfits-title" className="font-display text-xl font-bold">
          Outfits
        </h2>
        <Button size="sm" icon={<Shuffle className="size-4" aria-hidden />} loading={surprise.isPending} onClick={() => surprise.mutate()}>
          Surprise me
        </Button>
      </div>
      {outfits.length ? (
        <ul className="mb-3 flex flex-col gap-1.5">
          {outfits.map((o) => {
            const buddy = o.items.buddy ? byId.get(o.items.buddy) : undefined;
            const pieces = Object.values(o.items).filter(Boolean).length;
            return (
              <li key={o.id} className="flex items-center gap-2 rounded-[var(--radius-m)] bg-surface-2 p-1.5 pl-2">
                <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-s)] bg-surface-3" aria-hidden>
                  {buddy ? <ItemArtView art={buddy.art} size={38} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{o.name}</span>
                  <span className="block text-xs text-text-2">{pieces === 1 ? '1 piece' : `${pieces} pieces`}</span>
                </span>
                <Button size="sm" variant="primary" loading={wear.isPending && wear.variables?.id === o.id} onClick={() => wear.mutate(o)} aria-label={`Wear ${o.name}`}>
                  Wear
                </Button>
                <IconButton label={`Delete ${o.name}`} onClick={() => remove.mutate(o)} disabled={remove.isPending}>
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-text-2">Save what your buddy wears now, then switch back to it in one tap.</p>
      )}
      {full ? (
        <p className="text-sm text-text-2">You have saved {MAX_OUTFITS} outfits, the most you can keep. Delete one to save another.</p>
      ) : (
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              setError('Give the outfit a name.');
              return;
            }
            save.mutate();
          }}
        >
          <label htmlFor="outfit-name" className="text-sm font-semibold">
            Save this look as
          </label>
          <div className="flex gap-2">
            <Input id="outfit-name" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="School day" aria-invalid={Boolean(error)} aria-describedby={error ? 'outfit-error' : undefined} className="h-11 min-w-0 flex-1" />
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          </div>
          {error ? (
            <p id="outfit-error" role="alert" className="text-sm font-semibold">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}

export default function Locker() {
  const me = useMe();
  const qc = useQueryClient();
  const [slot, setSlot] = useState('buddy');
  const locker = useQuery({ queryKey: ['locker'], queryFn: () => api.get<{ items: LockerItem[]; equipped: Record<string, string> }>('/api/locker'), enabled: Boolean(me.data?.user) });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['locker'] }), qc.invalidateQueries({ queryKey: ['overview'] }), qc.invalidateQueries({ queryKey: ['collection'] }), qc.invalidateQueries({ queryKey: extrasKey })]);
  const extras = useExtras();
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
        <EmptyState
          icon={<Shirt />}
          title="Sign in to dress up your buddy"
          action={
            <>
              <ButtonLink to="/signin?next=/locker" variant="primary">
                Sign in
              </ButtonLink>
              <ButtonLink to="/signup?next=/locker">Create a free account</ButtonLink>
            </>
          }
        >
          Your buddy is the Glim other players see in games and on your profile. Pick one, then give it hats, frames and more from the shop.
        </EmptyState>
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
      <section className={`panel rounded-[var(--radius-l)] p-4 ${className}`} aria-label="Your emotes">
        <h2 className="mb-2 font-display text-xl font-bold">Your emotes</h2>
        <ul className="flex flex-wrap gap-2">
          {emotes.map((e) => (
            <li key={e.id} title={e.name} className="grid size-14 place-items-center rounded-[var(--radius-m)] border border-line bg-surface-2">
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
              earnedTitle={extras.data?.earnedTitle?.text}
            />
          ) : (
            <Skeleton className="h-96 rounded-[var(--radius-l)]" />
          )}
          {data ? <Outfits outfits={extras.data?.outfits ?? []} byId={byId} onChanged={refresh} /> : null}
          {data ? <LockerUniform preview={buddy ? { art: buddy.art as GlimArt, accessories } : null} /> : null}
          {emotesPanel('hidden lg:block')}
        </div>
        <div className="min-w-0">
          {/* Counts appear once they are known, rather than as zeros while the locker loads. */}
          <StickerTabs value={slot} onValueChange={setSlot} label="What to change" items={SLOTS.map((s) => ({ value: s.value, label: s.label, ...(data ? { count: data.items.filter(s.match).length } : {}) }))}>
            <StickerTabPanel value={slot} className="focus-visible:outline-offset-8">
              {active.note ? <p className="mb-4 text-text-2">{active.note}</p> : null}
              {slot === 'title' && data ? <EarnedTitles current={extras.data?.earnedTitle?.id ?? null} onChanged={refresh} /> : null}
              {slot === 'title' && data ? <h3 className="mb-2 font-display text-xl font-bold">From the shop</h3> : null}
              {loading ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-60 rounded-[var(--radius-l)]" />
                  ))}
                </div>
              ) : null}
              {data && list.length === 0 && slot !== 'title' ? (
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
                      <div className={`flex h-full flex-col overflow-hidden ${f.className}`} style={f.style}>
                        <RarityPanel rarity={i.rarity} className="m-1.5 h-32">
                          <ItemArtView art={i.art} rarity={i.rarity} size={i.type === 'banner' ? 130 : i.type === 'frame' ? 82 : 96} />
                          {on ? (
                            <span className="absolute bottom-2 left-1/2 z-[2] inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-lantern px-2 py-0.5 text-xs font-bold whitespace-nowrap text-on-accent shadow-[0_4px_10px_-4px_rgb(2_5_20/0.6)]">
                              <Check className="size-3.5" aria-hidden /> {words.on}
                            </span>
                          ) : null}
                        </RarityPanel>
                        <div className="flex flex-1 flex-col gap-2 px-3 pb-3">
                          <div className="min-w-0">
                            <div className="truncate font-display text-[1.05rem] leading-tight font-bold">{i.name}</div>
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
