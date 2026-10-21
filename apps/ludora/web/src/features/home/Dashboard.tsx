import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Flame, Presentation, ShoppingBag, Swords, Trophy, User } from 'lucide-react';
import { useMe } from '../../lib/session.ts';
import { useModes, useOverview, thumbFor, type QuestView } from '../../lib/queries.ts';
import { api, ApiError } from '../../lib/api.ts';
import { formatNumber, ordinal, timeAgo, untilText } from '../../lib/format.ts';
import { CodeEntry } from '../play/CodeEntry.tsx';
import { Glim } from '../../art/glim/Glim.tsx';
import { FrameRing } from '../../art/cosmetics.tsx';
import { ModeArt } from '../../art/ModeArt.tsx';
import { Amount, Badge, EmptyState, ErrorNotice, Panel, ProgressBar, SectionTitle, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';

function Buddy({ size = 112 }: { size?: number }) {
  const o = useOverview();
  const avatar = o.data?.avatar;
  const frame = o.data?.equipped.frame?.art;
  const glim = avatar ? <Glim art={avatar.art} accessories={avatar.accessories} size={size * 0.86} bob /> : <User className="size-10 text-text-3" />;
  if (frame && frame.kind === 'frame') {
    return (
      <FrameRing style={frame.style} hue={frame.hue} accentHue={frame.accentHue} size={size}>
        <span className="grid size-full place-items-center bg-surface-2">{glim}</span>
      </FrameRing>
    );
  }
  return <span className="grid shrink-0 place-items-center rounded-full bg-surface-2" style={{ width: size, height: size }}>{glim}</span>;
}

function QuestRow({ q }: { q: QuestView }) {
  const qc = useQueryClient();
  const claim = useMutation({
    mutationFn: () => api.post<{ reward: QuestView['reward'] }>(`/api/quests/${q.id}/claim`, { period: q.period }),
    onSuccess: async () => {
      const parts = [q.reward.sparks ? `${q.reward.sparks} Sparks` : '', q.reward.moonstones ? `${q.reward.moonstones} Moonstones` : '', q.reward.frost_tickets ? `${q.reward.frost_tickets} Frost Tickets` : '', q.reward.xp ? `${q.reward.xp} XP` : ''].filter(Boolean);
      toast.success(`Quest complete: +${parts.join(', ')}`);
      await qc.invalidateQueries({ queryKey: ['overview'] });
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not claim the reward.'),
  });
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{q.title}</span>
          {q.kind === 'weekly' ? <Badge tone="violet">Weekly</Badge> : q.kind === 'event' ? <Badge tone="sky">Frost Festival</Badge> : null}
        </div>
        <p className="text-sm text-text-3">{q.description}</p>
        {!q.completed ? <ProgressBar value={q.progress} max={q.target} className="mt-2" label={`${q.title} progress`} /> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {q.claimed ? (
          <Badge tone="mint">Claimed</Badge>
        ) : q.completed ? (
          <Button size="sm" variant="success" loading={claim.isPending} onClick={() => claim.mutate()}>
            Claim
          </Button>
        ) : (
          <span className="text-sm font-semibold text-text-2 tabular">
            {q.progress}/{q.target}
          </span>
        )}
        <span className="flex gap-2">
          {q.reward.sparks ? <Amount currency="sparks" value={q.reward.sparks} size="sm" /> : null}
          {q.reward.moonstones ? <Amount currency="moonstones" value={q.reward.moonstones} size="sm" /> : null}
          {q.reward.frost_tickets ? <Amount currency="frost_tickets" value={q.reward.frost_tickets} size="sm" /> : null}
        </span>
      </div>
    </li>
  );
}

export default function Dashboard() {
  const me = useMe();
  const overview = useOverview();
  const modes = useModes();
  const user = me.data!.user!;
  const o = overview.data;

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex items-center gap-5">
          <Buddy />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Hi, {user.displayName}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-2">
              <span className="font-semibold text-text">Level {user.level.level}</span>
              <div className="w-40">
                <ProgressBar value={user.level.into} max={user.level.needed || 1} tone="violet" label="Progress to next level" />
              </div>
              {user.level.needed ? <span className="tabular">{formatNumber(user.level.needed - user.level.into)} XP to go</span> : <span>Top level</span>}
              {o && o.stats.dailyStreak > 0 ? (
                <span className="inline-flex items-center gap-1 font-semibold text-lantern">
                  <Flame className="size-4" aria-hidden />
                  {o.stats.dailyStreak}-day streak{o.stats.playedToday ? '' : ': play today to keep it'}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 lg:w-[400px]">
          <CodeEntry />
          <div className="flex gap-2">
            <ButtonLink to="/host" variant="secondary" className="flex-1" icon={<Presentation className="size-4" />}>
              Host a game
            </ButtonLink>
            <ButtonLink to="/host?solo=1" variant="secondary" className="flex-1" icon={<Swords className="size-4" />}>
              Play solo
            </ButtonLink>
          </div>
        </div>
      </section>

      {user.isGuest ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-m)] border-2 border-dashed border-lantern/60 bg-dusk/20 px-4 py-3">
          <p className="text-sm text-text-2">
            <span className="font-semibold text-text">You are playing as a guest.</span> Guest progress lives on this device only. Save it to an account to play anywhere.
          </p>
          <ButtonLink to="/signup" variant="primary" size="sm">
            Save my progress
          </ButtonLink>
        </div>
      ) : null}

      {overview.isError ? <ErrorNotice message="Your overview could not be loaded." onRetry={() => overview.refetch()} /> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Panel className="p-5">
          <SectionTitle action={o ? <span className="text-xs text-text-3">New daily quests in {untilText(o.quests.resets.daily)}</span> : null}>Quests</SectionTitle>
          {!o ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {o.quests.list.map((q) => (
                <QuestRow key={`${q.id}-${q.period}`} q={q} />
              ))}
            </ul>
          )}
          <Link to="/quests" className="mt-2 inline-block text-sm font-semibold">
            Quests and achievements
          </Link>
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel className="p-5">
            <SectionTitle>Today</SectionTitle>
            {o ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-4">
                  <Amount currency="sparks" value={o.balances.sparks ?? 0} size="lg" />
                  <Amount currency="moonstones" value={o.balances.moonstones ?? 0} size="lg" />
                  <Amount currency="dust" value={o.balances.dust ?? 0} size="lg" />
                </div>
                <div>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="text-text-2">Sparks from games today</span>
                    <span className="font-semibold tabular">
                      {formatNumber(o.dailySparks.earned)} / {formatNumber(o.dailySparks.cap)}
                    </span>
                  </div>
                  <ProgressBar value={o.dailySparks.earned} max={o.dailySparks.cap} />
                </div>
                <div className="flex gap-2">
                  <ButtonLink to="/shop" variant="primary" size="sm" icon={<ShoppingBag className="size-4" />}>
                    Open the shop
                  </ButtonLink>
                  <ButtonLink to="/collection" variant="secondary" size="sm">
                    My Glims
                  </ButtonLink>
                </div>
              </div>
            ) : (
              <Skeleton className="h-28" />
            )}
          </Panel>

          <Panel className="p-5">
            <SectionTitle action={<Link to="/me" className="text-sm font-semibold">All games</Link>}>Recent games</SectionTitle>
            {o && o.recentGames.length === 0 ? (
              <EmptyState icon={<Trophy className="size-7" />} title="No games yet">
                Join a game with a code, or play one of the modes on your own to get started.
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {(o?.recentGames ?? []).map((g) => (
                  <li key={g.gameId} className="flex items-center justify-between gap-3 rounded-[12px] bg-surface-2 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{g.title}</div>
                      <div className="truncate text-xs text-text-3">{g.setTitle}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-display font-bold">{g.players > 1 ? ordinal(g.rank) : `${g.correct}/${g.answered} right`}</div>
                      <div className="text-xs text-text-3">{timeAgo(g.endedAt)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <section>
        <SectionTitle action={<Link to="/modes" className="text-sm font-semibold">All modes</Link>}>Pick a game to play</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(modes.data?.modes ?? []).slice(0, 8).map((m) => (
            <Link key={m.meta.id} to={`/modes/${m.meta.id}`} className="text-text no-underline overflow-hidden rounded-[var(--radius-m)] border border-line bg-raised transition-colors hover:border-line-strong">
              <ModeArt thumb={thumbFor(m.meta)} className="aspect-[16/9] w-full" />
              <div className="p-3.5">
                <div className="font-display font-bold">{m.meta.title}</div>
                <div className="line-clamp-2 text-sm text-text-2">{m.meta.tagline}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
