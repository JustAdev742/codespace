import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { HouseChip } from '../school/emblems.tsx';
import { SchoolLobbyTheme } from '../school/LobbyTheme.tsx';
import { LessonLobbyLine } from '../lessons/room.tsx';
import { DropdownMenu } from 'radix-ui';
import { Bot, Check, Copy, Eye, Hand, Lock, LockOpen, MoreHorizontal, Pencil, Pin, Settings2, Share2, Shuffle, UserCheck, UserMinus, UserRound, UserX, Users, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import type { HostCommand, RoomPlayerView, RoomView, TeamView } from '@ludora/shared';
import type { RoomHandle } from '../../lib/useRoom.ts';
import type { GlimPose } from '../../art/glim/Glim.tsx';
import { Button } from '../../ui/Button.tsx';
import { Dialog, Field, Input } from '../../ui/primitives.tsx';
import { QrCode } from './host/QrCode.tsx';
import { useHostTools } from './host/HostTools.tsx';
import { POINTS_MODES } from './host/RoomSettings.tsx';
import { HowToPlay } from './HowToPlay.tsx';
import { estimateMinutes, withKey } from './host/tools.ts';
import { ReactionBar, useChooseReactions } from './game/Reactions.tsx';
import { Pill, PlayerGlim, StagePanel, motionOK } from './game/stage.tsx';
import { useAnnounce } from './game/announce.tsx';
import { BackdropPicker } from './game/Backdrop.tsx';
import { teamFill } from './game/Leaderboard.tsx';
import { plural } from '../../lib/format.ts';
import { playSfx } from '../../lib/sound/react.tsx';
import { EXTRA_SHARES, extraOf, setExtraTime, type ExtraShare } from './host/ExtraTime.tsx';
import { InviteFriendsButton } from '../social/InviteFriends.tsx';

/** The most practice bots a room takes (the server's limit). */
const MAX_BOTS = 20;

/** One column per team on a wide screen, up to what fits. */
const TEAM_COLS: Record<number, string> = { 1: '', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-2 xl:grid-cols-4', 5: 'md:grid-cols-3', 6: 'md:grid-cols-3' };

/**
 * Glims get smaller as the crowd grows, so a whole class still fits on one projector screen.
 * The height counts as well as the width: a 1366 by 768 projector is short for its width.
 */
function seatSize(n: number, inTeam: boolean): string {
  if (inTeam) return n <= 6 ? 'clamp(3.5rem, min(5.6vw, 9vh), 6.5rem)' : n <= 12 ? 'clamp(3rem, min(4.6vw, 7vh), 5.5rem)' : 'clamp(2.75rem, min(3.6vw, 5.5vh), 4.25rem)';
  if (n <= 6) return 'clamp(5.5rem, min(9.5vw, 17vh), 11rem)';
  if (n <= 12) return 'clamp(4.25rem, min(7vw, 12vh), 8.5rem)';
  // Two rows of a dozen still fit under the join code on a 1366 by 768 projector.
  if (n <= 24) return 'clamp(3rem, min(4.6vw, 6.6vh), 6.5rem)';
  if (n <= 36) return 'clamp(2.75rem, min(4vw, 7vh), 5rem)';
  if (n <= 48) return 'clamp(2.5rem, min(3.6vw, 6.2vh), 4.5rem)';
  // Sixty: four rows of fifteen under the join code on a 1366 by 768 projector.
  return 'clamp(2.25rem, min(2.8vw, 4.8vh), 3.75rem)';
}

/** A seat card grows to fit its name, up to about twice its Glim's width, before the name is shortened. A big crowd's cards start narrower. */
const CARD = 'min-w-[max(calc(var(--seat)*1.35),var(--card-min,7rem))] max-w-[max(calc(var(--seat)*2.1),10rem)]';
/** An empty seat: the width of a card with a short name. */
const EMPTY_CARD = 'w-[max(calc(var(--seat)*1.35),7rem)]';

/**
 * One player in the lobby crowd, as a card: their Glim, their name and, for the host, a remove button.
 * A card slides in as its player arrives (the lobby's one moment). Bots and players who dropped out wear a
 * small chip on their Glim rather than an extra line, so a full class keeps to one screen.
 */
const SEAT_ITEM = 'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[var(--radius-m)] px-3 text-sm font-semibold text-text-2 outline-none data-[highlighted]:bg-surface-2 data-[highlighted]:text-text';

/** What the host can do with one player in the lobby. */
export interface SeatActions {
  kick: (p: RoomPlayerView) => void;
  rename: (p: RoomPlayerView) => void;
  move: (p: RoomPlayerView, teamId: string) => void;
  teams: TeamView[];
  /** Extra time on timed questions (only the host sees it). */
  extra?: { of: (p: RoomPlayerView) => number; set: (p: RoomPlayerView, share: ExtraShare) => void; kind?: { kind: 'rounds' | 'own' | 'none'; what: string } | undefined };
}

/** The host's menu on a seat card: rename, move to another team, remove. */
function SeatMenu({ p, actions }: { p: RoomPlayerView; actions: SeatActions }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label={`Options for ${p.name}`}
        title={`Options for ${p.name}`}
        className="paper absolute -top-2 -right-2 grid size-9 place-items-center rounded-full opacity-0 shadow-[0_6px_14px_-6px_rgb(2_5_20/0.8)] transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-52 rounded-[var(--radius-l)] border border-line bg-raised p-1.5 shadow-[0_18px_40px_-12px_rgb(2_5_20/0.6)]">
          {!p.isBot ? (
            <DropdownMenu.Item className={SEAT_ITEM} onSelect={() => actions.rename(p)}>
              <Pencil className="size-4" aria-hidden /> Rename
            </DropdownMenu.Item>
          ) : null}
          {actions.teams
            .filter((t) => t.id !== p.teamId)
            .map((t) => (
              <DropdownMenu.Item key={t.id} className={SEAT_ITEM} onSelect={() => actions.move(p, t.id)}>
                <span className="size-3 shrink-0 rounded-full" style={{ background: `hsl(${t.hue} 80% 64%)` }} aria-hidden />
                Move to {t.name}
              </DropdownMenu.Item>
            ))}
          {!p.isBot && actions.extra?.kind?.kind === 'none' ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <p className="max-w-60 px-3 py-1.5 text-xs text-text-2">Extra time does not apply in this game: its only clock is shared by everyone.</p>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
            </>
          ) : !p.isBot && actions.extra ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Label className="px-3 pt-1 pb-0.5 text-xs font-semibold text-text-3">{actions.extra.kind?.kind === 'own' ? `Extra time on ${actions.extra.kind.what} (only you see this)` : 'Extra time (only you see this)'}</DropdownMenu.Label>
              <DropdownMenu.RadioGroup value={String(actions.extra.of(p))} onValueChange={(v) => actions.extra?.set(p, Number(v) as ExtraShare)}>
                {EXTRA_SHARES.map((s) => (
                  <DropdownMenu.RadioItem key={s.share} value={String(s.share)} className={SEAT_ITEM}>
                    <span className="grid size-4 place-items-center" aria-hidden>
                      <DropdownMenu.ItemIndicator>
                        <Check className="size-4" />
                      </DropdownMenu.ItemIndicator>
                    </span>
                    {s.label}
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
            </>
          ) : null}
          <DropdownMenu.Item className={`${SEAT_ITEM} text-ember data-[highlighted]:text-ember`} onSelect={() => actions.kick(p)}>
            <UserMinus className="size-4" aria-hidden /> Remove
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Seat({ p, actions, delay, hop, cheering = false }: { p: RoomPlayerView; actions?: SeatActions | undefined; delay: number; hop?: number | undefined; cheering?: boolean }) {
  return (
    // No box around a player: their Glim stands on the stage floor with its name on a tag, so a full class reads as a crowd, not a grid of cards.
    <li className={`group relative flex flex-col items-center gap-1 px-1 pt-1 ${CARD}`} style={motionOK() ? { animation: `stage-arrive 220ms var(--ease-out) ${delay}ms both` } : undefined}>
      <span className="relative">
        {/* The spot of light each Glim stands in. */}
        <span className="absolute inset-x-[8%] bottom-[2%] h-[16%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(120_160_255/0.38),transparent)]" aria-hidden />
        {/* Lobby play: the Glim hops when its player taps it on their own device. Still under reduced motion. */}
        <span key={hop ?? 0} className="relative block" style={hop && motionOK() ? { animation: 'seat-hop 520ms var(--ease-out)' } : undefined}>
          {/* A player sending a reaction from their phone throws their arms up here for a moment. */}
          <PlayerGlim avatar={p.avatar} seed={p.id} size={128} pose={cheering ? 'cheer' : 'idle'} className={`size-[var(--seat)] ${p.connected ? '' : 'opacity-45 grayscale'}`} />
        </span>
        {p.ready && !p.isBot ? (
          <span className="absolute -left-1 bottom-0 grid size-[max(1.15rem,calc(var(--seat)*0.3))] place-items-center rounded-full bg-glim text-on-accent shadow-[0_0_0_3px_var(--stage-2)]" title="Ready">
            <Check className="size-[60%]" strokeWidth={3} aria-hidden />
            <span className="sr-only">Ready</span>
          </span>
        ) : null}
        {p.isBot || !p.connected ? (
          <span className={`absolute -right-1 bottom-0 grid size-[max(1.15rem,calc(var(--seat)*0.3))] place-items-center rounded-full shadow-[0_0_0_3px_var(--stage-2)] ${p.connected ? 'bg-dusk text-on-accent' : 'paper'}`} title={p.connected ? 'Practice bot' : 'Away'}>
            {p.connected ? <Bot className="size-[60%]" aria-hidden /> : <WifiOff className="size-[55%]" aria-hidden />}
            <span className="sr-only">{p.connected ? 'Bot' : 'Away'}</span>
          </span>
        ) : null}
      </span>
      <span className="max-w-full truncate rounded-[var(--radius-s)] bg-[color-mix(in_srgb,var(--stage-4)_82%,transparent)] px-2 py-0.5 text-center text-[length:clamp(var(--name-min,0.95rem),calc(var(--seat)*0.16),1.5rem)] leading-tight font-bold">{p.name}</span>
      {p.avatar?.house ? <HouseChip house={p.avatar.house} /> : null}
      {actions ? <SeatMenu p={p} actions={actions} /> : null}
    </li>
  );
}

/** The crowd's sizes: each Glim, the narrowest card and the smallest name, by how many are in it. */
function crowdVars(n: number, inTeam: boolean): CSSProperties {
  const tight: Record<string, string> = n > 48 ? { '--card-min': '4.25rem', '--name-min': '0.8rem' } : n > 30 ? { '--card-min': '5rem' } : n > 12 ? { '--card-min': '5.75rem' } : {};
  return { '--seat': seatSize(n, inTeam), ...tight } as CSSProperties;
}

/** Players' Glims, together. Those already here when the screen opens come in one after another; newcomers slide in as they join. */
function Crowd({ players, actions, hops, cheers, inTeam = false }: { players: RoomPlayerView[]; actions?: SeatActions; hops?: Map<string, number>; cheers?: Set<string>; inTeam?: boolean }) {
  const firstSeen = useRef<Set<string> | null>(null);
  firstSeen.current ??= new Set(players.map((p) => p.id));
  const initial = firstSeen.current;
  return (
    <ul className="flex flex-wrap items-end justify-center gap-x-[clamp(0.25rem,calc(var(--seat)*0.1),1rem)] gap-y-[clamp(0.25rem,calc(var(--seat)*0.08),0.9rem)]" style={crowdVars(players.length, inTeam)}>
      {players.map((p, i) => (
        <Seat key={p.id} p={p} actions={actions} hop={hops?.get(p.id)} cheering={cheers?.has(p.id)} delay={initial.has(p.id) ? Math.min(i, 16) * 40 : 0} />
      ))}
    </ul>
  );
}

/** Before anyone joins: empty seats where the cards will land. */
function EmptySeats() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-[clamp(1.5rem,5vh,3.5rem)] text-center" style={{ '--seat': seatSize(5, false) } as CSSProperties}>
      <div className="flex flex-wrap justify-center gap-[clamp(0.5rem,1.4vw,1.25rem)]" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`grid aspect-[4/5] place-items-center rounded-[var(--radius-l)] border-2 border-dashed border-white/20 ${EMPTY_CARD}`}>
            <UserRound className="size-[45%] text-white/25" strokeWidth={1.6} />
          </span>
        ))}
      </div>
      <p className="max-w-[40ch] text-[clamp(1.1rem,1.7vw,1.9rem)] font-semibold text-text-2">Waiting for players. Each one appears here as they join.</p>
    </div>
  );
}

function TeamCrowd({ team, players, actions, hops, cheers, onRename }: { team: TeamView; players: RoomPlayerView[]; actions: SeatActions; hops: Map<string, number>; cheers: Set<string>; onRename: () => void }) {
  return (
    // A solid panel, so the backdrop never shows through the crowd; the team's banner in its colour across the top.
    <StagePanel as="section" className="overflow-hidden bg-[color-mix(in_srgb,var(--stage-1)_90%,#ffffff)]! shadow-[0_14px_36px_-12px_rgb(2_5_20/0.7)]" label={team.name}>
      <div className="flex items-center gap-2 px-4 py-2.5 text-on-accent" style={{ background: teamFill(team.hue) }}>
        <h3 className="min-w-0 flex-1 truncate font-display text-[clamp(1.4rem,2vw,2.25rem)] font-bold">{team.name}</h3>
        <button type="button" onClick={onRename} className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-m)] hover:bg-black/10" aria-label={`Rename ${team.name}`} title={`Rename ${team.name}`}>
          <Pencil className="size-4" aria-hidden />
        </button>
        <span className="font-display text-[clamp(1.25rem,1.7vw,1.85rem)] font-extrabold tabular">{players.length}</span>
      </div>
      <div className="p-4">{players.length ? <Crowd players={players} actions={actions} hops={hops} cheers={cheers} inTeam /> : <p className="py-4 text-center font-semibold text-text-2">Nobody yet</p>}</div>
    </StagePanel>
  );
}

/** Rename a player or a team: the name goes through the server's name filter. */
function RenameDialog({ target, onClose, onSave }: { target: { kind: 'player' | 'team'; id: string; name: string } | null; onClose: () => void; onSave: (name: string) => Promise<string | null> }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (target) {
      setName(target.name);
      setError(null);
    }
  }, [target]);
  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(v) => (v ? null : onClose())}
      size="sm"
      title={target?.kind === 'team' ? `Rename ${target.name}` : `Rename ${target?.name ?? ''}`}
      description="2 to 24 letters, numbers or spaces. It goes through the name filter."
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const problem = await onSave(name);
          setBusy(false);
          if (problem) setError(problem);
          else onClose();
        }}
      >
        <Field label="New name" error={error ?? undefined}>
          {(p) => <Input {...p} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** The newest hop from each player, from the room's reactions. */
function useHops(reactions: RoomHandle['reactions']): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of reactions) if (r.emote === 'hop' && r.playerId) map.set(r.playerId, r.key);
  return map;
}

/** Share the invite: the system share sheet where the browser has one, otherwise copy it, and say so on the button. */
function ShareButton({ url, code }: { url: string; code: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(t);
  }, [copied]);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && window.matchMedia?.('(pointer: coarse)').matches;
  return (
    <Button
      icon={copied ? <Check className="size-4" aria-hidden /> : canShare ? <Share2 className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      variant={copied ? 'success' : 'secondary'}
      onClick={async () => {
        if (canShare) {
          try {
            await navigator.share({ title: 'Join my Ludora game', text: `Join with code ${code}`, url });
            return;
          } catch (err) {
            // Closing the share sheet is not an error; anything else falls back to copying.
            if ((err as Error)?.name === 'AbortError') return;
          }
        }
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        } catch {
          toast.error(`Copying did not work here. The link is ${url}`);
        }
      }}
    >
      <span aria-live="polite">{copied ? 'Copied' : canShare ? 'Share invite' : 'Copy invite link'}</span>
    </Button>
  );
}

/** The waiting room: players asking to come in, for the host to let in or turn away. */
function WaitingRoom({ room, run }: { room: RoomView; run: (label: string, cmd: HostCommand) => Promise<void> }) {
  const pending = room.host?.pending ?? [];
  if (!pending.length) return null;
  return (
    <StagePanel as="section" className="flex flex-col gap-2 p-4" label="Waiting to come in">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 font-display text-[clamp(1.4rem,2vw,2.25rem)] font-bold">
          <Hand className="size-[0.9em] text-lantern" aria-hidden /> Waiting to come in: <span className="tabular">{pending.length}</span>
        </h2>
        {pending.length > 1 ? (
          <Button size="sm" variant="success" className="ml-auto" onClick={() => void Promise.all(pending.map((p) => run('admit', { cmd: 'admit', playerId: p.id, allow: true })))}>
            Let everyone in
          </Button>
        ) : null}
      </div>
      <ul className="flex flex-wrap gap-2">
        {pending.map((p) => (
          <li key={p.id} className="flex items-center gap-1.5 rounded-[var(--radius-m)] bg-white/[0.08] py-1 pr-1 pl-3">
            <span className="max-w-[14rem] truncate font-semibold">{p.name}</span>
            <Button size="sm" variant="success" icon={<UserCheck className="size-4" aria-hidden />} aria-label={`Let ${p.name} in`} onClick={() => void run('admit', { cmd: 'admit', playerId: p.id, allow: true })}>
              Let in
            </Button>
            <Button size="sm" variant="ghost" icon={<UserX className="size-4" aria-hidden />} aria-label={`Turn ${p.name} away`} onClick={() => void run('admit', { cmd: 'admit', playerId: p.id, allow: false })}>
              <span className="max-sm:sr-only">Turn away</span>
            </Button>
          </li>
        ))}
      </ul>
    </StagePanel>
  );
}

/** The host's pinned message, on every lobby screen. */
function PinnedMessage({ text, big }: { text: string; big: boolean }) {
  return (
    <p className={`flex items-start gap-2.5 rounded-[var(--radius-m)] bg-lantern/[0.14] px-4 py-2.5 font-semibold ring-2 ring-lantern ring-inset ${big ? 'text-[clamp(1.1rem,1.6vw,1.8rem)]' : 'text-lg'}`}>
      <Pin className="mt-[0.2em] size-[1em] shrink-0 text-lantern" aria-hidden />
      <span className="min-w-0 break-words">
        <span className="sr-only">Message from the host: </span>
        {text}
      </span>
    </p>
  );
}

export function HostLobby({ room, handle }: { room: RoomView; handle: RoomHandle }) {
  const [busy, setBusy] = useState<string | null>(null);
  const joinUrl = `${location.origin}/join/${room.room.code}`;
  const tools = useHostTools();
  const run = async (label: string, cmd: HostCommand) => {
    setBusy(label);
    const ack = await handle.host(cmd);
    setBusy(null);
    if (!ack.ok) toast.error(ack.error.message);
  };
  const [renaming, setRenaming] = useState<{ kind: 'player' | 'team'; id: string; name: string } | null>(null);
  const actions: SeatActions = {
    kick: (p) => void run('kick', { cmd: 'kick', playerId: p.id }),
    rename: (p) => setRenaming({ kind: 'player', id: p.id, name: p.name }),
    move: (p, teamId) => void run('move', { cmd: 'setTeam', playerId: p.id, teamId }),
    teams: room.room.teams,
    extra: { of: (p) => extraOf(room, p.id), set: (p, share) => void setExtraTime(handle, p, share), kind: room.host?.extraTimeKind },
  };
  const hops = useHops(handle.reactions);
  const cheers = new Set(handle.reactions.flatMap((r) => (r.emote !== 'hop' && r.playerId ? [r.playerId] : [])));
  const minutes = estimateMinutes(room.room);
  const o = room.room.options;
  const humans = room.players.filter((p) => !p.isBot).length;
  const bots = room.players.length - humans;
  // A pop as each player arrives, a step up the scale each time, so a crowd joining plays a little tune.
  const count = room.players.length;
  const seen = useRef(count);
  useEffect(() => {
    if (count > seen.current) playSfx('join', { n: count });
    seen.current = count;
  }, [count]);
  const teams = room.room.teams;
  const code = room.room.code;
  // A big class needs the screen's height for the crowd: the join card tightens up, and its code stays the loudest thing on screen.
  const crowded = room.players.length > 16;
  return (
    <div className="mx-auto flex w-full max-w-[112rem] flex-1 flex-col gap-[clamp(1rem,3vh,2.25rem)]">
      <section className="grid grid-cols-1 gap-[clamp(1rem,2vw,2.25rem)] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* The join code is the hero of the lobby: ink on white, readable from the back of the room. */}
        <div className={`paper stage-card flex flex-col px-[clamp(1.25rem,3vw,3.5rem)] ${crowded ? 'gap-[clamp(0.4rem,1vh,0.8rem)] py-[clamp(0.75rem,2vh,1.75rem)]' : 'gap-[clamp(0.6rem,1.6vh,1.1rem)] py-[clamp(1rem,3vh,2.5rem)]'}`}>
          <div className="flex items-center gap-[clamp(1rem,2vw,2rem)]">
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-[clamp(0.25rem,1vh,0.75rem)]">
              <p className="text-[clamp(1.1rem,1.7vw,2rem)] font-semibold text-text-2">
                Go to <span className="font-bold text-text">{location.host}/play</span> and enter
              </p>
              <p className={`font-display leading-[0.9] font-extrabold tracking-[0.02em] whitespace-nowrap text-text tabular ${crowded ? 'text-[clamp(4rem,min(7.4vw,13vh),10rem)]' : 'text-[clamp(4.5rem,8.6vw,12rem)]'}`}>
                <span className="sr-only">Game code {code.split('').join(' ')}</span>
                <span aria-hidden>
                  {code.slice(0, 3)}
                  <span className="inline-block w-[0.28em]" />
                  {code.slice(3)}
                </span>
              </p>
            </div>
            {/* Scanning opens the join page with the code filled in. Drawn in the browser; the link goes nowhere else. */}
            <figure className="hidden shrink-0 flex-col items-center gap-1 sm:flex">
              <QrCode text={joinUrl} label={`QR code: scan to join game ${code.split('').join(' ')}`} className={`ring-1 ring-black/10 ${crowded ? 'w-[clamp(6rem,min(9vw,16vh),10rem)]' : 'w-[clamp(7rem,11vw,12rem)]'}`} />
              <figcaption className="text-sm font-semibold text-text-2">Scan to join</figcaption>
            </figure>
          </div>
          <div className="flex flex-wrap gap-2">
            <ShareButton url={joinUrl} code={code} />
            <InviteFriendsButton code={code} />
            <Button icon={room.room.locked ? <Lock className="size-4" aria-hidden /> : <LockOpen className="size-4" aria-hidden />} onClick={() => run('lock', { cmd: 'lock', locked: !room.room.locked })} loading={busy === 'lock'} title={withKey(room.room.locked ? 'Unlock the room' : 'Lock the room', 'L')} aria-keyshortcuts="L">
              {room.room.locked ? 'Room locked' : 'Lock room'}
            </Button>
            {tools ? (
              <Button icon={<Settings2 className="size-4" aria-hidden />} onClick={() => tools.open('settings')}>
                Room settings
              </Button>
            ) : null}
            <BackdropPicker />
            <HowToPlay room={room} big />
          </div>
        </div>
        <div className="flex flex-col justify-between gap-5">
          <div className="flex flex-col items-start gap-2">
            <SchoolLobbyTheme />
            <LessonLobbyLine room={room} big />
            <h1 className="font-display text-[clamp(2.25rem,3.6vw,4.5rem)] leading-[0.95] font-extrabold">{room.room.title}</h1>
            <p className="text-[clamp(1.15rem,1.6vw,1.8rem)] font-semibold text-text-2">{room.room.setTitle}</p>
            <ul className="mt-2 flex flex-wrap gap-2 text-[clamp(0.95rem,1.15vw,1.3rem)]" aria-label="Game settings">
              <li>
                <Pill>{plural(room.room.common.questionLimit ? Math.min(room.room.common.questionLimit, room.room.questionCount) : room.room.questionCount, 'question')}</Pill>
              </li>
              {minutes ? (
                <li>
                  <Pill>About {plural(minutes, 'minute')}</Pill>
                </li>
              ) : null}
              <li>
                <Pill>{room.room.common.questionTimeSec} s per question</Pill>
              </li>
              {room.room.common.timeLimitSec ? (
                <li>
                  <Pill>{Math.round(room.room.common.timeLimitSec / 60)} min game</Pill>
                </li>
              ) : null}
              {teams.length ? (
                <li>
                  <Pill>{teams.length} teams</Pill>
                </li>
              ) : null}
              {room.room.options.generatedNames ? (
                <li>
                  <Pill>Generated names</Pill>
                </li>
              ) : null}
              {room.room.classTitle ? (
                <li>
                  <Pill tone="dusk">
                    <Users className="size-[1em]" aria-hidden /> {room.room.classTitle} only
                  </Pill>
                </li>
              ) : null}
              {o.catchUp && POINTS_MODES.has(room.room.modeId) ? (
                <li>
                  <Pill>Late joiners start level with the lowest score</Pill>
                </li>
              ) : null}
              {room.room.common.doubleFinal && POINTS_MODES.has(room.room.modeId) ? (
                <li>
                  <Pill tone="lantern">Double points on the final question</Pill>
                </li>
              ) : null}
              {o.hideNames ? (
                <li>
                  <Pill>Names hidden on this screen</Pill>
                </li>
              ) : null}
              {o.quiet ? (
                <li>
                  <Pill>Quiet room</Pill>
                </li>
              ) : null}
              {o.admit ? (
                <li>
                  <Pill>Waiting room</Pill>
                </li>
              ) : null}
              {o.autoStartAt ? (
                <li>
                  <Pill>Starts at {plural(o.autoStartAt, 'player')}</Pill>
                </li>
              ) : null}
            </ul>
            {tools ? (
              <Button size="sm" variant="ghost" className="mt-1 -ml-3" icon={<Eye className="size-4" aria-hidden />} onClick={() => tools.open('preview')}>
                Preview the questions
              </Button>
            ) : null}
            {room.room.pinned ? <PinnedMessage text={room.room.pinned} big /> : null}
          </div>
           <Button variant="primary" size="2xl" className={`w-full text-[clamp(1.75rem,2.6vw,3.25rem)]! ${crowded ? 'h-[clamp(3.75rem,8vh,5.5rem)]!' : 'h-[clamp(4.5rem,11vh,7rem)]!'}`} disabled={room.players.length === 0} loading={busy === 'start'} onClick={() => run('start', { cmd: 'start' })}>
            Start game
          </Button>
        </div>
      </section>

      <WaitingRoom room={room} run={run} />
      <section className="flex flex-1 flex-col gap-[clamp(0.75rem,2vh,1.5rem)]" aria-labelledby="lobby-crowd">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <h2 id="lobby-crowd" className="font-display text-[clamp(1.75rem,2.6vw,3rem)] font-bold">
            {room.players.length === 0 ? (
              'Nobody here yet'
            ) : (
              <>
                <span className="tabular">{humans}</span> {humans === 1 ? 'player' : 'players'}
                {bots ? ` and ${bots} practice ${bots === 1 ? 'bot' : 'bots'}` : ''}
              </>
            )}
          </h2>
          {room.room.readyCount ? (
            <Pill tone="glim" className="text-[clamp(0.95rem,1.15vw,1.3rem)]">
              <Check className="size-[1em]" strokeWidth={3} aria-hidden /> {room.room.readyCount} ready
            </Pill>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {teams.length ? (
              <Button icon={<Shuffle className="size-4" aria-hidden />} onClick={() => run('shuffle', { cmd: 'shuffleTeams' })}>
                Shuffle teams
              </Button>
            ) : null}
            {/* A room holds up to 20 practice bots (the server's limit): past that the button would only fail. */}
            <Button icon={<Bot className="size-4" aria-hidden />} onClick={() => run('bots', { cmd: 'addBots', count: 3 })} loading={busy === 'bots'} disabled={bots >= MAX_BOTS}>
              {bots >= MAX_BOTS ? `${MAX_BOTS} bots is the most` : 'Add 3 practice bots'}
            </Button>
            {bots ? <Button onClick={() => run('nobots', { cmd: 'removeBots' })}>Remove bots</Button> : null}
          </div>
        </div>
        {room.players.length === 0 ? (
          <EmptySeats />
        ) : teams.length ? (
          <div className={`grid grid-cols-1 gap-4 ${TEAM_COLS[Math.min(teams.length, 6)] ?? 'md:grid-cols-3'}`}>
            {teams.map((t) => (
              <TeamCrowd key={t.id} team={t} players={room.players.filter((p) => p.teamId === t.id)} actions={actions} hops={hops} cheers={cheers} onRename={() => setRenaming({ kind: 'team', id: t.id, name: t.name })} />
            ))}
          </div>
        ) : (
          // The crowd stands on a lit stage floor that runs the width of the screen.
          <div className="relative flex flex-1 flex-col justify-end pb-[clamp(0.5rem,2vh,1.5rem)]">
            <div className="pointer-events-none absolute inset-x-[-2rem] bottom-0 h-[min(70%,14rem)] bg-[radial-gradient(60%_100%_at_50%_100%,rgb(58_107_255/0.22),transparent_75%)]" aria-hidden />
            <div className="relative">
              <Crowd players={room.players} actions={actions} hops={hops} cheers={cheers} />
            </div>
          </div>
        )}
      </section>
      <RenameDialog
        target={renaming}
        onClose={() => setRenaming(null)}
        onSave={async (name) => {
          if (!renaming) return null;
          const ack = await handle.host(renaming.kind === 'team' ? { cmd: 'renameTeam', teamId: renaming.id, name } : { cmd: 'renamePlayer', playerId: renaming.id, name });
          return ack.ok ? null : ack.error.message;
        }}
      />
    </div>
  );
}

/** The player's own Glim jumps for joy for a moment whenever they send a reaction. */
function useOwnPose(): [GlimPose, () => void] {
  const [cheerAt, setCheerAt] = useState(0);
  useEffect(() => {
    if (!cheerAt) return;
    const t = setTimeout(() => setCheerAt(0), 1200);
    return () => clearTimeout(t);
  }, [cheerAt]);
  return [cheerAt ? 'cheer' : 'idle', () => setCheerAt(Date.now())];
}

export function PlayerLobby({ room, handle }: { room: RoomView; handle: RoomHandle }) {
  const me = room.players.find((p) => p.id === room.me.playerId);
  const team = room.room.teams.find((t) => t.id === room.me.teamId);
  const others = room.players.filter((p) => p.id !== room.me.playerId);
  const shown = others.slice(0, 7);
  const [pose, cheer] = useOwnPose();
  // A room that starts by itself (a friend challenge has nobody to press Start) says so instead.
  const autoAt = room.room.options.autoStartAt;
  const waitingFor = autoAt ? `It starts by itself when ${plural(autoAt, 'player')} are in.` : `Waiting for ${room.room.hostName} to start.`;
  useAnnounce(`You are in. ${waitingFor}`, 'joined');
  const reactions = room.room.options.reactions;
  const chooseReactions = useChooseReactions(handle);
  const [hopCool, setHopCool] = useState(false);
  const hop = async () => {
    if (hopCool || !reactions) return;
    setHopCool(true);
    cheer();
    setTimeout(() => setHopCool(false), 1500);
    await handle.react('hop');
  };
  const ready = Boolean(room.me.ready);
  const pickTeam = room.room.options.teamPick && room.room.teams.length > 0;
  const send = async (req: Parameters<RoomHandle['player']>[0]) => {
    const ack = await handle.player(req);
    if (!ack.ok) toast.error(ack.error.message);
  };
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 text-center">
      <h1 className="plate plate-gold text-[2.5rem]">
        <span>You are in</span>
      </h1>
      {/* The player's card: their Glim under the stage light, their name and their team. */}
      {room.room.pinned ? <PinnedMessage text={room.room.pinned} big={false} /> : null}
      <LessonLobbyLine room={room} big={false} />
      <div className="stage-card flex w-full flex-col items-center gap-2 bg-white/[0.07] bg-[radial-gradient(90%_70%_at_50%_0%,rgb(58_107_255/0.35)_0%,transparent_70%)] px-5 pt-5 pb-4">
        {reactions ? (
          // Lobby play: tap your Glim and it hops on the big screen too.
          <button type="button" onClick={() => void hop()} disabled={hopCool} className="rounded-full disabled:cursor-default" aria-label="Make your Glim hop on the big screen" title="Tap to make your Glim hop on the big screen">
            <PlayerGlim avatar={me?.avatar} seed={room.me.playerId ?? room.me.name ?? 'you'} size={160} pose={pose} />
          </button>
        ) : (
          <PlayerGlim avatar={me?.avatar} seed={room.me.playerId ?? room.me.name ?? 'you'} size={160} pose={pose} />
        )}
        <p className="text-lg text-text-2">
          Playing as <span className="font-bold text-text">{room.me.name}</span>
        </p>
        {team && !pickTeam ? (
          <span className="rounded-full px-3 py-0.5 font-bold text-on-accent" style={{ background: `hsl(${team.hue} 80% 65%)` }}>
            {team.name}
          </span>
        ) : null}
        {pickTeam ? (
          <div className="flex w-full flex-col gap-1.5" role="radiogroup" aria-label="Pick your team">
            <p className="text-sm font-semibold text-text-2">Pick your team</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {room.room.teams.map((t) => {
                const mine = t.id === room.me.teamId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={mine}
                    onClick={() => (mine ? null : void send({ op: 'team', teamId: t.id }))}
                    className={`min-h-11 rounded-full px-4 font-bold text-on-accent transition-transform ${mine ? 'ring-4 ring-white ring-offset-2 ring-offset-[var(--stage-2)]' : 'opacity-80 hover:opacity-100'}`}
                    style={{ background: `hsl(${t.hue} 80% 65%)` }}
                  >
                    {mine ? <Check className="mr-1 inline size-4" strokeWidth={3} aria-hidden /> : null}
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <Button size="lg" variant={ready ? 'success' : 'primary'} className="mt-1 w-full" icon={ready ? <Check className="size-5" strokeWidth={3} aria-hidden /> : undefined} aria-pressed={ready} onClick={() => void send({ op: 'ready', ready: !ready })}>
          {ready ? 'Ready' : 'Tap when you are ready'}
        </Button>
      </div>
      <div className="paper stage-card w-full px-5 pt-4 pb-5">
        <p className="font-display text-[1.75rem] leading-tight font-bold">{room.room.title}</p>
        <p className="text-text-2">{room.room.setTitle}</p>
        {/* The game's rules, for anyone who has not played it before. */}
        <HowToPlay room={room} className="mt-3" />
        {shown.length ? (
          <div className="mt-3 flex items-end justify-center" aria-hidden>
            {shown.map((p, i) => (
              <span key={p.id} className={i ? '-ml-2.5' : ''} style={motionOK() ? { animation: 'stage-arrive 220ms var(--ease-out) both' } : undefined}>
                <PlayerGlim avatar={p.avatar} seed={p.id} size={46} />
              </span>
            ))}
            {others.length > shown.length ? <span className="mb-2 ml-1.5 font-display text-xl font-extrabold tabular">+{others.length - shown.length}</span> : null}
          </div>
        ) : null}
        <p className="mt-3 font-semibold text-text-2">
          {waitingFor} <span className="tabular">{room.players.length}</span> in the room
          {room.room.readyCount ? (
            <>
              , <span className="tabular">{room.room.readyCount}</span> ready
            </>
          ) : null}
          .
        </p>
        {/* A signed-in player can bring a friend into this room (the server checks they are friends and the room is open). */}
        {!room.room.locked && room.players.length < room.room.options.maxPlayers ? <InviteFriendsButton code={room.room.code} className="mt-3" /> : null}
      </div>
      {reactions ? (
        <ReactionBar
          onReact={(e) => {
            void handle.react(e);
            cheer();
          }}
          emotes={room.me.reactions}
          canReact={room.me.canReact}
          onChoose={chooseReactions}
        />
      ) : null}
    </div>
  );
}
