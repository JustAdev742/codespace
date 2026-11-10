import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';

export const notificationCountKey = ['notifications', 'count'] as const;

/** The bell's number: unread notifications plus work due soon. Polled gently while the tab is open. */
export function useNotificationCount(enabled: boolean) {
  return useQuery({ queryKey: notificationCountKey, queryFn: () => api.get<{ unread: number }>('/api/notifications/count'), enabled, refetchInterval: 60_000, staleTime: 20_000 });
}

/** The header's bell: a link to the notifications page with the number waiting. Signed-in accounts only. */
export function NotificationBell() {
  const me = useMe();
  const signedIn = Boolean(me.data?.user);
  const count = useNotificationCount(signedIn);
  if (!signedIn) return null;
  const n = count.data?.unread ?? 0;
  return (
    <Link to="/notifications" className="relative grid size-11 place-items-center rounded-full border border-line bg-raised text-text hover:bg-surface-2" aria-label={n ? `Notifications, ${n} new` : 'Notifications'}>
      <Bell className="size-5" aria-hidden />
      {n ? (
        <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-lantern px-1 font-display text-xs leading-none font-bold text-on-accent tabular" aria-hidden>
          {n > 99 ? '99+' : n}
        </span>
      ) : null}
    </Link>
  );
}
