import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { formatNumber, plural, timeAgo } from '../../lib/format.ts';
import { useCan } from '../../lib/session.ts';
import { Badge, Dialog, EmptyState, ErrorNotice, Skeleton } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { ActionDialog, DataTable, KeyValues, StaffPage, Stat, StatusPill, dateTime, useStaffMutation, type Column } from './ui.tsx';

/*
 * Live rooms, refreshed every few seconds. Staff can look inside a room
 * (names and connection state only; answers and reconnect tokens never
 * leave the game server), remove a player, or close the room.
 */

type RoomStatus = 'lobby' | 'running' | 'paused' | 'ended' | 'closed';

interface RoomSummary {
  code: string;
  status: RoomStatus;
  modeId: string;
  variantId: string | null;
  title: string;
  setTitle: string;
  hostUserId: string;
  hostName: string;
  players: number;
  bots: number;
  connected: number;
  solo: boolean;
  locked: boolean;
  createdAt: string;
  lastActivity: string;
  gamesPlayed: number;
  errors: number;
}

interface RoomsResponse {
  rooms: RoomSummary[];
  totals: { rooms: number; players: number; sockets: number | null };
}

interface RoomPlayer {
  id: string;
  name: string;
  userId: string | null;
  isGuest: boolean;
  isBot: boolean;
  connected: boolean;
  teamId: string | null;
}

interface RoomDetail {
  room: RoomSummary;
  players: RoomPlayer[];
  setTitle: string;
  questions: number;
}

const REFRESH_MS = 5000;

const ROOM_STATUS: Record<RoomStatus, string> = { lobby: 'In lobby', running: 'Playing', paused: 'Paused', ended: 'Finished', closed: 'Closed' };

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function playerKind(p: RoomPlayer): string {
  if (p.isBot) return 'Practice bot';
  if (!p.userId) return 'Not signed in';
  return p.isGuest ? 'Guest account' : 'Account';
}

export default function Rooms() {
  const [params, setParams] = useSearchParams();
  const openCode = params.get('room');
  const canUsers = useCan('users.read');
  const rooms = useQuery({ queryKey: ['admin', 'rooms'], queryFn: () => api.get<RoomsResponse>('/api/admin/rooms'), refetchInterval: REFRESH_MS });
  const setRoom = (code: string | null) => {
    const next = new URLSearchParams(params);
    if (code) next.set('room', code);
    else next.delete('room');
    setParams(next, { replace: true });
  };

  const list = rooms.data?.rooms;
  const inGame = list?.filter((r) => r.status === 'running' || r.status === 'paused').length ?? 0;
  const connected = list?.reduce((n, r) => n + r.connected, 0) ?? 0;
  const errors = list?.reduce((n, r) => n + r.errors, 0) ?? 0;

  const columns: Column<RoomSummary>[] = [
    {
      key: 'code',
      header: 'Room',
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            className="font-mono text-[15px] font-bold tracking-wide text-text hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              setRoom(r.code);
            }}
            aria-label={`Room ${r.code}: open details`}
          >
            {r.code}
          </button>
          <span className="flex flex-wrap gap-1">
            <StatusPill status={r.status} label={ROOM_STATUS[r.status] ?? r.status} />
            {r.solo ? <Badge>Solo</Badge> : null}
            {r.locked ? (
              <Badge tone="amber">
                <Lock className="size-3" aria-hidden />
                Locked
              </Badge>
            ) : null}
          </span>
        </div>
      ),
    },
    {
      key: 'players',
      header: 'Players',
      align: 'right',
      cell: (r) => (
        <div>
          <div className="font-semibold">{formatNumber(r.players)}</div>
          <div className="text-xs whitespace-nowrap text-text-3">
            {formatNumber(r.connected)} connected{r.bots ? `, ${plural(r.bots, 'bot')}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'game',
      header: 'Game',
      cell: (r) => (
        <div className="min-w-0 max-w-[16rem]">
          <div className="font-semibold">{r.title}</div>
          <div className="truncate text-xs text-text-3">{r.setTitle}</div>
        </div>
      ),
    },
    {
      key: 'host',
      header: 'Host',
      cell: (r) =>
        canUsers ? (
          <Link to={`/staff/users/${r.hostUserId}`} className="font-semibold text-text hover:underline" onClick={(e) => e.stopPropagation()}>
            {r.hostName}
          </Link>
        ) : (
          r.hostName
        ),
    },
    { key: 'games', header: 'Games', align: 'right', cell: (r) => formatNumber(r.gamesPlayed) },
    { key: 'errors', header: 'Errors', align: 'right', cell: (r) => (r.errors ? <Badge tone="coral">{formatNumber(r.errors)}</Badge> : <span className="text-text-3">0</span>) },
    { key: 'activity', header: 'Last activity', className: 'whitespace-nowrap', cell: (r) => <span title={dateTime(r.lastActivity)}>{timeAgo(r.lastActivity)}</span> },
  ];

  return (
    <StaffPage
      title="Live rooms"
      description="Every open room on this server. Open one to see who is in it, remove a player or close the room."
      actions={
        <p className="flex items-center gap-2 text-xs text-text-3" aria-live="off">
          <span className={`size-2 rounded-full ${rooms.error ? 'bg-ember' : 'bg-glim'}`} aria-hidden />
          {rooms.dataUpdatedAt ? `Updates every 5 seconds. Last update ${clock(rooms.dataUpdatedAt)}.` : 'Updates every 5 seconds.'}
        </p>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {rooms.data ? (
          <>
            <Stat label="Live rooms" value={formatNumber(rooms.data.totals.rooms)} hint={`${formatNumber(inGame)} with a game in progress`} />
            <Stat label="Players in rooms" value={formatNumber(rooms.data.totals.players)} hint={`${formatNumber(connected)} connected now. Bots not counted.`} />
            <Stat label="Open connections" value={rooms.data.totals.sockets === null ? 'Off' : formatNumber(rooms.data.totals.sockets)} hint={rooms.data.totals.sockets === null ? 'Realtime server not running' : 'Hosts and players together'} />
            <Stat label="Game errors" value={formatNumber(errors)} hint="In rooms open now" />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[84px]" />)
        )}
      </div>

      {rooms.error && rooms.data ? (
        <p role="status" className="mb-3 rounded-[12px] border border-ember/50 bg-ember/10 px-3 py-2 text-sm text-text">
          Could not refresh the list. Showing rooms as of {clock(rooms.dataUpdatedAt)}.
        </p>
      ) : null}

      {list && list.length === 0 ? (
        <EmptyState title="No live rooms right now">Rooms appear here while they are open. They close on their own 20 minutes after a game ends, or after 45 minutes with no activity.</EmptyState>
      ) : (
        <DataTable
          caption="Live rooms"
          minWidth={780}
          columns={columns}
          rows={list}
          rowKey={(r) => r.code}
          loading={rooms.isLoading}
          error={rooms.data ? undefined : rooms.error}
          onRetry={() => void rooms.refetch()}
          onRowClick={(r) => setRoom(r.code)}
        />
      )}

      <RoomDialog code={openCode} onClose={() => setRoom(null)} canUsers={canUsers} />
    </StaffPage>
  );
}

function RoomDialog({ code, onClose, canUsers }: { code: string | null; onClose: () => void; canUsers: boolean }) {
  const [closing, setClosing] = useState(false);
  const [removing, setRemoving] = useState<RoomPlayer | null>(null);
  const detail = useQuery({
    queryKey: ['admin', 'room', code],
    queryFn: () => api.get<RoomDetail>(`/api/admin/rooms/${code}`),
    enabled: Boolean(code),
    refetchInterval: (q) => (q.state.error ? false : REFRESH_MS),
  });
  const close = useStaffMutation((v: { reason: string; confirm: string }) => api.post(`/api/admin/rooms/${code}/close`, v), {
    invalidate: [['admin', 'rooms'], ['admin', 'system']],
    success: `Room ${code} closed`,
    onSuccess: () => onClose(),
    silentError: true,
  });
  const remove = useStaffMutation((v: { player: RoomPlayer; reason: string }) => api.post(`/api/admin/rooms/${code}/remove-player`, { playerId: v.player.id, reason: v.reason }), {
    invalidate: [['admin', 'room', code], ['admin', 'rooms']],
    success: (_res, v) => `${v.player.name} removed from room ${code}`,
    silentError: true,
  });
  const d = detail.data;
  const gone = detail.error instanceof ApiError && detail.error.status === 404;
  const r = d?.room;
  const hasTeams = Boolean(d?.players.some((p) => p.teamId));

  const columns: Column<RoomPlayer>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (p) => (
        <div className="min-w-0">
          <div className="font-semibold break-words">{p.name}</div>
          {p.userId && canUsers ? (
            <Link to={`/staff/users/${p.userId}`} className="text-xs font-semibold text-link">
              Player page
            </Link>
          ) : null}
        </div>
      ),
    },
    { key: 'kind', header: 'Kind', cell: (p) => <Badge tone={p.isBot ? 'neutral' : p.userId && !p.isGuest ? 'sky' : 'neutral'}>{playerKind(p)}</Badge> },
    {
      key: 'connected',
      header: 'Connection',
      cell: (p) =>
        p.isBot ? (
          <span className="text-text-3">-</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className={`size-2 rounded-full ${p.connected ? 'bg-glim' : 'bg-text-3'}`} aria-hidden />
            {p.connected ? 'Connected' : 'Disconnected'}
          </span>
        ),
    },
    ...(hasTeams ? [{ key: 'team', header: 'Team', cell: (p: RoomPlayer) => p.teamId ?? <span className="text-text-3">-</span> }] : []),
    {
      key: 'remove',
      // The relative wrapper keeps the hidden label inside the table's scroll box, so it cannot widen the dialog.
      header: (
        <span className="relative">
          <span className="sr-only">Actions</span>
        </span>
      ),
      align: 'right',
      cell: (p) => (
        <Button size="sm" variant="ghost" onClick={() => setRemoving(p)} aria-label={`Remove ${p.name} from the room`}>
          Remove
        </Button>
      ),
    },
  ];

  return (
    <>
      <Dialog
        open={Boolean(code)}
        onOpenChange={(o) => !o && onClose()}
        size="lg"
        title={`Room ${code ?? ''}`}
        description={r && !gone ? `${r.title}, playing ${d.setTitle}.` : undefined}
        footer={
          r && !gone ? (
            <Button variant="danger" onClick={() => setClosing(true)}>
              Close room
            </Button>
          ) : null
        }
      >
        {detail.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-40" />
          </div>
        ) : gone ? (
          <EmptyState title="This room has closed">
            It is no longer on the server. Finished rooms close on their own, and hosts can close theirs at any time.
          </EmptyState>
        ) : detail.error && !d ? (
          <ErrorNotice message={detail.error instanceof ApiError ? detail.error.message : 'The room could not be loaded.'} onRetry={() => void detail.refetch()} />
        ) : r && d ? (
          <div className="flex min-w-0 flex-col gap-5">
            <KeyValues
              items={[
                ['Status', <StatusPill status={r.status} label={ROOM_STATUS[r.status] ?? r.status} />],
                ['Game', r.title],
                ['Question set', `${d.setTitle} (${plural(d.questions, 'question')})`],
                [
                  'Host',
                  canUsers ? (
                    <Link to={`/staff/users/${r.hostUserId}`} className="font-semibold text-link">
                      {r.hostName}
                    </Link>
                  ) : (
                    r.hostName
                  ),
                ],
                ['Opened', dateTime(r.createdAt)],
                ['Last activity', timeAgo(r.lastActivity)],
                ['Games played', formatNumber(r.gamesPlayed)],
                ['Game errors', formatNumber(r.errors)],
                ['Joining', r.locked ? 'Locked by the host' : 'Open to new players'],
                ['Kind', r.solo ? 'Solo practice' : 'Hosted game'],
              ]}
            />
            <section aria-labelledby="room-players">
              <h3 id="room-players" className="mb-2 font-semibold text-text">
                People in the room <span className="font-normal text-text-3">({plural(r.players, 'player')}{r.bots ? `, ${plural(r.bots, 'bot')}` : ''})</span>
              </h3>
              <DataTable caption="People in the room" minWidth={hasTeams ? 480 : 420} columns={columns} rows={d.players} rowKey={(p) => p.id} empty="Nobody has joined yet." />
            </section>
          </div>
        ) : null}
      </Dialog>

      {code ? (
        <ActionDialog
          open={closing}
          onOpenChange={setClosing}
          title={`Close room ${code}`}
          description="Any game in progress ends and its results are saved. Everyone is then disconnected and told that Ludora staff closed the room."
          confirmWord={code}
          confirmLabel="Close room"
          variant="danger"
          onSubmit={({ reason, confirm }) => close.mutateAsync({ reason, confirm: confirm ?? '' })}
        />
      ) : null}
      {code && removing ? (
        <ActionDialog
          open
          onOpenChange={(o) => !o && setRemoving(null)}
          title={`Remove ${removing.name}`}
          description={
            removing.isBot
              ? `The practice bot leaves room ${code}.`
              : `${removing.name} is taken out of room ${code} straight away and cannot rejoin it. The room sees a message that they were removed by the host.`
          }
          confirmLabel="Remove player"
          variant="danger"
          onSubmit={({ reason }) => remove.mutateAsync({ player: removing, reason })}
        />
      ) : null}
    </>
  );
}
