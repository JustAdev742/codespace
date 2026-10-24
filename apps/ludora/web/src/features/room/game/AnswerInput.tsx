import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Check, Send, Users, WifiOff, X } from 'lucide-react';
import type { Answer, Media, PublicQuestion } from '@ludora/shared';
import { AnswerShape, ANSWER_LETTERS } from '../../../art/icons.tsx';
import { QuestionImage } from './QuestionCard.tsx';
import { useAnswerMemory, useRememberingSubmit } from './answerMemory.tsx';
import { useOnline } from './online.tsx';
import { playSfx, useSoundPacing, useSoundRole } from '../../../lib/sound/react.tsx';

/*
 * Answer controls for every question type. Choices always carry a shape and
 * a letter as well as a colour, and number keys 1 to 6 pick them.
 */

export const TILE_BG = ['var(--tile-a)', 'var(--tile-b)', 'var(--tile-c)', 'var(--tile-d)', 'var(--tile-e)', 'var(--tile-f)'];

export interface AnswerInputProps {
  q: PublicQuestion;
  /** Resolves true when the server accepted the answer. */
  onSubmit: (answer: Answer) => Promise<boolean>;
  disabled?: boolean;
  /** Token of the choice already submitted, to keep it highlighted. */
  chosen?: string | null;
  /** Smaller tiles, for modes where the question shares the phone with a game board. */
  compact?: boolean;
}

export type TileSize = 'sm' | 'md' | 'lg';

const SIZE: Record<TileSize, { tile: string; stack: string; text: string; long: string; badge: string; shape: number; mark: string }> = {
  sm: { tile: 'min-h-[3.75rem] gap-3 rounded-[12px] px-3 py-2', stack: 'min-h-[5.5rem] gap-2 rounded-[12px] p-3', text: 'text-lg', long: 'text-base', badge: 'gap-1 px-1.5 py-1 text-lg', shape: 18, mark: 'size-7' },
  md: { tile: 'min-h-[4.5rem] gap-3 rounded-[14px] px-3.5 py-2.5', stack: 'min-h-[7rem] gap-2 rounded-[14px] p-3.5', text: 'text-xl', long: 'text-base', badge: 'gap-1.5 px-1.5 py-1 text-[1.35rem]', shape: 22, mark: 'size-8' },
  lg: {
    tile: 'min-h-[clamp(5rem,12.5vh,9.5rem)] gap-[clamp(0.75rem,1.4vw,1.5rem)] rounded-[14px] px-[clamp(1rem,1.6vw,1.75rem)] py-3 max-sm:min-h-[4.5rem]',
    stack: 'min-h-[clamp(7rem,18vh,12rem)] gap-3 rounded-[14px] p-[clamp(1rem,1.6vw,1.75rem)]',
    text: 'text-[clamp(1.4rem,2.3vw,2.75rem)]',
    long: 'text-[clamp(1.1rem,1.6vw,1.9rem)]',
    badge: 'gap-2 px-[clamp(0.4rem,0.7vw,0.75rem)] py-[clamp(0.25rem,0.5vh,0.5rem)] text-[clamp(1.5rem,2.4vw,2.75rem)]',
    shape: 36,
    mark: 'size-[clamp(2.25rem,4vh,3rem)]',
  },
};

/** Taller projector tiles when there are only two rows of them, so they fill the screen (not on a host screen opened on a phone). */
const TALL = 'min-h-[clamp(5.5rem,15.5vh,11.5rem)]! max-sm:min-h-[4.5rem]!';
/** Taller two-up phone tiles when there are four or fewer: bigger targets that still fit above the fold. */
const TALL_STACK = 'min-h-[clamp(7rem,18vh,10rem)]!';
/** Shorter two-up phone tiles for five or six answers, so the last row stays above the fold. */
const DENSE_STACK = 'min-h-[5.25rem]!';

/**
 * One answer as a solid, pressable game piece (`.piece`): its tile colour, ink
 * words, its letter and shape. A chosen tile is held down and carries a check;
 * tiles out of play go smoked (`.piece-off`) rather than fading, so every label
 * stays readable, and their letter keeps the answer's colour and shape. At the
 * reveal the right answer stays lit with a mint ring and a check badge, and the
 * player's own pick is tagged "Your answer". Nothing is told by colour alone.
 */
export function ChoiceTile({
  index,
  text,
  selected,
  dimmed,
  correct,
  wrong,
  mine,
  onClick,
  disabled,
  compact,
  size,
  layout = 'row',
  count,
  max = 0,
  keyHint = false,
  tall = false,
  dense = false,
  media,
}: {
  index: number;
  text: string;
  selected?: boolean;
  dimmed?: boolean;
  correct?: boolean;
  wrong?: boolean;
  /** The player's own pick, tagged at the reveal whether it was right or not. */
  mine?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  compact?: boolean;
  size?: TileSize;
  /** `stack` puts the badge above the text, for two-up tiles on a phone. */
  layout?: 'row' | 'stack';
  /** How many players chose this answer, shown at the reveal. */
  count?: number | null | undefined;
  max?: number;
  /** Show the number key that picks this tile (players with a keyboard). */
  keyHint?: boolean;
  tall?: boolean;
  dense?: boolean;
  /** A picture on the answer itself. */
  media?: Media | undefined;
}) {
  const s = SIZE[size ?? (compact ? 'sm' : 'md')];
  const lit = !dimmed;
  const bg = TILE_BG[index % TILE_BG.length];
  const long = text.length > 60;
  const tagged = wrong || mine;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-pressed={selected || undefined}
      aria-pressed={selected}
      className={`relative flex w-full text-left [--press:5px] disabled:cursor-default ${layout === 'stack' ? `flex-col items-start justify-between ${s.stack} ${tall ? TALL_STACK : dense ? DENSE_STACK : ''}` : `items-center ${s.tile} ${tall ? TALL : ''}`} ${lit ? 'piece text-on-accent' : 'piece-off'} ${
        correct ? 'ring-[3px] ring-glim ring-offset-[3px] ring-offset-[color:var(--stage-3)]' : ''
      }`}
      style={lit ? { background: bg } : undefined}
    >
      {/* On a lit tile the letter and shape sit straight on its colour; on a smoked one they keep a chip of it. */}
      <span className={`flex shrink-0 items-center rounded-[var(--radius-s)] font-display leading-none font-extrabold text-on-accent ${s.badge} ${lit ? 'bg-black/[0.07]' : ''}`} style={lit ? undefined : { background: bg }}>
        <AnswerShape index={index} size={s.shape} />
        <span>{ANSWER_LETTERS[index]}</span>
      </span>{' '}
      {media ? <QuestionImage media={media} size="tile" className={layout === 'stack' ? 'self-start' : ''} /> : null}
      {text ? <span className={`min-w-0 flex-1 leading-tight font-bold break-words ${long ? s.long : s.text} ${layout === 'stack' ? 'flex w-full items-end' : ''}`}>{text}</span> : <span className="flex-1" />}
      {keyHint && !selected ? (
        <span className="hidden self-start font-display text-base font-bold opacity-70 sm:block" aria-hidden>
          {index + 1}
        </span>
      ) : null}
      {selected ? (
        // The chosen tile is held down and checked, so the pick reads without its colour.
        <span className={`absolute top-2 right-2 grid place-items-center rounded-full bg-ink text-white ${s.mark}`} aria-hidden>
          <Check className="size-[60%]" strokeWidth={3} />
        </span>
      ) : null}
      {count !== undefined && count !== null ? (
        <>
          <span className={`flex shrink-0 items-center gap-1.5 self-center rounded-full px-3 py-1 font-display font-extrabold tabular ${lit ? 'bg-ink/85 text-white' : 'bg-white/[0.12] text-text'} ${size === 'lg' ? 'text-[clamp(1.25rem,2vw,2.25rem)]' : 'text-lg'}`}>
            <Users className="size-[0.85em]" aria-hidden />
            {count}
            <span className="sr-only"> {count === 1 ? 'player' : 'players'}</span>
          </span>
          {max > 0 ? (
            <span className="pointer-events-none absolute inset-x-3 bottom-2 h-1.5 overflow-hidden rounded-full" aria-hidden>
              <span className={`block h-full origin-left rounded-full ${lit ? 'bg-ink/45' : 'bg-white/45'}`} style={{ transform: `scaleX(${Math.min(1, count / max)})`, animation: 'stage-grow 420ms var(--ease-out) both' }} />
            </span>
          ) : null}
        </>
      ) : null}
      {correct ? (
        <span className="absolute -top-3 -right-3 grid size-10 place-items-center rounded-full bg-glim text-on-accent shadow-[0_0_0_3px_var(--stage-3)]" role="img" aria-label="Correct answer">
          <Check className="size-6" strokeWidth={3} aria-hidden />
        </span>
      ) : null}
      {tagged ? (
        <span className={`absolute -top-3 inline-flex items-center gap-1 rounded-[var(--radius-s)] px-2 py-0.5 text-sm font-bold shadow-[0_6px_14px_-6px_rgb(2_5_20/0.8)] ${correct ? 'paper right-10' : 'right-3 bg-ember text-on-accent'}`}>
          {correct ? null : <X className="size-3.5" strokeWidth={3} aria-hidden />}
          <span className="sr-only">, </span>Your answer
        </span>
      ) : null}
    </button>
  );
}

/** True and False on the projector: side by side, or stacked on a host screen opened on a phone. */
export const HOST_PAIR = 'grid grid-cols-1 gap-[clamp(0.75rem,1.4vw,1.5rem)] sm:grid-cols-2';

/** Two-up tiles when every choice is short enough to sit side by side on a phone; the odd one out spans the row. */
export function choiceGrid(texts: string[], host = false): { grid: string; layout: 'row' | 'stack'; tall: boolean; dense: boolean } {
  const n = texts.length;
  const short = texts.every((t) => t.length <= 18);
  const odd = '[&>*:last-child:nth-child(odd)]:col-span-2';
  const oddWide = 'sm:[&>*:last-child:nth-child(odd)]:col-span-2';
  const tall = n <= 4;
  const dense = n > 4;
  if (host) {
    // Three or six short answers sit three across on a wide screen: one row fewer to read, and it fits a 768-pixel projector.
    const threeUp = (n === 3 || n === 6) && texts.every((t) => t.length <= 32);
    // A host screen opened on a phone gets one column, so the projector-sized text never has to break a word.
    const gap = 'gap-[clamp(0.75rem,1.4vw,1.5rem)]';
    return { grid: threeUp ? `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${gap} sm:max-lg:[&>*:last-child:nth-child(odd)]:col-span-2` : `grid grid-cols-1 sm:grid-cols-2 ${gap} ${oddWide}`, layout: 'row', tall, dense };
  }
  if (n <= 2 || short) return { grid: `grid grid-cols-2 gap-3 ${odd}`, layout: 'stack', tall, dense };
  return { grid: 'grid grid-cols-1 gap-3 sm:grid-cols-2', layout: 'row', tall: false, dense };
}

function useNumberKeys(count: number, onPick: (i: number) => void, enabled: boolean) {
  const ref = useRef(onPick);
  ref.current = onPick;
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= count) {
        e.preventDefault();
        ref.current(n - 1);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [count, enabled]);
}

function ChoiceAnswer({ q, onSubmit, disabled, chosen, compact }: AnswerInputProps & { q: Extract<PublicQuestion, { type: 'mcq' }> }) {
  const [picked, setPicked] = useState<string | null>(chosen ?? null);
  const [busy, setBusy] = useState(false);
  const locked = disabled || busy || picked !== null;
  const pick = async (id: string) => {
    if (locked) return;
    setPicked(id);
    setBusy(true);
    const ok = await onSubmit({ type: 'mcq', choiceId: id });
    setBusy(false);
    if (!ok) setPicked(null);
  };
  useNumberKeys(q.choices.length, (i) => void pick(q.choices[i]!.id), !locked);
  const { grid, layout, tall, dense } = choiceGrid(q.choices.map((c) => c.text));
  return (
    <div className={grid} role="group" aria-label="Answers">
      {q.choices.map((c, i) => (
        <ChoiceTile key={c.id} index={i} text={c.text} media={c.media} selected={picked === c.id} dimmed={picked !== null && picked !== c.id} onClick={() => void pick(c.id)} disabled={locked && picked !== c.id} compact={compact} layout={layout} tall={tall && !compact && !q.media} dense={dense} keyHint />
      ))}
    </div>
  );
}

function TrueFalseAnswer({ q, onSubmit, disabled, compact }: AnswerInputProps) {
  const [picked, setPicked] = useState<boolean | null>(null);
  const locked = disabled || picked !== null;
  const pick = async (v: boolean) => {
    if (locked) return;
    setPicked(v);
    if (!(await onSubmit({ type: 'truefalse', value: v }))) setPicked(null);
  };
  useNumberKeys(2, (i) => void pick(i === 0), !locked);
  return (
    <div className="grid grid-cols-2 gap-3" role="group" aria-label="Answers">
      <ChoiceTile index={0} text="True" selected={picked === true} dimmed={picked === false} onClick={() => void pick(true)} disabled={locked} compact={compact} layout="stack" tall={!compact && !q.media} keyHint />
      <ChoiceTile index={1} text="False" selected={picked === false} dimmed={picked === true} onClick={() => void pick(false)} disabled={locked} compact={compact} layout="stack" tall={!compact && !q.media} keyHint />
    </div>
  );
}

function MultiAnswer({ q, onSubmit, disabled, compact }: AnswerInputProps & { q: Extract<PublicQuestion, { type: 'multi' }> }) {
  const [sel, setSel] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const locked = disabled || sent;
  const toggle = (id: string) => {
    if (locked) return;
    playSfx('select');
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  useNumberKeys(q.choices.length, (i) => toggle(q.choices[i]!.id), !locked);
  const submit = async () => {
    if (locked || sel.length === 0) return;
    setSent(true);
    if (!(await onSubmit({ type: 'multi', choiceIds: sel }))) setSent(false);
  };
  const { grid, layout, dense } = choiceGrid(q.choices.map((c) => c.text));
  return (
    <div className="flex flex-col gap-3">
      <p className="font-semibold text-text-2">{q.selectCount ? `Pick ${q.selectCount}.` : 'Pick every correct answer.'}</p>
      <div className={grid} role="group" aria-label="Answers">
        {q.choices.map((c, i) => (
          <ChoiceTile key={c.id} index={i} text={c.text} media={c.media} selected={sel.includes(c.id)} dimmed={locked && !sel.includes(c.id)} onClick={() => toggle(c.id)} disabled={locked} compact={compact} layout={layout} dense={dense} keyHint />
        ))}
      </div>
      <SubmitButton disabled={locked || sel.length === 0} sent={sent} onClick={submit} label={sel.length ? `Submit ${sel.length} ${sel.length === 1 ? 'answer' : 'answers'}` : 'Submit answers'} sticky />
    </div>
  );
}

/**
 * `sticky` keeps the button in view at the bottom of the screen while a long list of
 * items above it scrolls: matching, ordering and select-all questions outgrow short phones.
 * Only once it can be pressed: a disabled sticker is see-through on the stage.
 */
function SubmitButton({ disabled, sent, onClick, label = 'Submit answer', sticky = false }: { disabled: boolean; sent: boolean; onClick?: () => void; label?: string; sticky?: boolean }) {
  return (
    <button
      type={onClick ? 'button' : 'submit'}
      onClick={onClick}
      disabled={disabled}
      className={`sticker inline-flex h-16 w-full items-center justify-center gap-2.5 rounded-[var(--radius-l)] bg-lantern px-6 font-display text-[1.6rem] font-extrabold text-on-accent [--press:6px] disabled:cursor-not-allowed sm:w-auto sm:self-start ${sticky && !disabled ? 'sticky bottom-3 z-10' : ''}`}
    >
      {sent ? <Check className="size-6" aria-hidden /> : <Send className="size-5" aria-hidden />}
      {sent ? 'Answer sent' : label}
    </button>
  );
}

function TextAnswer({ numeric, unit, onSubmit, disabled }: { numeric: boolean; unit?: string | undefined; onSubmit: AnswerInputProps['onSubmit']; disabled?: boolean | undefined }) {
  const [value, setValue] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const locked = disabled || sent;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (locked || !value.trim()) return;
    let answer: Answer;
    if (numeric) {
      const n = Number(value.replace(/,/g, '').replace(/−/g, '-').trim());
      if (!Number.isFinite(n)) {
        setError('Type a number, like 42 or 3.5.');
        return;
      }
      answer = { type: 'numeric', value: n };
    } else answer = { type: 'short', text: value.slice(0, 200) };
    setError(null);
    setSent(true);
    if (!(await onSubmit(answer))) setSent(false);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="answer-text" className="sr-only">
          Your answer
        </label>
        <input
          ref={ref}
          id="answer-text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={locked}
          inputMode={numeric ? 'decimal' : 'text'}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={200}
          placeholder={numeric ? 'Type a number' : 'Type your answer'}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'answer-text-error' : undefined}
          className="paper h-16 min-w-0 flex-1 rounded-[var(--radius-l)] border border-line-strong px-4 text-2xl font-bold placeholder:text-lg placeholder:font-normal placeholder:text-text-3 focus:outline-none focus-visible:ring-4 focus-visible:ring-lantern disabled:opacity-80"
        />
        {unit ? <span className="font-display text-[1.75rem] font-bold text-text">{unit}</span> : null}
      </div>
      {error ? (
        <p id="answer-text-error" className="rounded-[var(--radius-m)] border border-ember/60 bg-white/[0.07] px-3 py-2 font-semibold text-ember">
          {error}
        </p>
      ) : null}
      <SubmitButton disabled={locked || !value.trim()} sent={sent} />
    </form>
  );
}

function OrderAnswer({ q, onSubmit, disabled }: AnswerInputProps & { q: Extract<PublicQuestion, { type: 'order' }> }) {
  const [items, setItems] = useState(q.items);
  const [sent, setSent] = useState(false);
  const locked = disabled || sent;
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (locked || j < 0 || j >= items.length) return;
    playSfx('tap');
    setItems((list) => {
      const next = list.slice();
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  };
  const submit = async () => {
    setSent(true);
    if (!(await onSubmit({ type: 'order', itemIds: items.map((i) => i.id) }))) setSent(false);
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="font-semibold text-text-2">Move the items into the right order, first at the top.</p>
      <ol className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={item.id} className="paper flex items-center gap-2 rounded-[var(--radius-m)] p-2 pl-3 shadow-[0_8px_20px_-10px_rgb(2_5_20/0.7)]">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-lantern font-display text-lg font-extrabold text-on-accent tabular">{i + 1}</span>
            <span className="min-w-0 flex-1 font-bold">{item.text}</span>
            <button type="button" className="grid size-11 scroll-mb-28 place-items-center rounded-[var(--radius-s)] bg-surface-3 text-text hover:bg-surface-2 disabled:opacity-30" onClick={() => move(i, -1)} disabled={locked || i === 0} aria-label={`Move ${item.text} up`}>
              <ArrowUp className="size-5" aria-hidden />
            </button>
            <button type="button" className="grid size-11 scroll-mb-28 place-items-center rounded-[var(--radius-s)] bg-surface-3 text-text hover:bg-surface-2 disabled:opacity-30" onClick={() => move(i, 1)} disabled={locked || i === items.length - 1} aria-label={`Move ${item.text} down`}>
              <ArrowDown className="size-5" aria-hidden />
            </button>
          </li>
        ))}
      </ol>
      <SubmitButton disabled={locked} sent={sent} onClick={submit} label="Lock in this order" sticky />
    </div>
  );
}

/** Each left item's colour, and its number: a matched pair shows the same number on both sides, so pairs never rely on colour. */
const PAIR_COLORS = ['var(--tile-a)', 'var(--tile-b)', 'var(--tile-c)', 'var(--tile-d)', 'var(--tile-e)', 'var(--tile-f)', 'var(--lantern)', 'var(--r-common)'];

function PairNumber({ n, color }: { n: number; color: string }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full font-display text-base font-extrabold text-on-accent tabular" style={{ background: color }} aria-hidden>
      {n}
    </span>
  );
}

function MatchAnswer({ q, onSubmit, disabled }: AnswerInputProps & { q: Extract<PublicQuestion, { type: 'match' }> }) {
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const locked = disabled || sent;
  const colorOf = useMemo(() => Object.fromEntries(q.left.map((l, i) => [l.id, PAIR_COLORS[i % PAIR_COLORS.length]!])), [q.left]);
  const numberOf = useMemo(() => Object.fromEntries(q.left.map((l, i) => [l.id, i + 1])), [q.left]);
  const rightOwner = (rid: string) => Object.entries(pairs).find(([, r]) => r === rid)?.[0];
  const pickRight = (rid: string) => {
    if (locked || !active) return;
    playSfx('select');
    setPairs((p) => {
      const next = { ...p };
      for (const [l, r] of Object.entries(next)) if (r === rid) delete next[l];
      next[active] = rid;
      return next;
    });
    const nextLeft = q.left.find((l) => l.id !== active && !pairs[l.id]);
    setActive(nextLeft?.id ?? null);
  };
  const complete = q.left.every((l) => pairs[l.id]);
  const submit = async () => {
    setSent(true);
    if (!(await onSubmit({ type: 'match', pairs }))) setSent(false);
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="font-semibold text-text-2">Pick an item on the left, then its match on the right.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          {q.left.map((l) => (
            <button
              key={l.id}
              type="button"
              disabled={locked}
              onClick={() => {
                playSfx('tap');
                setActive(l.id);
              }}
              aria-pressed={active === l.id}
              className={`paper flex min-h-14 scroll-mb-28 items-center gap-2 rounded-[var(--radius-m)] px-2.5 py-2 text-left font-bold transition-shadow ${active === l.id ? 'ring-4 ring-lantern' : ''}`}
            >
              <PairNumber n={numberOf[l.id]!} color={colorOf[l.id]!} />
              <span className="min-w-0 flex-1 break-words">{l.text}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {q.right.map((r) => {
            const owner = rightOwner(r.id);
            return (
              <button
                key={r.id}
                type="button"
                disabled={locked || !active}
                onClick={() => pickRight(r.id)}
                className="paper flex min-h-14 scroll-mb-28 items-center gap-2 rounded-[var(--radius-m)] px-2.5 py-2 text-left font-bold disabled:cursor-default"
              >
                {/* The name starts with the words on the button, then says the pair (the number chip is for sighted players). */}
                <span className="min-w-0 flex-1 break-words">
                  {r.text}
                  {owner ? <span className="sr-only">, matched with {q.left.find((l) => l.id === owner)?.text}</span> : null}
                </span>
                {owner ? <PairNumber n={numberOf[owner]!} color={colorOf[owner]!} /> : <span className="size-7 shrink-0 rounded-full border-2 border-dashed border-line-strong" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>
      <SubmitButton disabled={locked || !complete} sent={sent} onClick={submit} label="Lock in matches" sticky />
    </div>
  );
}

/** Picks the right control for the question type. Remount (key by iid) for each new question. */
export function AnswerInput(props: AnswerInputProps) {
  const { q } = props;
  // A new question, or one that comes back, starts with no answer from this player.
  const { begin } = useAnswerMemory();
  useEffect(() => begin(q.prompt), [q.prompt, begin]);
  const remembering = useRememberingSubmit(q, props.onSubmit);
  // In host-paced games the result comes later, so the answer going in gets its own sound;
  // self-paced games play the result straight away instead.
  const pacing = useSoundPacing();
  const role = useSoundRole();
  const lockInSound = pacing === 'host' && role !== 'host';
  const onSubmit = useCallback(
    async (answer: Answer) => {
      const ok = await remembering(answer);
      if (ok && lockInSound) playSfx('lockIn');
      return ok;
    },
    [remembering, lockInSound],
  );
  const online = useOnline();
  const p = { ...props, onSubmit, disabled: props.disabled || !online };
  if (!online) {
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2.5 rounded-[var(--radius-m)] border border-ember/60 bg-white/[0.07] px-4 py-2.5 font-bold text-text">
          <WifiOff className="size-5 shrink-0 text-ember" aria-hidden />
          The connection dropped. Your answer can go in as soon as it is back.
        </p>
        {/* Dimmed, so they do not look tappable while they wait. */}
        <div className="opacity-55">
          <AnswerControls {...p} />
        </div>
      </div>
    );
  }
  return <AnswerControls {...p} />;
}

function AnswerControls(p: AnswerInputProps) {
  const { q, onSubmit } = p;
  switch (q.type) {
    case 'mcq':
      return <ChoiceAnswer {...p} q={q} />;
    case 'multi':
      return <MultiAnswer {...p} q={q} />;
    case 'truefalse':
      return <TrueFalseAnswer {...p} />;
    case 'short':
      return <TextAnswer numeric={false} onSubmit={onSubmit} disabled={p.disabled} />;
    case 'numeric':
      return <TextAnswer numeric unit={q.unit} onSubmit={onSubmit} disabled={p.disabled} />;
    case 'order':
      return <OrderAnswer {...p} q={q} />;
    case 'match':
      return <MatchAnswer {...p} q={q} />;
    case 'flashcard':
      return <p className="text-text-2">This question needs a study mode.</p>;
  }
}
