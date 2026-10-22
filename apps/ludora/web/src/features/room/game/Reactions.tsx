import { useEffect, useState } from 'react';
import { EmoteGlyph } from '../../../art/cosmetics.tsx';
import type { Reaction } from '../../../lib/useRoom.ts';
import { playSfx } from '../../../lib/sound/react.tsx';

const EMOTES = ['wave', 'laugh', 'wow', 'clap', 'heart', 'fire', 'think', 'gg'];

/** Floating reactions from the room, rising from the bottom edge; projector-sized on the host screen. */
export function ReactionLayer({ reactions, big = false }: { reactions: Reaction[]; big?: boolean }) {
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
          <span className={`paper mt-0.5 truncate rounded-full border-2 border-ink font-bold ${big ? 'max-w-[14rem] px-3 py-0.5 text-[clamp(1rem,1.3vw,1.5rem)]' : 'max-w-[8rem] px-2 text-xs'}`}>{r.name}</span>
        </div>
      ))}
    </div>
  );
}

/** Preset reactions only. There is no free-text chat in rooms. */
export function ReactionBar({ onReact, disabled }: { onReact: (emote: string) => void; disabled?: boolean }) {
  const [cooling, setCooling] = useState(false);
  const react = (e: string) => {
    if (cooling || disabled) return;
    onReact(e);
    setCooling(true);
    setTimeout(() => setCooling(false), 1500);
  };
  return (
    <div className="flex justify-center gap-1 sm:gap-1.5" role="group" aria-label="Send a reaction">
      {EMOTES.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => react(e)}
          disabled={cooling || disabled}
          className="grid size-10 shrink-0 place-items-center rounded-[14px] border border-white/20 bg-white/10 transition-[translate,background-color] duration-150 hover:-translate-y-0.5 hover:bg-white/20 active:translate-y-0 disabled:opacity-40 sm:size-11"
          aria-label={`React: ${e}`}
        >
          <EmoteGlyph glyph={e} size={26} />
        </button>
      ))}
    </div>
  );
}
