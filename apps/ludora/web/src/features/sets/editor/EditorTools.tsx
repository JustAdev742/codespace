import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Search, Shuffle, Timer, Trash2, ArrowRightLeft, X } from 'lucide-react';
import { createRng, questionSchema, QUESTION_TYPE_LABELS, type Answer, type AnswerReveal, type PublicQuestion, type Question } from '@ludora/shared';
import { answerFromTokens, gradeAnswer, presentationOrder, revealAnswer, revealToTokens, toPublicQuestion } from '@ludora/engine/questions';
import { api } from '../../../lib/api.ts';
import { plural } from '../../../lib/format.ts';
import { Button } from '../../../ui/Button.tsx';
import { Badge, Dialog, ErrorNotice, Input, Select, Skeleton, Switch, Textarea } from '../../../ui/primitives.tsx';
import { ToggleChips } from '../../../ui/game.tsx';
import { AnswerInput } from '../../room/game/AnswerInput.tsx';
import { QuestionCard as PlayerQuestion } from '../../room/game/QuestionCard.tsx';
import { ResultBanner, RevealAnswer } from '../../room/game/Reveal.tsx';
import { MathText } from '../math/MathText.tsx';
import { checkHealth, type HealthIssue } from './health.ts';
import { toCandidate, type DraftQuestion } from './model.ts';
import { flashcardsFromPairs, numberBonds, spellingList, timesTables } from './starters.ts';

/* The editor's extra tools: health check, try a question, question bank, starters, shortcuts and bulk edit. */

/* ------------------------------ Health check ------------------------------- */

const KIND_LABEL: Record<HealthIssue['kind'], string> = { duplicate: 'Repeated', answer: 'No right answer', long: 'Long answer', picture: 'No description', unfinished: 'Not finished' };

export function HealthDialog({ open, onOpenChange, questions, onGo }: { open: boolean; onOpenChange: (o: boolean) => void; questions: DraftQuestion[]; onGo: (questionId: string) => void }) {
  const health = useMemo(() => (open ? checkHealth(questions) : null), [open, questions]);
  const ok = health?.modes.filter((m) => m.ok) ?? [];
  const not = health?.modes.filter((m) => !m.ok) ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Set health check" description="Things worth fixing before you play, and which game modes can use this set as it is now.">
      {health ? (
        <div className="flex flex-col gap-5">
          <section aria-labelledby="health-issues" className="flex flex-col gap-2">
            <h3 id="health-issues" className="font-display text-lg font-bold text-text">
              {health.issues.length ? plural(health.issues.length, 'thing to look at', 'things to look at') : 'Nothing to fix'}
            </h3>
            {health.issues.length ? (
              <ul className="flex flex-col gap-1.5">
                {health.issues.map((i, k) => (
                  <li key={`${i.questionId}-${i.kind}-${k}`} className="flex flex-wrap items-start gap-2 rounded-[var(--radius-m)] border border-line p-2.5">
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-lantern" aria-hidden />
                    <span className="min-w-0 flex-1 basis-48 text-sm text-text">
                      <Badge className="mr-1.5">{KIND_LABEL[i.kind]}</Badge>
                      {i.message}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onOpenChange(false);
                        onGo(i.questionId);
                      }}
                    >
                      Go to question {i.number}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-text-2">
                <CircleCheck className="size-4 text-glim" aria-hidden /> No repeats, every question has its answer, answers fit their tiles and every picture is described.
              </p>
            )}
          </section>
          <section aria-labelledby="health-modes" className="flex flex-col gap-2">
            <h3 id="health-modes" className="font-display text-lg font-bold text-text">
              Plays in {ok.length} of {health.modes.length} game modes
            </h3>
            <ul className="flex flex-col gap-1.5">
              {[...not, ...ok].map((m) => (
                <li key={m.id} className="flex items-start gap-2 text-sm">
                  {m.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-glim" aria-label="Plays" /> : <X className="mt-0.5 size-4 shrink-0 text-ember" aria-label="Cannot play" />}
                  <span className="min-w-0 flex-1 text-text">
                    <span className="font-semibold">{m.title}</span>
                    {m.reason ? <span className="text-text-2">: {m.reason}</span> : m.converted ? <span className="text-text-2">: {plural(m.converted, 'question')} shown in another form.</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </Dialog>
  );
}

/* ---------------------------- Try this question ---------------------------- */

interface Trial {
  q: Question;
  order: string[] | null;
  pub: PublicQuestion;
}

function makeTrial(q: Question): Trial {
  const order = presentationOrder(q, createRng(Math.floor(Math.random() * 1e9)), true);
  return { q, order, pub: toPublicQuestion(q, order) };
}

/** One question as a player sees it on a phone, answered here and marked by the same rules a game uses. */
export function TryDialog({ draft, onOpenChange }: { draft: DraftQuestion | null; onOpenChange: (o: boolean) => void }) {
  const parsed = useMemo(() => (draft ? questionSchema.safeParse(toCandidate(draft).question) : null), [draft]);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [result, setResult] = useState<{ correct: boolean; partial: number; ungraded: boolean; reveal: AnswerReveal } | null>(null);
  const [round, setRound] = useState(0);
  const current = parsed?.success && (!trial || trial.q !== parsed.data) ? makeTrial(parsed.data) : trial;
  if (current !== trial && current) setTrial(current);
  const submit = async (a: Answer) => {
    if (!current) return false;
    const g = gradeAnswer(current.q, answerFromTokens(current.q, current.order, a));
    setResult({ correct: g.correct, partial: g.partial, ungraded: Boolean(g.ungraded), reveal: revealToTokens(current.q, current.order, revealAnswer(current.q)) });
    return true;
  };
  const again = () => {
    if (parsed?.success) setTrial(makeTrial(parsed.data));
    setResult(null);
    setRound((r) => r + 1);
  };
  return (
    <Dialog
      open={draft !== null}
      onOpenChange={(o) => {
        if (!o) {
          setResult(null);
          setTrial(null);
        }
        onOpenChange(o);
      }}
      title="Try this question"
      description="As a player sees it on a phone, marked by the same rules a game uses."
      footer={result ? <Button onClick={again}>Try again</Button> : undefined}
    >
      {!parsed ? null : !parsed.success ? (
        <p className="text-text-2">This question is not finished yet. Fix what the editor marks, then try it.</p>
      ) : current ? (
        <div className="stage mx-auto flex w-full max-w-[390px] flex-col gap-4 rounded-[var(--radius-l)] p-4" key={round}>
          <PlayerQuestion q={current.pub}>
            {result ? (
              <div className="flex flex-col gap-3">
                {result.ungraded ? <p className="font-semibold text-text-2">A poll has no right answer. In a game, the class split shows here.</p> : <ResultBanner correct={result.correct} partial={result.partial} />}
                <RevealAnswer q={current.pub} reveal={result.reveal} compact />
              </div>
            ) : (
              <AnswerInput key={round} q={current.pub} onSubmit={submit} />
            )}
          </PlayerQuestion>
        </div>
      ) : null}
    </Dialog>
  );
}

/* ------------------------------ Question bank ------------------------------ */

interface BankResult {
  setId: string;
  setTitle: string;
  question: Question;
}

/** Search every question in your own sets and add the ones you pick to this set. */
export function BankDialog({ open, onOpenChange, setId, room, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; setId: string | null; room: number; onAdd: (questions: Question[]) => void }) {
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const results = useQuery({ queryKey: ['bank', q, setId], queryFn: () => api.get<{ results: BankResult[]; more: boolean }>(`/api/sets/bank?q=${encodeURIComponent(q)}${setId ? `&exclude=${setId}` : ''}`), enabled: open });
  const keyOf = (r: BankResult) => `${r.setId}:${r.question.id}`;
  const list = results.data?.results ?? [];
  const chosen = list.filter((r) => picked.has(keyOf(r)));
  const search = (e: FormEvent) => {
    e.preventDefault();
    setQ(typed.trim());
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setPicked(new Set());
        onOpenChange(o);
      }}
      title="Question bank"
      description="Search the questions in all your own sets, tick the ones you want, and add copies of them here."
      footer={
        <Button
          variant="primary"
          disabled={!chosen.length || chosen.length > room}
          onClick={() => {
            onAdd(chosen.map((r) => r.question));
            setPicked(new Set());
          }}
        >
          {chosen.length > room ? `Room for ${room} more` : chosen.length ? `Add ${plural(chosen.length, 'question')}` : 'Add questions'}
        </Button>
      }
    >
      <form onSubmit={search} className="mb-3 flex gap-2" role="search">
        <label htmlFor="bank-search" className="sr-only">
          Search your questions
        </label>
        <Input id="bank-search" type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Words in a question or answer" className="min-w-0 flex-1" />
        <Button type="submit" icon={<Search className="size-4" />}>
          Search
        </Button>
      </form>
      {results.isError ? (
        <ErrorNotice message="Your questions could not be searched." onRetry={() => results.refetch()} />
      ) : results.isLoading ? (
        <Skeleton className="h-40" />
      ) : !list.length ? (
        <p className="text-text-2">{q ? 'No questions in your other sets match.' : 'Your other sets have no questions yet.'}</p>
      ) : (
        <ul className="flex max-h-[50vh] flex-col divide-y divide-line overflow-y-auto rounded-[var(--radius-m)] border border-line" aria-label="Questions found">
          {list.map((r) => {
            const k = keyOf(r);
            return (
              <li key={k}>
                <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-surface-2">
                  <input
                    type="checkbox"
                    className="mt-1 size-5 shrink-0"
                    checked={picked.has(k)}
                    onChange={(e) =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(k);
                        else n.delete(k);
                        return n;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold break-words text-text">
                      <MathText text={r.question.prompt} />
                    </span>
                    <span className="block text-xs text-text-3">
                      {QUESTION_TYPE_LABELS[r.question.type]}, from {r.setTitle}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {results.data?.more ? <p className="mt-2 text-xs text-text-3">Showing the first 60. Add more words to narrow it down.</p> : null}
    </Dialog>
  );
}

/* --------------------------------- Starters -------------------------------- */

type StarterKind = 'tables' | 'bonds' | 'spelling' | 'pairs';
const STARTER_LABEL: Record<StarterKind, string> = { tables: 'Times tables', bonds: 'Number bonds', spelling: 'Spelling list', pairs: 'Flashcards from pairs' };

/** Starters that write real questions: times tables, number bonds, a spelling list, flashcards from pairs. */
export function StartersDialog({ open, onOpenChange, room, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; room: number; onAdd: (questions: Question[]) => void }) {
  const [kind, setKind] = useState<StarterKind>('tables');
  const [tables, setTables] = useState<number[]>([2, 5, 10]);
  const [upTo, setUpTo] = useState(12);
  const [total, setTotal] = useState(10);
  const [choices, setChoices] = useState(false);
  const [count, setCount] = useState(20);
  const [text, setText] = useState('');
  const style = choices ? 'choices' : 'typed';
  const made = useMemo(() => {
    if (!open) return { questions: [] as Question[], skipped: [] as string[] };
    switch (kind) {
      case 'tables':
        return { questions: tables.length ? timesTables({ tables, upTo, style, count }) : [], skipped: [] };
      case 'bonds':
        return { questions: numberBonds({ total, style, count }), skipped: [] };
      case 'spelling':
        return spellingList({ text, style });
      case 'pairs':
        return flashcardsFromPairs({ text });
    }
  }, [open, kind, tables, upTo, total, style, count, text]);
  const n = made.questions.length;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Starters"
      description="Ludora writes the questions for you. Check them over and edit any once they are in."
      footer={
        <Button variant="primary" disabled={!n || n > room} onClick={() => onAdd(made.questions)}>
          {n > room ? `Room for ${room} more` : n ? `Add ${plural(n, 'question')}` : 'Add questions'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <ToggleChips<StarterKind> value={kind} onChange={setKind} label="What to make" options={(Object.keys(STARTER_LABEL) as StarterKind[]).map((k) => ({ value: k, label: STARTER_LABEL[k] }))} />
        {kind === 'tables' ? (
          <>
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-text">Tables</legend>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((t) => (
                  <label key={t} className={`grid h-11 min-w-11 cursor-pointer place-items-center rounded-[var(--radius-m)] border px-2 font-display text-lg font-bold has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-[var(--focus)] ${tables.includes(t) ? 'border-lantern bg-lantern text-on-accent' : 'border-line text-text'}`}>
                    <input type="checkbox" className="sr-only" checked={tables.includes(t)} onChange={(e) => setTables((list) => (e.target.checked ? [...list, t].sort((a, b) => a - b) : list.filter((x) => x !== t)))} />
                    {t}
                    <span className="sr-only"> times table</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex flex-col gap-1 text-sm font-semibold text-text">
              Up to
              <Select value={upTo} onChange={(e) => setUpTo(Number(e.target.value))} className="w-40">
                <option value={10}>× 10</option>
                <option value={12}>× 12</option>
              </Select>
            </label>
          </>
        ) : null}
        {kind === 'bonds' ? (
          <label className="flex flex-col gap-1 text-sm font-semibold text-text">
            Bonds to
            <Select value={total} onChange={(e) => setTotal(Number(e.target.value))} className="w-40">
              {[5, 10, 20, 50, 100].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        {kind === 'tables' || kind === 'bonds' ? (
          <label className="flex flex-col gap-1 text-sm font-semibold text-text">
            How many questions, at most
            <Input type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} className="w-32" />
          </label>
        ) : null}
        {kind === 'spelling' || kind === 'pairs' ? (
          <label className="flex flex-col gap-1 text-sm font-semibold text-text">
            {kind === 'spelling' ? 'Words, one per line' : 'Pairs, one per line'}
            <Textarea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={kind === 'spelling' ? 'necessary - It is necessary to sleep.\nrhythm\nbecause' : 'le chien - the dog\nle chat - the cat'}
              className="h-auto min-h-[140px] font-normal"
            />
            <span className="text-xs font-normal text-text-3">{kind === 'spelling' ? 'Add a sentence after a dash and the word is blanked out of it for players to fill in.' : 'Separate the two sides with a tab, a dash, a colon, an equals sign or a comma.'}</span>
          </label>
        ) : null}
        {kind !== 'pairs' ? <Switch checked={choices} onCheckedChange={setChoices} label="Multiple choice" description={kind === 'spelling' ? 'Pick the right spelling from three wrong ones.' : 'Pick the answer from four. Off, players type it.'} /> : null}
        <div className="rounded-[var(--radius-m)] border border-line bg-surface-2 p-3" aria-live="polite">
          <p className="text-sm font-semibold text-text">{n ? `${plural(n, 'question')} ready.` : 'Nothing to add yet.'}</p>
          {n ? (
            <p className="mt-1 text-sm break-words text-text-2">
              For example: <MathText text={made.questions[0]!.prompt} />
            </p>
          ) : null}
          {made.skipped.length ? <p className="mt-1 text-sm text-text-2">Skipped {plural(made.skipped.length, 'line')} that could not be read: {made.skipped.slice(0, 3).join('; ')}.</p> : null}
        </div>
      </div>
    </Dialog>
  );
}

/* -------------------------------- Shortcuts -------------------------------- */

export const SHORTCUTS: [string, string][] = [
  ['Alt + N', 'Add a multiple choice question'],
  ['Alt + ↓ / Alt + ↑', 'Go to the next or previous question'],
  ['Alt + 1 to 6', 'Mark that choice as the right answer, in the question you are in'],
  ['Ctrl + Z', 'Undo (outside a text box)'],
  ['Ctrl + Shift + Z or Ctrl + Y', 'Redo (outside a text box)'],
  ['Ctrl + S', 'Save'],
  ['?', 'Show these shortcuts'],
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm" title="Keyboard shortcuts" description="On a Mac, use Option for Alt and Command for Ctrl.">
      <dl className="flex flex-col divide-y divide-line">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={keys} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
            <dt>
              <kbd className="rounded-[var(--radius-s)] border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-sm text-text">{keys}</kbd>
            </dt>
            <dd className="text-sm text-text-2">{what}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

/* -------------------------------- Bulk edit -------------------------------- */

export interface MySetOption {
  id: string;
  title: string;
}

/** Shown while questions are ticked: set their time limit, shuffle their answers, delete them, or copy or move them to another set. */
export function BulkBar({
  count,
  onClear,
  onTimeLimit,
  onShuffle,
  onDelete,
  onTransfer,
  canTransfer,
  sets,
}: {
  count: number;
  onClear: () => void;
  onTimeLimit: (seconds: number | null) => void;
  onShuffle: () => void;
  onDelete: () => void;
  onTransfer: (to: string, mode: 'copy' | 'move') => void;
  /** Copy and move work on saved questions, so they wait for unsaved changes to be saved. */
  canTransfer: boolean;
  sets: MySetOption[];
}) {
  const [time, setTime] = useState('');
  const [to, setTo] = useState('');
  const seconds = Number(time);
  const timeOk = time.trim() === '' || (Number.isInteger(seconds) && seconds >= 5 && seconds <= 300);
  return (
    <section aria-label="Change the ticked questions" className="lift sticky top-2 z-20 flex flex-col gap-2 rounded-[var(--radius-l)] border border-lantern bg-raised p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-text" role="status">
          {plural(count, 'question')} ticked
        </p>
        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-text-2">
          Time limit in seconds
          <Input value={time} onChange={(e) => setTime(e.target.value)} inputMode="numeric" placeholder="Game's setting" aria-invalid={!timeOk} className="h-9 w-36" />
        </label>
        <Button size="sm" icon={<Timer className="size-4" />} disabled={!timeOk} onClick={() => onTimeLimit(time.trim() ? seconds : null)}>
          Set time limit
        </Button>
        <Button size="sm" icon={<Shuffle className="size-4" />} onClick={onShuffle}>
          Shuffle answers
        </Button>
        <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} onClick={onDelete}>
          Delete
        </Button>
      </div>
      {!timeOk ? <p className="text-xs font-semibold text-[color-mix(in_oklab,var(--ember)_68%,var(--text))]">Use a whole number from 5 to 300, or leave it empty for the game's setting.</p> : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-text-2">
          Another of your sets
          <Select value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-56">
            <option value="">Choose a set</option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
        </label>
        <Button size="sm" icon={<ArrowRightLeft className="size-4" />} disabled={!to || !canTransfer} onClick={() => onTransfer(to, 'copy')}>
          Copy there
        </Button>
        <Button size="sm" disabled={!to || !canTransfer} onClick={() => onTransfer(to, 'move')}>
          Move there
        </Button>
        {!canTransfer ? <p className="text-xs text-text-3">Save your changes first to copy or move questions.</p> : null}
      </div>
    </section>
  );
}
