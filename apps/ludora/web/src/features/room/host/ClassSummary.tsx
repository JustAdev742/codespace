import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ClipboardCopy, Frown, Meh, Printer, RotateCcw, Smile } from 'lucide-react';
import { toast } from 'sonner';
import type { Feeling, HostReportView, RoomView } from '@ludora/shared';
import { api, ApiError } from '../../../lib/api.ts';
import { duration, plural } from '../../../lib/format.ts';
import { Button } from '../../../ui/Button.tsx';
import { Dialog } from '../../../ui/primitives.tsx';
import { PrintSheet, usePrinting } from '../../classes/PrintSheet.tsx';
import { hardest, percent, summaryText } from './summary.ts';

/*
 * The class summary, for the teacher only: how the class did, the hardest questions with the most
 * common wrong answer, who may need a hand, how it felt (exit ticket counts), the per-question
 * breakdown, a summary to copy, a printable results sheet, and one tap to play the missed
 * questions again. Opened from the results, never shown on the big screen by itself: the list of
 * who may need a hand is not for the whole room.
 */

export const FEELING_INFO: Record<Feeling, { label: string; Icon: typeof Smile }> = {
  great: { label: 'Great', Icon: Smile },
  okay: { label: 'Okay', Icon: Meh },
  tough: { label: 'Tough', Icon: Frown },
};

function Feelings({ counts }: { counts: Record<Feeling, number> }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="How it felt">
      {(Object.keys(FEELING_INFO) as Feeling[]).map((f) => {
        const { label, Icon } = FEELING_INFO[f];
        return (
          <li key={f} className="flex items-center gap-2 rounded-[var(--radius-m)] bg-surface-2 px-3 py-1.5 font-semibold">
            <Icon className="size-5" aria-hidden />
            {label}: <span className="font-display text-lg font-bold tabular">{counts[f]}</span>
          </li>
        );
      })}
    </ul>
  );
}

function QuestionTable({ report }: { report: HostReportView }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-m)] border border-line">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="sr-only">Each question: how many got it right first time, the most common wrong answer and the average time</caption>
        <thead className="bg-surface-2 text-text-2">
          <tr>
            <th scope="col" className="px-2.5 py-2">#</th>
            <th scope="col" className="px-2.5 py-2">Question</th>
            <th scope="col" className="px-2.5 py-2">Right</th>
            <th scope="col" className="px-2.5 py-2">Most common wrong answer</th>
            <th scope="col" className="px-2.5 py-2">Time</th>
          </tr>
        </thead>
        <tbody>
          {report.questions.map((q, i) => (
            <tr key={q.qid} className="border-t border-line align-top">
              <td className="px-2.5 py-2 tabular">{i + 1}</td>
              <td className="max-w-[18rem] px-2.5 py-2 break-words">{q.prompt}</td>
              <td className="px-2.5 py-2 whitespace-nowrap tabular">
                {q.right} of {q.answered} ({percent(q.right, q.answered)})
              </td>
              <td className="px-2.5 py-2 break-words">{q.commonWrong ? `${q.commonWrong.text} (${q.commonWrong.count})` : '—'}</td>
              <td className="px-2.5 py-2 whitespace-nowrap tabular">{(q.avgMs / 1000).toFixed(1)} s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** What goes on paper: the standings and the per-question breakdown, plain black on white. */
function ResultsSheet({ room, report }: { room: RoomView; report: HostReportView }) {
  const r = room.results!;
  return (
    <div className="flex flex-col gap-4 text-[11pt]">
      <header>
        <h1 className="text-[20pt] font-bold">
          {room.room.title}: {room.room.setTitle}
        </h1>
        <p>
          {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · {plural(r.standings.length, 'player')} · {duration(r.durationMs)} · class accuracy {percent(report.right, report.answered)}
        </p>
      </header>
      <section className="print-avoid-break">
        <h2 className="mb-1 text-[14pt] font-bold">Standings</h2>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1">Place</th>
              <th className="py-1">Name</th>
              <th className="py-1">Result</th>
              <th className="py-1">Right</th>
            </tr>
          </thead>
          <tbody>
            {r.standings.map((s) => (
              <tr key={s.playerId} className="border-b border-[#ccc]">
                <td className="py-1">{s.rank}</td>
                <td className="py-1">{s.name}</td>
                <td className="py-1">{s.label}</td>
                <td className="py-1">
                  {s.correct} of {s.answered}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2 className="mb-1 text-[14pt] font-bold">Questions</h2>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1">#</th>
              <th className="py-1">Question</th>
              <th className="py-1">Right first time</th>
              <th className="py-1">Most common wrong answer</th>
            </tr>
          </thead>
          <tbody>
            {report.questions.map((q, i) => (
              <tr key={q.qid} className="print-avoid-break border-b border-[#ccc] align-top">
                <td className="py-1 pr-2">{i + 1}</td>
                <td className="py-1 pr-2">{q.prompt}</td>
                <td className="py-1 pr-2">
                  {q.right} of {q.answered}
                </td>
                <td className="py-1">{q.commonWrong ? `${q.commonWrong.text} (${q.commonWrong.count})` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function ClassSummaryDialog({ room, open, onOpenChange }: { room: RoomView; open: boolean; onOpenChange: (v: boolean) => void }) {
  const report = room.results?.report;
  const navigate = useNavigate();
  const printing = usePrinting();
  const [busy, setBusy] = useState(false);
  if (!report) return null;
  const tough = hardest(report, 3);
  const missed = report.questions.filter((q) => q.right < q.answered).length;
  const again = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ code: string; questions: number; extra: number }>(`/api/rooms/${room.room.code}/missed`, {});
      onOpenChange(false);
      const what = `${res.questions} most-missed ${res.questions === 1 ? 'question' : 'questions'}`;
      toast.success(res.extra ? `A new game is ready: the ${what}, and ${res.extra} more from the set, since this mode needs at least ${res.questions + res.extra}.` : `A new game with the ${what} is ready. Share its code.`);
      navigate(`/room/${res.code}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not make the new game. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summaryText(room, report));
      toast.success('Summary copied');
    } catch {
      toast.error('Copying did not work in this browser.');
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Class summary" description="For you: the list of who may need a hand is not meant for the big screen." size="lg">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <p>
            <span className="block font-display text-[2.75rem] leading-none font-extrabold tabular">{percent(report.right, report.answered)}</span>
            <span className="text-sm text-text-2">class accuracy, first tries</span>
          </p>
          <p>
            <span className="block font-display text-[2.75rem] leading-none font-extrabold tabular">{report.answered}</span>
            <span className="text-sm text-text-2">answers</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<RotateCcw className="size-4" aria-hidden />} loading={busy} disabled={!missed} onClick={() => void again()}>
            {missed ? 'Play the missed questions again' : 'Nothing was missed'}
          </Button>
          <Button icon={<ClipboardCopy className="size-4" aria-hidden />} onClick={() => void copy()}>
            Copy summary
          </Button>
          <Button icon={<Printer className="size-4" aria-hidden />} onClick={printing.print}>
            Print results
          </Button>
        </div>

        <section aria-labelledby="cs-hard">
          <h3 id="cs-hard" className="mb-2 font-display text-xl font-bold">
            Hardest questions
          </h3>
          {tough.length ? (
            <ol className="flex flex-col gap-2">
              {tough.map((q) => (
                <li key={q.qid} className="rounded-[var(--radius-m)] bg-surface-2 px-3 py-2">
                  <p className="font-semibold break-words">{q.prompt}</p>
                  <p className="text-sm text-text-2">
                    {q.right} of {q.answered} right ({percent(q.right, q.answered)}){q.commonWrong ? `. Most common wrong answer: “${q.commonWrong.text}”, ${q.commonWrong.count} ${q.commonWrong.count === 1 ? 'time' : 'times'}.` : '.'}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-text-2">Everyone got every question right.</p>
          )}
        </section>

        <section aria-labelledby="cs-help">
          <h3 id="cs-help" className="mb-2 font-display text-xl font-bold">
            May need a hand
          </h3>
          <p className="mb-2 text-sm text-text-2">Under {Math.round(report.threshold * 100)}% right, after at least 3 answers.</p>
          {report.needHelp.length ? (
            <ul className="flex flex-wrap gap-2">
              {report.needHelp.map((p) => (
                <li key={p.playerId} className="rounded-[var(--radius-m)] bg-surface-2 px-3 py-1.5">
                  <span className="font-semibold">{p.name}</span> <span className="text-sm text-text-2 tabular">{`${p.right} of ${p.answered}`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-semibold text-glim">Nobody this time.</p>
          )}
        </section>

        {report.feelings ? (
          <section aria-labelledby="cs-feel">
            <h3 id="cs-feel" className="mb-2 font-display text-xl font-bold">
              How it felt
            </h3>
            <Feelings counts={report.feelings} />
          </section>
        ) : null}

        <section aria-labelledby="cs-each">
          <h3 id="cs-each" className="mb-2 font-display text-xl font-bold">
            Each question
          </h3>
          {report.questions.length ? <QuestionTable report={report} /> : <p className="text-text-2">No answers were given.</p>}
        </section>
      </div>
      {printing.printing ? (
        <PrintSheet onDone={printing.done} label="Results">
          <ResultsSheet room={room} report={report} />
        </PrintSheet>
      ) : null}
    </Dialog>
  );
}

export { Feelings };
