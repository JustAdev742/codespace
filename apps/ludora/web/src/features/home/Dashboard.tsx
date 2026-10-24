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
import { SparkIcon } from '../../art/icons.tsx';
import { Stage } from '../../ui/Stage.tsx';
import { Amount, Badge, ErrorNotice, Panel, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { ModeCard } from '../modes/ModeCard.tsx';
import { OpenGames } from '../host/OpenGames.tsx';
import { BLEED_ROUNDING, Bleed, Meter } from './kit.tsx';

/** Shown until the overview loads, or if a player somehow has no buddy. */
const PLACEHOLDER_BUDDY: GlimArt = { kind: 'glim', body: 'blob', hue: 30, accentHue: 45, saturation: 25, eyes: 'dot', mouth: 'smile', pattern: 'freckles', topper: 'none', cheeks: true };

/** The player's buddy as their avatar, in its frame if they have one equipped, with a link to change it. Still: no idle motion. */
function Buddy() {
  const o = useOverview();
  const avatar = o.data?.avatar;
  const frame = o.data?.equipped.frame?.art;
  const buddy = o.data?.equipped.buddy;
  const name = buddy?.name;
  const rarity: Rarity | undefined = avatar?.rarity ?? RARITIES.find((r) => r === buddy?.rarity);
  const glim = <Glim art={avatar?.art ?? PLACEHOLDER_BUDDY} accessories={avatar?.accessories} size={190} rarity={rarity} silhouette={!avatar} className="h-auto w-full" />;
  return (
    <div className="relative w-[104px] shrink-0 sm:w-[168px]">
      {frame?.kind === 'frame' ? (
        <FrameRing style={frame.style} hue={frame.hue} accentHue={frame.accentHue} size={168}>
          <span className="grid size-full place-items-center bg-white/10">{glim}</span>
        </FrameRing>
      ) : (
        <div className="relative">{glim}</div>
      )}
      {name ? (
        // 28px to see, 44px to press: the strip above and below makes up the difference.
        <Link
          to="/locker"
          className="absolute -bottom-2 left-1/2 inline-flex h-7 -translate-x-1/2 items-center rounded-[var(--radius-s)] bg-white px-2.5 text-sm font-bold whitespace-nowrap text-on-accent no-underline after:absolute after:inset-x-0 after:-inset-y-2 hover:bg-[#e8ecfb]"
          aria-label={`${name} is your buddy. Change your buddy in the locker`}
        >
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
    <li className={`flex items-center gap-4 rounded-[var(--radius-m)] px-3 py-3 ${ready ? 'bg-glim/15' : ''}`}>
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
            {/* The player card: their buddy, their name, their level. On phones the meter and streak run the full width under it. */}
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-5 sm:gap-x-6 sm:gap-y-3">
              <div className="sm:row-span-3 sm:self-center">
                <Buddy />
              </div>
              <div className="flex min-w-0 flex-col gap-3">
                <h1 className="font-display text-[2.4rem] leading-none font-extrabold break-words sm:text-[3.4rem]">Hi, {user.displayName}</h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="plate plate-gold text-xl sm:text-2xl">
                    <span className="tabular">Level {lv.level}</span>
                  </span>
                  <span className="text-sm text-text-2 tabular">{lv.needed ? `${formatNumber(lv.needed - lv.into)} XP to level ${lv.level + 1}` : 'Top level reached'}</span>
                </div>
              </div>
              <div className="col-span-2 w-full max-w-[480px] sm:col-span-1 sm:col-start-2">
                <Meter value={lv.needed ? lv.into : 1} max={lv.needed || 1} tone="amber" size="lg" label={`Level ${lv.level} progress`} />
              </div>
              {streak > 0 ? (
                <p className="col-span-2 inline-flex items-center gap-1.5 font-semibold text-lantern sm:col-span-1 sm:col-start-2">
                  <Flame className="size-5 shrink-0" aria-hidden />
                  {o?.stats.playedToday ? `${streak}-day streak. Come back tomorrow to keep it.` : `Play today to keep your ${streak}-day streak.`}
                </p>
              ) : (
                <p className="col-span-2 text-text-2 sm:col-span-1 sm:col-start-2">Play a game today to start a streak.</p>
              )}
            </div>
            <div className="hud stage-card p-4 sm:p-5">
              <h2 className="mb-3 font-display text-2xl leading-none font-bold">Join a game</h2>
              <CodeEntry />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ButtonLink to="/host" variant="secondary" icon={<Presentation className="size-4" aria-hidden />}>
                  Host a game
                </ButtonLink>
                <ButtonLink to="/host?solo=1" variant="secondary" icon={<Swords className="size-4" aria-hidden />}>
                  Play solo
                </ButtonLink>
              </div>
            </div>
          </div>
        </Stage>
      </Bleed>

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel className="p-5 sm:p-6" aria-labelledby="quests-title">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="quests-title" className="font-display text-[1.75rem] leading-tight font-bold">
              Today&apos;s quests
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
                {(o?.recentGames ?? []).slice(0, 4).map((g) => (
                  <li key={g.gameId} className="flex items-center justify-between gap-3 rounded-[var(--radius-m)] bg-surface-2 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate font-bold">{g.title}</div>
                      <div className="truncate text-sm text-text-2">{g.setTitle}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-display text-2xl leading-none font-extrabold tabular">{g.players > 1 ? ordinal(g.rank) : `${g.correct}/${g.answered}`}</div>
                      <div className="mt-0.5 text-xs text-text-2">{g.players > 1 ? timeAgo(g.endedAt) : `right, ${timeAgo(g.endedAt)}`}</div>
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
