import { useEffect, useRef, type ReactNode } from 'react';
import { Zap } from 'lucide-react';
import { POINTS_USUAL, type Media, type PublicQuestion } from '@ludora/shared';
import { formatDecimal } from '../../../lib/format.ts';
import { useAnnounce } from './announce.tsx';
import { focusAdrift, focusSettled } from '../../../lib/focus.ts';
import { useSfx, useSharedSounds } from '../../../lib/sound/react.tsx';
import { useChaosPrompt } from '../../extras/ExtrasLayer.tsx';
import { MathText } from '../../sets/math/MathText.tsx';
import { mathToWords } from '../../sets/math/parse.ts';
import { ReadAloud, useBigScreenReads } from './comfort.tsx';
import { useAccess } from '../../../lib/usePrefs.ts';
import { speechSupported } from '../../../lib/speech.ts';

/** A question's Points field in words: "Worth twice the points", "No points". */
export function worthWords(points: number): string {
  const x = points / POINTS_USUAL;
  if (x === 0) return 'No points';
  if (x === 2) return 'Worth twice the points';
  if (x === 0.5) return 'Worth half the points';
  return `Worth ${formatDecimal(x, 2)}× the points`;
}

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
 * scaled up rather than shown as a dot, framed in white so transparent pictures
 * still read as pictures on the stage. The author writes the alt text.
 */
export function QuestionImage({ media, size, className = '' }: { media: Media; size: keyof typeof IMAGE_HEIGHT; className?: string }) {
  return (
    <span className={`paper inline-grid max-w-full shrink-0 place-items-center overflow-hidden ${size === 'tile' ? 'rounded-[var(--radius-s)] p-1' : 'lift rounded-[var(--radius-m)] p-1.5'} ${className}`}>
      <img src={media.url} alt={media.alt} className={`block w-auto max-w-full rounded-[4px] object-contain ${IMAGE_HEIGHT[size]}`} />
    </span>
  );
}

/**
 * The prompt, with its image if it has one, in the reading face: questions are
 * read carefully, so they get the most legible type rather than the display face.
 * `size="lg"` is the projector card: dark ink on white, as big as the prompt allows, with the picture beside it.
 * `size="md"` is the phone version, white on the stage, with the picture underneath.
 */
export function QuestionCard({ q, index, total, children, size = 'md' }: { q: PublicQuestion; index?: number | undefined; total?: number | undefined; children?: ReactNode; size?: 'md' | 'lg' }) {
  // A new question is read out. If the answer button that had focus went away with the last one,
  // focus moves to the new prompt, so keyboard and screen reader users keep their place.
  const key = `${index ?? ''}|${q.prompt}`;
  useAnnounce(`${index !== undefined && total ? `Question ${index + 1} of ${total}. ` : ''}${q.double ? 'Double points. ' : ''}${q.points !== undefined ? `${worthWords(q.points)}. ` : ''}${mathToWords(q.prompt)}`, key);
  useSfx('question', key, useSharedSounds());
  const heading = useRef<HTMLHeadingElement>(null);
  // Chaos text looks (jumbled, typed out...) change only how the prompt is drawn, never what is read out.
  const chaosPrompt = useChaosPrompt();
  // Maths is drawn unless a chaos text look is changing how the prompt looks.
  const prompt = (text: string) => {
    const shown = chaosPrompt(text);
    return shown === text ? <MathText text={text} /> : shown;
  };
  useEffect(() => focusSettled(() => heading.current, { preventScroll: true }), [key]);
  // Answering swaps the answer buttons for "locked in" within the same question, and focus goes
  // with them to the page body, which sends a screen reader back to the top. Bring it to the prompt.
  useEffect(() => {
    let last: Element | null = document.activeElement;
    const onFocus = (e: FocusEvent) => {
      last = e.target as Element;
    };
    const lost = new MutationObserver(() => {
      if (last && !last.isConnected && focusAdrift()) {
        last = null;
        heading.current?.focus({ preventScroll: true });
      }
    });
    document.addEventListener('focusin', onFocus);
    lost.observe(heading.current?.closest('main') ?? document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('focusin', onFocus);
      lost.disconnect();
    };
  }, []);
  const bigScreenReads = useBigScreenReads();
  const { readAloud } = useAccess();
  const autoRead = size === 'lg' && bigScreenReads;
  const reader = speechSupported() && (readAloud || autoRead) ? <ReadAloud q={q} index={index} total={total} auto={autoRead} big={size === 'lg'} /> : null;
  const len = q.prompt.length;
  const many = (q.type === 'mcq' || q.type === 'multi') && q.choices.length > 4;
  const pill = `inline-flex items-center gap-1.5 self-start rounded-full bg-lantern px-3 py-0.5 font-display font-extrabold text-on-accent ${size === 'lg' ? 'text-[clamp(1.1rem,1.6vw,1.8rem)]' : 'text-base'}`;
  const double =
    q.double || q.points !== undefined ? (
      <>
        {q.double ? (
          <span className={pill}>
            <Zap className="size-[1em]" aria-hidden />
            Double points
          </span>
        ) : null}
        {/* What the question's author made it worth, where 1,000 is a usual question. */}
        {q.points !== undefined ? <span className={pill}>{worthWords(q.points)}</span> : null}
      </>
    ) : null;
  const counter =
    index !== undefined && total ? (
      <div className="flex flex-wrap items-center gap-3">
        <p className={`font-display font-bold tabular ${size === 'lg' ? 'text-[clamp(1.25rem,1.9vw,2.1rem)] text-text-2' : 'text-lg text-text-2'}`}>
          Question {index + 1} of {total}
        </p>
        {double}
        {reader ? <span className="ml-auto">{reader}</span> : null}
      </div>
    ) : double || reader ? (
      <div className="flex flex-wrap items-center gap-3">
        {double}
        {reader ? <span className="ml-auto">{reader}</span> : null}
      </div>
    ) : null;
  if (size === 'lg') {
    const text = len > 160 ? 'text-[clamp(1.5rem,2.3vw,2.75rem)]' : len > 90 ? 'text-[clamp(1.85rem,2.9vw,3.5rem)]' : 'text-[clamp(2.25rem,3.8vw,4.75rem)]';
    return (
      <div className="paper stage-card flex flex-col gap-3 px-[clamp(1.25rem,2.6vw,3.25rem)] py-[clamp(1rem,2.6vh,2.25rem)]">
        {counter}
        <div className="flex flex-col gap-[clamp(1rem,2vw,2.5rem)] sm:flex-row sm:items-center">
          <h2 ref={heading} tabIndex={-1} data-chaos-part="prompt" className={`min-w-0 flex-1 font-sans leading-[1.12] font-bold tracking-[-0.01em] text-pretty break-words text-text outline-none ${text} max-sm:text-[1.6rem]`}>
            {prompt(q.prompt)}
          </h2>
          {q.media ? <QuestionImage media={q.media} size={many ? 'hostCompact' : 'host'} className="self-start sm:max-w-[42%] sm:self-auto" /> : null}
        </div>
        {children}
      </div>
    );
  }
  const text = len > 140 ? 'text-lg sm:text-xl' : len > 70 ? 'text-xl sm:text-2xl' : 'text-[1.6rem] leading-[1.18] sm:text-[1.75rem]';
  return (
    <div className="flex flex-col gap-2.5">
      {counter}
      <h2 ref={heading} tabIndex={-1} data-chaos-part="prompt" className={`font-sans leading-snug font-bold text-pretty text-text outline-none ${text}`}>
        {prompt(q.prompt)}
      </h2>
      {q.media ? <QuestionImage media={q.media} size={many || len > 70 ? 'phoneCompact' : 'phone'} className="self-start" /> : null}
      {children}
    </div>
  );
}
