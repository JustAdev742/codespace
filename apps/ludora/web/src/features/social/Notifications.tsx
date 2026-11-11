import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Award, Bell, CalendarClock, Castle, Gamepad2, Mail, MailOpen, TrendingUp, UserPlus, Users } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { formatDate, timeAgo } from '../../lib/format.ts';
import { AccountError, EmptyState, ErrorNotice, PageHeader, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink, IconButton } from '../../ui/Button.tsx';
import { usePageTitle } from './data.ts';

/*
 * Notifications: friend requests and new friends, invites to games, rewards
 * (achievements and levels) and work due soon. Read and unread; opening the
 * page leaves them as they are until the player marks them, so nothing slips by.
 */

export interface NotificationItem {
  id: string;
  kind: 'friend_request' | 'friend_accepted' | 'invite' | 'achievement' | 'level' | 'collection' | 'due' | 'school';
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

interface Page {
  due: NotificationItem[];
  items: NotificationItem[];
  nextBefore: string | null;
}

const ICON: Record<NotificationItem['kind'], { icon: React.ReactNode; tone: string; label: string }> = {
  friend_request: { icon: <UserPlus className="size-5" />, tone: 'bg-sky', label: 'Friend request' },
  friend_accepted: { icon: <Users className="size-5" />, tone: 'bg-sky', label: 'New friend' },
  invite: { icon: <Gamepad2 className="size-5" />, tone: 'bg-lantern', label: 'Invite' },
  achievement: { icon: <Award className="size-5" />, tone: 'bg-dusk', label: 'Reward' },
  level: { icon: <TrendingUp className="size-5" />, tone: 'bg-glim', label: 'Reward' },
  collection: { icon: <Award className="size-5" />, tone: 'bg-glim', label: 'Reward' },
  due: { icon: <CalendarClock className="size-5" />, tone: 'bg-ember', label: 'Work due' },
  school: { icon: <Castle className="size-5" />, tone: 'bg-lantern', label: 'School' },
};

function Row({ n, onRead, onUnread }: { n: NotificationItem; onRead: (id: string) => void; onUnread: (id: string) => void }) {
  const kind = ICON[n.kind];
  const live = n.kind !== 'due';
  return (
    <li className={`flex items-start gap-3 rounded-[var(--radius-m)] border p-3.5 ${n.read ? 'border-line bg-raised' : 'border-lantern/50 bg-lantern/10'}`}>
      <span className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-[var(--radius-m)] text-on-accent ${kind.tone}`} aria-hidden>
        {kind.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-text-2">
          {kind.label}
          {!n.read ? <span className="ml-2 rounded-[var(--radius-s)] bg-lantern px-1.5 font-bold text-on-accent">New</span> : null}
        </p>
        {n.link ? (
          <Link to={n.link} onClick={() => live && !n.read && onRead(n.id)} className="font-bold break-words text-text">
            {n.title}
          </Link>
        ) : (
          <p className="font-bold break-words">{n.title}</p>
        )}
        {n.body ? <p className="text-sm break-words text-text-2">{n.body}</p> : null}
        <p className="mt-0.5 text-xs text-text-3">{n.kind === 'due' ? `Due ${formatDate(n.createdAt, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : timeAgo(n.createdAt)}</p>
      </div>
      {/* An invite or a challenge: join straight from here. */}
      {n.kind === 'invite' && n.link?.startsWith('/join/') ? (
        <ButtonLink to={n.link} size="sm" variant="primary" onClick={() => !n.read && onRead(n.id)} aria-label={`Join: ${n.title}`} className="self-center">
          Join
        </ButtonLink>
      ) : null}
      {live ? (
        <IconButton label={n.read ? `Mark as unread: ${n.title}` : `Mark as read: ${n.title}`} onClick={() => (n.read ? onUnread(n.id) : onRead(n.id))}>
          {n.read ? <Mail className="size-5" aria-hidden /> : <MailOpen className="size-5" aria-hidden />}
        </IconButton>
      ) : null}
    </li>
  );
}

export default function Notifications() {
  usePageTitle('Notifications');
  const me = useMe();
  const qc = useQueryClient();
  const user = me.data?.user;
  const list = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    queryFn: ({ pageParam }) => api.get<Page>(`/api/notifications${pageParam ? `?before=${pageParam}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: Boolean(user),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const read = useMutation({
    mutationFn: (ids?: string[]) => api.post('/api/notifications/read', ids ? { ids: ids.map(Number) } : {}),
    onSuccess: refresh,
    onError: () => toast.error('That did not save. Try again.'),
  });
  const unread = useMutation({
    mutationFn: (id: string) => api.post(`/api/notifications/${id}/unread`),
    onSuccess: refresh,
    onError: () => toast.error('That did not save. Try again.'),
  });
  // After "Mark all as read", tell screen reader users it worked.
  const status = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (read.isSuccess && read.variables === undefined && status.current) status.current.textContent = 'All marked as read.';
  }, [read.isSuccess, read.variables]);

  if (me.isError && !me.data) {
    return (
      <>
        <PageHeader title="Notifications" />
        <AccountError onRetry={() => void me.refetch()} />
      </>
    );
  }
  if (!me.isLoading && !user) {
    return (
      <>
        <PageHeader title="Notifications" />
        <EmptyState icon={<Bell />} title="Sign in to see your notifications" action={<ButtonLink to="/signin?next=/notifications" variant="primary">Sign in</ButtonLink>}>
          Friend requests, invites to games, rewards and work due soon.
        </EmptyState>
      </>
    );
  }
  const pages = list.data?.pages ?? [];
  const due = pages[0]?.due ?? [];
  const items = pages.flatMap((p) => p.items);
  const anyUnread = items.some((i) => !i.read);
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Friend requests, invites, rewards and work due soon."
        actions={
          anyUnread ? (
            <Button icon={<MailOpen className="size-4" aria-hidden />} loading={read.isPending && read.variables === undefined} onClick={() => read.mutate(undefined)}>
              Mark all as read
            </Button>
          ) : null
        }
      />
      <p ref={status} role="status" className="sr-only" />
      {list.isError ? <ErrorNotice message="Your notifications did not load." onRetry={() => void list.refetch()} /> : null}
      {list.isPending && user ? <Skeleton className="h-60" /> : null}
      {due.length ? (
        <section className="mb-6" aria-labelledby="due-heading">
          <h2 id="due-heading" className="mb-2 font-display text-2xl font-bold">
            Due soon
          </h2>
          <ul className="flex flex-col gap-2">
            {due.map((n) => (
              <Row key={n.id} n={n} onRead={() => {}} onUnread={() => {}} />
            ))}
          </ul>
        </section>
      ) : null}
      {list.data && items.length === 0 && due.length === 0 ? (
        <EmptyState icon={<Bell />} title="Nothing new">
          When a friend asks to be friends, invites you to a game, or you unlock a reward, it shows up here.
        </EmptyState>
      ) : null}
      {items.length ? (
        <section aria-labelledby="all-heading">
          <h2 id="all-heading" className="mb-2 font-display text-2xl font-bold">
            Recent
          </h2>
          <ul className="flex flex-col gap-2">
            {items.map((n) => (
              <Row key={n.id} n={n} onRead={(id) => read.mutate([id])} onUnread={(id) => unread.mutate(id)} />
            ))}
          </ul>
          {list.hasNextPage ? (
            <Button className="mt-4" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              Show older
            </Button>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
