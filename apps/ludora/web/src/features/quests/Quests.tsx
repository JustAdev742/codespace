import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { formatNumber, untilText } from '../../lib/format.ts';
import { useMe } from '../../lib/session.ts';
import type { QuestView } from '../../lib/queries.ts';
import { Amount, Badge, EmptyState, ErrorNotice, PageHeader, ProgressBar, Skeleton, Tabs } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';

interface QuestsResponse {
  resets: { daily: string; weekly: string };
  events: { key: string; name: string; period: string }[];
  quests: QuestView[];
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  reward: { sparks?: number; moonstones?: number; xp?: number; itemId?: string };
  tier: 1 | 2 | 3;
  hue: number;
  unlockedAt: string | null;
}

const TIER_LABEL = { 1: 'Bronze', 2: 'Silver', 3: 'Gold' } as const;

function RewardChips({ reward }: { reward: QuestView['reward'] | Achievement['reward'] }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {reward.sparks ? <Amount currency="sparks" value={reward.sparks} size="sm" /> : null}
      {reward.moonstones ? <Amount currency="moonstones" value={reward.moonstones} size="sm" /> : null}
      {'frost_tickets' in reward && reward.frost_tickets ? <Amount currency="frost_tickets" value={reward.frost_tickets} size="sm" /> : null}
      {reward.xp ? <span className="text-sm font-bold text-text-2 tabular">{formatNumber(reward.xp)} XP</span> : null}
      {'itemId' in reward && reward.itemId ? <span className="text-sm font-semibold text-text-2">and an item</span> : null}
    </span>
  );
}

function QuestCard({ q }: { q: QuestView }) {
  const qc = useQueryClient();
  const claim = useMutation({
    mutationFn: () => api.post<{ levelUp: { from: number; to: number } | null }>(`/api/quests/${q.id}/claim`, { period: q.period }),
    onSuccess: async (res) => {
      toast.success(res.levelUp ? `Reward claimed. You reached level ${res.levelUp.to}.` : 'Reward claimed');
      await Promise.all([qc.invalidateQueries({ queryKey: ['quests'] }), qc.invalidateQueries({ queryKey: ['overview'] }), qc.invalidateQueries({ queryKey: ['me'] })]);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not claim the reward.'),
  });
  return (
    <li className={`flex flex-col gap-3 rounded-[var(--radius-m)] border p-4 ${q.completed && !q.claimed ? 'border-glim bg-glim/8' : 'border-line bg-raised'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-text">{q.title}</h3>
          <p className="text-sm text-text-2">{q.description}</p>
        </div>
        {q.claimed ? (
          <Badge tone="mint">
            <Check className="size-3.5" /> Claimed
          </Badge>
        ) : q.completed ? (
          <Button size="sm" variant="success" loading={claim.isPending} onClick={() => claim.mutate()}>
            Claim
          </Button>
        ) : (
          <span className="shrink-0 text-sm font-bold text-text-2 tabular">
            {formatNumber(q.progress)}/{formatNumber(q.target)}
          </span>
        )}
      </div>
      {!q.completed ? <ProgressBar value={q.progress} max={q.target} label={`${q.title}: ${q.progress} of ${q.target}`} /> : null}
      <RewardChips reward={q.reward} />
    </li>
  );
}

function QuestGroup({ title, note, quests }: { title: string; note: string; quests: QuestView[] }) {
  if (!quests.length) return null;
  const done = quests.filter((q) => q.completed).length;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-xl font-bold">{title}</h2>
        <p className="text-sm text-text-3">
          {done} of {quests.length} done. {note}
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {quests.map((q) => (
          <QuestCard key={`${q.id}:${q.period}`} q={q} />
        ))}
      </ul>
    </section>
  );
}

function Medal({ a }: { a: Achievement }) {
  const earned = Boolean(a.unlockedAt);
  const ring = a.tier === 3 ? '#f5c451' : a.tier === 2 ? '#c7cbe0' : '#d89a6a';
  return (
    <svg viewBox="0 0 48 48" className="size-12 shrink-0" aria-hidden>
      <circle cx="24" cy="24" r="21" fill={earned ? `hsl(${a.hue} 75% 58%)` : 'var(--surface-3)'} stroke={earned ? ring : 'var(--line-strong)'} strokeWidth="4" />
      {earned ? (
        <path d="M24 13l3.2 6.6 7.2 1-5.2 5 1.3 7.2L24 29.4l-6.5 3.4 1.3-7.2-5.2-5 7.2-1z" fill="var(--on-accent)" />
      ) : (
        <g stroke="var(--text-3)" strokeWidth="2.4" fill="none" strokeLinecap="round">
          <rect x="17" y="22" width="14" height="11" rx="2" />
          <path d="M20 22v-3a4 4 0 0 1 8 0v3" />
        </g>
      )}
    </svg>
  );
}

export default function Quests() {
  const me = useMe();
  const signedIn = Boolean(me.data?.user);
  const quests = useQuery({ queryKey: ['quests'], queryFn: () => api.get<QuestsResponse>('/api/quests'), enabled: signedIn });
  const achievements = useQuery({ queryKey: ['achievements'], queryFn: () => api.get<{ achievements: Achievement[]; secretLeft: number }>('/api/achievements'), enabled: signedIn });
  const [filter, setFilter] = useState('all');
  const list = useMemo(() => {
    const all = achievements.data?.achievements ?? [];
    if (filter === 'earned') return all.filter((a) => a.unlockedAt);
    if (filter === 'progress') return all.filter((a) => !a.unlockedAt).sort((x, y) => y.progress / y.target - x.progress / x.target);
    return all;
  }, [achievements.data, filter]);

  if (!me.isLoading && !signedIn) {
    return (
      <>
        <PageHeader title="Quests and achievements" />
        <EmptyState title="Sign in to take on quests" action={<ButtonLink to="/signin?next=/quests" variant="primary">Sign in</ButtonLink>}>
          Quests give you something new to aim for every day. A guest account works too.
        </EmptyState>
      </>
    );
  }

  const q = quests.data;
  const earned = (achievements.data?.achievements ?? []).filter((a) => a.unlockedAt).length;
  const total = achievements.data?.achievements.length ?? 0;
  return (
    <>
      <PageHeader title="Quests and achievements" description="Quests change every day and every week; claim each reward when you finish. Achievements are yours for good and pay out the moment you earn them." />
      <div className="flex flex-col gap-8">
        {quests.isLoading ? <Skeleton className="h-48" /> : null}
        {quests.error ? <ErrorNotice message="Your quests did not load." onRetry={() => void quests.refetch()} /> : null}
        {q ? (
          <>
            <QuestGroup title="Today" note={`New quests in ${untilText(q.resets.daily)}.`} quests={q.quests.filter((x) => x.kind === 'daily')} />
            <QuestGroup title="This week" note={`New quests in ${untilText(q.resets.weekly)}.`} quests={q.quests.filter((x) => x.kind === 'weekly')} />
            {q.events.map((ev) => (
              <QuestGroup key={ev.key} title={ev.name} note={`Event quests change each week while the festival runs. They are the only way to earn its tickets.`} quests={q.quests.filter((x) => x.kind === 'event' && x.period === ev.period)} />
            ))}
          </>
        ) : null}

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">Achievements</h2>
              {achievements.data ? (
                <p className="text-sm text-text-3">
                  {earned} of {total} earned{achievements.data.secretLeft ? `, plus ${achievements.data.secretLeft} hidden ones to discover` : ''}.
                </p>
              ) : null}
            </div>
          </div>
          <Tabs
            value={filter}
            onValueChange={setFilter}
            label="Achievements to show"
            items={[
              { value: 'all', label: 'All', count: total },
              { value: 'progress', label: 'In progress', count: total - earned },
              { value: 'earned', label: 'Earned', count: earned },
            ]}
          />
          {achievements.isLoading ? <Skeleton className="h-60" /> : null}
          {achievements.error ? <ErrorNotice message="Achievements did not load." onRetry={() => void achievements.refetch()} /> : null}
          {achievements.data && !list.length ? (
            <EmptyState title={filter === 'earned' ? 'None earned yet' : 'All earned'} action={filter === 'earned' ? <ButtonLink to="/play" variant="primary">Play a game</ButtonLink> : undefined}>
              {filter === 'earned' ? 'Your first one comes with your first finished game.' : 'You have every achievement there is. Impressive.'}
            </EmptyState>
          ) : null}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((a) => (
              <li key={a.id} className={`flex gap-3 rounded-[var(--radius-m)] border p-4 ${a.unlockedAt ? 'border-line bg-raised' : 'border-dashed border-line-strong bg-transparent'}`}>
                <Medal a={a} />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-text">{a.title}</h3>
                    <span className="text-xs text-text-3">{TIER_LABEL[a.tier]}</span>
                  </div>
                  <p className="text-sm text-text-2">{a.description}</p>
                  {a.unlockedAt ? (
                    <p className="text-xs text-text-3">Earned {new Date(a.unlockedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <ProgressBar value={a.progress} max={a.target} tone="violet" label={`${a.title}: ${a.progress} of ${a.target}`} />
                      <span className="shrink-0 text-xs font-semibold text-text-2 tabular">
                        {formatNumber(a.progress)}/{formatNumber(a.target)}
                      </span>
                    </div>
                  )}
                  <RewardChips reward={a.reward} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
