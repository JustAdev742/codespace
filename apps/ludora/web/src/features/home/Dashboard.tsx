import { Link } from 'react-router';
import { SchoolStrip } from '../school/SchoolStrip.tsx';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trophy } from 'lucide-react';
import { useMe } from '../../lib/session.ts';
import { thumbFor, useModes, useOverview, type QuestView } from '../../lib/queries.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { api, ApiError } from '../../lib/api.ts';
import { formatNumber, ordinal, timeAgo, untilText } from '../../lib/format.ts';
import { SparkIcon } from '../../art/icons.tsx';
import { Amount, Badge, ErrorNotice, Panel, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { ModeCard } from '../modes/ModeCard.tsx';
import { OpenGames } from '../host/OpenGames.tsx';
import { NextUp } from './NextUp.tsx';
import { StudentMore, StudentToday } from './StudentHome.tsx';
import { Meter } from './kit.tsx';
import { Place } from './Place.tsx';
import { QuestBadge } from '../../art/badges.tsx';

function rewardText(r: QuestView['reward']): string {
  return [r.sparks ? `${r.sparks} Sparks` : '', r.moonstones ? `${r.moonstones} Moonstones` : '', r.frost_tickets ? `${r.frost_tickets} Frost Tickets` : '', r.xp ? `${r.xp} XP` : ''].filter(Boolean).join(', ');
}

function QuestRow({ q }: { q: QuestView }) {
  const qc = useQueryClient();
  const claim = useMutation({
    mutationFn: () => api.post<{ reward: QuestView['reward'] }>(`/api/quests/${q.id}/claim`, { period: q.period }),
    onSuccess: async () => {
      toast.success(`Quest complete: you got ${rewardText(q.reward)}`);
      await Promise.all([qc.invalidateQueries({ queryKey: ['overview'] }), qc.invalidateQueries({ queryKey: ['me'] }), qc.invalidateQueries({ queryKey: ['quests'] })]);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not claim the reward.'),
  });
  const ready = q.completed && !q.claimed;
  return (
    <li className={`flex items-center gap-4 rounded-[var(--radius-m)] px-3 py-3 ${ready ? 'bg-glim/15' : ''}`}>
      <QuestBadge metric={q.metric} kind={q.kind} done={q.completed} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-bold">{q.title}</span>
          {q.kind === 'weekly' ? <Badge tone="violet">This week</Badge> : q.kind === 'event' ? <Badge tone="sky">Frost Festival</Badge> : null}
        </div>
        <p className="text-sm text-text-2">{q.description}</p>
        {!q.completed ? (
          <div className="mt-2 flex items-center gap-3">
            <Meter value={q.progress} max={q.target} size="sm" tone="violet" label={`${q.title}: ${q.progress} of ${q.target}`} className="max-w-[260px]" />
            <span className="shrink-0 font-display text-base font-bold text-text-2 tabular">
              {formatNumber(q.progress)}/{formatNumber(q.target)}
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {q.claimed ? (
          <Badge tone="mint">Claimed</Badge>
        ) : ready ? (
          <Button size="sm" variant="success" loading={claim.isPending} onClick={() => claim.mutate()}>
            Claim
          </Button>
        ) : null}
        <span className="flex flex-wrap justify-end gap-x-2.5">
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
  const quests = o?.quests.list ?? [];
  const today = quests.filter((q) => q.kind === 'daily' || (q.completed && !q.claimed));
  const later = quests.filter((q) => !today.includes(q));
  const laterDone = later.filter((q) => q.completed).length;

  return (
    <div className="flex flex-col gap-8">
      {/* The menu: the yard, with the join box and the places to go. */}
      <Place />

      {user.isGuest ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-m)] border border-lantern/60 bg-lantern/10 px-4 py-3">
          <p className="text-text-2">
            <span className="font-bold text-text">You&apos;re playing as a guest.</span> Your Glims and Sparks live on this device only. Save them to an account to play anywhere.
          </p>
          <ButtonLink to="/signup" variant="primary" size="sm">
            Save my progress
          </ButtonLink>
        </div>
      ) : null}

      {overview.isError ? <ErrorNotice message="Your overview could not be loaded." onRetry={() => overview.refetch()} /> : null}

      {/* Only there when this player is hosting games: a way back into them, or to close them. */}
      <OpenGames />

      {/* The school: a countdown to its next event, notices, and the player's house. */}
      <SchoolStrip />

      {/* A teacher's classes and last game, or a student's assignments: the first thing to do today. */}
      <NextUp />

      {/* First steps, today's challenge, mistakes to fix and the weekly goal. */}
      <StudentToday />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel className="p-5 sm:p-6" aria-labelledby="quests-title">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="quests-title" className="font-display text-[1.75rem] leading-tight font-bold">
              Today&apos;s quests
            </h2>
            {o ? <span className="text-sm text-text-2">New ones in {untilText(o.quests.resets.daily)}</span> : null}
          </div>
          {!o ? (
            // While it loads, rows shaped like quests; if it failed, the notice above says so, so nothing pulses for ever.
            overview.isError ? (
              <p className="py-3 text-sm text-text-2">Your quests will show here once your overview loads.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            )
          ) : (
            <ul className="-mx-3 flex flex-col">
              {today.map((q) => (
                <QuestRow key={`${q.id}-${q.period}`} q={q} />
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-sm text-text-2">{o && later.length ? `Weekly and event quests: ${laterDone} of ${later.length} done.` : 'Quests give you something new to aim for every day.'}</p>
            <ButtonLink to="/quests" size="sm">
              All quests
            </ButtonLink>
          </div>
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel className="p-5 sm:p-6" aria-labelledby="wallet-title">
            <h2 id="wallet-title" className="font-display text-[1.75rem] leading-tight font-bold">
              Your Sparks
            </h2>
            {o ? (
              <>
                <p className="mt-1 flex items-center gap-2 font-display text-[3.5rem] leading-none font-extrabold tabular">
                  <SparkIcon size={40} />
                  {formatNumber(o.balances.sparks ?? 0)}
                </p>
                <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-text-2">
                  <span className="inline-flex items-center gap-1.5">
                    <Amount currency="moonstones" value={o.balances.moonstones ?? 0} size="sm" className="text-text" /> Moonstones
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Amount currency="dust" value={o.balances.dust ?? 0} size="sm" className="text-text" /> Glow Dust
                  </span>
                </p>
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between gap-3 text-sm font-semibold">
                    <span>Sparks from games today</span>
                    <span className="tabular">
                      {formatNumber(o.dailySparks.earned)} of {formatNumber(o.dailySparks.cap)}
                    </span>
                  </div>
                  <Meter value={o.dailySparks.earned} max={o.dailySparks.cap} tone="amber" label="Sparks from games today" />
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <ButtonLink to="/shop?tab=lanterns" variant="primary">
                    Open a Lantern
                  </ButtonLink>
                  <ButtonLink to="/collection" variant="secondary">
                    See my Glims
                  </ButtonLink>
                </div>
              </>
            ) : overview.isError ? (
              <p className="mt-2 text-sm text-text-2">Your balance will show here once your overview loads.</p>
            ) : (
              <Skeleton className="mt-3 h-40" />
            )}
          </Panel>

          <Panel className="p-5 sm:p-6" aria-labelledby="recent-title">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="recent-title" className="font-display text-[1.75rem] leading-tight font-bold">
                Recent games
              </h2>
              <Link to="/me" className="text-sm font-semibold">
                All my games
              </Link>
            </div>
            {o && o.recentGames.length === 0 ? (
              <div className="flex items-center gap-4 rounded-[var(--radius-m)] bg-surface-2 p-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-m)] bg-sky text-on-accent">
                  <Trophy className="size-6" aria-hidden />
                </span>
                <p className="text-sm text-text-2">
                  <span className="block font-bold text-text">No games yet</span>
                  Join one with a code, or play a mode on your own to get started.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {(o?.recentGames ?? []).slice(0, 4).map((g) => {
                  const played = modes.data?.modes.find((m) => m.meta.id === g.modeId)?.meta;
                  return (
                    <li key={g.gameId} className="flex items-center justify-between gap-3 rounded-[var(--radius-m)] bg-surface-2 px-3.5 py-2.5">
                      {played ? <ModeArt thumb={thumbFor(played)} mode={played} className="h-10 w-14 shrink-0 rounded-[var(--radius-s)]" /> : null}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">{g.title}</div>
                        <div className="truncate text-sm text-text-2">{g.setTitle}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-display text-2xl leading-none font-extrabold tabular">{g.players > 1 ? ordinal(g.rank) : `${g.correct}/${g.answered}`}</div>
                        <div className="mt-0.5 text-xs text-text-2">{g.players > 1 ? timeAgo(g.endedAt) : `right, ${timeAgo(g.endedAt)}`}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* Last week's recap, favourites and recently played. */}
      <StudentMore />

      <section aria-labelledby="play-title">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 id="play-title" className="font-display text-[1.9rem] leading-none font-bold sm:text-[2.25rem]">
            Pick a game to play
          </h2>
          <Link to="/modes" className="font-semibold">
            All game modes
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {modes.isLoading
            ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72 rounded-[var(--radius-l)]" />)
            : (modes.data?.modes ?? [])
                .filter((m) => m.meta.status === 'playable')
                .slice(0, 8)
                .map((m) => <ModeCard key={m.meta.id} mode={m} />)}
        </div>
      </section>
    </div>
  );
}
