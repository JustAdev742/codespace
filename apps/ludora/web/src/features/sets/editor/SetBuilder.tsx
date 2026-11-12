import { useMemo, useState } from 'react';
import { CircleAlert, CircleCheck, FolderOpen, LayoutTemplate, ListPlus, Monitor, ScanSearch, Smartphone, TextSearch, Tv } from 'lucide-react';
import { createRng, questionSchema, QUESTION_TYPE_LABELS, type Answer, type AnswerReveal, type PublicQuestion, type Question } from '@ludora/shared';
import { answerFromTokens, gradeAnswer, presentationOrder, revealAnswer, revealToTokens, toPublicQuestion } from '@ludora/engine/questions';
import { plural } from '../../../lib/format.ts';
import { Button } from '../../../ui/Button.tsx';
import { Badge, Dialog, Input, Select, Switch, Textarea } from '../../../ui/primitives.tsx';
import { Segmented } from '../../../ui/Segmented.tsx';
import { AnswerInput } from '../../room/game/AnswerInput.tsx';
import { QuestionCard as PlayerQuestion } from '../../room/game/QuestionCard.tsx';
import { ResultBanner, RevealAnswer } from '../../room/game/Reveal.tsx';
import { MathText } from '../math/MathText.tsx';
import { findMatches, replaceAll } from './findReplace.ts';
import { findMissing, MISSING_LABEL } from './missing.ts';
import { toCandidate, type DraftQuestion } from './model.ts';
import { parseQuickAdd } from './quickAdd.ts';
import { DRILL_SIGN, mathsDrill, readPairs, readTimeline, timelineQuestions, vocabQuestions, VOCAB_LABEL, type DrillOp, type VocabType } from './templates.ts';

/*
 * More editor tools: quick add (a whole set typed in one box), find and replace across the set,
 * templates (maths drills, vocabulary pairs to several question types, a timeline to ordering),
 * the "missing things" pass, and a preview that plays a question exactly as a phone and the big
 * screen show it.
 */

export type BuilderTool = 'quick' | 'find' | 'templates' | 'missing' | 'preview' | 'uploads';

/** The toolbar buttons that open these tools. */
export function SetBuilderButtons({ onOpen }: { onOpen: (t: BuilderTool) => void }) {
  const items: [BuilderTool, string, typeof ListPlus][] = [
    ['quick', 'Quick add', ListPlus],
    ['templates', 'Templates', LayoutTemplate],
    ['find', 'Find and replace', TextSearch],
    ['missing', 'Missing things', ScanSearch],
    ['preview', 'Preview', Tv],
    ['uploads', 'Your uploads', FolderOpen],
  ];
  return (
    <>
      {items.map(([t, label, Icon]) => (
        <Button key={t} size="sm" variant="ghost" icon={<Icon className="size-4" />} onClick={() => onOpen(t)}>
          {label}
        </Button>
      ))}
    </>
  );
}

function QuestionList({ questions }: { questions: Question[] }) {
  return (
    <ol className="flex max-h-[38vh] flex-col gap-1.5 overflow-y-auto" aria-label="Questions that will be added">
      {questions.map((q, i) => (
        <li key={q.id} className="flex min-w-0 items-start gap-2 rounded-[var(--radius-m)] border border-line px-2.5 py-1.5 text-sm">
          <span className="font-semibold text-text-3 tabular">{i + 1}.</span>
          <span className="min-w-0 flex-1 break-words text-text">
            <MathText text={q.prompt} />
          </span>
          <Badge>{QUESTION_TYPE_LABELS[q.type]}</Badge>
        </li>
      ))}
    </ol>
  );
}

/* ----------------------------------- quick add ----------------------------------- */

const QUICK_EXAMPLE = `What is 7 x 8? = 56
Capital of France? = Paris
The Sun is a star. = true
bonjour :: hello
Plants need [sunlight] and [water].
Smallest first: ant > cat > horse
Which are mammals?
* whale
- shark
* bat`;

export function QuickAddDialog({ open, onOpenChange, room, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; room: number; onAdd: (qs: Question[]) => void }) {
  const [text, setText] = useState('');
  const result = useMemo(() => parseQuickAdd(text), [text]);
  const usable = result.questions.slice(0, room);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Quick add"
      description="Type questions one to a line: the answer after an equals sign, choices on the lines below with * for a right one. They are read as you type."
      footer={
        <Button variant="primary" disabled={!usable.length} onClick={() => (onAdd(usable), setText(''))}>
          {usable.length ? `Add ${plural(usable.length, 'question')}` : 'Add questions'}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <label htmlFor="quick-add" className="text-sm font-semibold text-text">
          Questions
        </label>
        <Textarea id="quick-add" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder={QUICK_EXAMPLE} className="h-auto min-h-[180px] font-mono text-sm" aria-describedby="quick-add-help" />
        <details id="quick-add-help" className="rounded-[var(--radius-m)] border border-line p-2.5 text-sm text-text-2">
          <summary className="cursor-pointer font-semibold text-text">How to write each kind</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            <li>A typed answer: <code>Capital of France? = Paris | paris</code> (other answers after a bar)</li>
            <li>A number: <code>How tall? = 12 cm</code></li>
            <li>True or false: <code>Bats are birds. = false</code></li>
            <li>A flashcard: <code>bonjour :: hello</code></li>
            <li>Fill in the blanks: put each gap in [square brackets]</li>
            <li>Put in order: <code>Oldest first: Rome &gt; Paris &gt; Berlin</code></li>
            <li>Match pairs: <code>Match: cat = chat; dog = chien</code></li>
            <li>Choices: the question, then a line per choice, starting with * for right and - for wrong</li>
          </ul>
        </details>
        <p role="status" className="text-sm font-semibold text-text">
          {text.trim() ? `${plural(result.questions.length, 'question')} read${result.problems.length ? `, ${plural(result.problems.length, 'line')} to fix` : ''}.` : 'Nothing typed yet.'}
          {result.questions.length > room ? ` Only ${room} more fit in this set.` : ''}
        </p>
        {result.problems.length ? (
          <ul className="flex flex-col gap-1 text-sm">
            {result.problems.map((p) => (
              <li key={p.line} className="flex items-start gap-1.5 text-text">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-lantern" aria-hidden />
                <span className="min-w-0 break-words">
                  Line {p.line} (“{p.text.slice(0, 60)}”): {p.message}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {usable.length ? <QuestionList questions={usable} /> : null}
      </div>
    </Dialog>
  );
}

/* -------------------------------- find and replace ------------------------------- */

export function FindReplaceDialog({ open, onOpenChange, questions, onReplace }: { open: boolean; onOpenChange: (o: boolean) => void; questions: DraftQuestion[]; onReplace: (next: DraftQuestion[], count: number) => void }) {
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const found = useMemo(() => findMatches(questions, find, { matchCase }), [questions, find, matchCase]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Find and replace"
      description="In every question: prompts, answers, choices, items, explanations and hints. Undo puts it all back."
      footer={
        <Button variant="primary" disabled={!found.total} onClick={() => onReplace(replaceAll(questions, find, replace, { matchCase }), found.total)}>
          {found.total ? `Replace ${plural(found.total, 'match', 'matches')}` : 'Replace'}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="find-text" className="text-sm font-semibold text-text">
            Find
          </label>
          <Input id="find-text" value={find} onChange={(e) => setFind(e.target.value)} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="replace-text" className="text-sm font-semibold text-text">
            Replace with
          </label>
          <Input id="replace-text" value={replace} onChange={(e) => setReplace(e.target.value)} autoComplete="off" />
        </div>
        <Switch checked={matchCase} onCheckedChange={setMatchCase} label="Match capitals" description="Find “Paris” but not “paris”." />
        <p role="status" className="text-sm font-semibold text-text">
          {!find ? 'Type something to find.' : found.total ? `${plural(found.total, 'match', 'matches')} in ${plural(found.byQuestion.length, 'question')}: ${found.byQuestion.slice(0, 12).map((q) => q.number).join(', ')}${found.byQuestion.length > 12 ? '…' : ''}.` : 'No matches.'}
        </p>
      </div>
    </Dialog>
  );
}

/* ------------------------------------ templates ----------------------------------- */

type TemplateKind = 'drill' | 'vocab' | 'timeline';
const TEMPLATE_LABEL: Record<TemplateKind, string> = { drill: 'Maths drill', vocab: 'Vocabulary pairs', timeline: 'Timeline' };
const OPS: DrillOp[] = ['add', 'subtract', 'multiply', 'divide'];
const OP_LABEL: Record<DrillOp, string> = { add: 'Add', subtract: 'Take away', multiply: 'Times', divide: 'Divide' };

export function TemplatesDialog({ open, onOpenChange, room, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; room: number; onAdd: (qs: Question[]) => void }) {
  const [kind, setKind] = useState<TemplateKind>('drill');
  const [ops, setOps] = useState<DrillOp[]>(['add']);
  const [min, setMin] = useState('1');
  const [max, setMax] = useState('12');
  const [count, setCount] = useState('10');
  const [as, setAs] = useState<'numeric' | 'mcq'>('numeric');
  const [pairsText, setPairsText] = useState('');
  const [types, setTypes] = useState<VocabType[]>(['flashcard', 'choice', 'typed']);
  const [timeText, setTimeText] = useState('');
  const [per, setPer] = useState('4');
  const [firstOf, setFirstOf] = useState(true);
  const [seed, setSeed] = useState(1);
  const result = useMemo(() => {
    const rng = createRng(seed);
    const random = () => rng.next();
    if (kind === 'drill') {
      const lo = Number(min);
      const hi = Number(max);
      const n = Number(count);
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || !Number.isInteger(n) || n < 1) return { questions: [] as Question[], note: 'Use whole numbers for the range and how many.' };
      if (Math.abs(lo) > 10_000 || Math.abs(hi) > 10_000) return { questions: [], note: 'Keep the numbers between -10,000 and 10,000.' };
      return { questions: mathsDrill({ ops, min: lo, max: hi, count: Math.min(n, 100), as }, random), note: '' };
    }
    if (kind === 'vocab') {
      const { pairs, skipped } = readPairs(pairsText);
      return { questions: vocabQuestions(pairs, types, random), note: skipped.length ? `${plural(skipped.length, 'line')} left out: write each as “word = meaning”.` : pairs.length && pairs.length < 3 && types.some((t) => t === 'choice' || t === 'reverse') ? 'Choice questions need at least three pairs.' : '' };
    }
    const { events, skipped } = readTimeline(timeText);
    return { questions: timelineQuestions(events, { perQuestion: Number(per) || 4, firstOf }, random), note: skipped.length ? `${plural(skipped.length, 'line')} left out: start each with a year, like “1066 Battle of Hastings”.` : '' };
  }, [kind, ops, min, max, count, as, pairsText, types, timeText, per, firstOf, seed]);
  const usable = result.questions.slice(0, room);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Templates"
      description="Many questions from a pattern, every answer worked out for you."
      footer={
        <>
          {kind !== 'vocab' ? (
            <Button variant="ghost" onClick={() => setSeed((s) => s + 1)}>
              Mix again
            </Button>
          ) : null}
          <Button variant="primary" disabled={!usable.length} onClick={() => onAdd(usable)}>
            {usable.length ? `Add ${plural(usable.length, 'question')}` : 'Add questions'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented<TemplateKind> label="Template" value={kind} onChange={setKind} options={(['drill', 'vocab', 'timeline'] as const).map((k) => ({ value: k, label: TEMPLATE_LABEL[k] }))} />
        {kind === 'drill' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <CheckChips<DrillOp> label="Sums" value={ops} onChange={(v) => setOps(v.length ? v : ['add'])} options={OPS.map((o) => ({ value: o, label: `${OP_LABEL[o]} (${DRILL_SIGN[o]})` }))} />
            </div>
            <NumberField id="drill-min" label="Smallest number" value={min} onChange={setMin} />
            <NumberField id="drill-max" label="Largest number" value={max} onChange={setMax} />
            <NumberField id="drill-count" label="How many questions" value={count} onChange={setCount} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="drill-as" className="text-sm font-semibold text-text">
                Answered by
              </label>
              <Select id="drill-as" value={as} onChange={(e) => setAs(e.target.value as 'numeric' | 'mcq')}>
                <option value="numeric">Typing the number</option>
                <option value="mcq">Picking from four</option>
              </Select>
            </div>
          </div>
        ) : kind === 'vocab' ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="vocab-pairs" className="text-sm font-semibold text-text">
                Pairs, one a line
              </label>
              <Textarea id="vocab-pairs" rows={6} value={pairsText} onChange={(e) => setPairsText(e.target.value)} placeholder={'chat = cat\nchien = dog\noiseau = bird\npoisson = fish'} className="h-auto min-h-[120px]" />
            </div>
            <CheckChips<VocabType> label="Question types to make" value={types} onChange={(v) => setTypes(v.length ? v : ['flashcard'])} options={(Object.keys(VOCAB_LABEL) as VocabType[]).map((t) => ({ value: t, label: VOCAB_LABEL[t] }))} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="timeline-events" className="text-sm font-semibold text-text">
                Events, one a line, each starting with its year
              </label>
              <Textarea id="timeline-events" rows={6} value={timeText} onChange={(e) => setTimeText(e.target.value)} placeholder={'55 BC Caesar lands in Britain\n1066 Battle of Hastings\n1215 Magna Carta\n1666 Great Fire of London'} className="h-auto min-h-[120px]" />
            </div>
            <NumberField id="timeline-per" label="Events in each ordering question" value={per} onChange={setPer} />
            <Switch checked={firstOf} onCheckedChange={setFirstOf} label="Also ask “Which came first?”" description="Choice questions about three events at a time." />
          </div>
        )}
        <p role="status" className="text-sm font-semibold text-text">
          {result.questions.length ? `${plural(result.questions.length, 'question')} ready.` : 'No questions yet.'} {result.note}
          {result.questions.length > room ? ` Only ${room} more fit in this set.` : ''}
        </p>
        {usable.length ? <QuestionList questions={usable} /> : null}
      </div>
    </Dialog>
  );
}

/** Several of a list, each a checkbox styled as a chip. */
function CheckChips<T extends string>({ label, value, onChange, options }: { label: string; value: T[]; onChange: (v: T[]) => void; options: { value: T; label: string }[] }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold text-text">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <label key={o.value} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-semibold has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-[var(--focus)] ${on ? 'border-lantern bg-lantern/15 text-text' : 'border-line-strong text-text-2'}`}>
              <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value))} className="size-4 accent-[var(--lantern)]" />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function NumberField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-text">
        {label}
      </label>
      <Input id={id} inputMode="numeric" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* ---------------------------------- missing things -------------------------------- */

export function MissingDialog({ open, onOpenChange, questions, shuffleAnswers, onGo }: { open: boolean; onOpenChange: (o: boolean) => void; questions: DraftQuestion[]; shuffleAnswers: boolean; onGo: (id: string) => void }) {
  const found = useMemo(() => (open ? findMissing(questions, { shuffleAnswers }) : []), [open, questions, shuffleAnswers]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="Missing things" description="What a careful reviewer would point out: explanations, descriptions and captions, repeats, and answers that give themselves away.">
      {found.length ? (
        <ul className="flex flex-col gap-1.5">
          {found.map((f, k) => (
            <li key={`${f.questionId}-${f.kind}-${k}`} className="flex flex-wrap items-start gap-2 rounded-[var(--radius-m)] border border-line p-2.5">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-lantern" aria-hidden />
              <span className="min-w-0 flex-1 basis-48 text-sm text-text">
                <Badge className="mr-1.5">{MISSING_LABEL[f.kind]}</Badge>
                {f.message}
              </span>
              {f.questionId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onOpenChange(false);
                    onGo(f.questionId!);
                  }}
                >
                  Go to question {f.number}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-text-2">
          <CircleCheck className="size-4 text-glim" aria-hidden /> Nothing missing: every question is explained, every picture described, every sound captioned, and no answer gives itself away.
        </p>
      )}
    </Dialog>
  );
}

/* ------------------------------------- preview ------------------------------------ */

interface Trial {
  q: Question;
  order: string[] | null;
  pub: PublicQuestion;
}

function makeTrial(q: Question, seed: number): Trial {
  const order = presentationOrder(q, createRng(seed), true);
  return { q, order, pub: toPublicQuestion(q, order) };
}

/** The big screen's answer tiles: what the room sees while a question is open (no answers chosen). */
function BigScreenAnswers({ q }: { q: PublicQuestion }) {
  if (q.type === 'mcq' || q.type === 'multi' || q.type === 'poll') {
    return (
      <ol className="grid grid-cols-2 gap-2">
        {q.choices.map((c, i) => (
          <li key={c.id} className="flex min-h-14 items-center gap-2 rounded-[12px] px-3 py-2 font-display text-lg font-bold text-[var(--tile-ink,#0b1020)]" style={{ background: `var(--tile-${'abcdef'[i]})` }}>
            <span aria-hidden>{'ABCDEF'[i]}</span>
            <span className="min-w-0 break-words">{c.text ? <MathText text={c.text} /> : (c.media?.alt ?? c.sound?.caption ?? '')}</span>
          </li>
        ))}
      </ol>
    );
  }
  if (q.type === 'truefalse') return <p className="text-lg font-semibold text-text-2">True or false: players answer on their devices.</p>;
  return <p className="text-lg font-semibold text-text-2">Players answer on their devices.</p>;
}

export function PreviewDialog({ open, onOpenChange, questions, startAt }: { open: boolean; onOpenChange: (o: boolean) => void; questions: DraftQuestion[]; startAt: string | null }) {
  const ready = useMemo(() => questions.map((d) => ({ d, r: questionSchema.safeParse(toCandidate(d).question) })), [questions]);
  const first = Math.max(0, ready.findIndex((x) => x.d.id === startAt));
  const [at, setAt] = useState<number | null>(null);
  const index = Math.min(at ?? first, Math.max(0, ready.length - 1));
  const [screen, setScreen] = useState<'phone' | 'big'>('phone');
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<{ correct: boolean; partial: number; ungraded: boolean; reveal: AnswerReveal } | null>(null);
  const item = ready[index];
  const trial = useMemo(() => (item?.r.success ? makeTrial(item.r.data, round + index * 31 + 7) : null), [item, round, index]);
  const go = (to: number) => {
    setAt(to);
    setResult(null);
    setRound((r) => r + 1);
  };
  const submit = async (a: Answer) => {
    if (!trial) return false;
    const g = gradeAnswer(trial.q, answerFromTokens(trial.q, trial.order, a));
    setResult({ correct: g.correct, partial: g.partial, ungraded: Boolean(g.ungraded), reveal: revealToTokens(trial.q, trial.order, revealAnswer(trial.q)) });
    return true;
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setAt(null);
          setResult(null);
        }
        onOpenChange(o);
      }}
      size="lg"
      title="Preview"
      description="Each question exactly as a phone and the big screen show it, answered and marked by the game's own rules."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-text-2 tabular">
            Question {index + 1} of {ready.length}
          </span>
          <div className="flex gap-2">
            <Button size="sm" disabled={index === 0} onClick={() => go(index - 1)}>
              Previous
            </Button>
            <Button size="sm" disabled={index >= ready.length - 1} onClick={() => go(index + 1)}>
              Next
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<'phone' | 'big'>
            label="Which screen"
            value={screen}
            onChange={setScreen}
            options={[
              { value: 'phone', label: 'Phone' },
              { value: 'big', label: 'Big screen' },
            ]}
          />
          {screen === 'phone' ? <Smartphone className="size-5 text-text-3" aria-hidden /> : <Monitor className="size-5 text-text-3" aria-hidden />}
        </div>
        {!item ? null : !trial ? (
          <p className="text-text-2">Question {index + 1} is not finished yet. Fix what the editor marks, then preview it.</p>
        ) : screen === 'phone' ? (
          <div className="stage mx-auto flex w-full max-w-[390px] flex-col gap-4 rounded-[var(--radius-l)] p-4" key={`p${round}`} data-preview="phone">
            <PlayerQuestion q={trial.pub} index={index} total={ready.length}>
              {result ? (
                <div className="flex flex-col gap-3">
                  {result.ungraded ? <p className="font-semibold text-text-2">A poll has no right answer. In a game, the class split shows here.</p> : <ResultBanner correct={result.correct} partial={result.partial} />}
                  <RevealAnswer q={trial.pub} reveal={result.reveal} compact />
                  <div>
                    <Button size="sm" onClick={() => go(index)}>
                      Answer again
                    </Button>
                  </div>
                </div>
              ) : (
                <AnswerInput key={round} q={trial.pub} onSubmit={submit} />
              )}
            </PlayerQuestion>
          </div>
        ) : (
          <div className="stage flex w-full flex-col gap-3 rounded-[var(--radius-l)] p-3" key={`b${round}`} data-preview="big">
            <PlayerQuestion q={trial.pub} index={index} total={ready.length} size="lg">
              <BigScreenAnswers q={trial.pub} />
            </PlayerQuestion>
          </div>
        )}
      </div>
    </Dialog>
  );
}
