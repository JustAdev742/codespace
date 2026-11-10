import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { parseBlanks, type Question } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { Button } from '../../ui/Button.tsx';
import { EmptyState, ErrorNotice, PageHeader, Spinner } from '../../ui/primitives.tsx';
import { ToggleChips } from '../../ui/game.tsx';
import type { SetResponse } from './editor/Editor.tsx';
import { answerText } from './answers.ts';
import { MathText } from './math/MathText.tsx';

/*
 * /sets/:id/print: a worksheet of the questions and, separately, an answer
 * key, laid out for paper. The print stylesheet hides the app around them.
 */

type Sheet = 'worksheet' | 'key';
const LETTERS = 'ABCDEFGH';

/** A stable shuffle by question id, so the worksheet's order of items is the same every time it is printed. */
function shuffleFor<T>(id: string, list: readonly T[]): T[] {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    h = Math.imul(h ^ i, 16777619);
    const j = (h >>> 0) % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  // Never print an ordering question already in order.
  if (a.length > 1 && a.every((x, i) => x === list[i])) a.push(a.shift()!);
  return a;
}

function Lines({ n = 1 }: { n?: number }) {
  return (
    <span className="mt-2 flex flex-col gap-5" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="block h-0 border-b border-dotted border-current opacity-60" />
      ))}
    </span>
  );
}

function WorksheetQuestion({ q }: { q: Question }) {
  switch (q.type) {
    case 'mcq':
    case 'multi':
    case 'poll':
      return (
        <>
          {q.type === 'multi' ? <p className="text-sm italic">Tick every correct answer.</p> : q.type === 'poll' ? <p className="text-sm italic">There is no right answer: tick your choice.</p> : null}
          <ul className="mt-1 grid gap-1 sm:grid-cols-2 print:grid-cols-2">
            {q.choices.map((c, i) => (
              <li key={c.id} className="flex items-start gap-2">
                <span className="mt-0.5 inline-block size-4 shrink-0 rounded-sm border border-current" aria-hidden />
                <span>
                  <span className="font-bold">{LETTERS[i]}.</span> <MathText text={c.text || c.media?.alt || 'Picture'} />
                </span>
              </li>
            ))}
          </ul>
        </>
      );
    case 'truefalse':
      return <p className="mt-1">Circle one: True / False</p>;
    case 'short':
    case 'numeric':
      return (
        <>
          {q.type === 'numeric' && q.unit ? <p className="text-sm italic">Answer in {q.unit}.</p> : null}
          <Lines />
        </>
      );
    case 'flashcard':
      return <Lines />;
    case 'order':
      return (
        <>
          <p className="text-sm italic">Number them 1 to {q.items.length} in the right order.</p>
          <ul className="mt-1 flex flex-col gap-1">
            {shuffleFor(q.id, q.items).map((it) => (
              <li key={it.id} className="flex items-center gap-2">
                <span className="inline-block h-6 w-8 shrink-0 rounded-sm border border-current" aria-hidden />
                <MathText text={it.text} />
              </li>
            ))}
          </ul>
        </>
      );
    case 'match':
      return (
        <>
          <p className="text-sm italic">Draw a line from each item to its match.</p>
          <div className="mt-1 grid grid-cols-2 gap-x-10 gap-y-1">
            {q.pairs.map((p, i) => {
              const right = shuffleFor(q.id, q.pairs)[i]!;
              return (
                <div key={p.id} className="contents">
                  <span>
                    <MathText text={p.left} /> •
                  </span>
                  <span>
                    • <MathText text={right.right} />
                  </span>
                </div>
              );
            })}
          </div>
        </>
      );
    case 'blanks': {
      const { pieces } = parseBlanks(q.text);
      return (
        <>
          <p className="mt-1 leading-loose">
            {pieces.map((piece, i) => (
              <span key={i}>
                {piece}
                {i < pieces.length - 1 ? <span className="mx-1 inline-block w-28 border-b border-current" aria-label="blank" role="img" /> : null}
              </span>
            ))}
          </p>
          {q.bank ? <p className="text-sm">Word bank: {shuffleFor(q.id, [...parseBlanks(q.text).gaps.map((g) => g.accepted[0]!), ...(q.distractors ?? [])]).join(', ')}</p> : null}
        </>
      );
    }
    case 'sort':
      return (
        <>
          <p className="text-sm">Sort into groups: {shuffleFor(q.id, q.items).map((i) => i.text).join(', ')}</p>
          <div className="mt-1 grid gap-2" style={{ gridTemplateColumns: `repeat(${q.groups.length}, minmax(0, 1fr))` }}>
            {q.groups.map((g) => (
              <div key={g.id} className="min-h-24 rounded-sm border border-current p-1.5">
                <p className="font-bold">{g.label}</p>
              </div>
            ))}
          </div>
        </>
      );
  }
}

export default function PrintSet() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const sheet: Sheet = params.get('sheet') === 'key' ? 'key' : 'worksheet';
  const [names, setNames] = useState(true);
  const data = useQuery({ queryKey: ['set', id], queryFn: () => api.get<SetResponse>(`/api/sets/${id}`) });
  useEffect(() => {
    const previous = document.title;
    if (data.data) document.title = `${data.data.set.title}: ${sheet === 'key' ? 'answer key' : 'worksheet'} | Ludora`;
    return () => {
      document.title = previous;
    };
  }, [data.data, sheet]);
  if (data.isLoading) return <Spinner />;
  if (data.isError) {
    const status = data.error instanceof ApiError ? data.error.status : 0;
    return status === 404 || status === 400 ? <EmptyState title="Set not found">It may be private or deleted.</EmptyState> : <ErrorNotice message="The set could not be loaded." onRetry={() => data.refetch()} />;
  }
  const { set, questions } = data.data!;
  if (!questions) {
    return (
      <EmptyState title="Only the set's editors can print it" action={<Link to={`/sets/${set.id}`}>Back to the set</Link>}>
        A worksheet shows every question and an answer key every answer, so printing is for the people who write the set. Copy it to your own sets to print it.
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {/* Hides the app's header, footer and these controls on paper, and prints dark on white. */}
      <style>{`@media print { body { background: #fff !important; color: #000 !important; } body * { visibility: hidden; } [data-print-sheet], [data-print-sheet] * { visibility: visible; } [data-print-sheet] { position: absolute; inset: 0 auto auto 0; width: 100%; } .print-q { break-inside: avoid; } }`}</style>
      <div className="flex flex-col gap-4" data-no-print>
        <PageHeader
          eyebrow={
            <Link to={`/sets/${set.id}`} className="font-semibold">
              Back to the set
            </Link>
          }
          title="Print"
          description="A worksheet of the questions, and a separate answer key. Choose one, then print it or save it as a PDF."
          actions={
            <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
              Print {sheet === 'key' ? 'answer key' : 'worksheet'}
            </Button>
          }
        />
        <div className="flex flex-wrap items-center gap-3">
          <ToggleChips<Sheet>
            value={sheet}
            onChange={(v) => setParams(v === 'key' ? { sheet: 'key' } : {}, { replace: true })}
            label="Which sheet"
            options={[
              { value: 'worksheet', label: 'Worksheet' },
              { value: 'key', label: 'Answer key' },
            ]}
          />
          {sheet === 'worksheet' ? (
            <label className="flex items-center gap-2 text-sm font-semibold text-text">
              <input type="checkbox" checked={names} onChange={(e) => setNames(e.target.checked)} className="size-5" />
              Name and date lines
            </label>
          ) : null}
        </div>
      </div>
      <article data-print-sheet className="paper mx-auto w-full max-w-[52rem] rounded-[var(--radius-m)] p-6 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.4)] sm:p-10 print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <header className="mb-5 border-b-2 border-current pb-3">
          <h1 className="font-display text-3xl leading-tight font-bold break-words">
            {set.title}
            {sheet === 'key' ? ': answer key' : ''}
          </h1>
          {set.description && sheet === 'worksheet' ? <p className="mt-1 break-words">{set.description}</p> : null}
          {sheet === 'worksheet' && names ? (
            <p className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
              <span>Name ______________________________</span>
              <span>Date ______________</span>
            </p>
          ) : null}
        </header>
        <ol className="flex flex-col gap-5">
          {questions.map((q, i) => (
            <li key={q.id} className="print-q flex gap-3">
              <span className="w-7 shrink-0 font-bold tabular">{i + 1}.</span>
              <div className="min-w-0 flex-1 break-words">
                <p className="font-semibold">
                  <MathText text={q.prompt} />
                  {q.doublePoints && sheet === 'worksheet' ? <span className="ml-2 text-sm font-bold">(double points)</span> : null}
                </p>
                {q.media ? <img src={q.media.url} alt={q.media.alt} className="mt-2 max-h-40 w-auto" /> : null}
                {sheet === 'worksheet' ? (
                  <WorksheetQuestion q={q} />
                ) : (
                  <p className="mt-0.5">
                    <span className="font-bold">Answer: </span>
                    <MathText text={answerText(q)} />
                    {q.explanation ? <span className="mt-0.5 block text-sm">{q.explanation}</span> : null}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </article>
    </div>
  );
}
