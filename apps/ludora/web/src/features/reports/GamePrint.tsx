import { duration, ordinal, plural } from '../../lib/format.ts';
import { dateTimeText, percent } from './reportUi.tsx';
import type { GameReportData, QuestionView } from './gameTypes.ts';
import type { AnswerLine } from './logic.ts';

/*
 * What goes on paper (rendered inside PrintSheet, black on white whatever the theme): a one-page
 * class report for the teacher's file, and a slip per student to send home with what went well
 * and what to practise. Slips name only the student they are for.
 */

/** A prompt without its closing full stop, for running into a sentence. */
const bare = (p: string) => p.trim().replace(/[.]+$/, '');

const cell = 'border-b border-[#999] px-1.5 py-1 text-left align-top';

export function ClassSheet({ data, view }: { data: GameReportData; view: QuestionView }) {
  const { game } = data;
  const qs = new Map(view.questions.map((q) => [q.questionId, q]));
  const people = data.standings.filter((s) => !s.isBot);
  const hardest = view.questions.slice(0, 8);
  const mis = view.misconceptions.map((id) => qs.get(id)!).filter(Boolean).slice(0, 5);
  return (
    <div className="text-[11pt] leading-snug">
      <p className="text-[9pt]">Ludora class report, {dateTimeText(game.startedAt)}</p>
      <h1 className="font-display text-[20pt] leading-tight font-bold">
        {game.mode}: {game.setTitle}
      </h1>
      <p className="mb-3">
        {game.className ? `${game.className}. ` : ''}
        {plural(people.length, 'player')}, {duration(game.durationMs)}. Right first time: {view.totals.answered ? percent(view.totals.right / view.totals.answered) : 'no answers'}.
      </p>
      {mis.length ? (
        <section className="print-avoid-break mb-3">
          <h2 className="text-[13pt] font-bold">Shared wrong answers</h2>
          <ul className="ml-5 list-disc">
            {mis.map((q) => (
              <li key={q.questionId}>
                {bare(q.prompt)}: {plural(q.commonWrong!.count, 'player')} answered “{q.commonWrong!.text}” ({percent(q.firstTryRate)} right).
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="print-avoid-break mb-3">
        <h2 className="text-[13pt] font-bold">Questions, hardest first</h2>
        <table className="w-full border-collapse text-[9.5pt]">
          <thead>
            <tr>
              <th className={cell}>Question</th>
              <th className={cell}>Right first time</th>
              <th className={cell}>Most common wrong answer</th>
            </tr>
          </thead>
          <tbody>
            {hardest.map((q) => (
              <tr key={q.questionId}>
                <td className={cell}>{q.prompt}</td>
                <td className={cell}>
                  {percent(q.firstTryRate)} ({q.right} of {q.players})
                </td>
                <td className={cell}>{q.commonWrong ? `${q.commonWrong.text} (${q.commonWrong.count})` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {view.questions.length > hardest.length ? <p className="text-[9pt]">And {plural(view.questions.length - hardest.length, 'more question')}; the full list is in the CSV download.</p> : null}
      </section>
      <section className="print-avoid-break">
        <h2 className="text-[13pt] font-bold">Players</h2>
        <table className="w-full border-collapse text-[9.5pt]">
          <thead>
            <tr>
              <th className={cell}>Place</th>
              <th className={cell}>Name</th>
              <th className={cell}>Right</th>
              <th className={cell}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {people.map((s) => (
              <tr key={s.playerKey}>
                <td className={cell}>{ordinal(s.rank)}</td>
                <td className={cell}>{s.name}</td>
                <td className={cell}>
                  {s.correct} of {s.answered}
                </td>
                <td className={cell}>{[s.membership === 'guest' ? 'Guest' : '', s.leftEarly ? 'Left early' : '', data.participation.rows.some((r) => r.playerKey === s.playerKey && r.fewAnswers) ? 'Answered few' : ''].filter(Boolean).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/** One slip per student, two to a page: their result, what went well and what to practise. */
export function StudentSlips({ data, answers }: { data: GameReportData; answers: AnswerLine[] }) {
  const { game } = data;
  const people = data.standings.filter((s) => !s.isBot);
  return (
    <div className="text-[11pt] leading-snug">
      {people.map((s) => {
        const mine = answers.filter((a) => a.playerKey === s.playerKey && a.tryNumber === 1 && a.kind !== 'self');
        const missed = mine.filter((a) => !a.correct);
        const right = mine.filter((a) => a.correct);
        return (
          <section key={s.playerKey} className="print-avoid-break mb-6 border-b-2 border-dashed border-[#999] pb-6">
            <p className="text-[9pt]">Ludora, {dateTimeText(game.startedAt)}</p>
            <h2 className="font-display text-[16pt] font-bold">{s.name}</h2>
            <p className="mb-2">
              {game.mode} with “{game.setTitle}”: {right.length} of {plural(mine.length, 'question')} right first time{s.answered ? ` (${percent(right.length / Math.max(1, mine.length))})` : ''}.
            </p>
            {right.length ? <p className="mb-2">Went well: {right.slice(0, 3).map((a) => bare(a.prompt)).join('; ')}.</p> : null}
            {missed.length ? (
              <>
                <p className="font-bold">To practise:</p>
                <ul className="ml-5 list-disc">
                  {missed.slice(0, 6).map((a) => (
                    <li key={a.prompt}>{a.prompt}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>Every question right first time. Well done.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
