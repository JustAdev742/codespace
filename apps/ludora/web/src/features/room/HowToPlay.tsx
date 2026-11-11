import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import type { RoomView } from '@ludora/shared';
import { useModes } from '../../lib/queries.ts';
import { Dialog } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';

/**
 * "How to play" in the lobby: the game's own rules (the list on its page) and what this version of it
 * changes. On a phone it is for a player who has not met the game before; on the big screen it is for
 * the teacher to talk through before pressing Start, so the words there are large enough for the back row.
 *
 * The rules come from the public catalogue the room already loads. Nothing shows until that has arrived,
 * or for a game the catalogue does not list.
 */
export function HowToPlay({ room, big = false, className = '' }: { room: RoomView; big?: boolean; className?: string }) {
  const modes = useModes();
  const [open, setOpen] = useState(false);
  const entry = modes.data?.modes.find((m) => m.meta.id === room.room.modeId);
  if (!entry || !entry.meta.rules.length) return null;
  const variant = room.room.variantId ? entry.variants.find((v) => v.meta.id === room.room.variantId) : undefined;
  const name = variant ? `${entry.meta.title}: ${variant.meta.title}` : entry.meta.title;
  return (
    <>
      <Button icon={<HelpCircle className="size-4" aria-hidden />} className={className} onClick={() => setOpen(true)}>
        How to play
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={`How to play ${name}`} description={variant?.meta.tagline ?? entry.meta.tagline} size={big ? 'lg' : 'md'}>
        <ol className={`flex flex-col text-left ${big ? 'gap-4' : 'gap-3'}`}>
          {entry.meta.rules.map((rule, i) => (
            <li key={rule} className="flex gap-3">
              <span className={`grid shrink-0 place-items-center rounded-[var(--radius-s)] bg-lantern font-display font-extrabold text-on-accent tabular ${big ? 'size-10 text-2xl' : 'size-8 text-lg'}`} aria-hidden>
                {i + 1}
              </span>
              <span className={big ? 'pt-0.5 text-[clamp(1.15rem,1.6vw,1.6rem)] leading-snug text-text' : 'pt-0.5 text-text'}>{rule}</span>
            </li>
          ))}
        </ol>
        {variant ? (
          <p className={`mt-4 rounded-[var(--radius-m)] bg-surface-2 px-4 py-3 text-left ${big ? 'text-[clamp(1.05rem,1.4vw,1.4rem)] leading-snug' : ''}`}>
            <span className="font-bold text-text">In this version: </span>
            <span className="text-text-2">{variant.meta.changes}</span>
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
