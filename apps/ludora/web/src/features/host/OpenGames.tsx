import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DoorOpen, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { useCan } from '../../lib/session.ts';
import { useModes, thumbFor } from '../../lib/queries.ts';
import { timeAgo } from '../../lib/format.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { Badge, Dialog, Panel } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';

/*
 * The games a host has open outside the room: in the lobby, running or paused.
 * Shown on the Host page and the home dashboard so a host who left a room can
 * go back to it or close it for everyone. Open games count toward a limit, so
 * this is also where a host makes room for a new game.
 */

export interface OpenGame {
  code: string;
  status: 'lobby' | 'running' | 'paused';
  modeId: string;
  variantId: string | null;
  title: string;
  setTitle: string;
  /** People in the room, not counting practice bots. */
  players: number;
  connected: number;
  locked: boolean;
  createdAt: string;
  lastActivity: string;
}

export const openGamesKey = ['rooms', 'open'] as const;

/** The signed-in host's open games, and how many they may have open at once. */
export function useOpenGames(enabled = true) {
  const canHost = useCan('rooms.host');
  return useQuery({
    queryKey: openGamesKey,
    queryFn: () => api.get<{ rooms: OpenGame[]; limit: number }>('/api/rooms'),
    enabled: enabled && canHost,
    staleTime: 5_000,
    // Players come and go, and idle rooms close on their own; keep a list that has games in it fresh.
    refetchInterval: (q) => (q.state.data?.rooms.length ? 15_000 : false),
  });
}

const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** A game in progress is Live, like a broadcast. Each status is a word as well as a colour. */
const STATUS: Record<OpenGame['status'], { label: string; tone: 'sky' | 'coral' | 'amber' }> = {
  lobby: { label: 'In the lobby', tone: 'sky' },
  running: { label: 'Live', tone: 'coral' },
  paused: { label: 'Paused', tone: 'amber' },
};

function people(g: OpenGame): string {
  const n = g.players;
  if (g.status === 'lobby') return n === 0 ? 'Nobody has joined yet.' : `${n} ${n === 1 ? 'player is' : 'players are'} waiting.`;
  if (g.status === 'paused') return `${n} ${n === 1 ? 'player is' : 'players are'} waiting for you.`;
  return `${n} ${n === 1 ? 'player' : 'players'}.`;
}

function GameRow({ game, onClose }: { game: OpenGame; onClose: () => void }) {
  const modes = useModes();
  const mode = modes.data?.modes.find((m) => m.meta.id === game.modeId);
  const variant = mode?.variants.find((v) => v.meta.id === game.variantId);
  const status = STATUS[game.status];
  const name = `${game.title}, game ${spaced(game.code)}`;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[var(--radius-m)] border border-line bg-surface-2 p-3 sm:flex-nowrap">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {mode ? <ModeArt thumb={thumbFor(mode.meta, variant?.meta)} className="h-14 w-20 shrink-0 overflow-hidden rounded-[var(--radius-s)]" /> : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-display text-xl leading-tight font-bold break-words">{game.title}</span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="break-words text-text-2">{game.setTitle}</p>
          <p className="text-sm text-text-2">
            Game {spaced(game.code)}, opened {timeAgo(game.createdAt)}. {people(game)}
          </p>
        </div>
      </div>
      <div className="flex w-full shrink-0 gap-2 sm:w-auto">
        <ButtonLink to={`/room/${game.code}`} variant="primary" size="sm" icon={<DoorOpen className="size-4" aria-hidden />} aria-label={`Rejoin ${name}`} className="flex-1 sm:flex-none">
          Rejoin
        </ButtonLink>
        <Button size="sm" icon={<X className="size-4" aria-hidden />} onClick={onClose} aria-label={`Close ${name}`} className="flex-1 sm:flex-none">
          Close
        </Button>
      </div>
    </li>
  );
}

/**
 * The host's open games, or nothing if they have none. Once it has shown games it
 * stays, saying there are none left, so closing the last one does not make the
 * section and the keyboard focus in it vanish. The ref is the section's heading,
 * for pages that move focus here. `notice` appears above the list.
 */
export const OpenGames = forwardRef<HTMLHeadingElement, { notice?: ReactNode; className?: string }>(function OpenGames({ notice, className = '' }, ref) {
  const qc = useQueryClient();
  const open = useOpenGames();
  const rooms = open.data?.rooms ?? [];
  const [seen, setSeen] = useState(false);
  const [closing, setClosing] = useState<OpenGame | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (rooms.length) setSeen(true);
  }, [rooms.length]);

  const close = useMutation({
    mutationFn: (code: string) => api.post<{ ok: true; outcome: 'ended' | 'closed' }>(`/api/rooms/${code}/close`),
    onSuccess: async (res) => {
      toast.success(res.outcome === 'ended' ? 'Game ended. Players can see their results.' : 'Game closed');
      await qc.invalidateQueries({ queryKey: openGamesKey });
    },
    onError: async (err) => {
      toast.error(err instanceof ApiError ? err.message : 'The game was not closed. Check your connection and try again.');
      await qc.invalidateQueries({ queryKey: openGamesKey });
    },
    onSettled: () => {
      setClosing(null);
      // The row and its Close button are gone; carry on from the section heading once the dialog has let go of focus.
      setTimeout(() => heading.current?.focus(), 30);
    },
  });

  if (!rooms.length && !seen) return null;
  const live = closing && closing.status !== 'lobby';
  return (
    <Panel className={`p-5 sm:p-6 ${className}`} aria-labelledby="open-games-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="open-games-title"
          tabIndex={-1}
          ref={(el) => {
            heading.current = el;
            if (typeof ref === 'function') ref(el);
            else if (ref) ref.current = el;
          }}
          className="scroll-mt-24 font-display text-[1.75rem] leading-tight font-bold"
        >
          Your open games
        </h2>
        {open.data ? <span className="text-sm text-text-2">You can have up to {open.data.limit} open at once.</span> : null}
      </div>
      {notice}
      {rooms.length ? (
        <ul className="flex flex-col gap-2.5">
          {rooms.map((g) => (
            <GameRow key={g.code} game={g} onClose={() => setClosing(g)} />
          ))}
        </ul>
      ) : (
        <p className="text-text-2">You have no open games now.</p>
      )}
      <Dialog
        open={Boolean(closing)}
        onOpenChange={(v) => {
          if (!v && !close.isPending) setClosing(null);
        }}
        title={live ? 'End this game for everyone?' : 'Close this game?'}
        description={
          closing
            ? live
              ? `${closing.title} with “${closing.setTitle}” ends now and players see their results. Scores so far are saved, and nobody else can join.`
              : `${closing.title} with “${closing.setTitle}” closes now. ${closing.players ? 'Players waiting in the lobby are sent out, and the' : 'The'} code ${spaced(closing.code)} stops working.`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button onClick={() => setClosing(null)} disabled={close.isPending}>
              Keep it open
            </Button>
            <Button variant="danger" loading={close.isPending} onClick={() => closing && close.mutate(closing.code)}>
              {live ? 'End game' : 'Close game'}
            </Button>
          </>
        }
      />
    </Panel>
  );
});
