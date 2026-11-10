import { useEffect, useState } from 'react';
import { BellRing, Bot, Check, UserMinus, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import type { HostCommand, RoomView } from '@ludora/shared';
import type { RoomHandle } from '../../../lib/useRoom.ts';
import { Button } from '../../../ui/Button.tsx';
import { Dialog, Spinner } from '../../../ui/primitives.tsx';
import { PlayerGlim } from '../game/stage.tsx';
import { QrCode } from './QrCode.tsx';
import type { Shortcut } from './tools.ts';

/*
 * The host's panels, opened from the host menu or the lobby: who is still answering, the players
 * and their connections, the phone remote, the keyboard shortcuts and the question preview.
 */

async function run(handle: RoomHandle, cmd: HostCommand): Promise<boolean> {
  const ack = await handle.host(cmd);
  if (!ack.ok) toast.error(ack.error.message);
  return ack.ok;
}

/** The names of players still thinking about the open question, each with a gentle nudge. */
export function StillAnsweringList({ room, handle }: { room: RoomView; handle: RoomHandle }) {
  const waiting = room.host?.waiting ?? null;
  const [sent, setSent] = useState<Set<string>>(new Set());
  if (waiting === null) {
    return <p className="text-text-2">{room.room.pacing === 'host' ? 'No question is open right now. The list fills in when the next one starts.' : 'Everyone plays at their own pace in this mode, so there is no one question to wait for.'}</p>;
  }
  if (!waiting.length) return <p className="font-semibold text-glim">Everyone has answered.</p>;
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Still answering">
      {waiting.map((w) => {
        const done = w.nudged || sent.has(w.id);
        return (
          <li key={w.id} className="flex items-center gap-3 rounded-[var(--radius-m)] bg-surface-2 px-3 py-1.5">
            <PlayerGlim avatar={room.players.find((p) => p.id === w.id)?.avatar} seed={w.id} size={36} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate font-semibold">{w.name}</span>
            <Button
              size="sm"
              variant={done ? 'ghost' : 'secondary'}
              disabled={done}
              icon={done ? <Check className="size-4" aria-hidden /> : <BellRing className="size-4" aria-hidden />}
              aria-label={done ? `${w.name} was nudged` : `Nudge ${w.name}`}
              onClick={async () => {
                if (await run(handle, { cmd: 'nudge', playerId: w.id })) setSent((s) => new Set(s).add(w.id));
              }}
            >
              {done ? 'Nudged' : 'Nudge'}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export function StillAnsweringDialog({ room, handle, open, onOpenChange }: { room: RoomView; handle: RoomHandle; open: boolean; onOpenChange: (v: boolean) => void }) {
  const waiting = room.host?.waiting;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={waiting?.length ? `Still answering: ${waiting.length}` : 'Still answering'} description="A nudge shows “Your teacher is waiting for your answer” on that player's device. Nobody else sees it.">
      <StillAnsweringList room={room} handle={handle} />
    </Dialog>
  );
}

/** Everyone in the room, with who is reconnecting, and Remove. */
export function PlayersList({ room, handle }: { room: RoomView; handle: RoomHandle }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const away = room.players.filter((p) => !p.connected && !p.isBot);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-2" role="status">
        {away.length ? `${away.length} reconnecting. Their devices try again by themselves; they keep their place.` : 'Everyone is connected.'}
      </p>
      <ul className="flex flex-col gap-1.5" aria-label="Players">
        {room.players.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-[var(--radius-m)] bg-surface-2 px-3 py-1.5">
            <PlayerGlim avatar={p.avatar} seed={p.id} size={36} className={`shrink-0 ${p.connected ? '' : 'opacity-50 grayscale'}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{p.name}</span>
              {p.isBot ? (
                <span className="flex items-center gap-1 text-xs text-text-3">
                  <Bot className="size-3.5" aria-hidden /> Practice bot
                </span>
              ) : !p.connected ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-ember">
                  <WifiOff className="size-3.5" aria-hidden /> Reconnecting
                </span>
              ) : null}
            </span>
            {confirm === p.id ? (
              <span className="flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                  Keep
                </Button>
                <Button size="sm" variant="danger" onClick={() => void run(handle, { cmd: 'kick', playerId: p.id }).then(() => setConfirm(null))}>
                  Remove
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" icon={<UserMinus className="size-4" aria-hidden />} aria-label={`Remove ${p.name}`} onClick={() => setConfirm(p.id)}>
                <span className="max-sm:sr-only">Remove</span>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlayersDialog({ room, handle, open, onOpenChange }: { room: RoomView; handle: RoomHandle; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Players: ${room.players.length}`} description="A removed player cannot come back into this room from the same device.">
      <PlayersList room={room} handle={handle} />
    </Dialog>
  );
}

/** A QR code that opens this room on the host's phone as a controls-only remote. */
export function RemoteDialog({ code, open, onOpenChange }: { code: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const url = `${location.origin}/room/${code}?remote=1`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Use your phone as a remote" description="Scan this with your phone, signed in to the same account. Your phone gets the controls; this screen stays the big screen." size="sm">
      <div className="flex flex-col items-center gap-3">
        <QrCode text={url} label="QR code that opens the remote on your phone" className="w-56 p-2" />
        <p className="text-center text-sm break-all text-text-2">{url}</p>
      </div>
    </Dialog>
  );
}

/** The host's keyboard shortcuts, as a sheet behind "?". */
export function ShortcutsDialog({ shortcuts, open, onOpenChange }: { shortcuts: Shortcut[]; open: boolean; onOpenChange: (v: boolean) => void }) {
  const shown = shortcuts.filter((s) => s.when !== false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" description="They work whenever you are not typing in a box." size="sm">
      <ul className="flex flex-col gap-2">
        {[...shown.map((s) => ({ key: s.key, label: s.label, does: s.does })), { key: 'Escape', label: 'Esc', does: 'Close a panel' }].map((s) => (
          <li key={s.key} className="flex items-center gap-4">
            <kbd className="inline-grid min-w-12 place-items-center rounded-[var(--radius-s)] border border-line bg-surface-2 px-2 py-1 font-display text-lg font-bold text-text">{s.label}</kbd>
            <span className="text-text">{s.does}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

type PreviewQuestion = { id: string; type: string; prompt: string };
const TYPE_WORDS: Record<string, string> = { mcq: 'Choice', multi: 'Pick all', truefalse: 'True or false', short: 'Typed answer', numeric: 'Number', order: 'Order', match: 'Match', flashcard: 'Flashcard' };

/** The questions before starting: prompts only, never answers, since this screen is often on the projector. */
export function PreviewDialog({ handle, open, onOpenChange }: { handle: RoomHandle; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [data, setData] = useState<{ questions: PreviewQuestion[]; plays: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    void handle.host({ cmd: 'preview' }).then((ack) => {
      if (ack.ok) setData({ questions: (ack.questions as PreviewQuestion[]) ?? [], plays: Number(ack.plays ?? 0) });
      else setError(ack.error.message);
    });
  }, [open, handle]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Questions in this game" description="Answers are not shown here, in case this screen is on the projector." size="lg">
      {error ? (
        <p role="alert" className="text-ember">
          {error}
        </p>
      ) : !data ? (
        <Spinner label="Loading the questions" />
      ) : (
        <>
          {data.plays < data.questions.length ? <p className="mb-3 text-sm text-text-2">{`${data.plays} of these ${data.questions.length} will be played, picked at random.`}</p> : null}
          <ol className="flex flex-col gap-2">
            {data.questions.map((q, i) => (
              <li key={q.id} className="flex gap-3 rounded-[var(--radius-m)] bg-surface-2 px-3 py-2">
                <span className="font-display text-lg font-bold text-text-3 tabular">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words">{q.prompt}</span>
                  <span className="text-xs font-semibold text-text-3">{TYPE_WORDS[q.type] ?? 'Question'}</span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Dialog>
  );
}
