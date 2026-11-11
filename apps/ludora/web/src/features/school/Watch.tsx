import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { io, type Socket } from 'socket.io-client';
import { Crown, Eye } from 'lucide-react';
import type { PulseView, RoomView } from '@ludora/shared';
import { createPulseSource, type AckResult } from '../../lib/useRoom.ts';
import { useMe } from '../../lib/session.ts';
import { prefersReducedMotion } from '../../lib/prefs.ts';
import { formatNumber, ordinal } from '../../lib/format.ts';
import { Stage } from '../../ui/Stage.tsx';
import { Spinner } from '../../ui/primitives.tsx';
import { buttonClass } from '../../ui/Button.tsx';
import { MODE_SCREENS } from '../room/modes/registry.ts';
import { PlayerGlim } from '../room/game/stage.tsx';
import { usePageTitle } from '../reports/reportUi.tsx';
import { HouseChip, HouseCrest } from './emblems.tsx';
import type { RankedHouse } from './schoolData.ts';
import { api } from '../../lib/api.ts';

/*
 * /school/watch/:code: a running game on a second display, read only. It sees what the big screen
 * shows every player (names hidden if the host hides them) and can send nothing: the server gives
 * a spectator no host controls, moves or reactions. With ?hall=1 it is the assembly hall screen:
 * very large type, the houses in the room, and a simple reveal of the house points at the end.
 */

interface WatchState {
  view: RoomView | null;
  receivedAt: number;
  error: string | null;
  ended: string | null;
}

function useWatch(code: string) {
  const [state, setState] = useState<WatchState>({ view: null, receivedAt: 0, error: null, ended: null });
  const pulse = useRef(createPulseSource()).current;
  useEffect(() => {
    const socket: Socket = io({ path: '/socket.io', withCredentials: true });
    const watch = () =>
      socket.emit('room:watch', { code }, (ack: AckResult) => {
        if (!ack.ok) setState((s) => ({ ...s, error: ack.error.message }));
      });
    socket.on('connect', watch);
    socket.on('room:view', (v: RoomView) => setState((s) => (s.view && v.version < s.view.version ? s : { view: v, receivedAt: Date.now(), error: null, ended: null })));
    socket.on('room:pulse', (p: PulseView) => pulse.push(p));
    socket.on('room:closed', (p: { message?: string }) => setState((s) => ({ ...s, ended: p?.message ?? 'This room has closed.' })));
    return () => {
      socket.close();
    };
  }, [code, pulse]);
  const gameNow = useCallback(() => {
    const v = state.view;
    if (!v) return 0;
    return v.paused ? v.gameNow : v.gameNow + (Date.now() - state.receivedAt);
  }, [state.view, state.receivedAt]);
  return { ...state, pulse, gameNow };
}

const nothing = async (): Promise<AckResult> => ({ ok: false, error: { code: 'forbidden', message: 'This screen only watches.' } });

/** The houses in the room, by how many players each has: the hall's roll call. */
function HouseRollCall({ view }: { view: RoomView }) {
  const counts = new Map<string, { house: NonNullable<NonNullable<RoomView['players'][number]['avatar']>['house']>; n: number }>();
  for (const p of view.players) {
    const h = p.avatar?.house;
    if (!h) continue;
    counts.set(h.id, { house: h, n: (counts.get(h.id)?.n ?? 0) + 1 });
  }
  if (!counts.size) return null;
  return (
    <ul className="flex flex-wrap justify-center gap-4" aria-label="Houses in the room">
      {[...counts.values()].map(({ house, n }) => (
        <li key={house.id} className="stage-card flex items-center gap-3 px-4 py-3">
          <HouseCrest house={house} size={56} />
          <span className="font-display text-3xl font-bold">{house.name}</span>
          <span className="font-display text-4xl font-extrabold tabular">{n}</span>
        </li>
      ))}
    </ul>
  );
}

/** At the end of an assembly: the houses' points from this game, revealed from last place to first. */
function HouseReveal({ gameId }: { gameId: string | null }) {
  const [houses, setHouses] = useState<(RankedHouse & { players: number })[]>([]);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!gameId) return;
    let tries = 0;
    let stop = false;
    const load = () =>
      api
        .get<{ houses: (RankedHouse & { players: number })[] }>(`/api/school/games/${gameId}/houses`)
        .then((r) => {
          if (stop) return;
          if (r.houses.length || tries >= 5) setHouses(r.houses);
          else {
            tries++;
            setTimeout(load, 1500);
          }
        })
        .catch(() => {});
    load();
    return () => {
      stop = true;
    };
  }, [gameId]);
  useEffect(() => {
    if (!houses.length) return;
    if (prefersReducedMotion()) return setShown(houses.length);
    if (shown >= houses.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 600 : 1600);
    return () => clearTimeout(t);
  }, [houses, shown]);
  if (!houses.length) return null;
  const order = [...houses].reverse();
  const winner = houses[0]!;
  const done = shown >= houses.length;
  return (
    <section aria-labelledby="reveal-title" className="flex flex-col items-center gap-6">
      <h2 id="reveal-title" className="font-display text-6xl font-bold">
        House points
      </h2>
      <ol className="flex w-full max-w-5xl flex-col gap-4" aria-live="polite">
        {order.slice(0, shown).map((h) => (
          <li key={h.id} className="stage-card flex items-center gap-6 px-6 py-4 motion-safe:animate-[rise-fade_220ms_var(--ease-out)]">
            <span className="w-24 font-display text-5xl font-extrabold tabular">{ordinal(h.rank)}</span>
            <HouseCrest house={h} size={88} />
            <span className="min-w-0 flex-1 truncate font-display text-5xl font-bold">{h.name}</span>
            <span className="font-display text-7xl font-extrabold italic tabular">
              {formatNumber(h.points)}
              <span className="sr-only"> points</span>
            </span>
          </li>
        ))}
      </ol>
      {done && winner.points > 0 ? (
        <p className="plate plate-gold px-6 py-2 text-5xl">
          <span className="inline-flex items-center gap-3">
            <Crown className="size-12" aria-hidden /> {winner.name} {houses.filter((h) => h.rank === 1).length > 1 ? 'share the top spot' : 'win'}
          </span>
        </p>
      ) : null}
    </section>
  );
}

export default function Watch() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const hall = params.get('hall') === '1';
  const me = useMe();
  const signedIn = Boolean(me.data?.user && !me.data.user.isGuest);
  usePageTitle(hall ? 'Hall screen' : 'Watching a game');
  // The hall screen: everything one size larger, like the larger text setting.
  useEffect(() => {
    if (!hall) return;
    const root = document.documentElement;
    const before = root.dataset.text;
    root.dataset.text = 'larger';
    return () => {
      if (before) root.dataset.text = before;
      else delete root.dataset.text;
    };
  }, [hall]);
  if (me.isPending) return <Spinner label="Loading" />;
  if (!signedIn) {
    return (
      <Stage as="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="font-display text-5xl font-bold">Sign in to show this game</h1>
        <p className="max-w-md text-text-2">A second screen for a game needs a Ludora account.</p>
        <Link to={`/signin?next=${encodeURIComponent(`/school/watch/${code}${hall ? '?hall=1' : ''}`)}`} className={buttonClass('primary', 'lg')}>
          Sign in
        </Link>
      </Stage>
    );
  }
  return <Watching code={code} hall={hall} />;
}

function Watching({ code, hall }: { code: string; hall: boolean }) {
  const w = useWatch(code);
  const v = w.view;
  if (w.error || w.ended) {
    return (
      <Stage as="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="font-display text-5xl font-bold">{w.ended ? 'The game has closed' : 'This game cannot be shown'}</h1>
        <p className="max-w-md text-text-2">{w.ended ?? w.error}</p>
        <Link to="/school" className={buttonClass('secondary', 'lg')}>
          Back to School
        </Link>
      </Stage>
    );
  }
  if (!v) return <Spinner label="Connecting to the game" />;
  const screens = MODE_SCREENS[v.room.modeId];
  const status = v.room.status;
  return (
    <Stage as="main" className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <h1 className="min-w-0 truncate font-display text-2xl font-bold">
          {v.room.title}
          <span className="font-sans text-base font-semibold text-text-2"> · {v.room.setTitle}</span>
        </h1>
        <p className="flex items-center gap-2 text-sm font-semibold text-text-2">
          <Eye className="size-4" aria-hidden /> Watching. Join with code <span className="font-display text-2xl font-extrabold tracking-wider text-text tabular">{code}</span>
        </p>
      </header>
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        {status === 'lobby' ? (
          <div className="flex flex-col items-center gap-6 text-center">
            <p className="text-2xl text-text-2">Go to {window.location.host}/play and type</p>
            <p className="font-display text-[clamp(4rem,12vw,9rem)] leading-none font-extrabold tracking-[0.08em] tabular">{code}</p>
            {hall ? <HouseRollCall view={v} /> : null}
            <ul className="flex flex-wrap justify-center gap-4" aria-label="Players in the room">
              {v.players.slice(0, 120).map((p) => (
                <li key={p.id} className="flex w-28 flex-col items-center gap-1">
                  <PlayerGlim avatar={p.avatar} seed={p.id} size={80} />
                  <span className="max-w-full truncate font-bold">{p.name}</span>
                  {p.avatar?.house ? <HouseChip house={p.avatar.house} /> : null}
                </li>
              ))}
            </ul>
            <p className="text-lg text-text-2" aria-live="polite">
              {v.players.length} {v.players.length === 1 ? 'player' : 'players'} in
            </p>
          </div>
        ) : null}
        {(status === 'running' || status === 'paused') && screens && v.game ? (
          <Suspense fallback={<Spinner />}>
            <div className="relative flex-1">
              <screens.Host view={v.game} room={v} act={nothing} fire={() => {}} pulse={w.pulse} gameNow={w.gameNow} paused={v.paused} />
            </div>
          </Suspense>
        ) : null}
        {status === 'ended' && v.results ? (
          <div className="flex flex-col items-center gap-8">
            {hall ? <HouseReveal gameId={v.results.gameId} /> : null}
            {v.results.teamStandings.length ? (
              <ol className="flex flex-wrap justify-center gap-4" aria-label="Teams">
                {v.results.teamStandings.map((t, i) => (
                  <li key={t.teamId} className="stage-card flex items-center gap-3 px-5 py-3">
                    <span className="font-display text-3xl font-extrabold">{ordinal(i + 1)}</span>
                    <span className="font-display text-3xl font-bold">{t.name}</span>
                    <span className="font-display text-3xl font-extrabold tabular">{formatNumber(Math.round(t.score))}</span>
                  </li>
                ))}
              </ol>
            ) : null}
            <ol className="flex w-full max-w-3xl flex-col gap-2" aria-label="Top players">
              {v.results.standings.slice(0, hall ? 5 : 10).map((s) => (
                <li key={s.playerId} className="stage-card flex items-center gap-4 px-4 py-2">
                  <span className="w-12 font-display text-2xl font-extrabold tabular">{s.rank}</span>
                  <span className="min-w-0 flex-1 truncate text-xl font-bold">{s.name}</span>
                  <span className="font-display text-2xl font-extrabold tabular">{s.label}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </Stage>
  );
}
