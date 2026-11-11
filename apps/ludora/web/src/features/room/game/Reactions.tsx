import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../lib/api.ts';
import { useMe } from '../../../lib/session.ts';
import type { RoomHandle } from '../../../lib/useRoom.ts';
import { Dialog } from '../../../ui/primitives.tsx';
import { Button } from '../../../ui/Button.tsx';
import { EmoteGlyph } from '../../../art/cosmetics.tsx';
import type { Reaction } from '../../../lib/useRoom.ts';
import { playSfx } from '../../../lib/sound/react.tsx';

const EMOTES = ['wave', 'laugh', 'wow', 'clap', 'heart', 'fire', 'think', 'gg'];

/** Floating reactions from the room, rising from the bottom edge; projector-sized on the host screen. */
export function ReactionLayer({ reactions: all, big = false }: { reactions: Reaction[]; big?: boolean }) {
  // Hops are lobby play: the player's own Glim jumps on the big screen instead of an emoji rising.
  const reactions = all.filter((r) => r.emote !== 'hop');
  // A soft pop for each reaction on the big screen; phones stay quiet.
  const latest = reactions.at(-1)?.key ?? null;
  useEffect(() => {
    if (big && latest !== null) playSfx('reaction', { n: latest });
  }, [big, latest]);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 h-0" aria-live="off">
      {reactions.map((r) => (
        <div key={r.key} className="absolute flex flex-col items-center" style={{ left: `${10 + ((r.key * 37) % 80)}%`, animation: 'reaction-float 3s var(--ease-out) forwards' }}>
          <EmoteGlyph glyph={r.emote} size={big ? 76 : 48} />
          <span className={`paper mt-0.5 truncate rounded-[var(--radius-s)] font-bold shadow-[0_6px_14px_-6px_rgb(2_5_20/0.8)] ${big ? 'max-w-[14rem] px-2.5 py-0.5 text-[clamp(1rem,1.3vw,1.5rem)]' : 'max-w-[8rem] px-1.5 text-xs'}`}>{r.name}</span>
        </div>
      ))}
    </div>
  );
}

/** The name of a reaction, for buttons and the chooser. */
export const REACTION_NAME: Record<string, string> = { wave: 'Wave', laugh: 'Laugh', wow: 'Wow', clap: 'Clap', heart: 'Heart', fire: 'Fire', think: 'Think', gg: 'GG', party: 'Party', cool: 'Cool', sleepy: 'Sleepy', star: 'Gold star' };

/** Preset reactions only. There is no free-text chat in rooms. `emotes` is the player's own bar (the server sends it). */
export function ReactionBar({ onReact, disabled, emotes = EMOTES, canReact, onChoose }: { onReact: (emote: string) => void; disabled?: boolean; emotes?: readonly string[] | undefined; canReact?: readonly string[] | undefined; onChoose?: ((emotes: string[]) => Promise<boolean>) | undefined }) {
  const [cooling, setCooling] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const react = (e: string) => {
    if (cooling || disabled) return;
    onReact(e);
    setCooling(true);
    setTimeout(() => setCooling(false), 1500);
  };
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-1">
      {/* Up to eight share the width of the narrowest phone: each is 44px tall and as wide as fits, up to 48px. */}
      <div className="flex w-full justify-center gap-1 sm:gap-1.5" role="group" aria-label="Send a reaction">
        {emotes.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => react(e)}
            disabled={cooling || disabled}
            className="press-soft grid h-11 max-w-12 min-w-0 flex-1 place-items-center rounded-[var(--radius-m)] bg-white/[0.08] hover:bg-white/[0.16] disabled:opacity-40"
            aria-label={`React: ${REACTION_NAME[e] ?? e}`}
          >
            <EmoteGlyph glyph={e} size={26} />
          </button>
        ))}
      </div>
      {onChoose && canReact && canReact.length > 0 ? (
        <>
          <button type="button" className="min-h-11 px-2 text-sm font-semibold text-text-2 underline underline-offset-2 hover:text-text" onClick={() => setChoosing(true)}>
            Choose your reactions
          </button>
          <ChooseReactions open={choosing} onOpenChange={setChoosing} current={emotes} canReact={canReact} onSave={onChoose} />
        </>
      ) : null}
    </div>
  );
}

/** Pick up to eight of the reactions you may send, in the order shown. */
export function ReactionPicker({ value, onChange, canReact, all }: { value: readonly string[]; onChange: (v: string[]) => void; canReact: readonly string[]; all?: readonly string[] }) {
  const list = all ?? canReact;
  const toggle = (e: string) => onChange(value.includes(e) ? value.filter((x) => x !== e) : value.length >= 8 ? [...value] : [...value, e]);
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm text-text-2">{value.length} of 8 chosen</legend>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {list.map((e) => {
          const owned = canReact.includes(e);
          const on = value.includes(e);
          return (
            <li key={e}>
              <label className={`flex min-h-11 items-center gap-2 rounded-[var(--radius-m)] border px-2 py-1.5 ${on ? 'border-lantern bg-lantern/10' : 'border-line'} ${owned ? 'cursor-pointer' : ''}`}>
                <input type="checkbox" className="size-5 shrink-0 accent-[var(--lantern)]" checked={on} disabled={!owned || (!on && value.length >= 8)} onChange={() => toggle(e)} />
                <EmoteGlyph glyph={e} size={24} />
                <span className="min-w-0 text-sm font-semibold break-words">
                  {REACTION_NAME[e] ?? e}
                  {owned ? null : <span className="block text-xs font-normal text-text-2">In the shop</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

function ChooseReactions({ open, onOpenChange, current, canReact, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; current: readonly string[]; canReact: readonly string[]; onSave: (emotes: string[]) => Promise<boolean> }) {
  const [value, setValue] = useState<string[]>([...current]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setValue([...current]);
  }, [open, current]);
  const save = async () => {
    setBusy(true);
    const ok = await onSave(value);
    setBusy(false);
    if (ok) onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Your reactions"
      description="Pick up to eight for your bar. Reactions you get in the shop or from Lanterns show up here too."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!value.length} onClick={() => void save()}>
            Use these
          </Button>
        </div>
      }
    >
      <ReactionPicker value={value} onChange={setValue} canReact={canReact} />
    </Dialog>
  );
}

/**
 * Saving a new bar from inside the room: the room uses it straight away (checked on the server), and an
 * account also keeps it for next time. A player who joined with only a name has no account to keep it
 * in, so no request needing one is made for them.
 */
export function useChooseReactions(handle: RoomHandle): (emotes: string[]) => Promise<boolean> {
  const me = useMe();
  const account = Boolean(me.data?.user && !me.data.user.isGuest);
  return async (emotes) => {
    const ack = await handle.player({ op: 'reactionBar', emotes });
    if (!ack.ok) {
      toast.error(ack.error.message);
      return false;
    }
    if (account) await api.patch('/api/me/preferences', { reactionBar: emotes }).catch(() => toast.error('Your reactions are set for this game, but were not saved for next time.'));
    return true;
  };
}
