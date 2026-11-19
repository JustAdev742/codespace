import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Heart, Minus, Plus, Sparkles, Wallet as WalletIcon } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { calmUntil, formatDate, formatNumber } from '../../lib/format.ts';
import { CurrencyIcon } from '../../art/icons.tsx';
import { AccountError, EmptyState, ErrorNotice, Field, PageHeader, ProgressBar, Select, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { extrasKey } from '../profile/extras.ts';
import { goalLine, todayLine, walletReason, weekLine } from './walletLogic.ts';

/*
 * /wallet (D58). A player's own money page, in a nine-year-old's words: what they have, how much
 * of today's game Sparks they have earned, what they are saving for, the week so far, and every
 * Spark in and out, newest first. Nothing compares them with anyone, nothing counts down, and
 * nothing asks them to spend.
 */

interface Entry {
  id: number;
  currency: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  detail: string | null;
  createdAt: string;
}

interface WalletData {
  balances: Record<string, number>;
  today: { gameSparks: number; cap: number; resetsAt: string };
  boost: { label: string; multiplier: number; startsAt: string; endsAt: string; running: boolean } | null;
  goal: { id: string; name: string; price: { currency: string; amount: number }; sale: { was: number; until: string } | null; have: number; inShopNow: boolean } | null;
  goalOptions: { id: string; name: string; price: { currency: string; amount: number } }[];
  week: { since: string; earned: number; spent: number; sources: { reason: string; sparks: number }[]; lastWeek: { earned: number; spent: number } };
  entries: Entry[];
  nextBefore: number | null;
}

const CURRENCY_NAME: Record<string, string> = { sparks: 'Sparks', moonstones: 'Moonstones', dust: 'Glow Dust', frost_tickets: 'Frost Tickets' };
const currencyName = (c: string) => CURRENCY_NAME[c] ?? c.replace(/_/g, ' ');

/** "Today", "Yesterday", or the day written out, for grouping the list. */
function dayHeading(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const key = (x: Date) => formatDate(x, { year: 'numeric', month: '2-digit', day: '2-digit' });
  if (key(d) === key(now)) return 'Today';
  if (key(d) === key(new Date(now.getTime() - 86_400_000))) return 'Yesterday';
  return formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function Wallet() {
  const me = useMe();
  const qc = useQueryClient();
  useEffect(() => {
    document.title = 'Wallet - Ludora';
  }, []);
  const q = useQuery({ queryKey: ['wallet'], queryFn: () => api.get<WalletData>('/api/me/wallet'), enabled: Boolean(me.data?.user) });
  const more = useInfiniteQuery({
    queryKey: ['wallet', 'older', q.data?.nextBefore ?? 0],
    queryFn: ({ pageParam }) => api.get<{ entries: Entry[]; nextBefore: number | null }>(`/api/me/wallet/history?before=${pageParam}`),
    initialPageParam: q.data?.nextBefore ?? 0,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: false,
  });
  const setGoal = useMutation({
    mutationFn: (listingId: string | null) => api.put<{ savingGoal: string | null }>('/api/me/saving-goal', { listingId }),
    onSuccess: async (r) => {
      toast.success(r.savingGoal ? 'Saving goal chosen' : 'Saving goal cleared');
      await Promise.all([qc.invalidateQueries({ queryKey: ['wallet'] }), qc.invalidateQueries({ queryKey: extrasKey })]);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Your goal did not change. Try again.'),
  });

  const entries = useMemo(() => [...(q.data?.entries ?? []), ...(more.data?.pages.flatMap((p) => p.entries) ?? [])], [q.data, more.data]);
  const groups = useMemo(() => {
    const out: { day: string; items: Entry[] }[] = [];
    for (const e of entries) {
      const day = dayHeading(e.createdAt);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [entries]);
  const hasMore = more.data ? more.hasNextPage : Boolean(q.data?.nextBefore);

  if (me.isError && !me.data) {
    return (
      <>
        <PageHeader title="Wallet" />
        <AccountError onRetry={() => void me.refetch()} />
      </>
    );
  }
  if (!me.isLoading && !me.data?.user) {
    return (
      <>
        <PageHeader title="Wallet" />
        <EmptyState icon={<WalletIcon />} title="Sign in to see your wallet" action={<ButtonLink to="/signin?next=/wallet" variant="primary">Sign in</ButtonLink>}>
          Your wallet shows the Sparks you earn by playing and where they went.
        </EmptyState>
      </>
    );
  }

  const d = q.data;
  const balances = d ? ['sparks', 'moonstones', 'dust', ...Object.keys(d.balances).filter((c) => !['sparks', 'moonstones', 'dust'].includes(c) && (d.balances[c] ?? 0) > 0)] : ['sparks', 'moonstones', 'dust'];
  const today = d ? todayLine(d.today.gameSparks, d.today.cap) : null;
  const goal = d?.goal ? goalLine(d.goal.have, d.goal.price.amount, currencyName(d.goal.price.currency)) : null;

  return (
    <>
      <PageHeader title="Wallet" description="What you have, where it came from and what you are saving for. Everything here is earned by playing. None of it is real money." />
      {q.isError ? <ErrorNotice message="Your wallet did not load." onRetry={() => void q.refetch()} /> : null}

      <section aria-labelledby="wallet-balances" className="mb-6">
        <h2 id="wallet-balances" className="sr-only">
          What you have
        </h2>
        <ul className="grid grid-cols-3 gap-2 sm:gap-3">
          {balances.map((c) => (
            <li key={c} className="panel flex min-w-0 flex-col gap-1.5 rounded-[var(--radius-l)] px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-3.5">
              <span className="flex min-w-0 items-center gap-1.5 sm:contents">
                <CurrencyIcon code={c} size={28} />
                <span className="min-w-0 truncate text-sm font-semibold text-text-2 sm:hidden">{currencyName(c)}</span>
              </span>
              <div className="min-w-0">
                <p className="hidden text-sm font-semibold text-text-2 sm:block">{currencyName(c)}</p>
                {d ? <p className="font-display text-[2rem] leading-none font-extrabold tabular sm:text-[2.4rem]">{formatNumber(d.balances[c] ?? 0)}</p> : <Skeleton className="mt-1 h-9 w-16" />}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section aria-labelledby="wallet-goal" className="panel flex min-w-0 flex-col gap-3 rounded-[var(--radius-l)] p-4 sm:p-5">
          <h2 id="wallet-goal" className="font-display text-2xl leading-tight font-bold">
            Saving for
          </h2>
          {!d ? (
            <Skeleton className="h-28" />
          ) : d.goal && goal ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                <p className="min-w-0 font-display text-[1.9rem] leading-tight font-bold break-words">{d.goal.name}</p>
                <p className="inline-flex items-center gap-1.5 font-display text-2xl leading-none font-extrabold tabular">
                  <CurrencyIcon code={d.goal.price.currency} size={22} />
                  {formatNumber(Math.min(d.goal.have, d.goal.price.amount))}
                  <span className="text-lg font-bold text-text-2">/ {formatNumber(d.goal.price.amount)}</span>
                </p>
              </div>
              <ProgressBar value={Math.min(d.goal.have, d.goal.price.amount)} max={d.goal.price.amount} tone={goal.ready ? 'mint' : 'amber'} label={`Saving for ${d.goal.name}`} className="h-4" />
              <p className="text-[15px] font-semibold text-text">{goal.text}</p>
              {d.goal.sale ? <p className="text-sm text-text-2">It is on sale {calmUntil(d.goal.sale.until)}, usually {formatNumber(d.goal.sale.was)}.</p> : null}
              {!d.goal.inShopNow ? <p className="text-sm text-text-2">It is not in the shop today. Daily and weekly picks come round again.</p> : null}
              <div className="mt-1 flex flex-wrap items-end gap-3">
                <GoalPicker options={d.goalOptions} value={d.goal.id} pending={setGoal.isPending} onChange={(id) => setGoal.mutate(id)} />
                <ButtonLink to="/shop?tab=featured" variant="ghost">
                  Go to the shop
                </ButtonLink>
              </div>
            </>
          ) : d.goalOptions.length ? (
            <>
              <p className="text-text-2">Pick something from your wishlist to save for, and see how close you are.</p>
              <GoalPicker options={d.goalOptions} value="" pending={setGoal.isPending} onChange={(id) => setGoal.mutate(id)} />
            </>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-text-2">
                Press the <Heart className="inline size-4 align-[-2px]" aria-label="heart" /> on anything in the shop to add it to your wishlist. Then you can choose it here as something to save for.
              </p>
              <ButtonLink to="/shop" variant="secondary">
                Go to the shop
              </ButtonLink>
            </div>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby="wallet-today" className="panel rounded-[var(--radius-l)] p-4 sm:p-5">
            <h2 id="wallet-today" className="mb-2 font-display text-2xl leading-tight font-bold">
              Today
            </h2>
            {d && today ? (
              <>
                <ProgressBar value={Math.min(d.today.gameSparks, d.today.cap)} max={d.today.cap} tone={today.reached ? 'mint' : 'amber'} label="Game Sparks earned today" />
                <p className="mt-2 text-[15px] text-text-2">{today.text}</p>
              </>
            ) : (
              <Skeleton className="h-14" />
            )}
            {d?.boost ? (
              <p className="mt-3 flex items-start gap-2 rounded-[var(--radius-m)] bg-surface-2 px-3 py-2 text-[15px] font-semibold text-text">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-lantern" aria-hidden />
                <span>
                  {d.boost.running ? `${d.boost.label}: game Sparks are worth ${d.boost.multiplier} times as much ${calmUntil(d.boost.endsAt)}.` : `${d.boost.label} starts ${formatDate(d.boost.startsAt, { weekday: 'long' })}.`}
                </span>
              </p>
            ) : null}
          </section>
          <section aria-labelledby="wallet-week" className="panel rounded-[var(--radius-l)] p-4 sm:p-5">
            <h2 id="wallet-week" className="mb-2 font-display text-2xl leading-tight font-bold">
              This week
            </h2>
            {d ? (
              <>
                <p className="text-[15px] text-text-2">{weekLine(d.week.earned, d.week.lastWeek.earned)}</p>
                {d.week.sources.length ? (
                  <ul className="mt-3 flex flex-col gap-1.5" aria-label="Where this week's Sparks came from">
                    {d.week.sources.map((s) => (
                      <li key={s.reason} className="flex items-baseline justify-between gap-3 text-[15px]">
                        <span className="min-w-0">{walletReason(s.reason)}</span>
                        <span className="shrink-0 font-display text-lg font-bold tabular">{formatNumber(s.sparks)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {d.week.spent ? <p className="mt-2 text-sm text-text-2">You spent {formatNumber(d.week.spent)} Sparks this week.</p> : null}
              </>
            ) : (
              <Skeleton className="h-20" />
            )}
          </section>
        </div>
      </div>

      <section aria-labelledby="wallet-history">
        <h2 id="wallet-history" className="mb-1 font-display text-[1.75rem] leading-tight font-bold">
          In and out
        </h2>
        <p className="mb-4 text-text-2">Every Spark, Moonstone and bit of Dust you got or spent, newest first.</p>
        {!d ? (
          <Skeleton className="h-64" />
        ) : !entries.length ? (
          <EmptyState icon={<WalletIcon />} title="Nothing yet">
            Play a game to earn your first Sparks.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((g) => (
              <div key={g.day}>
                <h3 className="mb-2 text-sm font-bold text-text-2">{g.day}</h3>
                <ul className="panel divide-y divide-line overflow-hidden rounded-[var(--radius-l)]">
                  {g.items.map((e) => (
                    <EntryRow key={e.id} e={e} />
                  ))}
                </ul>
              </div>
            ))}
            {hasMore ? (
              <div>
                <Button loading={more.isFetching} onClick={() => void (more.data ? more.fetchNextPage() : more.refetch())}>
                  Show older
                </Button>
              </div>
            ) : null}
          </div>
        )}
        <p className="mt-6 text-sm text-text-3">
          Something looks wrong? Ask your teacher or a grown-up to contact Ludora. You can also see what is in the <Link to="/shop" className="font-semibold text-link underline-offset-2 hover:underline">shop</Link>.
        </p>
      </section>
    </>
  );
}

function EntryRow({ e }: { e: Entry }) {
  const gain = e.delta > 0;
  const none = e.delta === 0;
  return (
    <li className="flex min-w-0 items-center gap-3 px-3.5 py-3">
      <span className={`grid size-9 shrink-0 place-items-center rounded-full ${none ? 'bg-surface-3 text-text-2' : gain ? 'bg-glim/15 text-glim' : 'bg-surface-3 text-text-2'}`} aria-hidden>
        {gain ? <Plus className="size-4" /> : <Minus className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-text">{walletReason(e.reason)}</span>
        {e.detail ? <span className="block text-sm break-words text-text-2">{e.detail}</span> : null}
      </span>
      <span className="shrink-0 text-right">
        <span className={`inline-flex items-center gap-1 font-display text-xl leading-none font-extrabold tabular ${gain ? 'text-glim' : 'text-text'}`}>
          {gain ? '+' : none ? '' : '-'}
          {formatNumber(Math.abs(e.delta))}
          <CurrencyIcon code={e.currency} size={16} />
          <span className="sr-only">{currencyName(e.currency)}</span>
        </span>
        <span className="block text-xs text-text-3">{formatDate(e.createdAt, { hour: '2-digit', minute: '2-digit' })}</span>
      </span>
    </li>
  );
}

function GoalPicker({ options, value, pending, onChange }: { options: WalletData['goalOptions']; value: string; pending: boolean; onChange: (id: string | null) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(ev) => {
        ev.preventDefault();
        onChange(v || null);
      }}
    >
      <div className="w-full max-w-[18rem]">
        <Field label={value ? 'Change your goal' : 'Choose from your wishlist'}>
          {(p) => (
            <Select {...p} value={v} onChange={(ev) => setV(ev.target.value)}>
              <option value="">{value ? 'No goal' : 'Pick one'}</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({formatNumber(o.price.amount)} {currencyName(o.price.currency)})
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Button type="submit" loading={pending} disabled={v === value}>
        {v ? 'Save for this' : 'Clear goal'}
      </Button>
    </form>
  );
}
