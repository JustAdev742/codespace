import type { HostReportView, QuestionReportView, RoomView } from '@ludora/shared';

/* The class summary's arithmetic and the text a teacher copies. Pure, so it is unit tested. */

export function percent(right: number, of: number): string {
  return of ? `${Math.round((right / of) * 100)}%` : '–';
}

/** The questions with the lowest share right at the first try, leaving out ones everybody got right. */
export function hardest(report: HostReportView, n: number): QuestionReportView[] {
  return report.questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => q.answered > 0 && q.right < q.answered)
    .sort((a, b) => a.q.right / a.q.answered - b.q.right / b.q.answered || a.i - b.i)
    .slice(0, n)
    .map(({ q }) => q);
}

/** A plain-text summary to paste into an email or a planner. */
export function summaryText(room: RoomView, report: HostReportView): string {
  const r = room.results!;
  const lines = [
    `${room.room.title}: ${room.room.setTitle}`,
    `${r.standings.length} ${r.standings.length === 1 ? 'player' : 'players'}. Class accuracy ${percent(report.right, report.answered)} (${report.right} of ${report.answered} right at the first try).`,
  ];
  const tough = hardest(report, 3);
  if (tough.length) {
    lines.push('', 'Hardest questions:');
    tough.forEach((q, i) => lines.push(`${i + 1}. ${q.prompt} (${percent(q.right, q.answered)} right${q.commonWrong ? `; most common wrong answer "${q.commonWrong.text}"` : ''})`));
  }
  if (report.needHelp.length) lines.push('', `May need a hand: ${report.needHelp.map((p) => p.name).join(', ')}.`);
  if (report.feelings) lines.push('', `How it felt: ${report.feelings.great} great, ${report.feelings.okay} okay, ${report.feelings.tough} tough.`);
  const top = r.standings.slice(0, 3).map((s) => `${s.rank}. ${s.name} (${s.label})`);
  if (top.length) lines.push('', 'Top of the table:', ...top);
  return lines.join('\n');
}
