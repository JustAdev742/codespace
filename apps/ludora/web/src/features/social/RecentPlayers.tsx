import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Gamepad2, UserPlus } from 'lucide-react';
import type { AvatarLite } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { plural, timeAgo } from '../../lib/format.ts';
import { Dialog, ErrorNotice, Panel, Skeleton } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { Dot, PlayerAvatar } from './parts.tsx';
import { errorText, friendsKey, type Friend } from './data.ts';

interface RecentPlayer {
  id: string;
  displayName: string;
  level: number;
  avatar: AvatarLite | null;
  lastPlayed: string;
  games: number;
  lastMode: string;
}

/**
 * People you played with lately, to add as friends. The server lists only players who accept
 * requests from everyone, never guests or anyone blocked, so nobody's settings are revealed.
 */
export function RecentPlayers() {
  const qc = useQueryClient();
  const recent = useQuery({ queryKey: ['friends', 'recent'], queryFn: () => api.get<{ players: RecentPlayer[] }>('/api/friends/recent') });
  const ask = useMutation({
    mutationFn: (p: RecentPlayer) => api.post<{ status: 'pending' | 'accepted' }>('/api/friends/request', { userId: p.id }),
    onSuccess: async (r, p) => {
      toast.success(r.status === 'accepted' ? `You and ${p.displayName} are now friends` : `Friend request sent to ${p.displayName}`);
      await Promise.all([qc.invalidateQueries({ queryKey: friendsKey }), qc.invalidateQueries({ queryKey: ['friends', 'recent'] })]);
    },
    onError: (err) => toast.error(errorText(err, 'The request did not send. Try again.')),
  });
  const list = recent.data?.players ?? [];
  return (
    <Panel className="p-5" aria-labelledby="recent-players-heading">
      <h2 id="recent-players-heading" className="font-display text-2xl font-bold">
        Played with lately
      </h2>
      <p className="text-sm text-text-3">From your games in the last 30 days. Only players who welcome friend requests are shown.</p>
      {recent.isError ? (
        <div className="mt-3">
          <ErrorNotice message={errorText(recent.error, 'This list did not load.')} onRetry={() => void recent.refetch()} />
        </div>
      ) : !recent.data ? (
        <Skeleton className="mt-3 h-14" />
      ) : list.length === 0 ? (
        <p className="mt-3 text-sm text-text-2">Nobody to suggest yet. Play a game with others and they may show up here.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              <PlayerAvatar avatar={p.avatar} size={44} />
              <div className="min-w-0 grow basis-28">
                <Link to={`/profile/${p.id}`} className="block truncate font-semibold text-text underline-offset-2 hover:underline">
                  {p.displayName}
                </Link>
                <p className="text-sm text-text-3">
                  {p.lastMode}
                  <Dot />
                  {p.games > 1 ? `${plural(p.games, 'game')}, last ${timeAgo(p.lastPlayed)}` : timeAgo(p.lastPlayed)}
                </p>
              </div>
              <Button size="sm" className="ml-auto" icon={<UserPlus className="size-4" />} loading={ask.isPending && ask.variables?.id === p.id} onClick={() => ask.mutate(p)} aria-label={`Add ${p.displayName} as a friend`}>
                Add friend
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

interface OpenRoom {
  code: string;
  title: string;
  setTitle: string;
  status: string;
}

/** The games you host that are open now, for inviting friends to. */
export function useOpenRooms(enabled: boolean) {
  return useQuery({ queryKey: ['rooms', 'open'], queryFn: () => api.get<{ rooms: OpenRoom[] }>('/api/rooms'), staleTime: 15_000, enabled });
}

/** Invite a friend to one of your open games: straight away with one game, or pick which with several. */
export function InviteButton({ friend, rooms }: { friend: Friend; rooms: OpenRoom[] }) {
  const [choosing, setChoosing] = useState(false);
  const invite = useMutation({
    mutationFn: (room: OpenRoom) => api.post('/api/invites', { userId: friend.id, code: room.code }),
    onSuccess: (_r, room) => {
      setChoosing(false);
      toast.success(`Invited ${friend.displayName} to ${room.title}`);
    },
    onError: (err) => toast.error(errorText(err, 'The invite did not send. Try again.')),
  });
  if (!rooms.length) return null;
  return (
    <>
      <Button size="sm" variant="primary" icon={<Gamepad2 className="size-4" />} loading={invite.isPending && !choosing} onClick={() => (rooms.length === 1 ? invite.mutate(rooms[0]!) : setChoosing(true))} aria-label={`Invite ${friend.displayName} to your game`}>
        Invite
      </Button>
      <Dialog open={choosing} onOpenChange={setChoosing} title={`Invite ${friend.displayName}`} description="Which game? They get a notification with the join link." size="sm">
        <ul className="flex flex-col gap-2">
          {rooms.map((r) => (
            <li key={r.code}>
              <Button className="w-full justify-between" loading={invite.isPending && invite.variables?.code === r.code} onClick={() => invite.mutate(r)}>
                <span className="truncate">
                  {r.title}, {r.setTitle}
                </span>
                <span className="font-display tabular">{r.code}</span>
              </Button>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
