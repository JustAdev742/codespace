import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Clock } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { formatNumber, untilText } from '../../lib/format.ts';
import { useMe } from '../../lib/session.ts';
import type { QuestView } from '../../lib/queries.ts';
import { AccountError, Amount, EmptyState, ErrorNotice, PageHeader, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { Meter, ToggleChips } from '../home/kit.tsx';

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

const TIER = {
  1: { label: 'Bronze', ring: '#d0884f' },
  2: { label: 'Silver', ring: '#c3c8de' },
  3: { label: 'Gold', ring: '#f5c451' },
} as const;

function RewardChips({ reward }: { reward: QuestView['reward'] | Achievement['reward'] }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {reward.sparks ? <Amount currency="sparks" value={reward.sparks} size="sm" /> : null}
      {reward.moonstones ? <Amount currency="moonstones" value={reward.moonstones} size="sm" /> : null}
      {'frost_tickets' in reward && reward.frost_tickets ? <Amount currency="frost_tickets" value={reward.frost_tickets} size="sm" /> : null}
      {reward.xp ? <span className="font-display text-base leading-tight font-bold text-text-2 tabular">{formatNumber(reward.xp)} XP</span> : null}
      {'itemId' in reward && reward.itemId ? <span className="text-sm font-semibold text-text-2">and an item</span> : null}
    </span>
  );
}

function QuestCard({ q, fill }: { q: QuestView; fill: string }) {
  const qc = useQueryClient();
  const claim = useMutation({
    mutationFn: () => api.post<{ levelUp: { from: number; to: number } | null }>(`/api/quests/${q.id}/claim`, { period: q.period }),
    onSuccess: async (res) => {
      toast.success(res.levelUp ? `Reward claimed. You reached level ${res.levelUp.to}.` : 'Reward claimed');
      await Promise.all([qc.invalidateQueries({ queryKey: ['quests'] }), qc.invalidateQueries({ queryKey: ['overview'] }), qc.invalidateQueries({ queryKey: ['me'] })]);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not claim the reward.'),
  });
  const ready = q.completed && !q.claimed;
  return (
    <li className={`relative flex flex-col gap-3 overflow-hidden rounded-[var(--radius-l)] border p-4 pt-5 ${ready ? 'border-glim bg-glim/10' : q.claimed ? 'border-line bg-raised opacity-80' : 'border-line bg-raised'}`}>
      {/* The group's colour along the top edge; mint once it is ready to claim. */}
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: ready ? 'var(--glim)' : fill }} aria-hidden />
      <div className="min-w-0">
        <h3 className="font-display text-xl leading-tight font-bold">{q.title}</h3>
        <p className="mt-0.5 text-sm text-text-2">{q.description}</p>
      </div>
      {!q.completed ? (
        <div className="flex items-center gap-3">
          <Meter value={q.progress} max={q.target} size="sm" fill={fill} label={`${q.title}: ${q.progress} of ${q.target}`} />
          <span className="shrink-0 font-display text-base font-bold text-text-2 tabular">
            {formatNumber(q.progress)}/{formatNumber(q.target)}
          </span>
        </div>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <RewardChips reward={q.reward} />
        {q.claimed ? (
          <span className="inline-flex items-center gap-1 rounded-[var(--radius-s)] bg-glim px-2 py-0.5 text-sm font-bold text-on-accent">
            <Check className="size-4" aria-hidden /> Claimed
          </span>
        ) : ready ? (
          <Button size="sm" variant="success" loading={claim.isPending} onClick={() => claim.mutate()}>
            Claim reward
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function QuestGroup({ title, reset, note, quests, tone, fill }: { title: string; reset?: string; note?: string; quests: QuestView[]; tone: string; fill: string }) {
  if (!quests.length) return null;
  const done = quests.filter((q) => q.completed).length;
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`quests-${title}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <span className={`h-7 w-1.5 rounded-[2px] ${tone}`} aria-hidden />
          <h2 id={`quests-${title}`} className="font-display text-[1.75rem] leading-tight font-bold">
            {title}
          </h2>
          <span className="rounded-[var(--radius-s)] bg-surface-3 px-2 py-0.5 text-sm font-bold text-text-2 tabular">
            {done} of {quests.length} done
          </span>
        </div>
        {reset ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-text-2">
            <Clock className="size-4" aria-hidden /> New quests in {untilText(reset)}
          </span>
        ) : null}
      </div>
      {note ? <p className="-mt-1 text-sm text-text-2">{note}</p> : null}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {quests.map((q) => (
          <QuestCard key={`${q.id}:${q.period}`} q={q} fill={fill} />
        ))}
      </ul>
    </section>
  );
}

function Medal({ a }: { a: Achievement }) {
  const earned = Boolean(a.unlockedAt);
  const ring = TIER[a.tier].ring;
  return (
    <svg viewBox="0 0 56 64" className="h-16 w-14 shrink-0" aria-hidden focusable={false}>
      {/* Ribbon */}
      <path d="M17 2H27L31 22H21Z" fill={earned ? `hsl(${a.hue} 70% 46%)` : 'var(--surface-3)'} stroke={earned ? 'var(--ink)' : 'var(--line-strong)'} strokeWidth="2" strokeLinejoin="round" />
      <path d="M39 2H29L25 22H35Z" fill={earned ? `hsl(${(a.hue + 30) % 360} 75% 58%)` : 'var(--surface-3)'} stroke={earned ? 'var(--ink)' : 'var(--line-strong)'} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="28" cy="40" r="20" fill={earned ? ring : 'var(--surface-3)'} stroke={earned ? 'var(--ink)' : 'var(--line-strong)'} strokeWidth="2.5" />
      <circle cx="28" cy="40" r="14" fill={earned ? `hsl(${a.hue} 75% 60%)` : 'var(--surface-2)'} stroke={earned ? 'var(--ink)' : 'var(--line-strong)'} strokeWidth="2" strokeDasharray={earned ? undefined : '3 3'} />
      {earned ? (
        <path d="M28 31l2.7 5.6 6.1.8-4.4 4.2 1.1 6.1L28 44.8l-5.5 2.9 1.1-6.1-4.4-4.2 6.1-.8z" fill="#fff" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" />
      ) : (
        <g stroke="var(--text-3)" strokeWidth="2.4" fill="none" strokeLinecap="round">
          <rect x="22" y="39" width="12" height="9" rx="2" />
          <path d="M24.5 39v-2.5a3.5 3.5 0 0 1 7 0V39" />
        </g>
      )}
    </svg>
  );
}

type AchievementFilter = 'all' | 'progress' | 'earned';

export default function Quests() {
  const me = useMe();
  const signedIn = Boolean(me.data?.user);
  const quests = useQuery({ queryKey: ['quests'], queryFn: () => api.get<QuestsResponse>('/api/quests'), enabled: signedIn });
  const achievements = useQuery({ queryKey: ['achievements'], queryFn: () => api.get<{ achievements: Achievement[]; secretLeft: number }>('/api/achievements'), enabled: signedIn });
  const [filter, setFilter] = useState<AchievementFilter>('all');
  const list = useMemo(() => {
    const all = achievements.data?.achievements ?? [];
    if (filter === 'earned') return all.filter((a) => a.unlockedAt);
    if (filter === 'progress') return all.filter((a) => !a.unlockedAt).sort((x, y) => y.progress / y.target - x.progress / x.target);
    return all;
  }, [achievements.data, filter]);

  if (me.isError && !me.data) {
    return (
      <>
        <PageHeader title="Quests and achievements" />
        <AccountError onRetry={() => void me.refetch()} />
      </>
    );
  }
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
      <PageHeader title="Quests and achievements" description="Quests change every day and every week. Claim each reward when you finish. Achievements are yours for good, and pay out the moment you earn them." />
      <div className="flex flex-col gap-10">
        {quests.isLoading ? <Skeleton className="h-48 rounded-[var(--radius-l)]" /> : null}
        {quests.error ? <ErrorNotice message="Your quests did not load." onRetry={() => void quests.refetch()} /> : null}
        {q ? (
          <>
            <QuestGroup title="Today" reset={q.resets.daily} quests={q.quests.filter((x) => x.kind === 'daily')} tone="bg-lantern" fill="var(--lantern)" />
            <QuestGroup title="This week" reset={q.resets.weekly} quests={q.quests.filter((x) => x.kind === 'weekly')} tone="bg-dusk" fill="var(--dusk)" />
            {q.events.map((ev) => (
              <QuestGroup key={ev.key} title={ev.name} note="Event quests change each week while the festival runs. They are the only way to earn its tickets." quests={q.quests.filter((x) => x.kind === 'event' && x.period === ev.period)} tone="bg-sky" fill="var(--sky)" />
            ))}
          </>
        ) : null}

        <section className="flex flex-col gap-4" aria-labelledby="achievements-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="achievements-title" className="font-display text-[1.75rem] leading-tight font-bold">
                Achievements
              </h2>
              {achievements.data ? (
                <p className="text-text-2">
                  {earned} of {total} earned{achievements.data.secretLeft ? `, plus ${achievements.data.secretLeft} hidden ones to discover` : ''}.
                </p>
              ) : null}
            </div>
            <ToggleChips<AchievementFilter>
              value={filter}
              onChange={setFilter}
              label="Achievements to show"
              options={[
                { value: 'all', label: `All ${total}` },
                { value: 'progress', label: `In progress ${total - earned}` },
                { value: 'earned', label: `Earned ${earned}` },
              ]}
            />
          </div>
          {achievements.isLoading ? <Skeleton className="h-60 rounded-[var(--radius-l)]" /> : null}
          {achievements.error ? <ErrorNotice message="Achievements did not load." onRetry={() => void achievements.refetch()} /> : null}
          {achievements.data && !list.length ? (
            <EmptyState title={filter === 'earned' ? 'None earned yet' : 'All earned'} action={filter === 'earned' ? <ButtonLink to="/play" variant="primary">Join a game</ButtonLink> : undefined}>
              {filter === 'earned' ? 'Your first one comes with your first finished game.' : 'You have every achievement there is. Impressive.'}
            </EmptyState>
          ) : null}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((a) => (
              <li key={a.id} className={`flex gap-3.5 rounded-[var(--radius-l)] border p-4 ${a.unlockedAt ? 'border-line bg-raised' : 'border-dashed border-line-strong'}`}>
                <Medal a={a} />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <h3 className="font-display text-xl leading-tight font-bold">{a.title}</h3>
                    <span className="text-xs font-semibold text-text-2">{TIER[a.tier].label}</span>
                  </div>
                  <p className="text-sm text-text-2">{a.description}</p>
                  {a.unlockedAt ? (
                    <p className="text-sm font-semibold text-glim">Earned {new Date(a.unlockedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Meter value={a.progress} max={a.target} size="sm" tone="amber" label={`${a.title}: ${a.progress} of ${a.target}`} />
                      <span className="shrink-0 text-xs font-bold text-text-2 tabular">
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
