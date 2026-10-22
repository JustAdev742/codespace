import { useEffect, useRef, type ReactNode } from 'react';
import type { Media, PublicQuestion } from '@ludora/shared';
import { useAnnounce } from './announce.tsx';

const IMAGE_HEIGHT = {
  /** Projector: beside the prompt, as tall as the screen comfortably allows. */
  host: 'h-[clamp(140px,28vh,320px)]',
  /** Projector, when five or six answers need the room. */
  hostCompact: 'h-[clamp(120px,20vh,260px)]',
  /** Phone: under the prompt, short enough that the answers stay above the fold. */
  phone: 'h-[clamp(100px,17vh,150px)]',
  /** Phone, under a long prompt or above five or six answers. */
  phoneCompact: 'h-[clamp(84px,12vh,120px)]',
  /** Inside an answer tile. */
  tile: 'h-[clamp(3.5rem,8vh,6.5rem)]',
};

/**
 * A question or answer picture at a fixed display height, so a tiny upload is
 * scaled up rather than shown as a dot, on white paper with an ink edge so
 * transparent pictures still read as pictures. The author writes the alt text.
 */
export function QuestionImage({ media, size, className = '' }: { media: Media; size: keyof typeof IMAGE_HEIGHT; className?: string }) {
  return (
    <span className={`paper inline-grid max-w-full shrink-0 place-items-center overflow-hidden border-ink ${size === 'tile' ? 'rounded-[12px] border-2 p-1' : 'rounded-[18px] border-[3px] p-2 shadow-[0_4px_0_rgb(12_8_48/0.55)]'} ${className}`}>
      <img src={media.url} alt={media.alt} className={`block w-auto max-w-full rounded-[10px] object-contain ${IMAGE_HEIGHT[size]}`} />
    </span>
  );
}

/**
 * The prompt, with its image if it has one.
 * `size="lg"` is the projector card: dark ink on white paper, as big as the prompt allows, with the picture beside it.
 * `size="md"` is the phone version, white on the dusk sky, with the picture underneath.
 */
export function QuestionCard({ q, index, total, children, size = 'md' }: { q: PublicQuestion; index?: number | undefined; total?: number | undefined; children?: ReactNode; size?: 'md' | 'lg' }) {
  // A new question is read out. If the answer button that had focus went away with the last one,
  // focus moves to the new prompt, so keyboard and screen reader users keep their place.
  const key = `${index ?? ''}|${q.prompt}`;
  useAnnounce(index !== undefined && total ? `Question ${index + 1} of ${total}. ${q.prompt}` : q.prompt, key);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!document.activeElement || document.activeElement === document.body) heading.current?.focus({ preventScroll: true });
  }, [key]);
  const len = q.prompt.length;
  const many = (q.type === 'mcq' || q.type === 'multi') && q.choices.length > 4;
  const counter =
    index !== undefined && total ? (
      <p className={`font-display font-bold ${size === 'lg' ? 'text-[clamp(1.1rem,1.7vw,1.9rem)] text-text-2' : 'text-base text-text-2'}`}>
        Question {index + 1} of {total}
      </p>
    ) : null;
  if (size === 'lg') {
    const text = len > 160 ? 'text-[clamp(1.6rem,2.5vw,3rem)]' : len > 90 ? 'text-[clamp(2rem,3.2vw,3.9rem)]' : 'text-[clamp(2.5rem,4.2vw,5.25rem)]';
    return (
      <div className="paper stage-card flex flex-col gap-3 px-[clamp(1.25rem,2.6vw,3.25rem)] py-[clamp(1rem,2.6vh,2.25rem)]">
        {counter}
        <div className="flex flex-col gap-[clamp(1rem,2vw,2.5rem)] sm:flex-row sm:items-center">
          <h2 ref={heading} tabIndex={-1} className={`min-w-0 flex-1 font-display leading-[1.06] font-extrabold break-words text-text outline-none ${text} max-sm:text-[1.9rem]`}>
            {q.prompt}
          </h2>
          {q.media ? <QuestionImage media={q.media} size={many ? 'hostCompact' : 'host'} className="self-start sm:max-w-[42%] sm:self-auto" /> : null}
        </div>
        {children}
      </div>
    );
  }
  const text = len > 140 ? 'text-lg sm:text-xl' : len > 70 ? 'text-xl sm:text-2xl' : 'text-[1.7rem] leading-[1.12] sm:text-3xl';
  return (
    <div className="flex flex-col gap-2.5">
      {counter}
      <h2 ref={heading} tabIndex={-1} className={`font-display font-extrabold text-text outline-none ${text}`}>
        {q.prompt}
      </h2>
      {q.media ? <QuestionImage media={q.media} size={many || len > 70 ? 'phoneCompact' : 'phone'} className="self-start" /> : null}
      {children}
    </div>
  );
}
