import { useState } from 'react';
import { EmoteGlyph } from '../../../art/cosmetics.tsx';
import type { Reaction } from '../../../lib/useRoom.ts';

const EMOTES = ['wave', 'laugh', 'wow', 'clap', 'heart', 'fire', 'think', 'gg'];

/** Floating reactions from the room, rising from the bottom edge. */
export function ReactionLayer({ reactions }: { reactions: Reaction[] }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 h-0" aria-live="off">
      {reactions.map((r) => (
        <div
          key={r.key}
          className="absolute flex flex-col items-center"
          style={{ left: `${10 + ((r.key * 37) % 80)}%`, animation: 'reaction-float 3s var(--ease-out) forwards' }}
        >
          <EmoteGlyph glyph={r.emote} size={44} />
          <span className="mt-0.5 max-w-[8rem] truncate rounded-full bg-ink/70 px-2 text-[11px] font-semibold text-white">{r.name}</span>
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
        <button key={e} type="button" onClick={() => react(e)} disabled={cooling || disabled} className="grid size-10 shrink-0 place-items-center rounded-[12px] border border-line bg-raised transition-transform hover:-translate-y-0.5 disabled:opacity-40 sm:size-11" aria-label={`React: ${e}`}>
          <EmoteGlyph glyph={e} size={26} />
        </button>
      ))}
    </div>
  );
}
