import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Check, Send } from 'lucide-react';
import type { Answer, PublicQuestion } from '@ludora/shared';
import { AnswerShape, ANSWER_LETTERS } from '../../../art/icons.tsx';

/*
 * Answer controls for every question type. Choices always carry a shape and
 * a letter as well as a colour, and number keys 1 to 6 pick them.
 */

const TILE_BG = ['var(--tile-a)', 'var(--tile-b)', 'var(--tile-c)', 'var(--tile-d)', 'var(--tile-e)', 'var(--tile-f)'];

export interface AnswerInputProps {
  q: PublicQuestion;
  /** Resolves true when the server accepted the answer. */
  onSubmit: (answer: Answer) => Promise<boolean>;
  disabled?: boolean;
  /** Token of the choice already submitted, to keep it highlighted. */
  chosen?: string | null;
  /** Bigger tiles for the projector-free, phone-first layout. */
  compact?: boolean;
}

export function ChoiceTile({ index, text, selected, dimmed, correct, wrong, onClick, disabled, compact }: { index: number; text: string; selected?: boolean; dimmed?: boolean; correct?: boolean; wrong?: boolean; onClick?: () => void; disabled?: boolean; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-pressed={selected || undefined}
      aria-pressed={selected}
      className={`sticker relative flex w-full items-center gap-3 rounded-[18px] px-4 text-left text-on-accent transition-opacity disabled:cursor-default ${compact ? 'min-h-[64px] py-3' : 'min-h-[84px] py-4'} ${dimmed ? 'opacity-35' : ''} ${correct ? 'ring-4 ring-glim ring-offset-2 ring-offset-[var(--bg)]' : ''}`}
      style={{ background: TILE_BG[index % TILE_BG.length] }}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-white/45 font-display text-lg font-extrabold">
        <span className="sr-only">{ANSWER_LETTERS[index]}</span>
        <AnswerShape index={index} size={22} />
      </span>
      <span className={`min-w-0 flex-1 font-semibold break-words ${text.length > 60 ? 'text-base' : 'text-lg'}`}>{text}</span>
      <span className="hidden font-display text-sm font-bold opacity-60 sm:block" aria-hidden>
        {index + 1}
      </span>
      {correct ? <Check className="absolute -top-2 -right-2 size-8 rounded-full border-2 border-ink bg-glim p-1" aria-label="Correct answer" /> : null}
      {wrong ? <span className="absolute -top-2 -right-2 rounded-full border-2 border-ink bg-ember px-2 text-xs font-bold">Yours</span> : null}
    </button>
  );
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
  return (
    <div className={`grid gap-3 ${q.choices.length > 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2'}`} role="group" aria-label="Answers">
      {q.choices.map((c, i) => (
        <ChoiceTile key={c.id} index={i} text={c.text} selected={picked === c.id} dimmed={picked !== null && picked !== c.id} onClick={() => void pick(c.id)} disabled={locked && picked !== c.id} compact={compact} />
      ))}
    </div>
  );
}

function TrueFalseAnswer({ onSubmit, disabled, compact }: AnswerInputProps) {
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
      <ChoiceTile index={0} text="True" selected={picked === true} dimmed={picked === false} onClick={() => void pick(true)} disabled={locked} compact={compact} />
      <ChoiceTile index={1} text="False" selected={picked === false} dimmed={picked === true} onClick={() => void pick(false)} disabled={locked} compact={compact} />
    </div>
  );
}

function MultiAnswer({ q, onSubmit, disabled, compact }: AnswerInputProps & { q: Extract<PublicQuestion, { type: 'multi' }> }) {
  const [sel, setSel] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const locked = disabled || sent;
  const toggle = (id: string) => !locked && setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  useNumberKeys(q.choices.length, (i) => toggle(q.choices[i]!.id), !locked);
  const submit = async () => {
    if (locked || sel.length === 0) return;
    setSent(true);
    if (!(await onSubmit({ type: 'multi', choiceIds: sel }))) setSent(false);
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-text-2">{q.selectCount ? `Pick ${q.selectCount}.` : 'Pick every correct answer.'}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="group" aria-label="Answers">
        {q.choices.map((c, i) => (
          <ChoiceTile key={c.id} index={i} text={c.text} selected={sel.includes(c.id)} dimmed={locked && !sel.includes(c.id)} onClick={() => toggle(c.id)} disabled={locked} compact={compact} />
        ))}
      </div>
      <SubmitButton disabled={locked || sel.length === 0} sent={sent} onClick={submit} label={`Submit ${sel.length || ''} ${sel.length === 1 ? 'answer' : 'answers'}`} />
    </div>
  );
}

function SubmitButton({ disabled, sent, onClick, label = 'Submit answer' }: { disabled: boolean; sent: boolean; onClick?: () => void; label?: string }) {
  return (
    <button type={onClick ? 'button' : 'submit'} onClick={onClick} disabled={disabled} className="sticker inline-flex h-14 items-center justify-center gap-2 rounded-[16px] bg-lantern px-6 font-display text-lg font-bold text-on-accent disabled:cursor-not-allowed disabled:opacity-55">
      {sent ? <Check className="size-5" /> : <Send className="size-5" />}
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
      const n = Number(value.replace(/,/g, '').replace(/\u2212/g, '-').trim());
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
          className="h-16 min-w-0 flex-1 rounded-[16px] border-2 border-ink bg-raised px-4 font-display text-2xl font-bold text-text placeholder:font-sans placeholder:text-lg placeholder:font-normal placeholder:text-text-3 focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)] disabled:opacity-70"
        />
        {unit ? <span className="font-display text-xl font-bold text-text-2">{unit}</span> : null}
      </div>
      {error ? <p className="text-sm font-semibold text-ember">{error}</p> : null}
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
      <p className="text-sm font-semibold text-text-2">Move the items into the right order, first at the top.</p>
      <ol className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={item.id} className="flex items-center gap-2 rounded-[14px] border-2 border-ink bg-raised p-2 pl-4">
            <span className="w-6 font-display font-bold text-text-3 tabular">{i + 1}</span>
            <span className="min-w-0 flex-1 font-semibold">{item.text}</span>
            <button type="button" className="grid size-10 place-items-center rounded-[10px] bg-surface-3 disabled:opacity-30" onClick={() => move(i, -1)} disabled={locked || i === 0} aria-label={`Move ${item.text} up`}>
              <ArrowUp className="size-5" />
            </button>
            <button type="button" className="grid size-10 place-items-center rounded-[10px] bg-surface-3 disabled:opacity-30" onClick={() => move(i, 1)} disabled={locked || i === items.length - 1} aria-label={`Move ${item.text} down`}>
              <ArrowDown className="size-5" />
            </button>
          </li>
        ))}
      </ol>
      <SubmitButton disabled={locked} sent={sent} onClick={submit} label="Lock in this order" />
    </div>
  );
}

const PAIR_COLORS = ['var(--tile-a)', 'var(--tile-b)', 'var(--tile-c)', 'var(--tile-d)', 'var(--tile-e)', 'var(--tile-f)', '#ffd23f', '#9be7ff'];

function MatchAnswer({ q, onSubmit, disabled }: AnswerInputProps & { q: Extract<PublicQuestion, { type: 'match' }> }) {
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const locked = disabled || sent;
  const colorOf = useMemo(() => Object.fromEntries(q.left.map((l, i) => [l.id, PAIR_COLORS[i % PAIR_COLORS.length]!])), [q.left]);
  const rightOwner = (rid: string) => Object.entries(pairs).find(([, r]) => r === rid)?.[0];
  const pickRight = (rid: string) => {
    if (locked || !active) return;
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
      <p className="text-sm font-semibold text-text-2">Pick an item on the left, then its match on the right.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          {q.left.map((l) => (
            <button
              key={l.id}
              type="button"
              disabled={locked}
              onClick={() => setActive(l.id)}
              aria-pressed={active === l.id}
              className={`min-h-14 rounded-[14px] border-2 px-3 py-2 text-left font-semibold transition-colors ${active === l.id ? 'border-lantern bg-dusk/20' : 'border-ink bg-raised'}`}
              style={pairs[l.id] ? { boxShadow: `inset 6px 0 0 ${colorOf[l.id]}` } : undefined}
            >
              {l.text}
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
                className="min-h-14 rounded-[14px] border-2 border-ink bg-raised px-3 py-2 text-left font-semibold disabled:cursor-default"
                style={owner ? { boxShadow: `inset -6px 0 0 ${colorOf[owner]}` } : undefined}
                aria-label={owner ? `${r.text}, matched with ${q.left.find((l) => l.id === owner)?.text}` : r.text}
              >
                {r.text}
              </button>
            );
          })}
        </div>
      </div>
      <SubmitButton disabled={locked || !complete} sent={sent} onClick={submit} label="Lock in matches" />
    </div>
  );
}

/** Picks the right control for the question type. Remount (key by iid) for each new question. */
export function AnswerInput(props: AnswerInputProps) {
  const { q } = props;
  switch (q.type) {
    case 'mcq':
      return <ChoiceAnswer {...props} q={q} />;
    case 'multi':
      return <MultiAnswer {...props} q={q} />;
    case 'truefalse':
      return <TrueFalseAnswer {...props} />;
    case 'short':
      return <TextAnswer numeric={false} onSubmit={props.onSubmit} disabled={props.disabled} />;
    case 'numeric':
      return <TextAnswer numeric unit={q.unit} onSubmit={props.onSubmit} disabled={props.disabled} />;
    case 'order':
      return <OrderAnswer {...props} q={q} />;
    case 'match':
      return <MatchAnswer {...props} q={q} />;
    case 'flashcard':
      return <p className="text-text-2">This question needs a study mode.</p>;
  }
}
