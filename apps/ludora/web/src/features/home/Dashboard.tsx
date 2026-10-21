import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Flame, Presentation, Swords, Trophy } from 'lucide-react';
import { RARITIES, type GlimArt, type Rarity } from '@ludora/shared';
import { useMe } from '../../lib/session.ts';
import { useModes, useOverview, type QuestView } from '../../lib/queries.ts';
import { api, ApiError } from '../../lib/api.ts';
import { formatNumber, ordinal, timeAgo, untilText } from '../../lib/format.ts';
import { CodeEntry } from '../play/CodeEntry.tsx';
import { Glim } from '../../art/glim/Glim.tsx';
import { FrameRing } from '../../art/cosmetics.tsx';
import { Lantern } from '../../art/Lantern.tsx';
import { SparkIcon } from '../../art/icons.tsx';
import { Stage } from '../../ui/Stage.tsx';
import { Amount, Badge, ErrorNotice, Panel, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { ModeCard } from '../modes/ModeCard.tsx';
import { BLEED_ROUNDING, Bleed, Meter } from './kit.tsx';

/** Shown until the overview loads, or if a player somehow has no buddy. */
const PLACEHOLDER_BUDDY: GlimArt = { kind: 'glim', body: 'blob', hue: 30, accentHue: 45, saturation: 25, eyes: 'dot', mouth: 'smile', pattern: 'freckles', topper: 'none', cheeks: true };

/** The player's buddy, big, standing in a pool of lantern light, with their level pinned to it. */
function Buddy({ level }: { level: number }) {
  const o = useOverview();
  const avatar = o.data?.avatar;
  const frame = o.data?.equipped.frame?.art;
  const buddy = o.data?.equipped.buddy;
  const name = buddy?.name;
  const rarity: Rarity | undefined = avatar?.rarity ?? RARITIES.find((r) => r === buddy?.rarity);
  const glim = <Glim art={avatar?.art ?? PLACEHOLDER_BUDDY} accessories={avatar?.accessories} size={210} rarity={rarity} pose={avatar ? 'wave' : 'idle'} bob={Boolean(avatar)} silhouette={!avatar} className="h-auto w-full" />;
  return (
    <div className="relative w-[170px] shrink-0 sm:w-[190px]">
      {/* A pool of warm light under the buddy */}
      <div className="absolute inset-x-[6%] bottom-[2%] h-[22%] rounded-[50%] bg-[#ffcf5c] opacity-30 blur-md" aria-hidden />
      {frame?.kind === 'frame' ? (
        <FrameRing style={frame.style} hue={frame.hue} accentHue={frame.accentHue} size={190}>
          <span className="grid size-full place-items-center bg-white/10">{glim}</span>
        </FrameRing>
      ) : (
        <div className="relative">{glim}</div>
      )}
      <span className="absolute top-1 -left-1 grid size-14 place-items-center rounded-full border-[3px] border-ink bg-lantern text-on-accent shadow-[0_3px_0_var(--ink)] sm:size-16" aria-hidden>
        <span className="flex flex-col items-center leading-none">
          <span className="text-[10px] font-bold sm:text-[11px]">Level</span>
          <span className="font-display text-2xl font-extrabold sm:text-[1.7rem]">{level}</span>
        </span>
      </span>
      {name ? (
        <Link to="/locker" className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border-2 border-ink bg-white px-3 py-0.5 font-display text-sm font-bold whitespace-nowrap text-[#1d1846] no-underline shadow-[0_2px_0_var(--ink)] hover:bg-[#fff4d6]" aria-label={`${name} is your buddy. Change your buddy in the locker`}>
          {name}
        </Link>
      ) : null}
    </div>
  );
}

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
    <li className={`flex items-center gap-4 rounded-[16px] px-3 py-3 ${ready ? 'bg-glim/15' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-bold">{q.title}</span>
          {q.kind === 'weekly' ? <Badge tone="violet">This week</Badge> : q.kind === 'event' ? <Badge tone="sky">Frost Festival</Badge> : null}
        </div>
        <p className="text-sm text-text-2">{q.description}</p>
        {!q.completed ? (
          <div className="mt-2 flex items-center gap-3">
            <Meter value={q.progress} max={q.target} size="sm" tone="violet" label={`${q.title}: ${q.progress} of ${q.target}`} className="max-w-[260px]" />
            <span className="shrink-0 text-sm font-bold text-text-2 tabular">
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
  const lv = user.level;
  const quests = o?.quests.list ?? [];
  const today = quests.filter((q) => q.kind === 'daily' || (q.completed && !q.claimed));
  const later = quests.filter((q) => !today.includes(q));
  const laterDone = later.filter((q) => q.completed).length;
  const streak = o?.stats.dailyStreak ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <Bleed>
        <Stage className={`px-4 pt-7 pb-8 sm:px-6 lg:pt-10 lg:pb-11 ${BLEED_ROUNDING}`}>
          <div className="mx-auto grid max-w-[1120px] grid-cols-1 items-center gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,410px)]">
            <div className="flex min-w-0 flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:text-left">
              <Buddy level={lv.level} />
              <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
                <h1 className="font-display text-[2.6rem] leading-[1.05] font-extrabold break-words sm:text-5xl">Hi, {user.displayName}</h1>
                <div className="w-full max-w-[420px] self-center sm:self-start">
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-bold">Level {lv.level}</span>
                    <span className="text-text-2 tabular">{lv.needed ? `${formatNumber(lv.needed - lv.into)} XP to level ${lv.level + 1}` : 'Top level reached'}</span>
                  </div>
                  <Meter value={lv.needed ? lv.into : 1} max={lv.needed || 1} tone="amber" size="lg" label={`Level ${lv.level} progress`} />
                </div>
                {streak > 0 ? (
                  <p className="inline-flex items-center gap-1.5 self-center font-semibold text-lantern sm:self-start">
                    <Flame className="size-5" aria-hidden />
                    {o?.stats.playedToday ? `${streak}-day streak. See you tomorrow!` : `Play today to keep your ${streak}-day streak going.`}
                  </p>
                ) : (
                  <p className="text-text-2">Play a game today to start a streak.</p>
                )}
              </div>
            </div>
            <div className="paper stage-card p-4 sm:p-5">
              <p className="mb-3 font-display text-xl font-bold">Join a game</p>
              <CodeEntry />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ButtonLink to="/host" variant="secondary" icon={<Presentation className="size-4" />}>
                  Host a game
                </ButtonLink>
                <ButtonLink to="/host?solo=1" variant="secondary" icon={<Swords className="size-4" />}>
                  Play solo
                </ButtonLink>
              </div>
            </div>
          </div>
        </Stage>
      </Bleed>

      {user.isGuest ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border-2 border-dashed border-lantern-deep bg-lantern/15 px-4 py-3">
          <p className="text-text-2">
            <span className="font-bold text-text">You are playing as a guest.</span> Your Glims and Sparks live on this device only. Save them to an account to play anywhere.
          </p>
          <ButtonLink to="/signup" variant="primary" size="sm">
            Save my progress
          </ButtonLink>
        </div>
      ) : null}

      {overview.isError ? <ErrorNotice message="Your overview could not be loaded." onRetry={() => overview.refetch()} /> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel className="p-5 sm:p-6" aria-labelledby="quests-title">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="quests-title" className="font-display text-2xl font-extrabold">
              Today's quests
            </h2>
            {o ? <span className="text-sm text-text-2">New ones in {untilText(o.quests.resets.daily)}</span> : null}
          </div>
          {!o ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
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
          <section aria-labelledby="wallet-title" className="relative overflow-hidden rounded-[24px] border-[2.5px] border-ink bg-lantern p-5 text-on-accent shadow-[0_5px_0_var(--ink)] sm:p-6">
            <Lantern art={{ hue: 265, accentHue: 45, pattern: 'stars' }} size={118} lit className="pointer-events-none absolute -top-3 right-2 rotate-6 sm:right-5" />
            <h2 id="wallet-title" className="font-display text-xl font-bold">
              Your Sparks
            </h2>
            {o ? (
              <>
                <p className="mt-1 flex items-center gap-2 font-display text-5xl font-extrabold tabular">
                  <SparkIcon size={40} />
                  {formatNumber(o.balances.sparks ?? 0)}
                </p>
                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    <Amount currency="moonstones" value={o.balances.moonstones ?? 0} size="sm" /> Moonstones
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Amount currency="dust" value={o.balances.dust ?? 0} size="sm" /> Glow Dust
                  </span>
                </p>
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between gap-3 text-sm font-semibold">
                    <span>Sparks from games today</span>
                    <span className="tabular">
                      {formatNumber(o.dailySparks.earned)} of {formatNumber(o.dailySparks.cap)}
                    </span>
                  </div>
                  <Meter value={o.dailySparks.earned} max={o.dailySparks.cap} tone="violet" label="Sparks from games today" />
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <ButtonLink to="/shop?tab=lanterns" variant="secondary" className="border-ink shadow-[0_3px_0_var(--ink)]">
                    Open a Lantern
                  </ButtonLink>
                  <Link to="/collection" className="inline-flex h-10 items-center rounded-[12px] px-3 font-bold text-on-accent underline decoration-2 underline-offset-4 hover:bg-[rgb(29_24_70/0.1)]">
                    See my Glims
                  </Link>
                </div>
              </>
            ) : (
              <Skeleton className="mt-3 h-40 bg-white/30" />
            )}
          </section>

          <Panel className="p-5 sm:p-6" aria-labelledby="recent-title">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="recent-title" className="font-display text-2xl font-extrabold">
                Recent games
              </h2>
              <Link to="/me" className="text-sm font-semibold">
                All my games
              </Link>
            </div>
            {o && o.recentGames.length === 0 ? (
              <div className="flex items-center gap-4 rounded-[16px] bg-surface-2 p-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-ink bg-sky text-on-accent">
                  <Trophy className="size-6" aria-hidden />
                </span>
                <p className="text-sm text-text-2">
                  <span className="block font-bold text-text">No games yet</span>
                  Join one with a code, or play a mode on your own to get started.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {(o?.recentGames ?? []).slice(0, 4).map((g) => (
                  <li key={g.gameId} className="flex items-center justify-between gap-3 rounded-[14px] bg-surface-2 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate font-bold">{g.title}</div>
                      <div className="truncate text-sm text-text-2">{g.setTitle}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-display text-lg font-extrabold">{g.players > 1 ? ordinal(g.rank) : `${g.correct}/${g.answered}`}</div>
                      <div className="text-xs text-text-2">{g.players > 1 ? timeAgo(g.endedAt) : `right, ${timeAgo(g.endedAt)}`}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <section aria-labelledby="play-title">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 id="play-title" className="font-display text-2xl font-extrabold sm:text-3xl">
            Pick a game to play
          </h2>
          <Link to="/modes" className="font-semibold">
            All game modes
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {modes.isLoading
            ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72 rounded-[22px]" />)
            : (modes.data?.modes ?? [])
                .filter((m) => m.meta.status === 'playable')
                .slice(0, 8)
                .map((m) => <ModeCard key={m.meta.id} mode={m} />)}
        </div>
      </section>
    </div>
  );
}
